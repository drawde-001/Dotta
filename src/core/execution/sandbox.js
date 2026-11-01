import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { capToolOutput } from '../tools/policy.js';
import { redactRootPaths } from './workspace.js';
import {
  getOrCreateRunSandbox,
  buildScrubbedSandboxEnv,
  assertNoHostPathAccess,
  redactSandboxHostPaths
} from './run-sandbox.js';

export const DEFAULT_DISTRO_NAME = process.env.OMNI_SANDBOX_DISTRO || 'omni-agent-sandbox';
export const DEFAULT_COMMAND_TIMEOUT_MS = 30000;
export const MAX_OUTPUT_CHARS = 10000;

const activeExecutions = new Map();

const distroCache = new Map();

export function isSandboxDistroAvailable(distroName = DEFAULT_DISTRO_NAME) {
  if (process.env.OMNI_USE_WSL_SANDBOX !== '1') {
    return false;
  }
  if (distroCache.has(distroName)) {
    return distroCache.get(distroName);
  }
  try {
    const output = execSync('wsl -l -v', { encoding: 'utf16le', timeout: 5000 });
    const ok = output.includes(distroName);
    distroCache.set(distroName, ok);
    return ok;
  } catch (err) {
    try {
      const outputUtf8 = execSync('wsl -l -v', { encoding: 'utf8', timeout: 5000 });
      const ok = outputUtf8.includes(distroName);
      distroCache.set(distroName, ok);
      return ok;
    } catch (e) {
      distroCache.set(distroName, false);
      return false;
    }
  }
}

