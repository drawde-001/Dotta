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
  OmniEngine,
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
import { resolveStagedFile } from '../src/core/bio/staging.js';
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
  setBrowserBroadcast
} from './browser-stream.js';
import { runMultiLevelFormPipeline } from '../src/core/levels/pipeline.js';
import { extractLiveDomSchemaInPlaywright } from '../src/core/levels/extractor.js';
import { createSandboxToolkit } from '../src/core/levels/sandbox-tools.js';

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
const SESSION_COOKIE = 'omni_session';
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
  if (!userId) {
    userId = sanitizeUserId(req.get('x-user-id')) || `user-${crypto.randomUUID()}`;
    res.cookie(SESSION_COOKIE, `${userId}.${signUserId(userId)}`, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
  }
  req.userId = userId;
  next();
});

app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set();

function broadcast(msg) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}
setBrowserBroadcast(broadcast);

wss.on('connection', async (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected. Total: ${wsClients.size}`);

  const page = getLiveBrowserPage();
  ws.send(
    JSON.stringify({
      type: 'init',
      url: page ? page.url() : ''
    })
  );

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleBrowserWsMessage(data, broadcast);
    } catch (err) {
      console.error('[WS Error]', err.message);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${wsClients.size}`);
  });
});

const engine = new OmniEngine({
  defaultModel: process.env.DEFAULT_MODEL || 'muse-spark-open'
});

// Register live browser executors with OmniEngine
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
    console.log(`[Omni Engine] Navigating live browser to ${searchUrl}...`);
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
    console.error('[Omni Engine] browser_search failed:', err?.message || err);
    return `Browser search error: ${err?.message || 'Failed to execute search in live browser'}`;
  }
});

