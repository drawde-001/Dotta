import { EventEmitter } from 'events';
import { AgentBudgetTracker } from './state/budget.js';
import {
  getThreadState,
  saveThreadState,
  persistTurn,
  saveInterrupt,
  clearInterrupt,
  getThreadApprovals,
  addThreadApproval,
  getInterruptHistory,
  recordInterruptHistory,
  getInterruptAnswer
} from './state/store.js';
import { checkPermission, executeToolWithRetry, appendAuditLog } from './tools/policy.js';
import { AGENT_TOOLS_CATALOG, getScopedTools } from './tools/catalog.js';
import { streamModelTurn } from './models/model-adapter.js';
import { buildFunctionResponseParts, normalizeGeminiContents } from './models/gemini-protocol.js';
import {
  workspaceFileRead,
  workspaceFileList,
  workspaceFileSearch,
  workspaceFileWrite,
  workspaceFileEdit,
  workspaceFileDelete,
  createWorkspace
} from './execution/workspace.js';
import {
  runSandboxCommand,
  getSandboxCommandOutput,
  killSandboxCommand
} from './execution/sandbox.js';
import {
  executeWebSearch,
  executeReadPage
} from './execution/browser.js';

export const OMNI_SYSTEM_PROMPT = `You are Omni Agent, a premier autonomous problem-solving AI agent powered by Meta Muse.
You possess direct, real-world execution tools to fulfill user instructions:
1. Web Discovery & Browsing:
- "browser_search" (or "web_search"): Live search the web for fresh facts, news, documentation, and real-time job openings. Query should be concise keywords. ALWAYS invoke this tool immediately whenever the user asks to look up, search, find online, or check anything on the web.
- "browser_read_page" (or "read_page"): Read and extract readable text from any destination URL.
2. Workspace & Files:
- "workspace_create", "file_read", "file_list", "file_search", "file_write", "file_edit", "file_delete".
3. Sandboxed Execution:
- "shell_run", "shell_output", "shell_kill".

CRITICAL EXECUTION RULES:
- DECISIVE TOOL USE: Never give conversational excuses or pretend you cannot access the web or run tools. When asked to check online, search, or read files, invoke the respective tool immediately on turn 1.
- DO NOT CHATTER BEFORE CALLING TOOLS: When calling tools, emit ONLY the function call without conversational preambles.
- SYNTHESIZE AFTER RESULTS: Once tool results are returned, synthesize a thorough, well-formatted Markdown response with links, citations, and summaries.`;

