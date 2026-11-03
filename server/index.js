import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';

import {
  DottaEngine,
  calculateMediaSegments,
  transcribeAudioSequentially,
  getGeneratedImage
} from '../src/core/index.js';
import { createAgUiHandler } from './ag-ui-bridge.js';
import {
  sanitizeUserId,
  listUserWorkspaceFiles,
  readUserWorkspaceFile,
  getUserWorkspaceRoot,
  validateAndResolvePath
} from '../src/core/execution/workspace.js';
import { wrapUntrustedContent } from '../src/core/tools/untrusted.js';
import {
  scanForInjection,
  quarantineNotice,
  warningBanner
} from '../src/core/tools/injection-scan.js';
import {
  loadUserBio,
  createProfile as bioCreateProfile,
  setActiveProfile as bioSetActiveProfile,
  updateProfile as bioUpdateProfile,
  deleteProfile as bioDeleteProfile,
  setField as bioSetField,
  addEntry as bioAddEntry,
  updateEntry as bioUpdateEntry,
  deleteEntry as bioDeleteEntry
} from '../src/core/bio/store.js';
import { resolveStagedFile, findMatchingStagedFile } from '../src/core/bio/staging.js';
import {
  listUserThreads,
  getUserThread,
  saveUserThread,
  deleteUserThread,
  renameUserThread
} from '../src/core/state/store.js';
import {
  initLiveBrowser,
  handleBrowserWsMessage,
  getLiveBrowserPage,
  scheduleBrowserTermination,
  cancelBrowserTermination,
  closeLiveBrowser,
  setBrowserBroadcast,
  getActiveBrowserSandbox
} from './browser-stream.js';
import {
  assertResourceOwnership,
  sendUniformNotFound,
  generateSignedDownloadToken,
  verifySignedDownloadToken
} from '../src/core/auth/access-control.js';
import { runMultiLevelFormPipeline } from '../src/core/levels/pipeline.js';
import { extractLiveDomSchemaInPlaywright } from '../src/core/levels/extractor.js';
import { createSandboxToolkit } from '../src/core/levels/sandbox-tools.js';
import { verifyLiveFormDom } from '../src/core/levels/verifier.js';
import {
  verifyUserCredentials,
  createUser,
  findUserById,
  sanitizeUserOutput
} from '../src/core/auth/user-store.js';
import {
  logDbUserSession,
  logDbAudit,
  recordDbUserUpload,
  listDbUserUploads,
  listDbConversations,
  getDbConversation
} from '../src/core/db/supabase.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// Server-issued anonymous session: the user ID is bound by the server into a
// signed httpOnly cookie. On first contact an existing client ID is adopted
// (preserving the user's sandbox/BIO data); after that the signed cookie is
// authoritative and client-supplied IDs are ignored. Real auth can replace
// this later without changing any route.
const SESSION_COOKIE = 'dotta_session';
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretPath = path.resolve(__dirname, '../src/data/.session-secret');
  try {
    if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();
  } catch {}
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, secret, 'utf8');
  } catch {}
  return secret;
}
const SESSION_SECRET = getSessionSecret();
function signUserId(id) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(id).digest('hex').slice(0, 32);
}

app.use((req, res, next) => {
  const raw = String(req.cookies?.[SESSION_COOKIE] || '');
  const dot = raw.lastIndexOf('.');
  let userId = null;
  if (dot > 0) {
    const candidate = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    if (sanitizeUserId(candidate) && sig === signUserId(candidate)) {
      userId = candidate;
    }
  }
  // Server-issued signed cookie is authoritative; x-user-id header spoofing is rejected
  req.userId = userId;
  next();
});

app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set();

function broadcast(msg, targetUserId = null) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  const activeOwner = targetUserId || getActiveBrowserSandbox()?.userId;
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      if (!activeOwner || client.userId === activeOwner) {
        client.send(json);
      }
    }
  }
}
setBrowserBroadcast(broadcast);

server.on('upgrade', (req, socket, head) => {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `http://${host}`);
  if (url.pathname === '/ws') {
    const rawCookies = req.headers.cookie || '';
    const cookies = Object.fromEntries(
      rawCookies
        .split(';')
        .map((c) => c.trim().split('='))
        .filter(([k]) => k)
        .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])
    );
    const rawSession = String(cookies[SESSION_COOKIE] || '');
    const dot = rawSession.lastIndexOf('.');
    let userId = null;
    if (dot > 0) {
      const candidate = rawSession.slice(0, dot);
      const sig = rawSession.slice(dot + 1);
      if (sanitizeUserId(candidate) && sig === signUserId(candidate)) {
        userId = candidate;
      }
    }

    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      wsClients.add(ws);
      console.log(`[WS] Authenticated client connected for user ${userId}. Total: ${wsClients.size}`);

      const page = getLiveBrowserPage();
      const currentActive = getActiveBrowserSandbox();
      if (!currentActive || currentActive.userId === userId) {
        ws.send(
          JSON.stringify({
            type: 'init',
            url: page ? page.url() : ''
          })
        );
      }

      ws.on('message', async (message) => {
        try {
          // Ownership verification: user can only interact with their own browser session
          const activeSandbox = getActiveBrowserSandbox();
          if (activeSandbox && activeSandbox.userId && activeSandbox.userId !== ws.userId) {
            return;
          }
          const data = JSON.parse(message);
          await handleBrowserWsMessage(data, broadcast);
        } catch (err) {
          console.error('[WS Error]', err.message);
        }
      });

      ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`[WS] Client disconnected (${userId}). Total: ${wsClients.size}`);
      });
    });
  } else {
    socket.destroy();
  }
});

const engine = new DottaEngine({
  defaultModel: process.env.DEFAULT_MODEL || 'muse-spark-open'
});

// Register live browser executors with DottaEngine
engine.registerTool({ name: 'browser_search' }, async (args) => {
  cancelBrowserTermination();
  try {
    const query = args.query || '';
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }

    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    console.log(`[Dotta Engine] Navigating live browser to ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});

    // Wait a moment for dynamic results to settle
    await new Promise((r) => setTimeout(r, 1200));

    const results = await page
      .evaluate(() => {
        const items = Array.from(document.querySelectorAll('article, [data-testid="result"]')).slice(0, 6);
        return items
          .map((el, idx) => {
            const a = el.querySelector('h2 a, a[data-testid="result-title-a"]');
            const snippetEl = el.querySelector('[data-result="snippet"], span');
            if (!a) return null;
            return `${idx + 1}. **[${a.innerText.trim()}](${a.href})**\n   ${snippetEl ? snippetEl.innerText.trim() : ''}`;
          })
          .filter(Boolean);
      })
      .catch(() => []);

    if (results.length > 0) {
      return `### Discovered Results for "${query}":\n\n` + results.join('\n\n');
    }

    // Fallback to text extract if structured cards not caught
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '');
    return `### Live Browser Search for "${query}":\n\n${bodyText}`;
  } catch (err) {
    console.error('[Dotta Engine] browser_search failed:', err?.message || err);
    return `Browser search error: ${err?.message || 'Failed to execute search in live browser'}`;
  }
});

