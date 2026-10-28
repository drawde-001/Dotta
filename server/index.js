import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';

import { OmniEngine } from '../src/core/index.js';
import { createAgUiHandler } from './ag-ui-bridge.js';
import {
  initLiveBrowser,
  handleBrowserWsMessage,
  getLiveBrowserPage
} from './browser-stream.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

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

  // Lazy-start browser on first client connection
  if (!page) {
    initLiveBrowser(broadcast).catch(() => {});
  }

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
});

engine.registerTool({ name: 'browser_read_page' }, async (args) => {
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
});

engine.registerTool({ name: 'browser_action' }, async (args) => {
  const { action, selectorOrText, value, direction = 'down', amount = 500, pressEnter } = args || {};
  let page = getLiveBrowserPage();
  if (!page) {
    const res = await initLiveBrowser(broadcast);
    page = res.page;
  }

  try {
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
  }
});

engine.registerTool({ name: 'snapshot_read' }, async () => {
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
});

engine.registerTool({ name: 'browser_screenshot' }, async (args) => {
  let page = getLiveBrowserPage();
  if (!page) {
    const res = await initLiveBrowser(broadcast);
    page = res.page;
  }
  const buffer = await page.screenshot({ fullPage: !!args?.fullPage }).catch(() => null);
  if (!buffer) return 'Failed to capture screenshot.';
  return `Captured live screenshot (${buffer.length} bytes). Viewport is streaming live in sidebar.`;
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
