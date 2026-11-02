/**
 * server/browser-stream.js
 *
 * Real-time headless Chromium screencasting and bidirectional interaction over WebSocket.
 * Streams JPEG frames at 60fps via Chrome DevTools Protocol (CDP) to the frontend LiveBrowserStream.
 */
import fs from 'fs';
import { chromium } from 'playwright-core';
import { buildScrubbedSandboxEnv } from '../src/core/execution/run-sandbox.js';

let browser = null;
let browserContext = null;
let page = null;
let cdp = null;
let isStarting = false;
let terminationTimer = null;
let isAgentRunning = false;
let globalBroadcast = null;
let activeBrowserSandbox = null;

export function setBrowserBroadcast(fn) {
  globalBroadcast = fn;
}

export function setActiveBrowserSandbox(sandbox) {
  activeBrowserSandbox = sandbox || null;
  if (activeBrowserSandbox && browserContext) {
    activeBrowserSandbox.browserContext = browserContext;
  }
}

export function getActiveBrowserSandbox() {
  return activeBrowserSandbox;
}

export function onAgentRunStart() {
  isAgentRunning = true;
  cancelBrowserTermination();
  console.log('[BrowserStream] Agent run started. Browser locked active (termination suspended).');
}

export function onAgentRunEnd(broadcast) {
  isAgentRunning = false;
  console.log('[BrowserStream] Agent run completed. Starting 30-second post-run termination countdown...');
  scheduleBrowserTermination(broadcast || globalBroadcast, 30000);
}

export function cancelBrowserTermination() {
  if (terminationTimer) {
    clearTimeout(terminationTimer);
    terminationTimer = null;
  }
}

export function scheduleBrowserTermination(broadcast, delayMs = 30000) {
  cancelBrowserTermination();
  if (isAgentRunning) {
    console.log('[BrowserStream] Termination timer skipped: agent run is currently active.');
    return;
  }
  const bc = broadcast || globalBroadcast;
  terminationTimer = setTimeout(async () => {
    if (isAgentRunning) {
      console.log('[BrowserStream] Inactivity timer fired, but agent is running. Aborting shutdown.');
      return;
    }
    console.log(`[BrowserStream] 30s post-run inactivity reached. Auto-terminating Chromium process completely...`);
    await closeLiveBrowser(bc);
  }, delayMs);
}

export async function closeLiveBrowser(broadcast) {
  cancelBrowserTermination();
  isAgentRunning = false;
  const bc = broadcast || globalBroadcast;
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
  if (browserContext) {
    try {
      await browserContext.close().catch(() => {});
    } catch {}
    browserContext = null;
  }
  if (browser) {
    try {
      const proc = typeof browser.process === 'function' ? browser.process() : null;
      await browser.close().catch(() => {});
      if (proc && proc.pid) {
        if (process.platform === 'win32') {
          try {
            const { execSync } = await import('child_process');
            execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
          } catch {}
        } else {
          try {
            process.kill(-proc.pid, 'SIGKILL');
          } catch {
            try { proc.kill('SIGKILL'); } catch {}
          }
        }
      }
    } catch {}
    browser = null;
  }
  isStarting = false;
  console.log('[BrowserStream] Chromium process tree completely killed and instance destroyed.');
  if (typeof bc === 'function') {
    bc({ type: 'browser_closed', timestamp: Date.now() });
  }
}

export function findChromeExecutable() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    localAppData ? `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` : null,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

export async function initLiveBrowser(broadcast, initialUrl = null) {
  cancelBrowserTermination();
  if (browser && page) return { browser, page, context: browserContext };
  if (isStarting) {
    while (isStarting) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (browser && page) return { browser, page, context: browserContext };
  }

  isStarting = true;
  console.log('[BrowserStream] Launching live Chromium with CDP screencasting in isolated sandbox context...');

  const execPath = findChromeExecutable();
  const scrubbedEnv = buildScrubbedSandboxEnv(activeBrowserSandbox?.sandboxRoot);
  const launchOptions = {
    headless: true,
    env: scrubbedEnv,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-file-system',
      '--disable-sync',
      '--disable-extensions',
      '--enable-surface-synchronization',
      '--run-all-compositor-stages-before-draw',
      '--disable-blink-features=AutomationControlled'
    ]
  };

  if (execPath) {
    launchOptions.executablePath = execPath;
    console.log(`[BrowserStream] Using detected browser binary: ${execPath}`);
  } else {
    launchOptions.channel = 'chrome';
    console.log('[BrowserStream] No explicit binary path found; attempting channel: chrome');
  }

  try {
    browser = await chromium.launch(launchOptions);
    browserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      bypassCSP: false,
      ignoreHTTPSErrors: false,
      permissions: [],
      serviceWorkers: 'block',
      acceptDownloads: false,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    if (activeBrowserSandbox) {
      activeBrowserSandbox.browserContext = browserContext;
    }

    // Intercept & log all browser network egress through active RunSandbox policy
    await browserContext.route('**/*', async (route) => {
      const req = route.request();
      const url = req.url();
      if (activeBrowserSandbox && !activeBrowserSandbox.destroyed) {
        const check = activeBrowserSandbox.checkNetworkRequest(url, {
          method: req.method(),
          resourceType: req.resourceType()
        });
        if (!check.allowed) {
          console.warn(`[BrowserStream] Blocked network request to ${url} (${check.reason})`);
          await route.abort('accessdenied').catch(() => {});
          return;
        }
      }
      await route.continue().catch(() => {});
    });

    page = await browserContext.newPage();

    cdp = await browserContext.newCDPSession(page);

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

    // Navigate to initial URL or default start page
    const startUrl = initialUrl || 'https://duckduckgo.com';
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

    console.log(`[BrowserStream] Chromium screencast successfully started on ${startUrl}.`);
    return { browser, page, context: browserContext };
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
  if (data?.type === 'close_browser' || data?.type === 'browser_close' || data?.type === 'close') {
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
    if (!isAgentRunning) {
      scheduleBrowserTermination(broadcast, 30000);
    }
  }
}