function createLiveBrowserExecutor(page, runId) {
  return async (toolName, toolArgs) => {
    if (toolName === 'browser_action') {
      const { action, script, selector, selectorOrText, value } = toolArgs || {};
      if (action === 'verify_dom_state') {
        const verifyRes = await verifyLiveFormDom(page, toolArgs.intendedFields || {}, {
          initialUrl: toolArgs.initialUrl,
          isSubmitAction: Boolean(toolArgs.isSubmitAction)
        });
        return verifyRes;
      }
      if (action === 'batch_fill_section' && script) {
        const evalRes = await page.evaluate((code) => {
          try {
            return (0, eval)(code);
          } catch (e) {
            return { error: e.message };
          }
        }, script).catch((e) => ({ error: e.message }));
        await page.waitForTimeout(300);
        return { ok: true, evalRes };
      }
      if (action === 'upload') {
        const stagedFile = resolveStagedFile(String(value || '').trim(), runId);
        if (stagedFile) {
          const uploadPath = stagedFile.sandboxPath || stagedFile.absPath;
          const targetSel = selector || selectorOrText;
          let uploaded = false;
          if (targetSel) {
            try {
              await page.locator(targetSel).first().setInputFiles(uploadPath, { timeout: 6000 });
              uploaded = true;
            } catch {}
          }
          if (!uploaded) {
            const inputs = page.locator('input[type="file"]');
            const count = await inputs.count().catch(() => 0);
            for (let i = 0; i < count; i++) {
              try {
                await inputs.nth(i).setInputFiles(uploadPath, { timeout: 6000 });
                uploaded = true;
                break;
              } catch {}
            }
          }
          await page.waitForTimeout(350);
          return { ok: uploaded, action: 'upload' };
        }
        return { ok: false, error: 'unknown_upload_ref' };
      }
      if (action === 'click') {
        const target = selector || selectorOrText;
        if (target) {
          const looksLikeCss = /^[.#\[]/.test(target) || target.includes('>') || target.includes('=');
          if (looksLikeCss) {
            await page.click(target, { timeout: 3500 }).catch(() => {});
          } else {
            await page.getByRole('button', { name: target }).first().click({ timeout: 2500 }).catch(async () => {
              await page.click(target, { timeout: 2000 }).catch(() => {});
            });
          }
        }
        await page.waitForTimeout(350);
        return { ok: true, action: 'click' };
      }
      if (action === 'type') {
        const target = selector || selectorOrText;
        if (target) {
          try {
            await page.click(target, { timeout: 2500 });
            await page.fill(target, '', { timeout: 2000 });
            await page.type(target, String(value || ''), { delay: 15, timeout: 4000 });
            await page.dispatchEvent(target, 'change');
            await page.dispatchEvent(target, 'blur');
          } catch {
            await page.fill(target, String(value || ''), { timeout: 3500 }).catch(() => {});
          }
        }
        await page.waitForTimeout(200);
        return { ok: true, action: 'type' };
      }
      if (action === 'select') {
        const target = selector || selectorOrText;
        if (target) {
          try {
            await page.selectOption(target, { value: String(value) }, { timeout: 2500 }).catch(async () => {
              await page.selectOption(target, { label: String(value) }, { timeout: 2500 });
            });
            await page.dispatchEvent(target, 'change');
          } catch {}
        }
        await page.waitForTimeout(200);
        return { ok: true, action: 'select' };
      }
    }
    if (toolName === 'snapshot_read') {
      return { ok: true, url: page.url(), title: await page.title().catch(() => '') };
    }
    return { ok: true };
  };
}

engine.registerTool({ name: 'browser_read_page' }, async (args, context = {}) => {
  cancelBrowserTermination();
  try {
    const rawTarget = String(args.url || '').trim();
    const targetUrl = rawTarget.startsWith('http') ? rawTarget : `https://${rawTarget}`;
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast, targetUrl);
      page = res.page;
    }

    const currentUrl = page ? page.url() : '';
    const normalizeUrl = (u) => String(u || '').replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
    const isAlreadyOnPage = currentUrl && normalizeUrl(currentUrl) === normalizeUrl(targetUrl);

    if (!isAlreadyOnPage) {
      console.log(`[Dotta Engine] Navigating live browser to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    } else {
      console.log(`[Dotta Engine] Live browser already on ${targetUrl}. Extracting live DOM directly without refresh to preserve form inputs.`);
    }

    const title = await page.title().catch(() => targetUrl);

    // If this is a form or application filling task, execute the Multi-Level Form Pipeline in batches!
    if (context?.formTask?.formWorkApproved) {
      try {
        const liveSchema = await extractLiveDomSchemaInPlaywright(page).catch(() => null);
        if (liveSchema && Array.isArray(liveSchema.schema?.fields) && liveSchema.schema.fields.length >= 2) {
          console.log(`[Dotta Engine] Detected form on ${targetUrl} with ${liveSchema.schema.fields.length} field(s). Running Multi-Level Form Pipeline in batches...`);
          const pipeRes = await runMultiLevelFormPipeline({
            runId: context?.runId || `live-pipe-${Date.now()}`,
            userId: context?.userId,
            userInstruction: context?.formTask?.userInstruction || 'Fill out this application form',
            url: targetUrl,
            html: await page.content().catch(() => ''),
            mode: context?.formTask?.mode || 'turbo',
            model: context?.model || 'muse-spark-open',
            liveExtractedSchema: liveSchema,
            userApproved: Boolean(context?.formTask?.userApproved),
            approvals: context?.formTask?.approvals,
            useLiveModel: true,
            browserExecutor: createLiveBrowserExecutor(page, context?.runId),
            onEvent: (evt) => {
              try {
                broadcast({
                  type: 'agent_action_stream',
                  runId: context?.runId,
                  event: evt
                });
              } catch (_) {}
              if (typeof context?.formTask?.onEvent === 'function') {
                context.formTask.onEvent(evt);
              }
            }
          });

          if (pipeRes && pipeRes.ok) {
            return `### Page: ${title}\n**URL**: ${targetUrl}\n\n${pipeRes.safeUserMessage}`;
          }
        }
      } catch (pipeErr) {
        console.error('[Dotta Engine] Multi-level form pipeline failed in browser_read_page:', pipeErr?.message || pipeErr);
      }
    }

    const text = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
    return `### Page: ${title}\n**URL**: ${targetUrl}${isAlreadyOnPage ? ' (already active, form inputs preserved)' : ''}\n\n${text}`;
  } catch (err) {
    console.error('[Dotta Engine] browser_read_page failed:', err?.message || err);
    return `Browser read page error: ${err?.message || 'Failed to navigate in live browser'}`;
  }
});