function createLiveBrowserExecutor(page, runId) {
  return async (toolName, toolArgs) => {
    if (toolName === 'browser_action') {
      const { action, script, selector, selectorOrText, value } = toolArgs || {};
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
      console.log(`[Omni Engine] Navigating live browser to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    } else {
      console.log(`[Omni Engine] Live browser already on ${targetUrl}. Extracting live DOM directly without refresh to preserve form inputs.`);
    }

    const title = await page.title().catch(() => targetUrl);

    // If this is a form or application filling task, execute the Multi-Level Form Pipeline in batches!
    if (context?.formTask?.formWorkApproved) {
      try {
        const liveSchema = await extractLiveDomSchemaInPlaywright(page).catch(() => null);
        if (liveSchema && Array.isArray(liveSchema.schema?.fields) && liveSchema.schema.fields.length >= 2) {
          console.log(`[Omni Engine] Detected form on ${targetUrl} with ${liveSchema.schema.fields.length} field(s). Running Multi-Level Form Pipeline in batches...`);
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
        console.error('[Omni Engine] Multi-level form pipeline failed in browser_read_page:', pipeErr?.message || pipeErr);
      }
    }

    const text = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
    return `### Page: ${title}\n**URL**: ${targetUrl}${isAlreadyOnPage ? ' (already active, form inputs preserved)' : ''}\n\n${text}`;
  } catch (err) {
    console.error('[Omni Engine] browser_read_page failed:', err?.message || err);
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
      return `Typed "${text}" into "${target || 'focused element'}".${pressEnter ? ' Pressed Enter.' : ''} Take a snapshot_read to confirm before continuing.`;
    } else if (action === 'upload') {
      const stagedFile = resolveStagedFile(String(value || '').trim(), context?.runId);
      if (!stagedFile) {
        return 'Browser action error: Unknown upload reference. Call bio_get first to stage the BIO file, then upload with its uploadRef. Nothing was uploaded.';
      }
      const uploadPath = stagedFile.sandboxPath || stagedFile.absPath;
      const selector = String(selectorOrText || '').trim();
      let uploaded = false;
      if (selector) {
        try {
          await page.locator(selector).first().setInputFiles(uploadPath, { timeout: 6000 });
          uploaded = true;
        } catch {}
      }
      if (!uploaded) {
        // Real forms hide the actual file input behind a styled button.
        // Find the real input, preferring one whose accept matches the file.
        const ext = (stagedFile.name.split('.').pop() || '').toLowerCase();
        const mime = String(stagedFile.mime || '').toLowerCase();
        const inputs = page.locator('input[type="file"]');
        const count = await inputs.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          const candidate = inputs.nth(i);
          const accept = String((await candidate.getAttribute('accept').catch(() => '')) || '').toLowerCase();
          const matches =
            !accept ||
            accept.split(',').some((tok) => {
              const t = tok.trim();
              return (
                t === `.${ext}` ||
                t === mime ||
                (t.endsWith('/*') && mime.startsWith(t.slice(0, -1)))
              );
            });
          if (!matches) continue;
          try {
            await candidate.setInputFiles(uploadPath, { timeout: 6000 });
            uploaded = true;
            break;
          } catch {}
        }
        if (!uploaded) {
          return `Browser action error: Found ${count} file input(s) on this page but could not attach "${stagedFile.name}". Take a snapshot_read, check its fileInputs list, and target the file input directly.`;
        }
      }
      await page.waitForTimeout(350);
      return `Uploaded "${stagedFile.name}" into the form file field. Take a snapshot_read to confirm the form state before submitting.`;
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
            required: !!el.required || el.getAttribute('aria-required') === 'true'
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
            ariaLabel: el.getAttribute('aria-label') || undefined
          }))
      }))
      .catch((err) => ({ error: err.message }));
    return JSON.stringify(snapshot, null, 2);
  } catch (err) {
    console.error('[Omni Engine] snapshot_read failed:', err?.message || err);
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
    console.error('[Omni Engine] browser_screenshot failed:', err?.message || err);
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
    muse: { configured: Boolean(process.env.MODAL_API_KEY || process.env.META_MUSE_API_KEY) },
    google: { configured: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS) },
    gemini: { configured: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS) },
    openai: { configured: Boolean(process.env.OPENAI_API_KEY) },
    spark: { configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    kimi: { configured: Boolean(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) }
  };
  res.json({
    status: 'healthy',
    providers,
    museConfigured: providers.muse.configured,
    geminiConfigured: providers.google.configured
  });
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
app.get('/api/threads', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const threads = listUserThreads(userId);
    res.json({ ok: true, threads });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/threads/:threadId', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const thread = getUserThread(userId, req.params.threadId);
    if (!thread) {
      return res.status(404).json({ ok: false, error: 'Thread not found' });
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
    const threadId = body.id || body.threadId || `thread-${Date.now()}`;
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

app.patch('/api/threads/:threadId', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const thread = saveUserThread(userId, req.params.threadId, req.body || {});
    res.json({ ok: true, thread });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/threads/:threadId', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
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
      console.log(`[Omni Attachments] Sequentially processing attachment ${orderNum} of ${sorted.length}: "${att.name}" (${att.size} bytes)`);

      // Persist the raw file into the user's own sandboxed workspace so the
      // agent's file tools (file_list, file_read, segment_image, ...) can
      // actually use it. The workspace folder is created on demand, tied to
      // the server-session user — never the root directory.
      let workspacePath = '';
      const sessionUserId = sanitizeUserId(req.userId);
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
          console.warn('[Omni Attachments] Failed to save attachment to workspace:', err.message);
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

      processedAttachments.push({
        id: att.id || `att-${Date.now()}-${orderNum}`,
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

// Per-user sandboxed workspace (one isolated folder per user ID).
// Only files inside workspaces/user-<userId>/ are ever listed or read.
function requireSandboxUserId(req, res) {
  // Server session is authoritative; header/body IDs are only a first-contact fallback.
  const userId =
    sanitizeUserId(req.userId) ||
    sanitizeUserId(req.get('x-user-id') || req.query.userId || req.body?.userId);
  if (!userId) {
    res.status(400).json({ ok: false, error: 'Missing or invalid user id' });
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

app.get('/api/workspace/file', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const file = readUserWorkspaceFile(userId, String(req.query.path || ''));
    res.json({ ok: true, file });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Raw sandbox file bytes (photos, entry files) — ownership checked via sandbox.
app.get('/api/workspace/raw', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const root = getUserWorkspaceRoot(userId);
    const resolved = validateAndResolvePath(root, String(req.query.path || ''));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return res.status(404).json({ ok: false, error: 'File not found' });
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
    res.status(400).json({ ok: false, error: err.message });
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

app.put('/api/bio/fields', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, fieldId, value } = req.body || {};
    const profile = bioSetField(userId, String(profileId || ''), String(fieldId || ''), value);
    res.json({ ok: true, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

app.patch('/api/bio/profile', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, name, grants } = req.body || {};
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

app.post('/api/bio/profiles/:id/activate', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const profile = bioSetActiveProfile(userId, req.params.id);
    res.json({ ok: true, profile });
  } catch (err) {
    bioFail(res, err);
  }
});

app.delete('/api/bio/profiles/:id', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
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

app.post('/api/bio/entries', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, name, type, description, file } = req.body || {};
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

app.patch('/api/bio/entries/:id', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
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

app.delete('/api/bio/entries/:id', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const entries = bioDeleteEntry(userId, String(req.query.profileId || ''), req.params.id);
    res.json({ ok: true, entries });
  } catch (err) {
    bioFail(res, err);
  }
});

app.post('/api/bio/photo', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, file } = req.body || {};
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

app.post('/api/bio/cv', (req, res) => {
  const userId = requireSandboxUserId(req, res);
  if (!userId) return;
  try {
    const { profileId, file } = req.body || {};
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
  try {
    await closeLiveBrowser(broadcast);
    res.json({ ok: true, closed: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// Serve generated images from Meta muse-image-1.0
app.get('/api/images/:filename', (req, res) => {
  const item = getGeneratedImage(req.params.filename);
  if (!item || !item.buffer) {
    return res.status(404).json({ ok: false, error: 'Image not found' });
  }
  res.setHeader('Content-Type', item.mimeType || 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(item.buffer);
});

// Static frontend in production
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(200).send('Omni Agent Server is running. Frontend build not present.');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Omni Agent Server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[Omni Agent Stream] WebSocket active on ws://0.0.0.0:${PORT}/ws`);
  console.log(`[Omni Agent Engine] Default model configured: ${process.env.DEFAULT_MODEL || 'muse-spark-open'}`);
});
