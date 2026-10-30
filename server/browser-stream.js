/**
 * server/browser-stream.js
 *
 * Real-time headless Chromium screencasting and bidirectional interaction over WebSocket.
 * Streams JPEG frames at 60fps via Chrome DevTools Protocol (CDP) to the frontend LiveBrowserStream.
 */
import fs from 'fs';
import { chromium } from 'playwright-core';

let browser = null;
let page = null;
let cdp = null;
let isStarting = false;
let terminationTimer = null;

export function cancelBrowserTermination() {
  if (terminationTimer) {
    clearTimeout(terminationTimer);
    terminationTimer = null;
  }
}

export function scheduleBrowserTermination(broadcast, delayMs = 30000) {
  cancelBrowserTermination();
  terminationTimer = setTimeout(async () => {
    console.log(`[BrowserStream] Inactivity timeout (${delayMs / 1000}s) reached. Auto-terminating Chromium...`);
    await closeLiveBrowser(broadcast);
  }, delayMs);
}

export async function closeLiveBrowser(broadcast) {
  cancelBrowserTermination();
  if (cdp) {
    try {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
    } catch {}
    cdp = null;
  }
  if (page) {
    try {
      await page.close().catch(() => {});
    } catch {}
    page = null;
  }
  if (browser) {
    try {
      const proc = typeof browser.process === 'function' ? browser.process() : null;
      await browser.close().catch(() => {});
      if (proc && !proc.killed) {
        try {
          proc.kill('SIGKILL');
        } catch {}
      }
    } catch {}
    browser = null;
  }
  isStarting = false;
  console.log('[BrowserStream] Chromium process killed and instance destroyed.');
  if (typeof broadcast === 'function') {
    broadcast({ type: 'browser_closed', timestamp: Date.now() });
  }
}

export async function initLiveBrowser(broadcast) {
  cancelBrowserTermination();
  if (browser && page) return { browser, page };
  if (isStarting) {
    while (isStarting) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (browser && page) return { browser, page };
  }

  isStarting = true;
  console.log('[BrowserStream] Launching live Chromium with CDP screencasting...');

  const chromeBin = process.env.CHROME_BIN || '/usr/bin/chromium';
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-surface-synchronization',
      '--run-all-compositor-stages-before-draw',
      '--disable-blink-features=AutomationControlled'
    ]
  };

  if (fs.existsSync(chromeBin)) {
    launchOptions.executablePath = chromeBin;
  }

  try {
    browser = await chromium.launch(launchOptions);
    page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    cdp = await page.context().newCDPSession(page);

    cdp.on('Page.screencastFrame', async (event) => {
      try {
        await cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
      } catch {}

      if (typeof broadcast === 'function') {
        broadcast({
          type: 'frame',
          data: event.data,
          metadata: event.metadata,
          url: page ? page.url() : ''
        });
      }
    });

    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 65,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1
    });

    // Navigate to default start page
    await page.goto('https://duckduckgo.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

    console.log('[BrowserStream] Chromium screencast successfully started.');
    return { browser, page };
  } catch (err) {
    console.error('[BrowserStream] Failed to initialize live Chromium:', err.message);
    throw err;
  } finally {
    isStarting = false;
  }
}

export function getLiveBrowserPage() {
  return page;
}

export async function handleBrowserWsMessage(data, broadcast) {
  if (data?.type === 'close_browser') {
    await closeLiveBrowser(broadcast);
    return;
  }

  cancelBrowserTermination();

  if (!page) {
    try {
      await initLiveBrowser(broadcast);
    } catch {
      return;
    }
  }

  try {
    switch (data.type) {
      case 'navigate': {
        let u = String(data.url || '').trim();
        if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
          u = 'https://' + u;
        }
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        broadcast?.({ type: 'navigated', url: page.url(), title: await page.title().catch(() => '') });
        break;
      }

      case 'click': {
        await page.mouse.click(data.x, data.y).catch(() => {});
        break;
      }

      case 'move': {
        await page.mouse.move(data.x, data.y).catch(() => {});
        break;
      }

      case 'wheel': {
        const dx = Number(data.deltaX) || 0;
        const dy = Number(data.deltaY) || 0;
        await page.mouse.wheel(dx, dy).catch(() => {});
        await page
          .evaluate(
            ({ x, y }) => {
              window.scrollBy({ left: x, top: y, behavior: 'auto' });
            },
            { x: dx, y: dy }
          )
          .catch(() => {});
        break;
      }

      case 'scroll': {
        const dy = Number(data.dy || data.deltaY || data.amount) || 0;
        const dx = Number(data.dx || data.deltaX) || 0;
        if (data.position === 'top') {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
        } else if (data.position === 'bottom') {
          await page
            .evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }))
            .catch(() => {});
        } else {
          await page.mouse.wheel(dx, dy).catch(() => {});
          await page
            .evaluate(
              ({ x, y }) => {
                window.scrollBy({ left: x, top: y, behavior: 'smooth' });
              },
              { x: dx, y: dy }
            )
            .catch(() => {});
        }
        break;
      }

      case 'type': {
        await page.keyboard.type(data.text).catch(() => {});
        break;
      }

      case 'press': {
        await page.keyboard.press(data.key).catch(() => {});
        break;
      }

      case 'back': {
        await page.goBack().catch(() => {});
        break;
      }

      case 'forward': {
        await page.goForward().catch(() => {});
        break;
      }

      case 'reload': {
        await page.reload().catch(() => {});
        break;
      }
    }
  } catch (err) {
    console.error('[BrowserStream] Error executing action:', err.message);
  } finally {
    scheduleBrowserTermination(broadcast, 30000);
  }
}