engine.registerTool({ name: 'browser_action' }, async (args, context = {}) => {
  cancelBrowserTermination();
  try {
    const { action, selectorOrText, value, direction = 'down', amount = 500, pressEnter, script } = args || {};
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }

    if (action === 'batch_fill_section' && script) {
      const scriptResult = await page.evaluate((code) => {
        try {
          return (0, eval)(code);
        } catch (e) {
          return { error: e.message };
        }
      }, script).catch((e) => ({ error: e.message }));
      await page.waitForTimeout(300);
      return `Executed batch fill section "${args.section || 'General'}": ${JSON.stringify(scriptResult)}`;
    }

    if (action === 'click') {
      const target = String(selectorOrText || '').trim();
      if (!target) {
        return 'Browser action error: click requires a target (selector or visible text from snapshot_read). Nothing was clicked.';
      }
      const looksLikeCss = /^[.#\[]/.test(target) || target.includes('>') || target.includes('=');
      const attempts = [];
      if (looksLikeCss) {
        attempts.push(() => page.click(target, { timeout: 3500 }));
      }
      attempts.push(() => page.getByRole('radio', { name: target }).first().click({ timeout: 3000 }));
      attempts.push(() => page.getByRole('checkbox', { name: target }).first().click({ timeout: 3000 }));
      attempts.push(() => page.getByRole('button', { name: target }).first().click({ timeout: 3000 }));
      attempts.push(() => page.getByRole('option', { name: target }).first().click({ timeout: 3000 }));
      attempts.push(() => page.getByText(target, { exact: false }).first().click({ timeout: 3000 }));
      if (!looksLikeCss) {
        attempts.push(() => page.click(target, { timeout: 2500 }));
      }
      let lastError = null;
      for (const attempt of attempts) {
        try {
          await attempt();
          await page.waitForTimeout(350);
          let stateNote = '';
          try {
            const checked = await page
              .getByRole('radio', { name: target })
              .first()
              .getAttribute('aria-checked', { timeout: 800 });
            if (checked !== null) {
              stateNote = ` Radio state now: ${checked === 'true' ? 'selected' : 'not selected'}.`;
            }
          } catch {}
          return `Clicked "${target}". Current URL: ${page.url()}.${stateNote} Take a snapshot_read to confirm the new page state before continuing.`;
        } catch (err) {
          lastError = err;
        }
      }
      return `Browser action error: Could not click "${target}". ${lastError ? String(lastError.message || '').split('\n')[0] : ''} Take a snapshot_read and choose a target from the listed interactive elements instead of guessing.`;
    } else if (action === 'type') {
      const target = String(selectorOrText || '').trim();
      const text = value || '';
      const looksLikeCss = /^[.#\[]/.test(target) || target.includes('>') || target.includes('=');
      const isPhone = /phone|tel/i.test(target);
      const rawDigits = String(text).replace(/\D+/g, '');
      const tenDigits = rawDigits.length === 11 && rawDigits.startsWith('1') ? rawDigits.slice(1) : rawDigits;

      // Split-phone auto-distribution (for forms with 3 sub-inputs: area, prefix, line)
      if (isPhone && tenDigits.length === 10) {
        const distributed = await page.evaluate(({ selector, digits }) => {
          let el = null;
          try { el = document.querySelector(selector); } catch {}
          if (!el) {
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])'));
            el = inputs.find(i => (i.id || '').includes('phone') || (i.name || '').includes('phone'));
          }
          if (el) {
            const container = el.closest('.form-group, .form-row, .field, div, tr') || el.parentElement;
            const sibs = container ? Array.from(container.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])')).filter(i => {
              const r = i.getBoundingClientRect();
              return r.width > 0 && i.type !== 'hidden';
            }) : [];
            if (sibs.length === 3) {
              const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
              sibs.forEach((inp, idx) => {
                inp.focus();
                inp.value = parts[idx];
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                inp.dispatchEvent(new Event('blur', { bubbles: true }));
              });
              return true;
            }
          }
          return false;
        }, { selector: target, digits: tenDigits }).catch(() => false);

        if (distributed) {
          return `Distributed 10-digit phone across 3 sub-inputs [${tenDigits.slice(0, 3)}] [${tenDigits.slice(3, 6)}] - [${tenDigits.slice(6, 10)}]. Take a snapshot_read to confirm.`;
        }
      }

      const strategies = [];
      if (target) {
        if (looksLikeCss) {
          strategies.push(() => page.locator(target).first().fill(text, { timeout: 3000 }));
        }
        strategies.push(() => page.getByLabel(target, { exact: false }).first().fill(text, { timeout: 3000 }));
        strategies.push(() => page.getByPlaceholder(target, { exact: false }).first().fill(text, { timeout: 3000 }));
        strategies.push(() => page.getByRole('textbox', { name: target }).first().fill(text, { timeout: 3000 }));
      }
      let typed = false;
      let lastError = null;
      for (const strategy of strategies) {
        try {
          await strategy();
          typed = true;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (!typed) {
        if (!target) {
          await page.keyboard.type(text);
          typed = true;
        } else {
          return `Browser action error: Could not type into "${target}". ${lastError ? String(lastError.message || '').split('\n')[0] : ''} Take a snapshot_read and target a listed input instead.`;
        }
      }
      if (pressEnter) await page.keyboard.press('Enter');

      // Dispatch blur and change events to clear error highlighting
      await page.evaluate((sel) => {
        try {
          const el = document.querySelector(sel);
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          }
        } catch {}
      }, target).catch(() => {});

      return `Typed "${text}" into "${target || 'focused element'}".${pressEnter ? ' Pressed Enter.' : ''} Take a snapshot_read to confirm before continuing.`;
    } else if (action === 'select') {
      const target = String(selectorOrText || '').trim();
      const val = String(value || '').trim();
      if (!target) {
        return 'Browser action error: select requires a target selector or label.';
      }
      const selectResult = await page.evaluate(({ selectorOrLabel, targetVal }) => {
        const valLower = String(targetVal || '').trim().toLowerCase();
        let el = null;
        try {
          el = document.querySelector(selectorOrLabel);
        } catch {}
        if (!el) {
          const selects = Array.from(document.querySelectorAll('select'));
          el = selects.find((s) => {
            const id = (s.id || '').toLowerCase();
            const name = (s.name || '').toLowerCase();
            const labelEl = s.id ? document.querySelector(`label[for="${s.id}"]`) : null;
            const labelText = (labelEl?.innerText || s.closest('label')?.innerText || s.getAttribute('aria-label') || '').toLowerCase();
            const q = selectorOrLabel.toLowerCase();
            return id.includes(q) || name.includes(q) || labelText.includes(q);
          });
        }
        if (!el) return { success: false, error: `Select element "${selectorOrLabel}" not found in DOM.` };

        const candidates = new Set([valLower]);
        const numVal = parseInt(valLower, 10);
        const MONTH_MAP = {
          1: ['january', 'jan', '01', '1'],
          2: ['february', 'feb', '02', '2'],
          3: ['march', 'mar', '03', '3'],
          4: ['april', 'apr', '04', '4'],
          5: ['may', '05', '5'],
          6: ['june', 'jun', '06', '6'],
          7: ['july', 'jul', '07', '7'],
          8: ['august', 'aug', '08', '8'],
          9: ['september', 'sep', '09', '9'],
          10: ['october', 'oct', '10'],
          11: ['november', 'nov', '11'],
          12: ['december', 'dec', '12']
        };
        for (const [mNum, names] of Object.entries(MONTH_MAP)) {
          if (names.includes(valLower) || parseInt(mNum, 10) === numVal) {
            names.forEach((n) => candidates.add(n));
          }
        }
        const STATE_MAP = {
          al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
          co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
          hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
          ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
          ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
          mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
          nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio',
          ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
          sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
          va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
          dc: 'district of columbia'
        };
        if (STATE_MAP[valLower]) candidates.add(STATE_MAP[valLower]);
        for (const [code, fullName] of Object.entries(STATE_MAP)) {
          if (fullName === valLower) {
            candidates.add(code);
            candidates.add(fullName);
          }
        }

        let selectedIdx = -1;
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          const oVal = (opt.value || '').trim().toLowerCase();
          const oText = (opt.text || '').trim().toLowerCase();
          for (const c of candidates) {
            if (c && (oVal === c || oText === c)) {
              selectedIdx = i;
              break;
            }
          }
          if (selectedIdx !== -1) break;
        }

        if (selectedIdx === -1) {
          for (let i = 0; i < el.options.length; i++) {
            const opt = el.options[i];
            const oVal = (opt.value || '').trim().toLowerCase();
            const oText = (opt.text || '').trim().toLowerCase();
            if (!oVal && !oText) continue;
            if (/^(select|choose|--|\s*)$/i.test(oText) || /^(select|choose|--|\s*)$/i.test(oVal)) continue;
            for (const c of candidates) {
              if (c && c.length >= 2 && (oVal.includes(c) || oText.includes(c) || c.includes(oVal) || c.includes(oText))) {
                selectedIdx = i;
                break;
              }
            }
            if (selectedIdx !== -1) break;
          }
        }

        if (selectedIdx === -1 && el.options.length > 1) {
          const nonPl = Array.from(el.options).findIndex((o) => o.value && !/^(select|choose|--|\s*)$/i.test(o.text));
          if (nonPl !== -1) selectedIdx = nonPl;
        }

        if (selectedIdx !== -1) {
          el.selectedIndex = selectedIdx;
          const chosen = el.options[selectedIdx];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, selectedValue: chosen.value, selectedText: chosen.text };
        }

        return { success: false, error: `No matching option found for "${targetVal}". Options: ${Array.from(el.options).slice(0, 8).map(o => o.text).join(', ')}` };
      }, { selectorOrLabel: target, targetVal: val });

      if (selectResult.success) {
        return `Selected option "${selectResult.selectedText}" (value: "${selectResult.selectedValue}") in "${target}". Take a snapshot_read to confirm.`;
      }
      return `Browser action error: ${selectResult.error}`;
    } else if (action === 'upload') {
      const selector = String(selectorOrText || '').trim();
      const rawVal = String(value || '').trim();

      // Inspect target input element on the live page
      const targetInputInfo = await page.evaluate((targetSel) => {
        let el = null;
        if (targetSel) {
          try { el = document.querySelector(targetSel); } catch {}
          if (!el) {
            const all = Array.from(document.querySelectorAll('input[type="file"], button, label, div, a'));
            el = all.find((e) => {
              const q = targetSel.toLowerCase();
              return (
                (e.id || '').toLowerCase().includes(q) ||
                (e.getAttribute('name') || '').toLowerCase().includes(q) ||
                (e.innerText || '').toLowerCase().includes(q)
              );
            });
          }
        }
        if (el && el.tagName.toLowerCase() !== 'input') {
          el = el.querySelector('input[type="file"]') || el.closest('form, div, .form-group')?.querySelector('input[type="file"]') || el;
        }
        if (!el || el.tagName.toLowerCase() !== 'input' || el.type !== 'file') {
          // If no specific element found, find the most relevant file input on page
          const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
          if (targetSel) {
            const q = targetSel.toLowerCase();
            el = inputs.find((inp) => {
              const linked = inp.id ? document.querySelector(`label[for="${inp.id}"]`) : null;
              const lbl = (linked?.innerText || inp.closest('label')?.innerText || inp.name || inp.id || '').toLowerCase();
              return lbl.includes(q);
            }) || inputs[0];
          } else {
            el = inputs[0];
          }
        }
        if (!el) return null;

        const linked = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        const wrapping = el.closest('label');
        const parentContainer = el.closest('.form-group, .field, div');
        const prevLabel = el.previousElementSibling && ['LABEL', 'SPAN', 'DIV'].includes(el.previousElementSibling.tagName) ? el.previousElementSibling.innerText : '';
        const labelText = (
          linked?.innerText ||
          wrapping?.innerText ||
          prevLabel ||
          parentContainer?.querySelector('label')?.innerText ||
          el.getAttribute('aria-label') ||
          el.name ||
          el.id ||
          'File upload'
        )
          .replace(/\s+/g, ' ')
          .replace(/[*:]+$/, '')
          .trim();

        const finalSel = el.id ? `#${el.id}` : el.name ? `input[name="${el.name}"]` : 'input[type="file"]';
        return {
          selector: finalSel,
          id: el.id || '',
          name: el.name || '',
          accept: el.getAttribute('accept') || '',
          label: labelText,
          required: !!el.required || el.getAttribute('aria-required') === 'true'
        };
      }, selector).catch(() => null);

      // Perform cross-check to match what the input is asking for against available files
      const matchRes = findMatchingStagedFile({
        inputLabel: targetInputInfo?.label || selector,
        inputName: targetInputInfo?.name || '',
        inputId: targetInputInfo?.id || '',
        inputSelector: targetInputInfo?.selector || selector,
        accept: targetInputInfo?.accept || '',
        requestedValue: rawVal,
        runId: context?.runId
      });

      if (!matchRes.matchedFile) {
        return `Browser action error: Could not find matching file in sandbox for file input "${targetInputInfo?.label || selector}". Expected category: ${matchRes.expectedCategory}. Please ensure your BIO contains this file and read access is granted.`;
      }

      const uploadPath = matchRes.matchedFile.sandboxPath || matchRes.matchedFile.absPath;
      if (!uploadPath || !fs.existsSync(uploadPath)) {
        return `Browser action error: Staged file "${matchRes.matchedFile.name}" not found on disk at "${uploadPath}".`;
      }

      const inputSelectorToUse = targetInputInfo?.selector || selector || 'input[type="file"]';
      let uploaded = false;

      try {
        const fileLoc = page.locator(inputSelectorToUse).first();
        await fileLoc.setInputFiles(uploadPath, { timeout: 8000 });
        await fileLoc.evaluate((inp) => {
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('blur', { bubbles: true }));
        }).catch(() => {});
        uploaded = true;
      } catch (err) {
        // Fallback: search all input[type="file"] on page
        const count = await page.locator('input[type="file"]').count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          try {
            await page.locator('input[type="file"]').nth(i).setInputFiles(uploadPath, { timeout: 6000 });
            uploaded = true;
            break;
          } catch {}
        }
      }

      if (!uploaded) {
        return `Browser action error: Failed to attach "${matchRes.matchedFile.name}" to file field "${targetInputInfo?.label || inputSelectorToUse}".`;
      }

      await page.waitForTimeout(350);
      const crossCheckNote = matchRes.warning ? ` [${matchRes.warning}]` : ` [Cross-checked: matches ${matchRes.expectedCategory} format]`;
      return `Uploaded "${matchRes.matchedFile.name}" into "${targetInputInfo?.label || inputSelectorToUse}".${crossCheckNote} Take a snapshot_read to confirm.`;
    } else if (action === 'scroll') {
      const px = direction === 'up' ? -Math.abs(amount) : Math.abs(amount);
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), px);
      return `Scrolled page ${direction} by ${amount}px.`;
    } else if (action === 'hover') {
      await page.hover(selectorOrText, { timeout: 5000 });
      return `Hovered over "${selectorOrText}".`;
    }
    return `Browser action "${action}" completed.`;
  } catch (err) {
    return `Browser action error: ${err.message}`;
  }
});

