import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { capToolOutput } from '../tools/policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const PROJECT_ROOT_NAME = path.basename(PROJECT_ROOT);
const WORKSPACES_BASE = path.resolve(__dirname, '../../workspaces');

export const DEFAULT_SANDBOX_CPU_LIMIT = 1;
export const DEFAULT_SANDBOX_MEMORY_MB = 256;
export const DEFAULT_SANDBOX_COMMAND_TIMEOUT_MS = 15000;
export const DEFAULT_SANDBOX_RUN_TIMEOUT_MS = 300000;
export const MAX_SANDBOX_OUTPUT_CHARS = 10000;

const activeRunSandboxes = new Map();
let exitHooksRegistered = false;

function registerProcessExitCleanup() {
  if (exitHooksRegistered) return;
  exitHooksRegistered = true;

  const cleanupAllSync = () => {
    for (const sandbox of activeRunSandboxes.values()) {
      try {
        sandbox.destroySync('process_exit');
      } catch {}
    }
  };

  process.once('exit', cleanupAllSync);
}

/**
 * Detects if Docker + gVisor (runsc) or standard Docker container runtime is available
 * when OMNI_SANDBOX_CONTAINER=1 is enabled.
 */
let cachedContainerRuntime = null;
export function detectContainerRuntime() {
  if (cachedContainerRuntime !== null) return cachedContainerRuntime;
  if (process.env.OMNI_SANDBOX_CONTAINER !== '1') {
    cachedContainerRuntime = { available: false, runtime: 'process-isolated' };
    return cachedContainerRuntime;
  }
  try {
    const info = execSync('docker info --format "{{json .Runtimes}}"', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    if (info && info.includes('runsc')) {
      cachedContainerRuntime = { available: true, runtime: 'runsc' };
      return cachedContainerRuntime;
    }
    cachedContainerRuntime = { available: true, runtime: 'runc' };
    return cachedContainerRuntime;
  } catch {
    cachedContainerRuntime = { available: false, runtime: 'process-isolated' };
    return cachedContainerRuntime;
  }
}

/**
 * Redacts any host or project workspace paths from sandbox output strings,
 * replacing the sandbox temp directory with virtual "/sandbox".
 */
export function redactSandboxHostPaths(text = '', sandboxRoot = '') {
  if (typeof text !== 'string' || !text) return '';
  let out = text;

  if (sandboxRoot) {
    const normSandbox = path.normalize(sandboxRoot);
    const slashSandbox = normSandbox.replace(/\\/g, '/');
    out = out.split(normSandbox).join('/sandbox');
    out = out.split(slashSandbox).join('/sandbox');
  }

  const hostRoots = [
    PROJECT_ROOT,
    PROJECT_ROOT.replace(/\\/g, '/'),
    WORKSPACES_BASE,
    WORKSPACES_BASE.replace(/\\/g, '/'),
    '/home/ubuntu/omni-agent',
    '/home/ubuntu',
    '/app'
  ].filter(Boolean);

  for (const r of hostRoots) {
    out = out.split(r).join('[REDACTED_HOST_PATH]');
    // Case-insensitive replacement for Windows drive paths
    const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), '[REDACTED_HOST_PATH]');
  }

  if (PROJECT_ROOT_NAME) {
    const rootWordRegex = new RegExp(`${PROJECT_ROOT_NAME}[\\\\/]`, 'gi');
    out = out.replace(rootWordRegex, '');
  }

  return out;
}

/**
 * Builds a minimal, scrubbed environment for sandbox child processes.
 * Never copies process.env secrets, API keys, or workspace variables.
 */
