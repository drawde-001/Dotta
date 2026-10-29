/**
 * scripts/gather-all-151.js
 *
 * Gathers all 151 assistant-ui elements across all 14 categories from:
 *   1. https://r.assistant-ui.com/elements-<slug>.json
 *   2. https://r.assistant-ui.com/<slug>.json
 *   3. https://www.assistant-ui.com/elements/<slug> (showcase HTML & code blocks)
 *
 * Workflow per Eddy's instructions:
 *   Step 1: Skip the ones we've already gathered in src/ui/components/assistant-ui/elements/
 *           and gather all remaining components into ./gathered-elements/<category>/<slug>/
 *   Step 2: After gathering the remaining ones, copy/sync the already-gathered components
 *           (and their registry definitions) into ./gathered-elements/ so all 151 are in one folder.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const EXISTING_ELEMENTS_DIR = path.join(ROOT_DIR, 'src', 'ui', 'components', 'assistant-ui', 'elements');
const GATHERED_DIR = path.join(ROOT_DIR, 'gathered-elements');

export const ALL_151_CATEGORIES = {
  'Reasoning': [
    'loading-state', 'thinking-indicator', 'streaming-text',
    'typing-indicator', 'reasoning-effort', 'guardrail-notice'
  ],
  'Messages': [
    'message-pair', 'message-branches', 'message-actions', 'error-state',
    'message-queue', 'edit-message', 'feedback-dialog', 'stopped-run',
    'day-separator', 'speaker-identity', 'regenerate-menu', 'confidence-marker'
  ],
  'Tool use': [
    'tool-call', 'run-activity', 'tool-timeline', 'terminal-block',
    'code-diff', 'reviewable-diff', 'file-tree', 'elicitation-form',
    'mcp-server-panel', 'tool-error', 'permission-grant', 'computer-use', 'code-runner'
  ],
  'Knowledge': [
    'web-search', 'inline-citation', 'link-preview', 'image-generation',
    'image-gallery', 'retrieval-chunks', 'document-reference', 'memory-chips',
    'research-report', 'map-answer', 'geo-map'
  ],
  'Structured output': [
    'data-table', 'number-ticker', 'chart', 'media-player', 'web-preview',
    'diagram', 'flow-graph', 'activity-graph', 'math-block', 'spec-sheet',
    'comparison-card', 'timeline', 'job-progress', 'score-breakdown'
  ],
  'Agents': [
    'agent-plan', 'subagent-list', 'task-card', 'agent-status', 'approval-card',
    'option-list', 'question-flow', 'recommendation-card', 'artifact-card',
    'todo-list', 'agent-card', 'agent-handoff', 'background-inbox',
    'checkpoint-history', 'schedule-card'
  ],
  'Observability': [
    'trace-waterfall', 'cost-meter', 'quota-banner'
  ],
  'Composer': [
    'composer', 'composer-slash-commands', 'composer-mentions',
    'composer-attachments', 'composer-model-picker', 'composer-voice',
    'composer-context', 'draft-restore', 'context-breakdown',
    'prompt-library', 'command-palette'
  ],
  'Voice': [
    'voice-conversation', 'read-aloud'
  ],
  'Thread': [
    'chat-panel', 'empty-state', 'scroll-anchor', 'canvas-split',
    'connection-state', 'shared-conversation', 'conversation-search',
    'thread-search', 'launcher-bubble', 'settings-panel', 'onboarding', 'mobile-composer'
  ],
  'AUI connected': [
    'thread', 'assistant-modal', 'assistant-sidebar', 'thread-list',
    'thread-list-sidebar', 'orb', 'reasoning', 'message-timing',
    'conversation-map', 'context-display', 'mcp-config', 'attachment',
    'follow-up-suggestions', 'tool-fallback', 'tool-group', 'quote',
    'sources', 'image', 'file', 'model-selector',
    'composer-trigger-popover', 'directive-text'
  ],
  'Renderers': [
    'markdown-text', 'syntax-highlighter', 'shiki-highlighter',
    'mermaid-diagram', 'generative-ui'
  ],
  'Primitives': [
    'tooltip-icon-button', 'logos', 'heat-graph'
  ],
  'Generative': [
    'generative-stays', 'generative-booking', 'generative-order-status',
    'generative-flight-tracker', 'generative-portfolio', 'generative-create-event',
    'generative-view-event', 'generative-weather-current', 'generative-ride-status',
    'generative-draft-email', 'generative-cart', 'generative-playlist',
    'generative-channel-message', 'generative-receipt', 'generative-chart-area',
    'generative-player-card', 'generative-event-session', 'generative-notify-confirm',
    'generative-chart-line', 'generative-create-task', 'generative-software-purchase',
    'generative-chart-bars'
  ]
};

async function curlGet(url, timeoutSec = 20, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        'curl.exe',
        ['-sL', '--retry', '2', '--retry-delay', '1', '-m', String(timeoutSec), url],
        { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 }
      );
      if (stdout && stdout.trim().length > 0) {
        return stdout;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return '';
}

function getAlreadyGatheredMap() {
  const map = new Map();
  if (!fs.existsSync(EXISTING_ELEMENTS_DIR)) return map;
  const files = fs.readdirSync(EXISTING_ELEMENTS_DIR);
  for (const f of files) {
    if (f.endsWith('.aui.jsx')) {
      const slug = f.replace(/\.aui\.jsx$/, '');
      map.set(slug, path.join(EXISTING_ELEMENTS_DIR, f));
    } else if (f.endsWith('.jsx') && f !== 'index.js') {
      const slug = f.replace(/\.jsx$/, '');
      map.set(slug, path.join(EXISTING_ELEMENTS_DIR, f));
    }
  }
  return map;
}

function extractShowcaseSnippet(html) {
  if (!html) return '';
  const docIdx = html.indexOf('rounded-document');
  if (docIdx !== -1) {
    const start = Math.max(0, html.lastIndexOf('<div', docIdx));
    return html.slice(start, start + 14000);
  }
  const slotIdx = html.indexOf('data-slot=');
  if (slotIdx !== -1) {
    const start = Math.max(0, html.lastIndexOf('<', slotIdx));
    return html.slice(start, start + 14000);
  }
  return html.slice(0, 10000);
}

async function fetchOneElement(category, slug) {
  const catSlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const targetDir = path.join(GATHERED_DIR, catSlug, slug);
  fs.mkdirSync(targetDir, { recursive: true });

  const regJsonPath = path.join(targetDir, 'registry.json');
  const showcasePath = path.join(targetDir, 'showcase-snippet.html');
  const metaPath = path.join(targetDir, 'meta.json');

  let registryData = null;
  let matchedRegistryUrl = null;

  if (fs.existsSync(regJsonPath)) {
    try {
      registryData = JSON.parse(fs.readFileSync(regJsonPath, 'utf8'));
      if (fs.existsSync(metaPath)) {
        const oldMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        matchedRegistryUrl = oldMeta.registryUrl;
      }
    } catch {}
  }

  if (!registryData) {
    const altSlug = slug === 'thread-list-sidebar' ? 'threadlist-sidebar' : slug;
    const registryUrls = [
      `https://r.assistant-ui.com/elements-${slug}.json`,
      `https://r.assistant-ui.com/${slug}.json`,
      ...(altSlug !== slug
        ? [
            `https://r.assistant-ui.com/elements-${altSlug}.json`,
            `https://r.assistant-ui.com/${altSlug}.json`
          ]
        : [])
    ];

    for (const rUrl of registryUrls) {
      const raw = await curlGet(rUrl, 20, 2);
      if (raw && raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.files)) {
            registryData = parsed;
            matchedRegistryUrl = rUrl;
            break;
          }
        } catch {}
      }
    }
  }

  let showcaseHtml = '';
  if (fs.existsSync(showcasePath)) {
    showcaseHtml = fs.readFileSync(showcasePath, 'utf8');
  }
  const pageUrl = `https://www.assistant-ui.com/elements/${slug}`;
  if (!showcaseHtml || showcaseHtml.length < 200) {
    const html = await curlGet(pageUrl, 20, 3);
    showcaseHtml = extractShowcaseSnippet(html);
    if (showcaseHtml) {
      fs.writeFileSync(showcasePath, showcaseHtml, 'utf8');
    }
  }

  // Also fetch markdown documentation / code page if available
  const mdPath = path.join(targetDir, 'page.md');
  let hasMarkdown = fs.existsSync(mdPath) && fs.statSync(mdPath).size > 50;
  if (!hasMarkdown) {
    const mdRaw = await curlGet(`https://www.assistant-ui.com/elements/${slug}.md`, 15, 2);
    if (mdRaw && mdRaw.trim().length > 50 && !mdRaw.trim().startsWith('<!DOCTYPE')) {
      fs.writeFileSync(mdPath, mdRaw, 'utf8');
      hasMarkdown = true;
    }
  }

  const savedFiles = [];
  if (registryData) {
    fs.writeFileSync(regJsonPath, JSON.stringify(registryData, null, 2), 'utf8');
    for (const fileObj of registryData.files) {
      const fileName = path.basename(fileObj.path);
      fs.writeFileSync(path.join(targetDir, fileName), fileObj.content || '', 'utf8');
      savedFiles.push(fileName);
    }
  }

  const meta = {
    slug,
    category,
    pageUrl,
    registryUrl: matchedRegistryUrl,
    hasRegistry: Boolean(registryData),
    hasMarkdown,
    hasShowcase: Boolean(showcaseHtml && showcaseHtml.length >= 200),
    files: savedFiles,
    gatheredAt: new Date().toISOString()
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const currentIdx = idx++;
      const res = await worker(items[currentIdx], currentIdx);
      results[currentIdx] = res;
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

async function main() {
  fs.mkdirSync(GATHERED_DIR, { recursive: true });
  const alreadyGathered = getAlreadyGatheredMap();

  const allItems = [];
  for (const [category, slugs] of Object.entries(ALL_151_CATEGORIES)) {
    for (const slug of slugs) {
      allItems.push({ category, slug });
    }
  }

  // Check which items still need either registry or showcase
  const needsRetry = [];
  const alreadyComplete = [];

  for (const item of allItems) {
    const catSlug = item.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const targetDir = path.join(GATHERED_DIR, catSlug, item.slug);
    const hasShow =
      fs.existsSync(path.join(targetDir, 'showcase-snippet.html')) &&
      fs.statSync(path.join(targetDir, 'showcase-snippet.html')).size >= 200;
    if (hasShow) {
      const meta = JSON.parse(fs.readFileSync(path.join(targetDir, 'meta.json'), 'utf8'));
      alreadyComplete.push(meta);
    } else {
      needsRetry.push(item);
    }
  }

  console.log(`=== Already Complete in gathered-elements/: ${alreadyComplete.length}/151 ===`);
  console.log(`=== Fetching/Completing Remaining:          ${needsRetry.length}/151 ===\n`);

  const retriedResults = await runWithConcurrency(needsRetry, 3, async (item, i) => {
    const meta = await fetchOneElement(item.category, item.slug);
    const existingPath = alreadyGathered.get(item.slug);
    if (existingPath && fs.existsSync(existingPath)) {
      const catSlug = item.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const targetDir = path.join(GATHERED_DIR, catSlug, item.slug);
      const destFile = path.join(targetDir, path.basename(existingPath));
      if (!fs.existsSync(destFile)) {
        fs.copyFileSync(existingPath, destFile);
      }
      meta.existingUiFile = path.basename(existingPath);
      fs.writeFileSync(path.join(targetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    }
    console.log(
      `[Complete ${i + 1}/${needsRetry.length}] ${item.category} -> ${item.slug} | registry=${meta.hasRegistry} | md=${meta.hasMarkdown} | showcase=${meta.hasShowcase}`
    );
    return meta;
  });

  // Finalize special mapped registry items so 151/151 have complete code files:
  // 1. orb -> https://r.assistant-ui.com/voice.json
  const orbDir = path.join(GATHERED_DIR, 'aui-connected', 'orb');
  if (!fs.existsSync(path.join(orbDir, 'registry.json'))) {
    const voiceRaw = await curlGet('https://r.assistant-ui.com/voice.json', 15, 2);
    if (voiceRaw && voiceRaw.trim().startsWith('{')) {
      const voiceReg = JSON.parse(voiceRaw);
      fs.writeFileSync(path.join(orbDir, 'registry.json'), JSON.stringify(voiceReg, null, 2), 'utf8');
      for (const f of voiceReg.files || []) {
        fs.writeFileSync(path.join(orbDir, path.basename(f.path)), f.content || '', 'utf8');
      }
    }
  }

  // 2. generative-ui-style.json -> gathered-elements/renderers/generative-ui/
  const genUiDir = path.join(GATHERED_DIR, 'renderers', 'generative-ui');
  if (!fs.existsSync(path.join(genUiDir, 'generative-ui-style.json'))) {
    const styleRaw = await curlGet('https://r.assistant-ui.com/generative-ui-style.json', 15, 2);
    if (styleRaw && styleRaw.trim().startsWith('{')) {
      const styleReg = JSON.parse(styleRaw);
      fs.writeFileSync(path.join(genUiDir, 'generative-ui-style.json'), JSON.stringify(styleReg, null, 2), 'utf8');
      for (const f of styleReg.files || []) {
        fs.writeFileSync(path.join(genUiDir, path.basename(f.path)), f.content || '', 'utf8');
      }
    }
  }

  // 3. composer-* sub-elements share composer.tsx from gathered-elements/composer/composer/
  const mainComposerDir = path.join(GATHERED_DIR, 'composer', 'composer');
  const composerSubSlugs = [
    'composer-slash-commands',
    'composer-mentions',
    'composer-attachments',
    'composer-model-picker',
    'composer-voice',
    'composer-context'
  ];
  if (fs.existsSync(path.join(mainComposerDir, 'composer.tsx'))) {
    for (const subSlug of composerSubSlugs) {
      const subDir = path.join(GATHERED_DIR, 'composer', subSlug);
      fs.copyFileSync(path.join(mainComposerDir, 'composer.tsx'), path.join(subDir, 'composer.tsx'));
      fs.copyFileSync(path.join(mainComposerDir, 'registry.json'), path.join(subDir, 'registry.json'));
    }
  }

  // 4. Extract clean card-dom.html and spec.json from showcase-snippet.html for the 22 generative-* elements
  for (const genSlug of ALL_151_CATEGORIES['Generative']) {
    const genDir = path.join(GATHERED_DIR, 'generative', genSlug);
    const snippetPath = path.join(genDir, 'showcase-snippet.html');
    if (fs.existsSync(snippetPath)) {
      const html = fs.readFileSync(snippetPath, 'utf8');
      // Extract <div data-aui-theme="elements" ...>...</div>
      const themeStart = html.indexOf('<div data-aui-theme="elements"');
      const figEnd = html.indexOf('</figcaption>', themeStart);
      if (themeStart !== -1) {
        const cardHtml = html.slice(themeStart, figEnd !== -1 ? figEnd : themeStart + 4000);
        fs.writeFileSync(path.join(genDir, 'card-dom.html'), cardHtml, 'utf8');
      }
      // Extract plain text from Shiki code blocks
      const codeBlocks = [];
      const preRegex = /<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g;
      let pm;
      while ((pm = preRegex.exec(html)) !== null) {
        const plain = pm[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&#x3C;/g, '<')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#x27;/g, "'");
        codeBlocks.push(plain);
      }
      if (codeBlocks.length > 0) {
        fs.writeFileSync(path.join(genDir, 'extracted-code.txt'), codeBlocks.join('\n\n// ---\n\n'), 'utf8');
      }
    }
  }

  // Rebuild final manifest verifying all 151 folders
  const finalElements = [];
  for (const item of allItems) {
    const catSlug = item.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const targetDir = path.join(GATHERED_DIR, catSlug, item.slug);
    const filesInDir = fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : [];
    const hasCode = filesInDir.some(
      (f) => f.endsWith('.tsx') || f.endsWith('.ts') || f === 'extracted-code.txt' || f === 'page.md'
    );
    const hasShow = filesInDir.includes('showcase-snippet.html');
    const meta = {
      slug: item.slug,
      category: item.category,
      folder: `gathered-elements/${catSlug}/${item.slug}`,
      hasCode,
      hasShowcase: hasShow,
      files: filesInDir
    };
    fs.writeFileSync(path.join(targetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    finalElements.push(meta);
  }

  const fullManifest = {
    totalCatalogCount: allItems.length,
    withCodeCount: finalElements.filter((e) => e.hasCode).length,
    withShowcaseCount: finalElements.filter((e) => e.hasShowcase).length,
    completedAt: new Date().toISOString(),
    elements: finalElements
  };

  fs.writeFileSync(
    path.join(GATHERED_DIR, 'manifest.json'),
    JSON.stringify(fullManifest, null, 2),
    'utf8'
  );

  console.log(`\n======================================================`);
  console.log(`ALL 151 ELEMENTS GATHERED INTO: ${GATHERED_DIR}`);
  console.log(`Complete Component Code / Specs: ${fullManifest.withCodeCount}/151`);
  console.log(`Complete Showcase HTML Snippets: ${fullManifest.withShowcaseCount}/151`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('Fatal error in gather-all-151.js:', err);
  process.exit(1);
});