engine.registerTool({ name: 'snapshot_read' }, async () => {
  cancelBrowserTermination();
  try {
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }
    const snapshot = await page
      .evaluate(() => ({
        title: document.title,
        url: window.location.href,
        // File inputs are often visually hidden behind custom upload
        // buttons, so surface them explicitly (with accept/required/label)
        // or the agent will never know media is required on a form.
        fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map((el) => {
          const linked = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          const wrapping = el.closest('label');
          const labelText = (
            linked?.innerText ||
            wrapping?.innerText ||
            el.getAttribute('aria-label') ||
            el.name ||
            'File upload'
          )
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 60);
          return {
            tag: 'input',
            type: 'file',
            text: labelText,
            name: el.getAttribute('name') || undefined,
            id: el.id || undefined,
            accept: el.getAttribute('accept') || undefined,
            required: !!el.required || el.getAttribute('aria-required') === 'true',
            hasFile: Boolean(el.files && el.files.length > 0),
            attachedFile: el.files && el.files.length > 0 ? el.files[0].name : undefined
          };
        }),
        interactives: Array.from(
          document.querySelectorAll(
            'a, button, input, textarea, select, [role="button"], [role="radio"], [role="checkbox"], [role="option"], [role="link"], [role="tab"], label, [contenteditable="true"]'
          )
        )
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          })
          .slice(0, 60)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || undefined,
            type: el.getAttribute('type') || undefined,
            text: (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 60),
            checked:
              typeof el.checked === 'boolean'
                ? el.checked
                : el.getAttribute('aria-checked') || undefined,
            disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
            id: el.id || undefined,
            name: el.getAttribute('name') || undefined,
            ariaLabel: el.getAttribute('aria-label') || undefined,
            options: el.tagName === 'SELECT'
              ? Array.from(el.querySelectorAll('option'))
                  .slice(0, 25)
                  .map((o) => (o.text || o.value || '').trim())
                  .filter(Boolean)
              : undefined
          }))
      }))
      .catch((err) => ({ error: err.message }));
    return JSON.stringify(snapshot, null, 2);
  } catch (err) {
    console.error('[Dotta Engine] snapshot_read failed:', err?.message || err);
    return JSON.stringify({ error: `Snapshot error: ${err?.message || 'Failed to read snapshot'}` });
  }
});

