import http from 'http';
import fs from 'fs';
import path from 'path';
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
  initLiveBrowser,
  handleBrowserWsMessage,
  getLiveBrowserPage,
  scheduleBrowserTermination,
  cancelBrowserTermination,
  closeLiveBrowser
} from './browser-stream.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
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
  defaultModel: process.env.DEFAULT_MODEL || 'meta-muse-spark'
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
  } finally {
    scheduleBrowserTermination(broadcast, 30000);
  }
});

engine.registerTool({ name: 'browser_read_page' }, async (args) => {
  cancelBrowserTermination();
  try {
    const targetUrl = args.url?.startsWith('http') ? args.url : `https://${args.url}`;
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }

    console.log(`[Omni Engine] Navigating live browser to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    const title = await page.title().catch(() => targetUrl);
    const text = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');

    return `### Page: ${title}\n**URL**: ${targetUrl}\n\n${text}`;
  } finally {
    scheduleBrowserTermination(broadcast, 30000);
  }
});

engine.registerTool({ name: 'browser_action' }, async (args) => {
  cancelBrowserTermination();
  try {
    const { action, selectorOrText, value, direction = 'down', amount = 500, pressEnter } = args || {};
    let page = getLiveBrowserPage();
    if (!page) {
      const res = await initLiveBrowser(broadcast);
      page = res.page;
    }

    if (action === 'click') {
      try {
        await page.click(selectorOrText, { timeout: 8000 });
        return `Successfully clicked "${selectorOrText}". Current URL: ${page.url()}`;
      } catch {
        await page.getByText(selectorOrText).first().click({ timeout: 5000 });
        return `Successfully clicked element with text "${selectorOrText}". Current URL: ${page.url()}`;
      }
    } else if (action === 'type') {
      try {
        await page.fill(selectorOrText, value || '', { timeout: 8000 });
        if (pressEnter) await page.press(selectorOrText, 'Enter');
        return `Successfully typed "${value}" into "${selectorOrText}".`;
      } catch {
        await page.keyboard.type(value || '');
        return `Typed text via keyboard into active focus.`;
      }
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
  } finally {
    scheduleBrowserTermination(broadcast, 30000);
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
        interactives: Array.from(document.querySelectorAll('a, button, input, textarea, select'))
          .filter((el) => el.offsetParent !== null)
          .slice(0, 30)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 50),
            id: el.id || undefined,
            name: el.getAttribute('name') || undefined,
            href: el.getAttribute('href') || undefined
          }))
      }))
      .catch((err) => ({ error: err.message }));
    return JSON.stringify(snapshot, null, 2);
  } finally {
    scheduleBrowserTermination(broadcast, 30000);
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
  } finally {
    scheduleBrowserTermination(broadcast, 30000);
  }
});

// Health check endpoints (both /health and /api/health)
const handleHealth = (req, res) => {
  res.json({
    status: 'healthy',
    defaultModel: process.env.DEFAULT_MODEL || 'meta-muse-spark',
    wsClients: wsClients.size,
    browserActive: !!getLiveBrowserPage(),
    timestamp: Date.now()
  });
};
app.get('/health', handleHealth);
app.get('/api/health', handleHealth);

// AG-UI 1.0 Chat endpoint
app.post('/api/chat', createAgUiHandler({ engine }));

// Audio & Video Transcription endpoint with 10-minute segmentation support
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, durationSec, mimeType, filename, mockText } = req.body || {};
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
      { mockText }
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

      processedAttachments.push({
        id: att.id || `att-${Date.now()}-${orderNum}`,
        order: orderNum,
        name: att.name,
        size: att.size,
        type: att.type,
        summary: textSummary || `Processed ${att.type || 'file'} (${att.size} bytes)`
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

// Safe workspace files endpoints for File Browser & File Viewer
app.get('/api/workspace/files', async (req, res) => {
  try {
    const rootDir = path.resolve(__dirname, '..');
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'others', '.agent', '.agents', '.system_generated', 'coverage', '.cache']);
    
    function scanDir(currentPath, relativePath = '') {
      const items = [];
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (ignoreDirs.has(entry.name.toLowerCase())) continue;
          const entryRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            items.push({
              type: 'folder',
              name: entry.name,
              path: entryRel,
              children: scanDir(path.join(currentPath, entry.name), entryRel)
            });
          } else {
            items.push({
              type: 'file',
              name: entry.name,
              path: entryRel
            });
          }
        }
      } catch {}
      return items;
    }
    
    const tree = scanDir(rootDir);
    res.json({ ok: true, files: tree });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/workspace/file', async (req, res) => {
  try {
    const rootDir = path.resolve(__dirname, '..');
    const relPath = req.query.path;
    if (!relPath || typeof relPath !== 'string') {
      return res.status(400).json({ ok: false, error: 'Path is required' });
    }
    const resolved = path.resolve(rootDir, relPath);
    // Security boundary: strictly verify path is inside rootDir and never accesses others
    const rel = path.relative(rootDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.toLowerCase().includes('others')) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }
    // Cap read size to 500KB
    const stat = fs.statSync(resolved);
    if (stat.size > 500 * 1024) {
      return res.status(400).json({ ok: false, error: 'File exceeds 500KB limit for web viewer' });
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    res.json({ ok: true, path: relPath, content });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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
  console.log(`[Omni Agent Engine] Default model configured: ${process.env.DEFAULT_MODEL || 'meta-muse-spark'}`);
});
