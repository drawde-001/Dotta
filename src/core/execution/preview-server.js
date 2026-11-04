import http from 'http';
import fs from 'fs';
import path from 'path';
import { getThreadWorkspaceRoot, validateAndResolvePath } from './workspace.js';

export const PREVIEW_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

export const PREVIEW_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; frame-ancestors 'self';",
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Referrer-Policy': 'no-referrer'
};

/**
 * Searches for an index.html file in thread workspace root or direct subfolders (e.g. website/, app/)
 */
export function findWorkspaceEntryHtml(workspaceRoot) {
  if (!fs.existsSync(workspaceRoot)) return null;

  const rootIndex = path.join(workspaceRoot, 'index.html');
  if (fs.existsSync(rootIndex) && fs.statSync(rootIndex).isFile()) {
    return 'index.html';
  }

  try {
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && !ent.name.startsWith('.')) {
        const subIndex = path.join(workspaceRoot, ent.name, 'index.html');
        if (fs.existsSync(subIndex) && fs.statSync(subIndex).isFile()) {
          return `${ent.name}/index.html`;
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Serves a file securely from the thread workspace root to an HTTP response.
 */
export function serveWorkspaceFile(workspaceRoot, rawSubpath, res) {
  let cleanPath = String(rawSubpath || '').split('?')[0].split('#')[0];
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {}
  cleanPath = cleanPath.replace(/^\/+/, '');

  if (!cleanPath || cleanPath === '.') {
    const defaultEntry = findWorkspaceEntryHtml(workspaceRoot);
    if (defaultEntry) {
      cleanPath = defaultEntry;
    } else {
      for (const [k, v] of Object.entries(PREVIEW_SECURITY_HEADERS)) {
        res.setHeader(k, v);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      res.end(`<!DOCTYPE html>
<html>
<head><title>Workspace Preview</title><style>body{font-family:sans-serif;padding:2rem;color:#333;background:#fafafa;}h2{color:#111;}</style></head>
<body>
  <h2>Workspace Live Preview</h2>
  <p>Workspace is ready. No <code>index.html</code> has been created yet.</p>
</body>
</html>`);
      return;
    }
  }

  let resolved = null;
  try {
    resolved = validateAndResolvePath(workspaceRoot, cleanPath);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
    return;
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const subIndex = path.join(resolved, 'index.html');
    if (fs.existsSync(subIndex) && fs.statSync(subIndex).isFile()) {
      resolved = subIndex;
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not Found');
      return;
    }
  }

  for (const [k, v] of Object.entries(PREVIEW_SECURITY_HEADERS)) {
    res.setHeader(k, v);
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.statusCode = 200;

  const stream = fs.createReadStream(resolved);
  stream.pipe(res);
}

class PreviewServerInstance {
  constructor({ userId, threadId, workspaceRoot, idleTimeoutMs = PREVIEW_IDLE_TIMEOUT_MS }) {
    this.userId = userId;
    this.threadId = threadId;
    this.workspaceRoot = workspaceRoot;
    this.idleTimeoutMs = idleTimeoutMs;
    this.port = null;
    this.server = null;
    this.lastActive = Date.now();
    this.isClosed = false;
  }

  touch() {
    this.lastActive = Date.now();
  }

  isIdle() {
    return Date.now() - this.lastActive > this.idleTimeoutMs;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.touch();

        const urlObj = new URL(req.url, `http://127.0.0.1:${this.port}`);
        if (urlObj.pathname === '/health') {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({
            status: 'ok',
            threadId: this.threadId,
            port: this.port,
            uptime: Date.now() - this.lastActive
          }));
          return;
        }

        serveWorkspaceFile(this.workspaceRoot, urlObj.pathname, res);
      });

      // Bind strictly to loopback 127.0.0.1 (never 0.0.0.0)
      this.server.listen(0, '127.0.0.1', async () => {
        const addr = this.server.address();
        this.port = addr.port;
        this.touch();

        // Perform self-health check
        try {
          await this.checkHealth();
          resolve(this);
        } catch (err) {
          this.stop();
          reject(new Error(`Preview server health check failed on port ${this.port}: ${err.message}`));
        }
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  async checkHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${this.port}/health`, { timeout: 3000 }, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`Health check returned status ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check timed out'));
      });
    });
  }

  stop() {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
    }
  }
}

export class PreviewServerManager {
  constructor(idleTimeoutMs = PREVIEW_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.instances = new Map(); // key: threadId

    // Background idle reaper
    this.reaperInterval = setInterval(() => {
      this.reapIdleServers();
    }, 30 * 1000);
    if (this.reaperInterval.unref) {
      this.reaperInterval.unref();
    }
  }

  reapIdleServers() {
    for (const [threadId, instance] of this.instances.entries()) {
      if (instance.isIdle()) {
        instance.stop();
        this.instances.delete(threadId);
      }
    }
  }

  async getOrStart(userId, threadId) {
    const existing = this.instances.get(threadId);
    if (existing && !existing.isClosed && existing.server) {
      existing.touch();
      return existing;
    }

    const workspaceRoot = getThreadWorkspaceRoot(userId, threadId);
    const instance = new PreviewServerInstance({
      userId,
      threadId,
      workspaceRoot,
      idleTimeoutMs: this.idleTimeoutMs
    });

    await instance.start();
    this.instances.set(threadId, instance);
    return instance;
  }

  touch(threadId) {
    const instance = this.instances.get(threadId);
    if (instance) {
      instance.touch();
    }
  }

  stop(threadId) {
    const instance = this.instances.get(threadId);
    if (instance) {
      instance.stop();
      this.instances.delete(threadId);
    }
  }

  stopAll() {
    for (const instance of this.instances.values()) {
      instance.stop();
    }
    this.instances.clear();
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
    }
  }
}

export const previewServerManager = new PreviewServerManager();