engine.registerTool({ name: 'browser_screenshot' }, async (args) => {
  cancelBrowserTermination();
  try {
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }
    const buffer = await page.screenshot({ fullPage: !!args?.fullPage }).catch(() => null);
    if (!buffer) return 'Failed to capture screenshot.';
    return `Captured live screenshot (${buffer.length} bytes). Viewport is streaming live in sidebar.`;
  } catch (err) {
    console.error('[Dotta Engine] browser_screenshot failed:', err?.message || err);
    return `Browser screenshot error: ${err?.message || 'Failed to take screenshot'}`;
  }
});

engine.registerTool({ name: 'page_snapshot' }, async (args, context = {}) => {
  cancelBrowserTermination();
  try {
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }
    const toolkit = createSandboxToolkit({
      runSandbox: context?.runSandbox,
      page,
      emitEvent: (evt) => {
        try { broadcast({ type: 'agent_action_stream', runId: context?.runId, event: evt }); } catch (_) {}
        if (typeof context?.formTask?.onEvent === 'function') context.formTask.onEvent(evt);
      }
    });
    return await toolkit.page_snapshot(args);
  } catch (err) {
    return `Page snapshot error: ${err.message}`;
  }
});

engine.registerTool({ name: 'notes_read' }, async (args, context = {}) => {
  try {
    let page = getLiveBrowserPage();
    const toolkit = createSandboxToolkit({
      runSandbox: context?.runSandbox,
      page,
      emitEvent: (evt) => {
        try { broadcast({ type: 'agent_action_stream', runId: context?.runId, event: evt }); } catch (_) {}
        if (typeof context?.formTask?.onEvent === 'function') context.formTask.onEvent(evt);
      }
    });
    return await toolkit.notes_read(args);
  } catch (err) {
    return `Notes read error: ${err.message}`;
  }
});

engine.registerTool({ name: 'notes_write' }, async (args, context = {}) => {
  try {
    let page = getLiveBrowserPage();
    const toolkit = createSandboxToolkit({
      runSandbox: context?.runSandbox,
      page,
      emitEvent: (evt) => {
        try { broadcast({ type: 'agent_action_stream', runId: context?.runId, event: evt }); } catch (_) {}
        if (typeof context?.formTask?.onEvent === 'function') context.formTask.onEvent(evt);
      }
    });
    return await toolkit.notes_write(args);
  } catch (err) {
    return `Notes write error: ${err.message}`;
  }
});

engine.registerTool({ name: 'sandbox_run_script' }, async (args, context = {}) => {
  cancelBrowserTermination();
  try {
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }
    const toolkit = createSandboxToolkit({
      runSandbox: context?.runSandbox,
      page,
      emitEvent: (evt) => {
        try { broadcast({ type: 'agent_action_stream', runId: context?.runId, event: evt }); } catch (_) {}
        if (typeof context?.formTask?.onEvent === 'function') context.formTask.onEvent(evt);
      }
    });
    return await toolkit.sandbox_run_script(args);
  } catch (err) {
    return `Sandbox run script error: ${err.message}`;
  }
});

engine.registerTool({ name: 'browser_screenshot_vision' }, async (args, context = {}) => {
  cancelBrowserTermination();
  try {
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }
    const toolkit = createSandboxToolkit({
      runSandbox: context?.runSandbox,
      page,
      emitEvent: (evt) => {
        try { broadcast({ type: 'agent_action_stream', runId: context?.runId, event: evt }); } catch (_) {}
        if (typeof context?.formTask?.onEvent === 'function') context.formTask.onEvent(evt);
      }
    });
    return await toolkit.browser_screenshot_vision(args);
  } catch (err) {
    return `Browser vision error: ${err.message}`;
  }
});

// Health check endpoints (both /health and /api/health)
const handleHealth = (req, res) => {
  res.json({
    status: 'healthy',
    defaultModel: process.env.DEFAULT_MODEL || 'muse-spark-open',
    wsClients: wsClients.size,
    browserActive: !!getLiveBrowserPage(),
    timestamp: Date.now()
  });
};
app.get('/health', handleHealth);
app.get('/api/health', handleHealth);
app.get('/api/status', (req, res) => {
  const providers = {
    muse: { configured: Boolean(process.env.MODAL_API_KEY || process.env.META_MUSE_API_KEY || process.env.MODAL_PROXY_TOKEN_A || process.env.MODAL_MUSE_SPARK_URL) }
  };
  res.json({
    status: 'healthy',
    providers,
    museConfigured: providers.muse.configured
  });
});