export async function runSandboxCommand({
  command,
  runId,
  workspaceRoot,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  memoryLimitMb = 256,
  background = false,
  distroName = DEFAULT_DISTRO_NAME
}) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string');
  }

  // Always execute inside the isolated per-run sandbox (never in PROJECT_ROOT or user workspace)
  const sandbox = getOrCreateRunSandbox(runId || 'default-run', {
    commandTimeoutMs: timeoutMs,
    memoryLimitMb
  });
  const effectiveWorkspaceRoot = sandbox.workDir;

  // Enforce strict host-path & workspace-escape blocking
  const pathCheck = assertNoHostPathAccess(command, sandbox.sandboxRoot);
  if (
    !pathCheck.allowed ||
    /(?:^|\s|;|&&|\|)(?:cd\s+(?:\/|\.\.|~|[a-zA-Z]:)|ls\s+\/|dir\s+[a-zA-Z]:\\|pwd\b)/i.test(command.trim())
  ) {
    const reason = pathCheck.reason || 'Access to the root directory or parent directory is strictly prohibited.';
    sandbox.emitOutput('COMMAND_BLOCKED', {
      command: redactSandboxHostPaths(command, sandbox.sandboxRoot),
      reason
    });
    return {
      id: 'exec_blocked',
      stdout: '',
      stderr: reason,
      exitCode: 1,
      timedOut: false,
      blocked: true,
      durationMs: 0,
      output: reason
    };
  }

  if (!fs.existsSync(effectiveWorkspaceRoot)) {
    fs.mkdirSync(effectiveWorkspaceRoot, { recursive: true });
  }

  // For foreground execution without background flag, delegate directly to RunSandbox.execCommand
  if (!background && !isSandboxDistroAvailable(distroName)) {
    return await sandbox.execCommand(command, { timeoutMs, memoryLimitMb });
  }

  const execId = 'exec_' + crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  const scrubbedEnv = buildScrubbedSandboxEnv(sandbox.sandboxRoot, { memoryLimitMb });

  const useWsl = isSandboxDistroAvailable(distroName);

  if (useWsl) {
    const safeRunId = String(runId || 'default-run').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const sandboxDir = `/sandbox/${safeRunId}`;

    const scrubbedCommand = `mkdir -p ${sandboxDir} && cd ${sandboxDir} && ${command}`;
    const child = spawn(
      'wsl',
      [
        '-d',
        distroName,
        '-u',
        'root',
        '--',
        'env',
        '-i',
        'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        `HOME=${sandboxDir}`,
        'USER=sandbox',
        `PWD=${sandboxDir}`,
        'sh',
        '-c',
        scrubbedCommand
      ],
      {
        env: { PATH: scrubbedEnv.PATH, SYSTEMROOT: scrubbedEnv.SYSTEMROOT || '', WSLENV: '' },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    sandbox.activeProcesses.add(child);

    if (background) {
      const execRecord = {
        id: execId,
        child,
        stdout: '',
        stderr: '',
        status: 'running',
        exitCode: null,
        runId: sandbox.runId,
        workspaceRoot: effectiveWorkspaceRoot,
        command,
        distroName,
        startedAt: startTime
      };
      child.stdout.on('data', (d) => {
        if (execRecord.stdout.length < MAX_OUTPUT_CHARS * 2) {
          execRecord.stdout += redactSandboxHostPaths(
            redactRootPaths(d.toString(), effectiveWorkspaceRoot),
            sandbox.sandboxRoot
          );
        }
      });
      child.stderr.on('data', (d) => {
        if (execRecord.stderr.length < MAX_OUTPUT_CHARS * 2) {
          execRecord.stderr += redactSandboxHostPaths(
            redactRootPaths(d.toString(), effectiveWorkspaceRoot),
            sandbox.sandboxRoot
          );
        }
      });
      child.on('close', (code) => {
        sandbox.activeProcesses.delete(child);
        execRecord.status = 'completed';
        execRecord.exitCode = code ?? 0;
      });
      activeExecutions.set(execId, execRecord);
      return {
        id: execId,
        status: 'running',
        background: true,
        message: `Command started in background with execution ID "${execId}".`
      };
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGTERM'); } catch (e) {}
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        if (stdout.length < MAX_OUTPUT_CHARS * 2) {
          stdout += redactSandboxHostPaths(
            redactRootPaths(data.toString(), effectiveWorkspaceRoot),
            sandbox.sandboxRoot
          );
        }
      });
      child.stderr.on('data', (data) => {
        if (stderr.length < MAX_OUTPUT_CHARS * 2) {
          stderr += redactSandboxHostPaths(
            redactRootPaths(data.toString(), effectiveWorkspaceRoot),
            sandbox.sandboxRoot
          );
        }
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        sandbox.activeProcesses.delete(child);
        const combinedRaw = [
          stdout.trim(),
          stderr.trim() ? `[stderr]\n${stderr.trim()}` : '',
          timedOut ? `[Command timed out after ${timeoutMs}ms]` : ''
        ].filter(Boolean).join('\n\n');

        const result = {
          id: execId,
          stdout,
          stderr,
          exitCode: timedOut ? 124 : (exitCode ?? 0),
          timedOut,
          durationMs: Date.now() - startTime,
          output: capToolOutput(combinedRaw || `Command exited with code ${exitCode}`, MAX_OUTPUT_CHARS)
        };
        sandbox.emitOutput('COMMAND_COMPLETED', {
          id: execId,
          exitCode: result.exitCode,
          timedOut,
          durationMs: result.durationMs
        });
        resolve(result);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        sandbox.activeProcesses.delete(child);
        const cleanErr = redactSandboxHostPaths(
          redactRootPaths(err.message, effectiveWorkspaceRoot),
          sandbox.sandboxRoot
        );
        resolve({
          id: execId,
          stdout: '',
          stderr: cleanErr,
          exitCode: 1,
          timedOut: false,
          durationMs: Date.now() - startTime,
          output: `Error executing command: ${cleanErr}`
        });
      });
    });
  }

  // Background local subprocess inside isolated RunSandbox with scrubbed env
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : '/bin/sh';
  const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command];

  const child = spawn(shell, shellArgs, {
    cwd: effectiveWorkspaceRoot,
    env: scrubbedEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  sandbox.activeProcesses.add(child);

  const execRecord = {
    id: execId,
    child,
    stdout: '',
    stderr: '',
    status: 'running',
    exitCode: null,
    command,
    startedAt: startTime
  };
  child.stdout.on('data', (d) => {
    if (execRecord.stdout.length < MAX_OUTPUT_CHARS * 2) {
      execRecord.stdout += redactSandboxHostPaths(
        redactRootPaths(d.toString(), effectiveWorkspaceRoot),
        sandbox.sandboxRoot
      );
    }
  });
  child.stderr.on('data', (d) => {
    if (execRecord.stderr.length < MAX_OUTPUT_CHARS * 2) {
      execRecord.stderr += redactSandboxHostPaths(
        redactRootPaths(d.toString(), effectiveWorkspaceRoot),
        sandbox.sandboxRoot
      );
    }
  });
  child.on('close', (code) => {
    sandbox.activeProcesses.delete(child);
    execRecord.status = 'completed';
    execRecord.exitCode = code ?? 0;
  });
  activeExecutions.set(execId, execRecord);
  return {
    id: execId,
    status: 'running',
    background: true,
    message: `Command started in background with execution ID "${execId}".`
  };
}

export async function getSandboxCommandOutput(id) {
  const exec = activeExecutions.get(id);
  if (!exec) {
    throw new Error(`Background execution "${id}" not found`);
  }

  const logs = [exec.stdout.trim(), exec.stderr.trim() ? `[stderr]\n${exec.stderr.trim()}` : '']
    .filter(Boolean)
    .join('\n\n');

  return {
    id,
    status: exec.status,
    exitCode: exec.exitCode,
    output: capToolOutput(logs || (exec.status === 'running' ? '[Process is currently running...]' : ''), MAX_OUTPUT_CHARS),
    durationMs: Date.now() - exec.startedAt
  };
}

export async function killSandboxCommand(id) {
  const exec = activeExecutions.get(id);
  if (!exec) {
    throw new Error(`Background execution "${id}" not found`);
  }

  try {
    if (exec.child && !exec.child.killed) {
      exec.child.kill('SIGTERM');
    }
  } catch (e) {}

  exec.status = 'killed';
  activeExecutions.delete(id);

  return {
    id,
    killed: true,
    message: `Background command "${id}" terminated successfully.`
  };
}