export class OmniEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.systemInstruction = options.systemInstruction || OMNI_SYSTEM_PROMPT;
    this.defaultModel = options.defaultModel || process.env.DEFAULT_MODEL || 'meta-muse-spark';
    this.toolCatalog = { ...AGENT_TOOLS_CATALOG, ...(options.customTools || {}) };
    this.customExecutors = options.customExecutors || {};
  }

  registerTool(toolDef, executor) {
    if (!toolDef || !toolDef.name) throw new Error('Tool must have a name');
    this.toolCatalog[toolDef.name] = toolDef;
    if (typeof executor === 'function') {
      this.customExecutors[toolDef.name] = executor;
    }
  }

  async executeTool(toolName, toolArgs, context = {}) {
    if (this.customExecutors[toolName]) {
      return await this.customExecutors[toolName](toolArgs, context);
    }

    const { workspaceRoot, runId } = context;

    switch (toolName) {
      case 'browser_search':
      case 'web_search':
        return await executeWebSearch(toolArgs);

      case 'browser_read_page':
      case 'read_page':
        return await executeReadPage(toolArgs);

      case 'profile_get':
        return JSON.stringify({
          fullName: 'Edward',
          role: 'Full Stack Engineer & AI Architect',
          skills: ['TypeScript', 'React', 'Node.js', 'Playwright', 'Python', 'DevOps']
        });

      case 'workspace_create':
        return createWorkspace(runId || toolArgs.name, toolArgs.name);

      case 'file_read':
        return workspaceFileRead({ ...toolArgs, workspaceRoot, runId });

      case 'file_list':
        return workspaceFileList({ ...toolArgs, workspaceRoot, runId });

      case 'file_search':
        return workspaceFileSearch({ ...toolArgs, workspaceRoot, runId });

      case 'file_write':
        return workspaceFileWrite({ ...toolArgs, workspaceRoot, runId });

      case 'file_edit':
        return workspaceFileEdit({ ...toolArgs, workspaceRoot, runId });

      case 'file_delete':
        return workspaceFileDelete({ ...toolArgs, workspaceRoot, runId });

      case 'shell_run':
        return await runSandboxCommand({ ...toolArgs, workspaceRoot, runId });

      case 'shell_output':
        return await getSandboxCommandOutput(toolArgs.id);

      case 'shell_kill':
        return await killSandboxCommand(toolArgs.id);

      default:
        throw new Error(`No local executor registered for tool "${toolName}".`);
    }
  }

  /**
   * Main autonomous orchestration loop
   */
  async run({
    instruction,
    messages = [],
    threadId = `thread-${Date.now()}`,
    runId = `run-${Date.now()}`,
    model = this.defaultModel,
    mode = 'turbo',
    maxTurns = 25,
    maxBudgetUsd = 2.0,
    workspaceRoot = null,
    resume = null
  }) {
    const budgetTracker = new AgentBudgetTracker({
      maxTurns,
      maxBudgetUsd,
      model
    });

    this.emit('event', {
      type: 'RUN_STARTED',
      threadId,
      runId,
      model,
      timestamp: Date.now()
    });

    const activeTools = getScopedTools({ phase: 'all' });
    let contents = normalizeGeminiContents(
      messages.length > 0
        ? messages
        : [{ role: 'user', parts: [{ text: instruction || 'Start execution' }] }]
    );

    let isCompleted = false;
    let turnCount = 0;

    try {
      while (!isCompleted) {
        const turnReason = budgetTracker.recordTurnStart();
        if (turnReason) {
          this.emit('event', {
            type: 'RUN_FINISHED',
            threadId,
            runId,
            stopReason: turnReason,
            summary: budgetTracker.getSummary()
          });
          return { success: false, stopReason: turnReason, summary: budgetTracker.getSummary() };
        }

        turnCount++;

        let turnThought = '';
        let turnText = '';
        const functionCalls = [];

        const streamResult = await streamModelTurn({
          contents,
          systemInstruction: this.systemInstruction,
          model,
          tools: activeTools,
          callbacks: {
            onThoughtChunk: (chunk) => {
              turnThought += chunk;
              this.emit('event', { type: 'THOUGHT_CHUNK', chunk, timestamp: Date.now() });
            },
            onResponseChunk: (chunk) => {
              turnText += chunk;
              this.emit('event', { type: 'TEXT_CHUNK', chunk, timestamp: Date.now() });
            },
            onFunctionCall: (fc) => {
              functionCalls.push(fc);
            }
          }
        });

        if (streamResult.usageMetadata) {
          const budgetReason = budgetTracker.recordTokenUsage(streamResult.usageMetadata);
          if (budgetReason) {
            this.emit('event', {
              type: 'RUN_FINISHED',
              threadId,
              runId,
              stopReason: budgetReason,
              summary: budgetTracker.getSummary()
            });
            return { success: false, stopReason: budgetReason, summary: budgetTracker.getSummary() };
          }
        }

        // If the model produced function calls, execute them
        const callsToExecute = streamResult.functionCalls || functionCalls;

        if (callsToExecute && callsToExecute.length > 0) {
          const toolResults = [];

          for (const fc of callsToExecute) {
            const toolName = fc.name;
            const toolArgs = fc.args || {};

            this.emit('event', {
              type: 'TOOL_CALL',
              name: toolName,
              args: toolArgs,
              id: fc.id,
              timestamp: Date.now()
            });

            // 1. Budget and cycle check
            const check = budgetTracker.recordToolCall(toolName, toolArgs);
            if (!check.allowed) {
              this.emit('event', {
                type: 'RUN_FINISHED',
                threadId,
                runId,
                stopReason: 'repeated_calls',
                summary: budgetTracker.getSummary()
              });
              return { success: false, stopReason: 'repeated_calls', summary: budgetTracker.getSummary() };
            }

            // 2. Policy permission check
            const perm = checkPermission(toolName, toolArgs, mode, getThreadApprovals(threadId));
            if (perm.decision === 'deny') {
              toolResults.push({
                name: toolName,
                id: fc.id,
                result: `Permission Denied: ${perm.reason}`
              });
              continue;
            }

            if (perm.decision === 'ask') {
              saveInterrupt(threadId, {
                runId,
                pendingToolName: toolName,
                pendingToolArgs: toolArgs
              });
              this.emit('event', {
                type: 'INTERRUPT',
                threadId,
                runId,
                tool: toolName,
                args: toolArgs,
                reason: perm.reason
              });
              return { status: 'interrupted', threadId, runId, pendingTool: toolName };
            }

            // 3. Execution with retry
            const toolDef = this.toolCatalog[toolName];
            const startTime = Date.now();
            const execResult = await executeToolWithRetry({
              toolName,
              toolArgs,
              toolDef,
              executor: (args) => this.executeTool(toolName, args, { workspaceRoot, runId, threadId })
            });

            appendAuditLog({
              tool: toolName,
              input: toolArgs,
              result: execResult.output,
              decision: perm.decision,
              durationMs: Date.now() - startTime
            });

            this.emit('event', {
              type: 'TOOL_RESULT',
              name: toolName,
              output: execResult.output,
              id: fc.id,
              status: execResult.status,
              timestamp: Date.now()
            });

            toolResults.push({
              name: toolName,
              id: fc.id,
              response: { result: execResult.output }
            });
          }

          // Append model turn with functionCalls and user turn with functionResponses to conversation contents
          contents.push({
            role: 'model',
            parts: streamResult.modelParts
          });

          contents.push({
            role: 'user',
            parts: buildFunctionResponseParts(toolResults)
          });

          persistTurn(threadId, {
            role: 'model',
            parts: streamResult.modelParts,
            turnIndex: turnCount,
            usageMetadata: streamResult.usageMetadata
          });
        } else {
          // Model finished with final answer (no tool calls)
          isCompleted = true;
          persistTurn(threadId, {
            role: 'model',
            parts: streamResult.modelParts,
            turnIndex: turnCount,
            usageMetadata: streamResult.usageMetadata
          });

          this.emit('event', {
            type: 'RUN_FINISHED',
            threadId,
            runId,
            stopReason: 'success',
            text: turnText,
            summary: budgetTracker.finish('success')
          });

          return {
            success: true,
            threadId,
            runId,
            text: turnText,
            thought: turnThought,
            summary: budgetTracker.getSummary()
          };
        }
      }
    } catch (err) {
      this.emit('event', {
        type: 'RUN_ERROR',
        threadId,
        runId,
        message: err.message,
        stack: err.stack
      });
      throw err;
    }
  }
}