// --- Authentication Endpoints ---
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password are required.' });
  }

  const user = verifyUserCredentials(email, password);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
  }

  const sessionVal = `${user.id}.${signUserId(user.id)}`;
  res.cookie(SESSION_COOKIE, sessionVal, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 365
  });

  // Log session & audit to Supabase database
  logDbUserSession({
    sessionId: sessionVal,
    userId: user.id,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip || req.headers['x-forwarded-for']
  });
  logDbAudit({
    userId: user.id,
    action: 'USER_LOGIN',
    details: { email: user.email, role: user.role },
    ipAddress: req.ip || req.headers['x-forwarded-for']
  });

  return res.json({ ok: true, user });
});

app.post('/api/auth/signup', (req, res) => {
  const { email, password, firstName, lastName } = req.body || {};
  try {
    const user = createUser({ email, password, firstName, lastName });
    const sessionVal = `${user.id}.${signUserId(user.id)}`;
    res.cookie(SESSION_COOKIE, sessionVal, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 365
    });

    // Log session & audit to Supabase database
    logDbUserSession({
      sessionId: sessionVal,
      userId: user.id,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.headers['x-forwarded-for']
    });
    logDbAudit({
      userId: user.id,
      action: 'USER_SIGNUP',
      details: { email: user.email, name: user.name },
      ipAddress: req.ip || req.headers['x-forwarded-for']
    });

    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = req.userId ? findUserById(req.userId) : null;
  if (user) {
    return res.json({ ok: true, user: sanitizeUserOutput(user) });
  }
  return res.status(401).json({ ok: false, error: 'Unauthenticated' });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.userId) {
    for (const client of wsClients) {
      if (client.userId === req.userId && client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({ type: 'session_ended' }));
          client.close(1008, 'Session ended');
        } catch {}
      }
    }
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  return res.json({ ok: true });
});

// AG-UI 1.0 Chat endpoint
app.post('/api/chat', createAgUiHandler({ engine }));

// Silent thread title summarization endpoint: returns clean, concise 3-5 word title
app.post('/api/thread/title', async (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const raw = String(text || '').trim();
    if (!raw) return res.json({ title: 'New chat' });

    let cleaned = raw
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/["'`]+/g, '')
      .replace(/^(can you|could you|please|i want to|i need to|help me|tell me about|how to|what is|search for|research and read their docs on|research and read docs on|research and read|research|find|look up|show me|hi|hey|hello)\s+/i, '')
      .replace(/[?!.:;,]+$/, '')
      .trim();

    if (!cleaned) cleaned = raw.trim();

    const words = cleaned
      .split(/\s+/)
      .filter((w) => w.length > 0 && !/^(and|the|a|an|to|for|on|with|in|of|how|we)$/i.test(w))
      .slice(0, 5);

    const titleWords = words.length > 0 ? words : cleaned.split(/\s+/).slice(0, 5);
    const title = titleWords
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .slice(0, 36);

    res.json({ title: title || 'New chat' });
  } catch (err) {
    res.json({ title: 'New chat' });
  }
});

