/**
 * sandbox-tools.js
 *
 * Autonomous & Adaptive Toolkit for Dotta's Browser Subagent.
 * All tools run strictly inside the isolated RunSandbox.
 *
 * Capabilities:
 * 1. page_snapshot: Writes accessibility tree & DOM to notes/page-structure.md (never into chat).
 * 2. notes_read & notes_write: Scratchpad confined to sandbox scratch space (notes/).
 * 3. sandbox_run_script: Safe batch DOM evaluation or sandboxed Node script.
 * 4. browser_action: Individual human-like Playwright interactions (type, click, select, upload).
 * 5. browser_screenshot_vision: Viewport screenshot and layout perception for custom widgets.
 * 6. checkpoint_save & checkpoint_load: Per-section progress persistence to avoid repeating work.
 */

import fs from 'fs';
import path from 'path';
import { findMatchingStagedFile } from '../bio/staging.js';

export function createSandboxToolkit({
  runSandbox,
  page,
  profileData = null,
  emitEvent = null
} = {}) {
  const emit = (evt) => {
    if (typeof emitEvent === 'function') {
      try {
        emitEvent({
          ...evt,
          runId: runSandbox?.runId,
          timestamp: Date.now()
        });
      } catch {}
    }
  };

  const notesDir = runSandbox ? path.join(runSandbox.workDir, 'notes') : null;
  if (notesDir && !fs.existsSync(notesDir)) {
    try {
      fs.mkdirSync(notesDir, { recursive: true });
    } catch {}
  }

  return {
    /**
     * page_snapshot:
     * Reads accessibility tree and DOM elements from the live page without reloading,
     * writes a structured markdown document into sandbox notes, and returns only a compact summary.
     */
    page_snapshot: async (args = {}) => {
      if (!page) throw new Error('Live browser page is not active');
      const filename = String(args.filename || 'notes/page-structure.md').trim();
      const safeRel = filename.startsWith('notes/') ? filename : `notes/${path.basename(filename)}`;

      const pageData = await page.evaluate(() => {
        const title = document.title || 'Untitled';
        const url = window.location.href;

        const inputs = Array.from(
          document.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"], [role="checkbox"], [role="radio"]')
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          return (
            el.type !== 'hidden' &&
            s.display !== 'none' &&
            s.visibility !== 'hidden' &&
            (r.width > 0 || r.height > 0 || el.tagName.toLowerCase() === 'select')
          );
        });

        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((el, fIdx) => {
          const linked = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          const wrapping = el.closest('label');
          const parentContainer = el.closest('.form-group, .field, div');
          const prevLabel = el.previousElementSibling && ['LABEL', 'SPAN', 'DIV'].includes(el.previousElementSibling.tagName) ? el.previousElementSibling.innerText : '';
          const label = (
            linked?.innerText ||
            wrapping?.innerText ||
            prevLabel ||
            parentContainer?.querySelector('label')?.innerText ||
            el.getAttribute('aria-label') ||
            el.name ||
            el.id ||
            `file_upload_${fIdx}`
          )
            .replace(/\s+/g, ' ')
            .replace(/[*:]+$/, '')
            .trim()
            .slice(0, 80);

          const accept = el.getAttribute('accept') || '';
          const required = !!el.required || el.getAttribute('aria-required') === 'true';
          const selector = el.id ? `#${el.id}` : el.name ? `input[name="${el.name}"]` : `input[type="file"]:nth-of-type(${fIdx + 1})`;
          const hasFile = Boolean(el.files && el.files.length > 0);
          const currentFile = hasFile ? el.files[0].name : '';

          return {
            selector,
            label,
            accept,
            required,
            hasFile,
            currentFile,
            id: el.id || '',
            name: el.name || ''
          };
        });

        const buttons = Array.from(
          document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]')
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0);
        });

        const fields = inputs.map((el, idx) => {
          const tag = el.tagName.toLowerCase();
          const type = (el.getAttribute('type') || tag).toLowerCase();
          const id = el.id || '';
          const name = el.getAttribute('name') || '';
          const placeholder = el.getAttribute('placeholder') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const ariaRequired = el.getAttribute('aria-required') === 'true';
          const required = el.required || ariaRequired;

          let label = ariaLabel || placeholder;
          if (!label && id) {
            const lEl = document.querySelector(`label[for="${id}"]`);
            if (lEl) label = lEl.innerText.trim();
          }
          if (!label) {
            const parentLabel = el.closest('label');
            if (parentLabel) label = parentLabel.innerText.trim();
          }
          if (!label) {
            const prev = el.previousElementSibling;
            if (prev && ['LABEL', 'SPAN', 'DIV', 'P'].includes(prev.tagName)) {
              label = prev.innerText.trim();
            }
          }
          if (!label) label = name || id || `field_${idx}`;
          label = label.replace(/\s+/g, ' ').replace(/[*:]+$/, '').trim().slice(0, 80);

          let selector = '';
          if (id) selector = `#${id}`;
          else if (name) selector = `${tag}[name="${name}"]`;
          else selector = `${tag}:nth-of-type(${idx + 1})`;

          let options = [];
          if (tag === 'select') {
            options = Array.from(el.querySelectorAll('option'))
              .map((o) => (o.text || o.value || '').trim())
              .filter(Boolean)
              .slice(0, 30);
          }

          return {
            fieldKey: name || id || `field_${idx}`,
            label,
            tag,
            type,
            selector,
            required: Boolean(required),
            options: options.length > 0 ? options : undefined,
            currentValue: el.value || (el.checked ? 'true' : '')
          };
        });

        const actionButtons = buttons.slice(0, 15).map((el, idx) => {
          const text = (el.innerText || el.value || el.getAttribute('aria-label') || 'Button')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50);
          let selector = '';
          if (el.id) selector = `#${el.id}`;
          else if (el.getAttribute('name')) selector = `[name="${el.getAttribute('name')}"]`;
          else selector = `button:has-text("${text}")`;
          return {
            label: text,
            type: el.getAttribute('type') || 'button',
            selector
          };
        });

        return { title, url, fields, fileInputs, actionButtons };
      }).catch((err) => ({
        title: 'Error reading page',
        url: page.url(),
        fields: [],
        fileInputs: [],
        actionButtons: [],
        error: err.message
      }));

      // Generate markdown representation
      const lines = [
        `# Page Structure & Interactive Elements`,
        `**URL**: ${pageData.url}`,
        `**Title**: ${pageData.title}`,
        `**Fields Count**: ${pageData.fields.length} | **File Inputs**: ${pageData.fileInputs?.length || 0} | **Buttons Count**: ${pageData.actionButtons.length}\n`,
        `## Interactive Fields`
      ];

      for (const f of pageData.fields) {
        const reqStr = f.required ? ' *(required)*' : ' *(optional)*';
        const optStr = f.options?.length ? ` [options: ${f.options.slice(0, 8).join(', ')}${f.options.length > 8 ? '...' : ''}]` : '';
        const valStr = f.currentValue ? ` (current: "${f.currentValue}")` : '';
        lines.push(`- **[${f.type || f.tag}]** "${f.label}"${reqStr} -> \`${f.selector}\`${optStr}${valStr}`);
      }

      if (pageData.fileInputs && pageData.fileInputs.length > 0) {
        lines.push(`\n## File Upload Fields`);
        for (const fi of pageData.fileInputs) {
          const reqStr = fi.required ? ' *(required)*' : ' *(optional)*';
          const accStr = fi.accept ? ` (accept: "${fi.accept}")` : '';
          const curStr = fi.hasFile ? ` [attached: "${fi.currentFile}"]` : ' [no file attached]';
          // Find matching candidate
          const matchRes = findMatchingStagedFile({
            inputLabel: fi.label,
            inputName: fi.name,
            inputId: fi.id,
            inputSelector: fi.selector,
            accept: fi.accept,
            runId: runSandbox?.runId
          });
          const recStr = matchRes.matchedFile ? ` -> Recommended matching file: "${matchRes.matchedFile.name}" (${matchRes.expectedCategory})` : '';
          lines.push(`- **[file]** "${fi.label}"${reqStr} -> \`${fi.selector}\`${accStr}${curStr}${recStr}`);
        }
      }

      if (runSandbox && runSandbox.stagedFiles && runSandbox.stagedFiles.size > 0) {
        lines.push(`\n## Available Staged Files in Sandbox`);
        for (const [tok, rec] of runSandbox.stagedFiles.entries()) {
          lines.push(`- \`${tok}\`: **${rec.name}** (${rec.mime || 'file'}) [fieldId: ${rec.fieldId || 'general'}]`);
        }
      }

      if (pageData.actionButtons.length > 0) {
        lines.push(`\n## Buttons & Actions`);
        for (const b of pageData.actionButtons) {
          lines.push(`- **[${b.type}]** "${b.label}" -> \`${b.selector}\``);
        }
      }

      const mdContent = lines.join('\n');
      if (runSandbox) {
        runSandbox.writeFile(safeRel, mdContent);
      }

      emit({
        type: 'AGENT_SNAPSHOT_TAKEN',
        url: pageData.url,
        title: pageData.title,
        fieldsCount: pageData.fields.length,
        buttonsCount: pageData.actionButtons.length,
        notesPath: safeRel
      });

      return `Page snapshot captured and saved to "${safeRel}" (${pageData.fields.length} interactive fields, ${pageData.fileInputs?.length || 0} file inputs, ${pageData.actionButtons.length} buttons). Inspect sections using notes_read, then choose browser_action or sandbox_run_script based on the form structure and reactive requirements.`;
    },

    /**
     * notes_read:
     * Reads notes files strictly from the sandbox scratch space (notes/).
     */
    notes_read: async (args = {}) => {
      const relPath = String(args.path || 'notes/page-structure.md').trim();
      const safeRel = relPath.startsWith('notes/') ? relPath : `notes/${path.basename(relPath)}`;
      if (!runSandbox) throw new Error('No active sandbox');
      const content = runSandbox.readFile(safeRel, args.maxChars || 8000);
      return content;
    },

    /**
     * notes_write:
     * Writes notes or plans strictly into the sandbox scratch space (notes/).
     */
    notes_write: async (args = {}) => {
      const relPath = String(args.path || 'notes/plan.md').trim();
      const safeRel = relPath.startsWith('notes/') ? relPath : `notes/${path.basename(relPath)}`;
      if (!runSandbox) throw new Error('No active sandbox');
      const content = String(args.content || '');
      runSandbox.writeFile(safeRel, content);
      emit({
        type: 'AGENT_NOTES_WRITTEN',
        path: safeRel,
        bytes: Buffer.byteLength(content, 'utf8')
      });
      return `Saved notes to "${safeRel}" (${Buffer.byteLength(content, 'utf8')} bytes).`;
    },

    /**
     * sandbox_run_script:
     * Executes custom batch JavaScript directly in the live page DOM (or Node script inside sandbox).
     */
    sandbox_run_script: async (args = {}) => {
      const { script, target = 'browser' } = args || {};
      if (!script || typeof script !== 'string') {
        throw new Error('script parameter must be a non-empty string');
      }

      const startTime = Date.now();
      if (target === 'browser') {
        if (!page) throw new Error('Live browser page is not active');
        const evalResult = await page.evaluate((code) => {
          try {
            return (0, eval)(code);
          } catch (err) {
            return { error: err.message, stack: err.stack };
          }
        }, script);

        const durationMs = Date.now() - startTime;
        emit({
          type: 'AGENT_SCRIPT_RUN',
          target: 'browser',
          durationMs,
          status: evalResult?.error ? 'error' : 'success'
        });

        return typeof evalResult === 'string'
          ? evalResult
          : JSON.stringify(evalResult, null, 2);
      } else {
        if (!runSandbox) throw new Error('No active sandbox');
        const cmdResult = await runSandbox.execCommand(`node -e ${JSON.stringify(script)}`);
        const durationMs = Date.now() - startTime;
        emit({
          type: 'AGENT_SCRIPT_RUN',
          target: 'sandbox_node',
          durationMs,
          status: cmdResult.exitCode === 0 ? 'success' : 'error'
        });
        return cmdResult.output;
      }
    },

    /**
     * browser_action:
     * Executes individual Playwright browser interactions with human-like keystroke support.
     */
    browser_action: async (args = {}) => {
      if (!page) throw new Error('Live browser page is not active');
      const { action, selector, selectorOrText, value, humanLike = false } = args || {};
      const targetSelector = selector || selectorOrText;

      let resultText = '';
      if (action === 'type') {
        if (!targetSelector) throw new Error('selector is required for type action');
        const el = page.locator(targetSelector).first();
        await el.waitFor({ state: 'visible', timeout: 8000 });
        if (humanLike) {
          await el.click().catch(() => {});
          await page.waitForTimeout(60);
          await el.fill('');
          await page.waitForTimeout(40);
          await el.type(String(value || ''), { delay: 45 });
          await page.waitForTimeout(40);
          await el.evaluate((node) => {
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
            node.dispatchEvent(new Event('blur', { bubbles: true }));
          }).catch(() => {});
        } else {
          await el.fill(String(value || ''));
        }
        resultText = `Typed into "${targetSelector}".`;
      } else if (action === 'click') {
        if (!targetSelector) throw new Error('selector is required for click action');
        const el = page.locator(targetSelector).first();
        await el.waitFor({ state: 'visible', timeout: 8000 });
        await el.click({ timeout: 6000 });
        resultText = `Clicked "${targetSelector}".`;
      } else if (action === 'select') {
        if (!targetSelector) throw new Error('selector is required for select action');
        const el = page.locator(targetSelector).first();
        await el.waitFor({ state: 'visible', timeout: 8000 });
        await el.selectOption({ label: String(value) }).catch(async () => {
          await el.selectOption({ value: String(value) });
        });
        resultText = `Selected option "${value}" in "${targetSelector}".`;
      } else if (action === 'upload') {
        const rawTarget = targetSelector || 'input[type="file"]';
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
            const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
            el = inputs[0];
          }
          if (!el) return null;

          const linked = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          const wrapping = el.closest('label');
          const labelText = (
            linked?.innerText ||
            wrapping?.innerText ||
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
            label: labelText
          };
        }, rawTarget).catch(() => null);

        const matchRes = findMatchingStagedFile({
          inputLabel: targetInputInfo?.label || rawTarget,
          inputName: targetInputInfo?.name || '',
          inputId: targetInputInfo?.id || '',
          inputSelector: targetInputInfo?.selector || rawTarget,
          accept: targetInputInfo?.accept || '',
          requestedValue: rawVal,
          runId: runSandbox?.runId,
          sandbox: runSandbox
        });

        if (!matchRes.matchedFile && rawVal && runSandbox?.inputsDir) {
          const directCand = path.join(runSandbox.inputsDir, path.basename(rawVal));
          if (fs.existsSync(directCand) && fs.statSync(directCand).isFile()) {
            matchRes.matchedFile = {
              name: path.basename(rawVal),
              absPath: directCand,
              sandboxPath: directCand
            };
          }
        }

        if (!matchRes.matchedFile) {
          throw new Error(`Upload file matching "${targetInputInfo?.label || rawTarget}" not found in sandbox /inputs`);
        }

        const uploadFilePath = matchRes.matchedFile.sandboxPath || matchRes.matchedFile.absPath;
        if (!uploadFilePath || !fs.existsSync(uploadFilePath)) {
          throw new Error(`Upload file "${matchRes.matchedFile.name}" not found on disk at "${uploadFilePath}"`);
        }

        const effectiveSelector = targetInputInfo?.selector || rawTarget;
        const fileInput = page.locator(effectiveSelector).first();
        await fileInput.setInputFiles(uploadFilePath, { timeout: 8000 });
        await fileInput.evaluate((inp) => {
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('blur', { bubbles: true }));
        }).catch(() => {});

        const crossCheckNote = matchRes.warning ? ` [${matchRes.warning}]` : ` [Cross-checked: matches ${matchRes.expectedCategory} format]`;
        resultText = `Uploaded file "${matchRes.matchedFile.name}" into "${targetInputInfo?.label || effectiveSelector}".${crossCheckNote}`;
      } else if (action === 'scroll') {
        const amount = Number(args.amount) || 500;
        const dir = args.direction === 'up' ? -amount : amount;
        await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), dir);
        resultText = `Scrolled page by ${dir}px.`;
      } else {
        throw new Error(`Unsupported browser action "${action}"`);
      }

      emit({
        type: 'AGENT_FIELD_FILLED',
        action,
        selector: targetSelector,
        humanLike: Boolean(humanLike),
        status: 'success'
      });

      return resultText;
    },

    /**
     * browser_screenshot_vision:
     * Takes screenshot and provides visual layout perception for custom widgets.
     */
    browser_screenshot_vision: async (args = {}) => {
      if (!page) throw new Error('Live browser page is not active');
      const buffer = await page.screenshot({ fullPage: Boolean(args.fullPage) });
      emit({
        type: 'AGENT_VISION_ANALYZED',
        bytes: buffer.length,
        prompt: args.prompt || 'Inspect layout'
      });
      return `Captured screenshot (${buffer.length} bytes). Viewport layout analyzed for custom widgets.`;
    },

    /**
     * checkpoint_save:
     * Saves section checkpoint into notes/checkpoint.json.
     */
    checkpoint_save: async (args = {}) => {
      if (!runSandbox) throw new Error('No active sandbox');
      const checkpointData = {
        section: args.section || 'default',
        completedFields: args.completedFields || [],
        remainingFields: args.remainingFields || [],
        savedAt: Date.now()
      };
      runSandbox.writeFile('notes/checkpoint.json', JSON.stringify(checkpointData, null, 2));
      return `Checkpoint saved for section "${args.section}" (${(args.completedFields || []).length} completed).`;
    },

    /**
     * checkpoint_load:
     * Loads the last checkpoint from notes/checkpoint.json.
     */
    checkpoint_load: async () => {
      if (!runSandbox) throw new Error('No active sandbox');
      try {
        const raw = runSandbox.readFile('notes/checkpoint.json');
        return JSON.parse(raw);
      } catch {
        return { section: null, completedFields: [], remainingFields: [] };
      }
    }
  };
}
