import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { capToolOutput } from '../tools/policy.js';
import { getWorkspaceRoot } from './workspace.js';

export const DEFAULT_DISTRO_NAME = process.env.OMNI_SANDBOX_DISTRO || 'omni-agent-sandbox';
export const DEFAULT_COMMAND_TIMEOUT_MS = 30000;
export const MAX_OUTPUT_CHARS = 10000;

const activeExecutions = new Map();

export function isSandboxDistroAvailable(distroName = DEFAULT_DISTRO_NAME) {
  try {
    const output = execSync('wsl -l -v', { encoding: 'utf16le', timeout: 15000 });
    return output.includes(distroName);
  } catch (err) {
    try {
      const outputUtf8 = execSync('wsl -l -v', { encoding: 'utf8', timeout: 15000 });
      return outputUtf8.includes(distroName);
    } catch (e) {
      return false;
    }
  }
}

export async function runSandboxCommand({
  command,
  runId,
  workspaceRoot,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  background = false,
  distroName = DEFAULT_DISTRO_NAME
}) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string');
  }

  const effectiveWorkspaceRoot = workspaceRoot || (runId ? getWorkspaceRoot(runId) : process.cwd());
  const execId = 'exec_' + crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  const useWsl = isSandboxDistroAvailable(distroName);

  if (useWsl) {
    const safeRunId = String(runId || 'default-run').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const sandboxDir = `/sandbox/${safeRunId}`;

    const scrubbedCommand = `cd ${sandboxDir} && ${command}`;
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
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, WSLENV: '' },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    if (background) {
      const execRecord = {
        id: execId,
        child,
        stdout: '',
        stderr: '',
        status: 'running',
        exitCode: null,
        runId,
        workspaceRoot: effectiveWorkspaceRoot,
        command,
        distroName,
        startedAt: startTime
      };
      child.stdout.on('data', (d) => {
        if (execRecord.stdout.length < MAX_OUTPUT_CHARS * 2) execRecord.stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        if (execRecord.stderr.length < MAX_OUTPUT_CHARS * 2) execRecord.stderr += d.toString();
      });
      child.on('close', (code) => {
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
        if (stdout.length < MAX_OUTPUT_CHARS * 2) stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        if (stderr.length < MAX_OUTPUT_CHARS * 2) stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        const combinedRaw = [
          stdout.trim(),
          stderr.trim() ? `[stderr]\n${stderr.trim()}` : '',
          timedOut ? `[Command timed out after ${timeoutMs}ms]` : ''
        ].filter(Boolean).join('\n\n');

        resolve({
          id: execId,
          stdout,
          stderr,
          exitCode: timedOut ? 124 : (exitCode ?? 0),
          timedOut,
          durationMs: Date.now() - startTime,
          output: capToolOutput(combinedRaw || `Command exited with code ${exitCode}`, MAX_OUTPUT_CHARS)
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          id: execId,
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          timedOut: false,
          durationMs: Date.now() - startTime,
          output: `Error executing command: ${err.message}`
        });
      });
    });
  }

  // Fallback to local subprocess execution if WSL sandbox is not configured
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : '/bin/sh';
  const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command];

  const child = spawn(shell, shellArgs, {
    cwd: effectiveWorkspaceRoot,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (background) {
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
      if (execRecord.stdout.length < MAX_OUTPUT_CHARS * 2) execRecord.stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (execRecord.stderr.length < MAX_OUTPUT_CHARS * 2) execRecord.stderr += d.toString();
    });
    child.on('close', (code) => {
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
      if (stdout.length < MAX_OUTPUT_CHARS * 2) stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_CHARS * 2) stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const combinedRaw = [
        stdout.trim(),
        stderr.trim() ? `[stderr]\n${stderr.trim()}` : '',
        timedOut ? `[Command timed out after ${timeoutMs}ms]` : ''
      ].filter(Boolean).join('\n\n');

      resolve({
        id: execId,
        stdout,
        stderr,
        exitCode: timedOut ? 124 : (exitCode ?? 0),
        timedOut,
        durationMs: Date.now() - startTime,
        output: capToolOutput(combinedRaw || `Command exited with code ${exitCode}`, MAX_OUTPUT_CHARS)
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        id: execId,
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        timedOut: false,
        durationMs: Date.now() - startTime,
        output: `Error executing command: ${err.message}`
      });
    });
  });
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