// ---- Chat Threads & Context Persistence (User-tied) ----
app.get('/api/threads', async (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    let threads = listUserThreads(userId);
    if (!Array.isArray(threads) || threads.length === 0) {
      const dbThreads = await listDbConversations(userId);
      if (Array.isArray(dbThreads) && dbThreads.length > 0) {
        threads = dbThreads;
      }
    }
    res.json({ ok: true, threads });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/threads/:threadId', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const isOwner = await assertResourceOwnership('thread', req.params.threadId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'thread' });
    }
    let thread = getUserThread(userId, req.params.threadId);
    if (!thread) {
      const dbThread = await getDbConversation(userId, req.params.threadId);
      if (dbThread) {
        thread = dbThread;
      }
    }
    if (!thread) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'thread' });
    }
    res.json({ ok: true, thread });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/threads', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const body = req.body || {};
    const threadId = crypto.randomUUID();
    const thread = saveUserThread(userId, threadId, {
      ...body,
      id: threadId,
      threadId
    });
    res.json({ ok: true, thread });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/threads/:threadId', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const isOwner = await assertResourceOwnership('thread', req.params.threadId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'thread' });
    }
    const thread = saveUserThread(userId, req.params.threadId, req.body || {});
    res.json({ ok: true, thread });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/threads/:threadId', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const isOwner = await assertResourceOwnership('thread', req.params.threadId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'thread' });
    }
    const deleted = deleteUserThread(userId, req.params.threadId);
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Audio & Video Transcription endpoint with 10-minute segmentation support
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, durationSec, mimeType, filename, mockText, model } = req.body || {};
    const totalDuration = Number(durationSec) || 0;

    // Segment based on 10-minute (600s) threshold
    const segments = calculateMediaSegments(totalDuration, 600);

    let buffer = null;
    if (audio) {
      const strAudio = String(audio);
      const commaIdx = strAudio.indexOf(',');
      const base64Data = strAudio.startsWith('data:') && commaIdx !== -1
        ? strAudio.slice(commaIdx + 1)
        : strAudio.replace(/^data:[^,]+,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    }

    const transcriptionResult = await transcribeAudioSequentially(
      segments,
      { buffer, mimeType: mimeType || 'audio/wav', filename },
      { mockText, preferredModel: model }
    );

    res.json({
      ok: true,
      transcript: transcriptionResult.transcript,
      segmentsProcessed: transcriptionResult.segmentsProcessed,
      durationSec: totalDuration
    });
  } catch (err) {
    console.error('[API /api/transcribe error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Sequential background attachment processing endpoint (Max 5, Max 15MB individual constraint)
app.post('/api/attachments/process', async (req, res) => {
  try {
    const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (rawAttachments.length > 5) {
      return res.status(400).json({
        ok: false,
        error: 'Maximum 5 attachments allowed per message.'
      });
    }

    const MAX_INDIVIDUAL_BYTES = 15 * 1024 * 1024;
    for (const att of rawAttachments) {
      if ((att.size || 0) > MAX_INDIVIDUAL_BYTES) {
        return res.status(400).json({
          ok: false,
          error: `Attachment "${att.name}" exceeds the 15MB limit.`
        });
      }
    }

    // Sort strictly by internal order (1..N)
    const sorted = [...rawAttachments].sort((a, b) => (a.order || 0) - (b.order || 0));
    const processedAttachments = [];

    // Process sequentially in the background
    for (let i = 0; i < sorted.length; i++) {
      const att = sorted[i];
      const orderNum = att.order || i + 1;
      console.log(`[Dotta Attachments] Sequentially processing attachment ${orderNum} of ${sorted.length}: "${att.name}" (${att.size} bytes)`);

      // Persist the raw file into the user's own sandboxed workspace so the
      // agent's file tools (file_list, file_read, segment_image, ...) can
      // actually use it. The workspace folder is created on demand, tied to
      // the server-session user — never the root directory.
      let workspacePath = '';
      const sessionUserId =
        sanitizeUserId(req.userId) ||
        sanitizeUserId(req.get('x-user-id') || req.query?.userId || req.body?.userId);
      if (sessionUserId && att.dataUrl?.startsWith('data:')) {
        try {
          const comma = att.dataUrl.indexOf(',');
          const buffer = Buffer.from(att.dataUrl.slice(comma + 1), 'base64');
          if (buffer.length > 0) {
            const root = getUserWorkspaceRoot(sessionUserId);
            const safeName = String(att.name || `attachment-${orderNum}`)
              .split(/[/\\]/)
              .pop()
              .replace(/[^a-zA-Z0-9._-]/g, '_')
              .slice(0, 100);
            const rel = `uploads/${Date.now()}-${safeName}`;
            const dest = validateAndResolvePath(root, rel);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buffer);
            workspacePath = rel;
          }
        } catch (err) {
          console.warn('[Dotta Attachments] Failed to save attachment to workspace:', err.message);
        }
      }

      let textSummary = '';
      if (att.textContent) {
        textSummary = att.textContent.slice(0, 3000);
      } else if (att.type?.startsWith('text/') || att.name?.match(/\.(txt|md|json|js|ts|py|html|css|csv)$/i)) {
        if (att.dataUrl?.startsWith('data:')) {
          try {
            const comma = att.dataUrl.indexOf(',');
            const base64 = att.dataUrl.slice(comma + 1);
            textSummary = Buffer.from(base64, 'base64').toString('utf8').slice(0, 3000);
          } catch {}
        }
      } else if (att.type?.startsWith('audio/') || att.name?.match(/\.(wav|mp3|m4a|ogg|webm|flac)$/i)) {
        if (att.dataUrl?.startsWith('data:')) {
          try {
            const comma = att.dataUrl.indexOf(',');
            const base64 = att.dataUrl.slice(comma + 1);
            const buffer = Buffer.from(base64, 'base64');
            const transcriptionResult = await transcribeAudioSequentially(
              calculateMediaSegments(300, 600),
              { buffer, mimeType: att.type || 'audio/wav', filename: att.name },
              { preferredModel: req.body?.model || process.env.DEFAULT_MODEL || 'muse-spark-open' }
            );
            if (transcriptionResult?.transcript) {
              textSummary = `[Audio Transcript of "${att.name}"]:\n${transcriptionResult.transcript}`;
            }
          } catch (err) {
            console.error('[Dotta Attachments] Meta audio transcription failed:', err.message);
            return res.status(503).json({
              ok: false,
              error: `Audio transcription failed for "${att.name}": ${err.message || 'All Meta voice model endpoints are unreachable.'}`
            });
          }
        }
      }

      // Screen attachment-derived text before it enters agent context.
      if (textSummary) {
        const assessment = scanForInjection(textSummary);
        if (assessment.tier === 'quarantine') {
          textSummary = quarantineNotice('attachment', assessment, textSummary);
        } else if (assessment.tier === 'warn') {
          textSummary = `${warningBanner('attachment', assessment)}\n${wrapUntrustedContent('attachment', textSummary)}`;
        } else {
          textSummary = wrapUntrustedContent('attachment', textSummary);
        }
      }

      // Permanently record file upload in Supabase tied to the user profile ID
      if (sessionUserId) {
        try {
          const secureUploadId = crypto.randomUUID();
          await recordDbUserUpload({
            id: secureUploadId,
            userId: sessionUserId,
            threadId: req.body?.threadId || null,
            name: att.name || `attachment-${orderNum}`,
            size: att.size || 0,
            type: att.type || 'application/octet-stream',
            workspacePath: workspacePath || '',
            metadata: {
              order: orderNum,
              summary: textSummary ? textSummary.slice(0, 500) : ''
            }
          });
        } catch (dbErr) {
          console.warn('[Dotta Attachments] Failed to record upload in Supabase:', dbErr.message);
        }
      }

      processedAttachments.push({
        id: crypto.randomUUID(),
        order: orderNum,
        name: att.name,
        size: att.size,
        type: att.type,
        workspacePath: workspacePath || undefined,
        summary:
          (textSummary || `Processed ${att.type || 'file'} (${att.size} bytes)`) +
          (workspacePath
            ? `\nSaved to your workspace as "${workspacePath}". Use file tools (file_read, segment_image, media processors) on that path when the task needs the actual file.`
            : '\nNo file bytes were received for this attachment, so it was not saved to the workspace.')
      });
    }

    const contextSummary = `User submitted ${sorted.length} attachments processed sequentially in background:\n` +
      processedAttachments.map((p) => `Attachment ${p.order}: "${p.name}" (${p.size} bytes, ${p.type})\n${p.summary}`).join('\n\n');

    res.json({
      ok: true,
      totalAttachments: sorted.length,
      processed: processedAttachments,
      contextPrompt: contextSummary
    });
  } catch (err) {
    console.error('[API /api/attachments/process error]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List user uploaded files tied to their profile ID in Supabase
app.get('/api/user/uploads', async (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const uploads = await listDbUserUploads(userId);
    res.json({ ok: true, uploads });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Per-user sandboxed workspace (one isolated folder per user ID).
// Server session is strictly authoritative: unauthenticated requests are rejected with 401.
function requireSandboxUserId(req, res) {
  const userId = sanitizeUserId(req.userId);
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return null;
  }
  return userId;
}

app.get('/api/workspace/files', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    res.json({ ok: true, files: listUserWorkspaceFiles(userId) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/workspace/file', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  const filePath = String(req.query.path || '');
  try {
    const isOwner = await assertResourceOwnership('workspace_file', filePath, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
    }
    const file = readUserWorkspaceFile(userId, filePath);
    if (!file) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
    }
    res.json({ ok: true, file });
  } catch (err) {
    return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
  }
});

// Signed download token generator (short-lived HMAC token bound to user and file path)
app.get('/api/workspace/signed-url', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  const filePath = String(req.query.path || '');
  if (!filePath) {
    return res.status(400).json({ ok: false, error: 'File path required' });
  }
  const { token, expires } = generateSignedDownloadToken(userId, filePath, SESSION_SECRET, 300);
  const downloadUrl = `/api/workspace/download?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`;
  res.json({ ok: true, downloadUrl, expires });
});

// Download endpoint: strictly verified via signed token or active session ownership
app.get('/api/workspace/download', async (req, res) => {
  const startMs = Date.now();
  const filePath = String(req.query.path || '');
  const token = String(req.query.token || '');
  let verifiedUserId = sanitizeUserId(req.userId);

  if (token) {
    const queryUserId = sanitizeUserId(req.query.userId);
    const candidateUser = verifiedUserId || queryUserId;
    if (candidateUser && verifySignedDownloadToken(token, candidateUser, filePath, SESSION_SECRET)) {
      verifiedUserId = candidateUser;
    } else {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
    }
  }

  if (!verifiedUserId) {
    return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
  }

  const isOwner = await assertResourceOwnership('workspace_file', filePath, verifiedUserId);
  if (!isOwner) {
    return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
  }

  try {
    const root = getUserWorkspaceRoot(verifiedUserId);
    const resolved = validateAndResolvePath(root, filePath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
    }
    const safeBase = path.basename(resolved);
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(resolved);
  } catch {
    return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
  }
});

// Raw sandbox file bytes (photos, entry files) — ownership checked via sandbox
app.get('/api/workspace/raw', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  const filePath = String(req.query.path || '');
  try {
    const isOwner = await assertResourceOwnership('workspace_file', filePath, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
    }
    const root = getUserWorkspaceRoot(userId);
    const resolved = validateAndResolvePath(root, filePath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
    }
    const ext = path.extname(resolved).toLowerCase();
    const mime =
      {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.md': 'text/markdown'
      }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(fs.readFileSync(resolved));
  } catch (err) {
    return sendUniformNotFound(res, startMs, { req, resourceType: 'workspace_file' });
  }
});

// ---- BIO (user-owned profile store) ----
function bioFail(res, err) {
  res.status(400).json({ ok: false, error: err.message || 'BIO request failed' });
}

app.get('/api/bio', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const doc = loadUserBio(userId);
    res.json({
      ok: true,
      profiles: doc.profiles,
      activeProfileId: (doc.profiles.find((p) => p.isActive) || {}).id || null
    });
  } catch (err) {
    bioFail(res, err);
  }
});

app.put('/api/bio/fields', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, fieldId, value } = req.body || {};
    const isOwner = await assertResourceOwnership('bio_profile', profileId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_profile' });
    }
    const profile = bioSetField(userId, String(profileId || ''), String(fieldId || ''), value);
    res.json({ ok: true, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

app.patch('/api/bio/profile', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, name, grants } = req.body || {};
    const isOwner = await assertResourceOwnership('bio_profile', profileId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_profile' });
    }
    const profile = bioUpdateProfile(userId, String(profileId || ''), { name, grants });
    res.json({ ok: true, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

app.post('/api/bio/profiles', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const profile = bioCreateProfile(userId, (req.body || {}).name);
    res.json({ ok: true, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

app.post('/api/bio/profiles/:id/activate', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const isOwner = await assertResourceOwnership('bio_profile', req.params.id, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_profile' });
    }
    const profile = bioSetActiveProfile(userId, req.params.id);
    res.json({ ok: true, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

app.delete('/api/bio/profiles/:id', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const isOwner = await assertResourceOwnership('bio_profile', req.params.id, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_profile' });
    }
    const profiles = bioDeleteProfile(userId, req.params.id);
    res.json({ ok: true, profiles });
  } catch (err) {
    bioFail(res, err);
  }
});

function decodeBioUpload(file, maxBytes, label) {
  if (!file || !file.dataBase64) return null;
  const buffer = Buffer.from(String(file.dataBase64), 'base64');
  if (buffer.length > maxBytes) {
    throw new Error(`${label} exceeds the ${Math.round(maxBytes / 1000000)}MB limit`);
  }
  return buffer;
}

function writeSandboxUpload(userId, file, buffer) {
  const root = getUserWorkspaceRoot(userId);
  const safeBase = String(file.name || 'file')
    .split(/[/\\]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  const rel = `bio/${Date.now()}-${safeBase}`;
  const resolved = validateAndResolvePath(root, rel);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, buffer);
  return rel;
}

app.post('/api/bio/entries', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, name, type, description, file } = req.body || {};
    const isOwner = await assertResourceOwnership('bio_profile', profileId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_profile' });
    }
    let entryFile = null;
    let textContent = '';
    if (file && file.dataBase64) {
      const buffer = decodeBioUpload(file, 15 * 1024 * 1024, 'File');
      const mime = String(file.mime || '');
      if (type === 'image' && !mime.startsWith('image/')) throw new Error('Expected an image file');
      if (type === 'audio' && !mime.startsWith('audio/')) throw new Error('Expected an audio file');
      if (type === 'video' && !mime.startsWith('video/')) throw new Error('Expected a video file');
      const rel = writeSandboxUpload(userId, file, buffer);
      entryFile = { name: String(file.name || 'file'), size: buffer.length, mime, path: rel };
      if (type === 'document' && (mime.startsWith('text/') || /\.(txt|md|json|csv)$/i.test(file.name || ''))) {
        textContent = buffer.toString('utf8').slice(0, 20000);
      }
    }
    const entry = bioAddEntry(userId, String(profileId || ''), {
      name,
      type,
      description,
      file: entryFile,
      textContent
    });
    res.json({ ok: true, entry });
  } catch (err) {
    bioFail(res, err);
  }
});

app.patch('/api/bio/entries/:id', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const isOwner = await assertResourceOwnership('bio_entry', req.params.id, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_entry' });
    }
    const { profileId, name, description, agentReadable } = req.body || {};
    const entry = bioUpdateEntry(userId, String(profileId || ''), req.params.id, {
      name,
      description,
      agentReadable
    });
    res.json({ ok: true, entry });
  } catch (err) {
    bioFail(res, err);
  }
});

app.delete('/api/bio/entries/:id', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const isOwner = await assertResourceOwnership('bio_entry', req.params.id, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_entry' });
    }
    const entries = bioDeleteEntry(userId, String(req.query.profileId || ''), req.params.id);
    res.json({ ok: true, entries });
  } catch (err) {
    bioFail(res, err);
  }
});

app.post('/api/bio/photo', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, file } = req.body || {};
    const isOwner = await assertResourceOwnership('bio_profile', profileId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_profile' });
    }
    if (!file || !String(file.mime || '').startsWith('image/')) {
      throw new Error('Photo must be an image file');
    }
    const buffer = decodeBioUpload(file, 5 * 1024 * 1024, 'Photo');
    const rel = writeSandboxUpload(userId, file, buffer);
    const profile = bioSetField(userId, String(profileId || ''), 'photo', rel);
    res.json({ ok: true, path: rel, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

app.post('/api/bio/cv', async (req, res) => {
  const startMs = Date.now();
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, file } = req.body || {};
    const isOwner = await assertResourceOwnership('bio_profile', profileId, userId);
    if (!isOwner) {
      return sendUniformNotFound(res, startMs, { req, resourceType: 'bio_profile' });
    }
    if (!file) throw new Error('CV file is required');
    if (!/\.(pdf|doc|docx|txt|md)$/i.test(file.name || '')) {
      throw new Error('CV must be a PDF, DOC, DOCX, TXT or MD file');
    }
    const buffer = decodeBioUpload(file, 10 * 1024 * 1024, 'CV');
    const rel = writeSandboxUpload(userId, file, buffer);
    const cv = { name: String(file.name), size: buffer.length, mime: String(file.mime || ''), path: rel };
    const profile = bioSetField(userId, String(profileId || ''), 'cv', cv);
    res.json({ ok: true, cv, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

// Explicit browser termination endpoint
app.post('/api/browser/close', async (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  const activeSandbox = getActiveBrowserSandbox();
  if (activeSandbox && activeSandbox.userId && activeSandbox.userId !== userId) {
    return res.status(403).json({ ok: false, error: 'Unauthorized to close active browser' });
  }
  try {
    await closeLiveBrowser(broadcast);
    res.json({ ok: true, closed: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve generated images from Meta muse-image-1.0 (strictly user-owned)
app.get('/api/images/:filename', (req, res) => {
  const startMs = Date.now();
  const userId = sanitizeUserId(req.userId);
  if (!userId) {
    return sendUniformNotFound(res, startMs, { req, resourceType: 'image' });
  }
  const item = getGeneratedImage(req.params.filename, userId);
  if (!item || !item.buffer) {
    return sendUniformNotFound(res, startMs, { req, resourceType: 'image' });
  }
  res.setHeader('Content-Type', item.mimeType || 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(item.buffer);
});

// Static frontend in production
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(200).send('Dotta Server is running. Frontend build not present.');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Dotta Server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[Dotta Stream] WebSocket active on ws://0.0.0.0:${PORT}/ws`);
  console.log(`[Dotta Engine] Default model configured: ${process.env.DEFAULT_MODEL || 'muse-spark-open'}`);
});
