/**
 * scripts/fetch-elements-batch.js
 *
 * Batch-fetches official assistant-ui element registry definitions from
 * https://r.assistant-ui.com/elements-<slug>.json (or https://r.assistant-ui.com/<slug>.json)
 * group by group, saving the official component source code into
 * src/ui/components/assistant-ui/elements/
 *
 * Usage:
 *   node scripts/fetch-elements-batch.js <group-name|all>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ELEMENTS_DIR = path.join(ROOT_DIR, 'src', 'ui', 'components', 'assistant-ui', 'elements');
const UTILS_DIR = path.join(ROOT_DIR, 'src', 'ui', 'components', 'assistant-ui', 'utils');

export const ELEMENT_BATCHES = {
  'shared-core': [
    'surfaces',
    'collapsible-root',
    'tool-fallback',
    'reasoning',
    'sources',
    'attachment'
  ],
  'tool-use': [
    'run-activity',
    'tool-call',
    'tool-timeline',
    'terminal-block',
    'code-diff',
    'reviewable-diff',
    'file-tree',
    'elicitation-form',
    'mcp-server-panel',
    'tool-error',
    'permission-grant',
    'computer-use',
    'code-runner'
  ],
  'reasoning': [
    'loading-state',
    'thinking-indicator',
    'streaming-text',
    'typing-indicator',
    'reasoning-effort',
    'guardrail-notice'
  ],
  'messages': [
    'message-pair',
    'message-branches',
    'message-actions',
    'error-state',
    'message-queue',
    'edit-message',
    'feedback-dialog',
    'stopped-run',
    'day-separator',
    'speaker-identity',
    'regenerate-menu',
    'confidence-marker'
  ],
  'agents-observability': [
    'agent-plan',
    'subagent-list',
    'task-card',
    'agent-status',
    'approval-card',
    'option-list',
    'question-flow',
    'recommendation-card',
    'artifact-card',
    'todo-list',
    'agent-card',
    'agent-handoff',
    'background-inbox',
    'checkpoint-history',
    'schedule-card',
    'trace-waterfall',
    'cost-meter',
    'quota-banner'
  ],
  'knowledge-structured': [
    'web-search',
    'inline-citation',
    'link-preview',
    'image-generation',
    'image-gallery',
    'retrieval-chunks',
    'document-reference',
    'memory-chips',
    'research-report',
    'map-answer',
    'geo-map',
    'data-table',
    'number-ticker',
    'chart',
    'media-player',
    'web-preview',
    'diagram',
    'flow-graph',
    'activity-graph',
    'math-block',
    'spec-sheet',
    'comparison-card',
    'timeline',
    'job-progress',
    'score-breakdown'
  ],
  'composer-voice-core': [
    'composer-slash-commands',
    'composer-mentions',
    'composer-attachments',
    'composer-model-picker',
    'composer-voice',
    'composer-context',
    'draft-restore',
    'context-breakdown',
    'prompt-library',
    'command-palette',
    'voice-conversation',
    'read-aloud',
    'message-timing',
    'conversation-map',
    'context-display',
    'mcp-config',
    'follow-up-suggestions',
    'tool-group',
    'quote',
    'image',
    'file',
    'model-selector',
    'composer-trigger-popover',
    'directive-text'
  ]
};

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 404) {
        return null;
      }
    } catch (err) {
      if (attempt === retries) {
        console.warn(`  [WARN] Failed to fetch ${url}: ${err.message}`);
      } else {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }
  return null;
}

async function fetchElementRegistryItem(slug) {
  const urls = [
    `https://r.assistant-ui.com/elements-${slug}.json`,
    `https://r.assistant-ui.com/${slug}.json`
  ];
  for (const url of urls) {
    const data = await fetchWithRetry(url);
    if (data && Array.isArray(data.files)) {
      return { slug, url, data };
    }
  }
  return null;
}

async function runBatch(batchName) {
  const slugs = ELEMENT_BATCHES[batchName];
  if (!slugs) {
    console.error(`Unknown batch "${batchName}". Available: ${Object.keys(ELEMENT_BATCHES).join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(ELEMENTS_DIR, { recursive: true });
  fs.mkdirSync(UTILS_DIR, { recursive: true });
  const registryCacheDir = path.join(ELEMENTS_DIR, '_registry');
  fs.mkdirSync(registryCacheDir, { recursive: true });

  console.log(`\n=== Running Batch: ${batchName} (${slugs.length} elements) ===`);
  let successCount = 0;

  for (const slug of slugs) {
    const result = await fetchElementRegistryItem(slug);
    if (!result) {
      console.log(`  [MISS] ${slug}`);
      continue;
    }

    const { data, url } = result;
    fs.writeFileSync(
      path.join(registryCacheDir, `${slug}.json`),
      JSON.stringify(data, null, 2),
      'utf8'
    );

    for (const file of data.files) {
      const baseName = path.basename(file.path);
      if (file.path.includes('/utils/')) {
        fs.writeFileSync(path.join(UTILS_DIR, baseName), file.content, 'utf8');
      }
    }

    successCount++;
    console.log(`  [OK]   ${slug} <- ${url} (${data.files.map((f) => path.basename(f.path)).join(', ')})`);
  }

  console.log(`=== Batch ${batchName} complete: ${successCount}/${slugs.length} fetched ===\n`);
}

const targetBatch = process.argv[2] || 'tool-use';
if (targetBatch === 'all') {
  for (const name of Object.keys(ELEMENT_BATCHES)) {
    await runBatch(name);
  }
} else {
  await runBatch(targetBatch);
}