export function buildScrubbedSandboxEnv(sandboxRoot, options = {}) {
  const memoryLimitMb = Number(options.memoryLimitMb) || DEFAULT_SANDBOX_MEMORY_MB;
  const tmpDir = sandboxRoot ? path.join(sandboxRoot, 'tmp') : os.tmpdir();
  const workDir = sandboxRoot ? path.join(sandboxRoot, 'work') : os.tmpdir();

  // Filter PATH so no directory inside PROJECT_ROOT or user workspaces is exposed
  const rawPath = String(process.env.PATH || process.env.Path || '');
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const normProject = PROJECT_ROOT.toLowerCase().replace(/\\/g, '/');
  const normWorkspaces = WORKSPACES_BASE.toLowerCase().replace(/\\/g, '/');

  const safePathEntries = rawPath
    .split(pathSep)
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      const lower = p.toLowerCase().replace(/\\/g, '/');
      if (lower.startsWith(normProject) || lower.startsWith(normWorkspaces)) return false;
      if (lower.includes(PROJECT_ROOT_NAME.toLowerCase())) return false;
      return true;
    });

  const env = {
    PATH: safePathEntries.join(pathSep),
    HOME: '/sandbox',
    USER: 'sandbox',
    LOGNAME: 'sandbox',
    LANG: 'C.UTF-8',
    TMP: tmpDir,
    TEMP: tmpDir,
    TMPDIR: tmpDir,
    PWD: workDir,
    SANDBOX_ROOT: '/sandbox',
    SANDBOX_INPUTS_DIR: sandboxRoot ? path.join(sandboxRoot, 'inputs') : '/sandbox/inputs',
    SANDBOX_OUTPUTS_DIR: sandboxRoot ? path.join(sandboxRoot, 'outputs') : '/sandbox/outputs',
    NODE_OPTIONS: `--max-old-space-size=${Math.max(32, memoryLimitMb)}`
  };

  if (process.platform === 'win32') {
    env.SystemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    env.SystemDrive = process.env.SystemDrive || process.env.SYSTEMDRIVE || 'C:';
    env.ComSpec = process.env.ComSpec || process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
    env.PATHEXT = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
    env.USERNAME = 'sandbox';
    env.USERPROFILE = '/sandbox';
    env.HOMEPATH = '/sandbox';
    env.HOMEDRIVE = env.SystemDrive;
    env.USERDOMAIN = 'SANDBOX';
    env.LOGONSERVER = '\\\\SANDBOX';
  }

  return Object.freeze(env);
}

/**
 * Inspects a command string or file path to ensure it cannot reference or escape
 * to the host filesystem, parent directories, or the project workspace.
 */
