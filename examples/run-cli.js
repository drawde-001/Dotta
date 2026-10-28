#!/usr/bin/env node

/**
 * Minimal Headless CLI runner for OmniEngine
 */
import path from 'path';
import { OmniEngine } from '../src/index.js';

async function main() {
  const instruction = process.argv.slice(2).join(' ') || 'Explain what tools you have available and how you execute them.';

  console.log('='.repeat(60));
  console.log('Omni Core Headless CLI');
  console.log('='.repeat(60));
  console.log(`Task: ${instruction}\n`);

  const engine = new OmniEngine();

  engine.on('event', (evt) => {
    switch (evt.type) {
      case 'RUN_STARTED':
        console.log(`[Status] Run started (Thread: ${evt.threadId}, Model: ${evt.model})`);
        break;
      case 'THOUGHT_CHUNK':
        process.stdout.write(`\x1b[90m${evt.chunk}\x1b[0m`);
        break;
      case 'TEXT_CHUNK':
        process.stdout.write(evt.chunk);
        break;
      case 'TOOL_CALL':
        console.log(`\n\x1b[36m[Tool Call]\x1b[0m ${evt.name}(${JSON.stringify(evt.args)})`);
        break;
      case 'TOOL_RESULT':
        console.log(`\x1b[32m[Tool Result]\x1b[0m ${evt.output}\n`);
        break;
      case 'RUN_FINISHED':
        console.log(`\n[Status] Run completed (${evt.stopReason}) in ${evt.summary.elapsedMs}ms`);
        break;
      case 'RUN_ERROR':
        console.error(`\n\x1b[31m[Run Error]\x1b[0m ${evt.message}`);
        break;
    }
  });

  const workspaceRoot = path.resolve(process.cwd(), 'workspace');

  try {
    const result = await engine.run({
      instruction,
      workspaceRoot
    });
    console.log('\nFinal Output:\n', result.text || '(Completed)');
  } catch (err) {
    console.error('Execution failed:', err.message);
  }
}

main();
