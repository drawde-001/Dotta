/**
 * sandbox-tools.js
 *
 * Autonomous & Adaptive Toolkit for Omni's Browser Subagent.
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

        return { title, url, fields, actionButtons };
      }).catch((err) => ({
        title: 'Error reading page',
        url: page.url(),
        fields: [],
        actionButtons: [],
        error: err.message
      }));

      // Generate markdown representation
      const lines = [
        `# Page Structure & Interactive Elements`,
        `**URL**: ${pageData.url}`,
        `**Title**: ${pageData.title}`,
        `**Fields Count**: ${pageData.fields.length} | **Buttons Count**: ${pageData.actionButtons.length}\n`,
        `## Interactive Fields`
      ];

      for (const f of pageData.fields) {
        const reqStr = f.required ? ' *(required)*' : ' *(optional)*';
        const optStr = f.options?.length ? ` [options: ${f.options.slice(0, 8).join(', ')}${f.options.length > 8 ? '...' : ''}]` : '';
        const valStr = f.currentValue ? ` (current: "${f.currentValue}")` : '';
        lines.push(`- **[${f.type || f.tag}]** "${f.label}"${reqStr} -> \`${f.selector}\`${optStr}${valStr}`);
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

      return `Page snapshot captured and saved to "${safeRel}" (${pageData.fields.length} interactive fields, ${pageData.actionButtons.length} buttons). Inspect sections using notes_read or execute a batch script with sandbox_run_script.`;
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
        if (!targetSelector) throw new Error('selector is required for upload action');
        // File must resolve strictly from sandbox /sandbox/inputs/
        let uploadFilePath = '';
        if (runSandbox) {
          const cand = path.join(runSandbox.inputsDir, path.basename(String(value || '')));
          if (fs.existsSync(cand)) {
            uploadFilePath = cand;
          } else {
            // Check staged files by token
            for (const record of runSandbox.stagedFiles.values()) {
              if (record.token === value || record.fieldId === value || record.name === value) {
                uploadFilePath = record.sandboxPath;
                break;
              }
            }
          }
        }
        if (!uploadFilePath || !fs.existsSync(uploadFilePath)) {
          throw new Error(`Upload file "${value}" not found in sandbox /inputs`);
        }
        const fileInput = page.locator(targetSelector).first();
        await fileInput.setInputFiles(uploadFilePath, { timeout: 8000 });
        resultText = `Uploaded file "${path.basename(uploadFilePath)}" into "${targetSelector}".`;
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