export function assertNoHostPathAccess(input, sandboxRoot = '') {
  const raw = String(input || '').trim();
  if (!raw) {
    return { allowed: true };
  }

  const normSandbox = sandboxRoot ? path.normalize(path.resolve(sandboxRoot)).toLowerCase().replace(/\\/g, '/') : '';
  const normProject = PROJECT_ROOT.toLowerCase().replace(/\\/g, '/');
  const normWorkspaces = WORKSPACES_BASE.toLowerCase().replace(/\\/g, '/');
  const lower = raw.toLowerCase().replace(/\\/g, '/');

  // 1. Direct reference to project root, workspace directory, or key/credential files
  if (
    lower.includes(normProject) ||
    lower.includes(normWorkspaces) ||
    lower.includes(PROJECT_ROOT_NAME.toLowerCase()) ||
    /\bsrc\/workspaces\b/i.test(lower) ||
    /\bsrc\/data\b/i.test(lower) ||
    /\bserver\/index\.js\b/i.test(lower) ||
    /\bpackage\.json\b/i.test(lower) ||
    /(?:^|[\s"'/\\])\.env(?:\b|$)/i.test(raw) ||
    /(?:^|[\s"'/\\])\.session-secret(?:\b|$)/i.test(raw) ||
    /(?:^|[\s"'/\\])\.git(?:\b|[/\\]|$)/i.test(raw) ||
    /(?:^|[\s"'/\\])\.ssh(?:\b|[/\\]|$)/i.test(raw) ||
    /(?:^|[\s"'/\\])\.agents(?:\b|[/\\]|$)/i.test(raw) ||
    /\.(?:pem|key|pfx|p12)\b/i.test(raw) ||
    /\b(?:id_rsa|id_ed25519|omni-agent-key)\b/i.test(raw)
  ) {
    return {
      allowed: false,
      reason: 'Access to project workspace files, host configuration, or sensitive files is strictly prohibited inside the isolated run sandbox.'
    };
  }

  // 2. Parent directory traversal ("..", "../", "..\") or URL-encoded traversal
  if (
    /(?:^|[\s"'/\\,;(&|])\.\.(?:[/\\]|[\s"');&|]|$)/.test(raw) ||
    raw.includes('../') ||
    raw.includes('..\\') ||
    /%2e%2e/i.test(raw)
  ) {
    return {
      allowed: false,
      reason: 'Parent directory traversal ("..") is strictly prohibited inside the isolated run sandbox.'
    };
  }

  // 3. UNC paths
  if (/\\\\[a-z0-9_.-]+\\/i.test(raw)) {
    return {
      allowed: false,
      reason: 'UNC network paths are strictly prohibited inside the isolated run sandbox.'
    };
  }

  // 4. Windows drive paths (e.g. C:\...) or POSIX root paths (/etc, /home, /root, /var, /proc, /Users)
  // that are NOT inside the sandbox's own temp directory
  const winDriveMatches = raw.match(/[a-zA-Z]:[/\\][^\s"';|&)]*/g) || [];
  for (const m of winDriveMatches) {
    const cleanMatch = path.normalize(m).toLowerCase().replace(/\\/g, '/');
    if (!normSandbox || !cleanMatch.startsWith(normSandbox)) {
      return {
        allowed: false,
        reason: `Access to host path "${redactSandboxHostPaths(m, sandboxRoot)}" outside the run sandbox is strictly prohibited.`
      };
    }
  }

  if (
    /(?:^|[\s"'(=])\/(?:etc|home|root|var|proc|sys|Users|mnt|opt|srv|boot)(?:\/|\b)/i.test(raw) ||
    /(?:^|\s|;|&&|\|)(?:cd\s+(?:\/|~)|ls\s+\/|dir\s+[a-zA-Z]:\\|pwd\b)/i.test(raw)
  ) {
    return {
      allowed: false,
      reason: 'Access to host system directories outside the run sandbox is strictly prohibited.'
    };
  }

  return { allowed: true };
}

function isPrivateOrMetadataHost(hostname = '') {
  const h = String(hostname || '').toLowerCase().trim();
  if (!h) return true;
  if (h === '169.254.169.254' || h === 'metadata.google.internal' || h === 'metadata') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  return false;
}

function unlockReadOnlyRecursive(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dirPath, ent.name);
      try {
        if (ent.isDirectory()) {
          unlockReadOnlyRecursive(full);
          fs.chmodSync(full, 0o700);
        } else {
          fs.chmodSync(full, 0o600);
        }
      } catch {}
    }
  } catch {}
}

function killProcessTreeSync(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        timeout: 3000
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {}
  }
}

/**
 * Isolated per-run sandbox environment.
 * Created for a single run only in an OS temporary directory outside the project workspace,
 * and destroyed automatically when the run finishes, errors, or is cancelled.
 */
export class RunSandbox {
  constructor(options = {}) {
    registerProcessExitCleanup();

    this.runId = String(options.runId || `run-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
    this.userId = options.userId || null;
    this.profileId = options.profileId || null;

    // Resource and time limits
    this.cpuLimit = Number(options.cpuLimit) || DEFAULT_SANDBOX_CPU_LIMIT;
    this.memoryLimitMb = Number(options.memoryLimitMb) || DEFAULT_SANDBOX_MEMORY_MB;
    this.commandTimeoutMs = Number(options.commandTimeoutMs) || DEFAULT_SANDBOX_COMMAND_TIMEOUT_MS;
    this.runTimeoutMs = Number(options.runTimeoutMs) || DEFAULT_SANDBOX_RUN_TIMEOUT_MS;

    // Network policy & egress logging
    this.networkAllowlist = new Set(
      Array.isArray(options.networkAllowlist)
        ? options.networkAllowlist.map((h) => String(h || '').toLowerCase().trim()).filter(Boolean)
        : []
    );
    this.strictNetworkAllowlist = Boolean(options.strictNetworkAllowlist);
    this.allowLocalhost = options.allowLocalhost !== undefined ? Boolean(options.allowLocalhost) : true;
    this.egressLog = [];

    // Explicit logged output channel
    this.outputChannelLog = [];
    this.outputSeq = 0;
    this.onOutput = typeof options.onOutput === 'function' ? options.onOutput : null;

    // Create isolated temporary directory strictly outside PROJECT_ROOT
    const baseTmp = os.tmpdir();
    this.sandboxRoot = fs.mkdtempSync(path.join(baseTmp, 'omni-run-sandbox-'));
    this.workDir = path.join(this.sandboxRoot, 'work');
    this.inputsDir = path.join(this.sandboxRoot, 'inputs');
    this.outputsDir = path.join(this.sandboxRoot, 'outputs');
    this.browserProfileDir = path.join(this.sandboxRoot, 'browser-profile');
    this.tmpDir = path.join(this.sandboxRoot, 'tmp');

    fs.mkdirSync(this.workDir, { recursive: true });
    fs.mkdirSync(this.inputsDir, { recursive: true });
    fs.mkdirSync(this.outputsDir, { recursive: true });
    fs.mkdirSync(this.browserProfileDir, { recursive: true });
    fs.mkdirSync(this.tmpDir, { recursive: true });

    // Verify disjointness from PROJECT_ROOT and WORKSPACES_BASE
    const normSandbox = path.normalize(this.sandboxRoot).toLowerCase();
    const normProject = path.normalize(PROJECT_ROOT).toLowerCase();
    if (normSandbox.startsWith(normProject)) {
      throw new Error('Security violation: RunSandbox root must never be inside PROJECT_ROOT');
    }

    this.stagedFiles = new Map();
    this.activeProcesses = new Set();
    this.browserContext = null;
    this.createdAt = Date.now();
    this.destroyed = false;
    this.destroyedAt = null;
    this.destroyReason = null;

    // Run-level wall-clock timer
    this.runTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.emitOutput('SANDBOX_TIMEOUT', {
          runId: this.runId,
          timeoutMs: this.runTimeoutMs
        });
        this.destroy('run_timeout').catch(() => {});
      }
    }, this.runTimeoutMs);
    if (typeof this.runTimer.unref === 'function') {
      this.runTimer.unref();
    }

    // Optional AbortSignal hook for immediate cancellation cleanup
    if (options.signal && typeof options.signal.addEventListener === 'function') {
      if (options.signal.aborted) {
        this.destroySync('aborted');
      } else {
        options.signal.addEventListener(
          'abort',
          () => {
            this.destroy('aborted').catch(() => {});
          },
          { once: true }
        );
      }
    }

    activeRunSandboxes.set(this.runId, this);
    this.emitOutput('SANDBOX_CREATED', {
      runId: this.runId,
      virtualRoot: '/sandbox',
      cpuLimit: this.cpuLimit,
      memoryLimitMb: this.memoryLimitMb,
      commandTimeoutMs: this.commandTimeoutMs,
      runTimeoutMs: this.runTimeoutMs
    });
  }

  /**
   * Sends structured output back through the explicit, logged sandbox output channel.
   * All host paths are scrubbed before logging and emitting.
   */
  emitOutput(type, payload = {}) {
    const seq = ++this.outputSeq;
    const rawJson = JSON.stringify(payload ?? {});
    const scrubbedJson = redactSandboxHostPaths(rawJson, this.sandboxRoot);
    let cleanPayload = payload;
    try {
      cleanPayload = JSON.parse(scrubbedJson);
    } catch {
      cleanPayload = redactSandboxHostPaths(String(payload ?? ''), this.sandboxRoot);
    }

    const entry = Object.freeze({
      seq,
      id: `out_${this.runId}_${seq}`,
      runId: this.runId,
      type: String(type || 'SANDBOX_OUTPUT'),
      timestamp: Date.now(),
      payload: cleanPayload
    });

    this.outputChannelLog.push(entry);
    if (this.onOutput) {
      try {
        this.onOutput(entry);
      } catch {}
    }
    return entry;
  }

  getOutputChannelLog() {
    return [...this.outputChannelLog];
  }

  getEgressLog() {
    return [...this.egressLog];
  }

  /**
   * Adds an allowed hostname or host:port to this run's network allowlist.
   */
  allowNetworkHost(hostOrUrl) {
    if (!hostOrUrl) return;
    try {
      const u = hostOrUrl.includes('://') ? new URL(hostOrUrl) : new URL(`https://${hostOrUrl}`);
      this.networkAllowlist.add(u.hostname.toLowerCase());
      if (u.host) this.networkAllowlist.add(u.host.toLowerCase());
    } catch {
      this.networkAllowlist.add(String(hostOrUrl).toLowerCase().trim());
    }
  }

  /**
   * Evaluates and logs a network egress request against the sandbox's network policy.
   */
  checkNetworkRequest(url, meta = {}) {
    const rawUrl = String(url || '').trim();
    const method = String(meta.method || 'GET').toUpperCase();
    const resourceType = String(meta.resourceType || 'fetch');

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      const record = {
        seq: this.egressLog.length + 1,
        timestamp: Date.now(),
        url: rawUrl,
        host: '',
        method,
        resourceType,
        allowed: false,
        reason: 'invalid_url'
      };
      this.egressLog.push(record);
      this.emitOutput('NETWORK_EGRESS', record);
      return record;
    }

    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    const hostWithPort = parsed.host.toLowerCase();

    // Allow safe internal browser schemes (about:blank, data:, blob:)
    if (protocol === 'about:' || protocol === 'data:' || protocol === 'blob:') {
      const record = {
        seq: this.egressLog.length + 1,
        timestamp: Date.now(),
        url: rawUrl.slice(0, 120),
        host: hostname || protocol,
        method,
        resourceType,
        allowed: true,
        reason: 'internal_scheme'
      };
      this.egressLog.push(record);
      return record;
    }

    // Block file:// and any non-http(s) protocol
    if (protocol !== 'http:' && protocol !== 'https:') {
      const record = {
        seq: this.egressLog.length + 1,
        timestamp: Date.now(),
        url: redactSandboxHostPaths(rawUrl, this.sandboxRoot),
        host: hostname,
        method,
        resourceType,
        allowed: false,
        reason: `blocked_protocol:${protocol}`
      };
      this.egressLog.push(record);
      this.emitOutput('NETWORK_EGRESS_BLOCKED', record);
      return record;
    }

    const isExplicitlyAllowlisted =
      this.networkAllowlist.has(hostname) ||
      this.networkAllowlist.has(hostWithPort) ||
      Array.from(this.networkAllowlist).some((allowedHost) => hostname.endsWith(`.${allowedHost}`));

    // Block cloud metadata and private RFC1918 IPs unless explicitly allowlisted
    if (isPrivateOrMetadataHost(hostname) && !isExplicitlyAllowlisted) {
      const record = {
        seq: this.egressLog.length + 1,
        timestamp: Date.now(),
        url: rawUrl,
        host: hostWithPort,
        method,
        resourceType,
        allowed: false,
        reason: 'blocked_private_or_metadata_ip'
      };
      this.egressLog.push(record);
      this.emitOutput('NETWORK_EGRESS_BLOCKED', record);
      return record;
    }

    // Localhost check
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (isLocalhost && !this.allowLocalhost && !isExplicitlyAllowlisted) {
      const record = {
        seq: this.egressLog.length + 1,
        timestamp: Date.now(),
        url: rawUrl,
        host: hostWithPort,
        method,
        resourceType,
        allowed: false,
        reason: 'localhost_not_allowed'
      };
      this.egressLog.push(record);
      this.emitOutput('NETWORK_EGRESS_BLOCKED', record);
      return record;
    }

    // Strict allowlist check
    if (this.strictNetworkAllowlist && !isExplicitlyAllowlisted) {
      const record = {
        seq: this.egressLog.length + 1,
        timestamp: Date.now(),
        url: rawUrl,
        host: hostWithPort,
        method,
        resourceType,
        allowed: false,
        reason: 'host_not_in_allowlist'
      };
      this.egressLog.push(record);
      this.emitOutput('NETWORK_EGRESS_BLOCKED', record);
      return record;
    }

    const record = {
      seq: this.egressLog.length + 1,
      timestamp: Date.now(),
      url: rawUrl,
      host: hostWithPort,
      method,
      resourceType,
      allowed: true,
      reason: isExplicitlyAllowlisted ? 'allowlisted' : 'default_egress_allowed'
    };
    this.egressLog.push(record);
    this.emitOutput('NETWORK_EGRESS', record);
    return record;
  }

  /**
   * Copies a single task-required file from the active BIO profile into the
   * sandbox's /inputs directory as READ-ONLY (mode 0o444).
   * The original host path is never exposed to the sandbox.
   */
  stageBioFileReadOnly({ token, absPath, name, mime, fieldId = null }) {
    if (this.destroyed) {
      throw new Error('Cannot stage BIO file into a destroyed RunSandbox');
    }
    if (!absPath || !fs.existsSync(absPath)) {
      throw new Error('Source BIO file does not exist');
    }
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) {
      throw new Error('Source BIO path is not a regular file');
    }

    const safeBase = path
      .basename(String(name || 'bio-file'))
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .slice(0, 80);
    const refToken = token || `biofile-${crypto.randomUUID().slice(0, 12)}`;
    const uniqueFileName = `${refToken}_${safeBase}`;
    const destPath = path.join(this.inputsDir, uniqueFileName);

    // If re-staging an existing file, temporarily unlock before overwrite
    if (fs.existsSync(destPath)) {
      try {
        fs.chmodSync(destPath, 0o600);
      } catch {}
    }

    fs.copyFileSync(absPath, destPath);
    // Enforce read-only permissions (0o444) so the run cannot mutate BIO inputs
    fs.chmodSync(destPath, 0o444);

    const stagedRecord = Object.freeze({
      token: refToken,
      name: String(name || safeBase),
      mime: String(mime || 'application/octet-stream'),
      fieldId: fieldId ? String(fieldId) : null,
      sandboxPath: destPath,
      virtualPath: `/sandbox/inputs/${uniqueFileName}`,
      size: stat.size,
      readOnly: true,
      stagedAt: Date.now()
    });

    this.stagedFiles.set(refToken, stagedRecord);
    this.emitOutput('BIO_FILE_STAGED_READONLY', {
      token: refToken,
      name: stagedRecord.name,
      mime: stagedRecord.mime,
      fieldId: stagedRecord.fieldId,
      virtualPath: stagedRecord.virtualPath,
      size: stagedRecord.size,
      readOnly: true
    });

    return stagedRecord;
  }

  /**
   * Resolves a relative path strictly inside this sandbox's work directory
   * (or inputs/outputs subdirectories). Rejects any escape or host path.
   */
  resolveSandboxPath(relPath = '.') {
    if (this.destroyed) {
      throw new Error('RunSandbox has already been destroyed');
    }
    const raw = String(relPath || '.').trim();

    // Map virtual /sandbox/... prefix to sandboxRoot
    let mapped = raw;
    if (/^\/sandbox(?:\/|$)/i.test(mapped)) {
      mapped = mapped.replace(/^\/sandbox\/?/i, '');
      const check = assertNoHostPathAccess(mapped, this.sandboxRoot);
      if (!check.allowed) throw new Error(check.reason);
      const target = path.normalize(path.resolve(this.sandboxRoot, mapped || '.'));
      if (target !== this.sandboxRoot && !target.startsWith(this.sandboxRoot + path.sep)) {
        throw new Error('Path traversal escapes sandbox boundaries');
      }
      return target;
    }

    const check = assertNoHostPathAccess(raw, this.sandboxRoot);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    if (
      path.isAbsolute(raw) ||
      /^[a-zA-Z]:[/\\]/.test(raw) ||
      raw.startsWith('/') ||
      raw.startsWith('\\')
    ) {
      const normRaw = path.normalize(raw);
      if (normRaw !== this.sandboxRoot && !normRaw.startsWith(this.sandboxRoot + path.sep)) {
        throw new Error('Access to absolute host paths outside the run sandbox is strictly prohibited.');
      }
      return normRaw;
    }

    const resolved = path.normalize(path.resolve(this.workDir, raw));
    if (
      resolved !== this.workDir &&
      !resolved.startsWith(this.workDir + path.sep) &&
      resolved !== this.sandboxRoot &&
      !resolved.startsWith(this.sandboxRoot + path.sep)
    ) {
      throw new Error('Path traversal escapes sandbox boundaries');
    }

    // Verify symlinks do not point outside sandboxRoot
    if (fs.existsSync(resolved)) {
      const lstat = fs.lstatSync(resolved);
      if (lstat.isSymbolicLink()) {
        const real = path.normalize(fs.realpathSync(resolved));
        if (real !== this.sandboxRoot && !real.startsWith(this.sandboxRoot + path.sep)) {
          throw new Error('Symlink targets location outside sandbox boundaries');
        }
      }
    }

    return resolved;
  }

  readFile(relPath, maxChars = 4000) {
    const resolved = this.resolveSandboxPath(relPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found in sandbox: "${redactSandboxHostPaths(relPath, this.sandboxRoot)}"`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      throw new Error('Target path in sandbox is not a file');
    }
    const content = redactSandboxHostPaths(fs.readFileSync(resolved, 'utf8'), this.sandboxRoot);
    return capToolOutput(content, maxChars);
  }

  writeFile(relPath, content) {
    const resolved = this.resolveSandboxPath(relPath);
    // Block writing into the read-only inputs directory
    if (resolved === this.inputsDir || resolved.startsWith(this.inputsDir + path.sep)) {
      throw new Error('Permission denied: /sandbox/inputs is read-only');
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const cleanData = redactSandboxHostPaths(data, this.sandboxRoot);
    fs.writeFileSync(resolved, cleanData, 'utf8');
    this.emitOutput('SANDBOX_FILE_WRITTEN', {
      path: redactSandboxHostPaths(resolved, this.sandboxRoot),
      bytes: Buffer.byteLength(cleanData, 'utf8')
    });
    return resolved;
  }

  /**
   * Executes a shell/node command inside the isolated run sandbox with:
   * - Host path blocking
   * - Scrubbed environment (no workspace or host env secrets)
   * - CPU, memory, and wall-clock timeout enforcement
   * - Output scrubbing and explicit output channel logging
   */
  async execCommand(command, options = {}) {
    if (this.destroyed) {
      throw new Error('Cannot execute command in a destroyed RunSandbox');
    }
    if (!command || typeof command !== 'string') {
      throw new Error('Command must be a non-empty string');
    }

    const pathCheck = assertNoHostPathAccess(command, this.sandboxRoot);
    if (!pathCheck.allowed) {
      const blockedResult = {
        id: `exec_blocked_${crypto.randomUUID().slice(0, 8)}`,
        stdout: '',
        stderr: pathCheck.reason,
        exitCode: 1,
        timedOut: false,
        blocked: true,
        durationMs: 0,
        output: pathCheck.reason
      };
      this.emitOutput('COMMAND_BLOCKED', {
        command: redactSandboxHostPaths(command, this.sandboxRoot),
        reason: pathCheck.reason
      });
      return blockedResult;
    }

    const timeoutMs = Number(options.timeoutMs) || this.commandTimeoutMs;
    const memoryLimitMb = Number(options.memoryLimitMb) || this.memoryLimitMb;
    const execId = `exec_${crypto.randomUUID().slice(0, 8)}`;
    const startTime = Date.now();
    const scrubbedEnv = buildScrubbedSandboxEnv(this.sandboxRoot, { memoryLimitMb });

    const child = spawn(command, [], {
      cwd: this.workDir,
      env: scrubbedEnv,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.activeProcesses.add(child);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let memoryExceeded = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killProcessTreeSync(child);
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (stdout.length + text.length > memoryLimitMb * 1024 * 1024) {
          memoryExceeded = true;
          killProcessTreeSync(child);
          return;
        }
        if (stdout.length < MAX_SANDBOX_OUTPUT_CHARS * 2) {
          stdout += redactSandboxHostPaths(text, this.sandboxRoot);
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        if (stderr.length < MAX_SANDBOX_OUTPUT_CHARS * 2) {
          stderr += redactSandboxHostPaths(text, this.sandboxRoot);
        }
      });

      const finalize = (exitCode, errText = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeProcesses.delete(child);

        if (errText) {
          stderr = (stderr ? `${stderr}\n` : '') + redactSandboxHostPaths(errText, this.sandboxRoot);
        }

        // Verify no symlinks escaping the sandbox were created by the command
        try {
          const checkDir = (dir) => {
            if (!fs.existsSync(dir)) return;
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, ent.name);
              const lstat = fs.lstatSync(full);
              if (lstat.isSymbolicLink()) {
                let targetOk = false;
                try {
                  const real = path.normalize(fs.realpathSync(full));
                  targetOk = real === this.sandboxRoot || real.startsWith(this.sandboxRoot + path.sep);
                } catch {
                  targetOk = false;
                }
                if (!targetOk) {
                  try { fs.unlinkSync(full); } catch {}
                  stderr += '\n[Security] Removed symlink targeting outside sandbox.';
                  exitCode = 1;
                }
              } else if (lstat.isDirectory()) {
                checkDir(full);
              }
            }
          };
          checkDir(this.workDir);
          checkDir(this.outputsDir);
        } catch {}

        const durationMs = Date.now() - startTime;
        const finalCode = timedOut ? 124 : memoryExceeded ? 137 : (exitCode ?? 0);
        const combinedRaw = [
          stdout.trim(),
          stderr.trim() ? `[stderr]\n${stderr.trim()}` : '',
          timedOut ? `[Command timed out after ${timeoutMs}ms]` : '',
          memoryExceeded ? `[Command exceeded memory limit of ${memoryLimitMb}MB]` : ''
        ]
          .filter(Boolean)
          .join('\n\n');

        const result = {
          id: execId,
          stdout,
          stderr,
          exitCode: finalCode,
          timedOut,
          memoryExceeded,
          blocked: false,
          durationMs,
          output: capToolOutput(
            combinedRaw || `Command exited with code ${finalCode}`,
            MAX_SANDBOX_OUTPUT_CHARS
          )
        };

        this.emitOutput('COMMAND_COMPLETED', {
          id: execId,
          exitCode: finalCode,
          timedOut,
          memoryExceeded,
          durationMs,
          outputPreview: result.output.slice(0, 500)
        });

        resolve(result);
      };

      child.on('close', (code) => finalize(code));
      child.on('error', (err) => finalize(1, err.message));
    });
  }

  /**
   * Collects any explicit output files written into /sandbox/outputs during the run.
   */
  collectOutputFiles() {
    if (this.destroyed || !fs.existsSync(this.outputsDir)) return [];
    const collected = [];
    const entries = fs.readdirSync(this.outputsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const full = path.join(this.outputsDir, ent.name);
      const lstat = fs.lstatSync(full);
      if (lstat.isSymbolicLink()) continue;
      if (lstat.size > 5 * 1024 * 1024) continue;
      const content = redactSandboxHostPaths(fs.readFileSync(full, 'utf8'), this.sandboxRoot);
      const item = {
        name: ent.name,
        virtualPath: `/sandbox/outputs/${ent.name}`,
        size: lstat.size,
        content
      };
      collected.push(item);
      this.emitOutput('OUTPUT_FILE_COLLECTED', {
        name: item.name,
        virtualPath: item.virtualPath,
        size: item.size
      });
    }
    return collected;
  }

  /**
   * Synchronous destruction used by process exit / crash hooks.
   */
  destroySync(reason = 'completed') {
    if (this.destroyed) return;
    if (this.runTimer) {
      clearTimeout(this.runTimer);
      this.runTimer = null;
    }

    for (const child of this.activeProcesses) {
      killProcessTreeSync(child);
    }
    this.activeProcesses.clear();

    try {
      unlockReadOnlyRecursive(this.sandboxRoot);
      if (fs.existsSync(this.sandboxRoot)) {
        fs.rmSync(this.sandboxRoot, { recursive: true, force: true });
      }
    } catch {}

    this.destroyed = true;
    this.destroyedAt = Date.now();
    this.destroyReason = String(reason || 'completed');
    activeRunSandboxes.delete(this.runId);

    this.emitOutput('SANDBOX_DESTROYED', {
      runId: this.runId,
      reason: this.destroyReason,
      destroyedAt: this.destroyedAt,
      existsOnDisk: fs.existsSync(this.sandboxRoot)
    });
  }

  /**
   * Asynchronous destruction that also closes any attached browser context cleanly.
   */
  async destroy(reason = 'completed') {
    if (this.destroyed) return;
    if (this.browserContext) {
      try {
        await this.browserContext.close().catch(() => {});
      } catch {}
      this.browserContext = null;
    }
    this.destroySync(reason);
  }
}

export function createRunSandbox(runIdOrOptions = {}, extraOptions = {}) {
  const options =
    typeof runIdOrOptions === 'string'
      ? { ...extraOptions, runId: runIdOrOptions }
      : { ...(runIdOrOptions || {}) };
  const runId = options.runId || `run-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  if (activeRunSandboxes.has(runId)) {
    const existing = activeRunSandboxes.get(runId);
    if (!existing.destroyed) return existing;
  }
  return new RunSandbox({ ...options, runId });
}

export function getRunSandbox(runId) {
  if (!runId) return null;
  const sb = activeRunSandboxes.get(String(runId));
  return sb && !sb.destroyed ? sb : null;
}

export function getOrCreateRunSandbox(runId, options = {}) {
  const existing = getRunSandbox(runId);
  if (existing) return existing;
  return createRunSandbox({ ...options, runId });
}

export async function destroyRunSandbox(runId, reason = 'completed') {
  if (!runId) return false;
  const sb = activeRunSandboxes.get(String(runId));
  if (!sb) return false;
  await sb.destroy(reason);
  return true;
}

export async function destroyAllRunSandboxes(reason = 'shutdown') {
  const list = Array.from(activeRunSandboxes.values());
  for (const sb of list) {
    await sb.destroy(reason);
  }
}
