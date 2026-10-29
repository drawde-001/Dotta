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
import { checkPermission, executeToolWithRetry, appendAuditLog, checkToolRunCap } from './tools/policy.js';
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
  createWorkspace,
  getLatestFileArtifact,
  sanitizeRelativeDisplayPath
} from './execution/workspace.js';
import {
  runSandboxCommand,
  getSandboxCommandOutput,
  killSandboxCommand
} from './execution/sandbox.js';
import {
  executeWebSearch,
  executeReadPage,
  executeBrowserAction,
  executeSnapshotRead,
  executeBrowserScreenshot
} from './execution/browser.js';
import { executeSegmentImage } from './tools/sam-tool.js';
import { executeGenerateImage } from './tools/image-tool.js';

export const OMNI_SYSTEM_PROMPT = `You are Omni Agent, a premier autonomous problem-solving AI agent.
You possess direct, real-world execution tools to fulfill user instructions:
1. Web Discovery & Browsing:
- "browser_search" (or "web_search"): Live search the web for fresh facts, news, documentation, and real-time listings. ALWAYS invoke this tool immediately whenever the user asks to look up, search, find online, or check anything on the web.
- "browser_read_page" (or "read_page"): Read and extract readable text from any destination URL.
- "browser_action": Click, type, scroll, or hover on webpage elements in the live Chromium browser.
- "snapshot_read": Inspect current page DOM and interactive elements without navigating.
- "browser_screenshot": Capture a visual screenshot of the live page.
- "profile_get": Retrieve user applicant profile and credentials.
2. Image Generation & Vision (Meta Muse Image 1.0 & SAM 3.1):
- "generate_image": Generate high-resolution images, portraits, photos, illustrations, or artwork using Meta Muse Image 1.0 ("muse-image-1.0"). ALWAYS call "generate_image" immediately whenever the user asks to generate, create, draw, paint, or render an image. NEVER write SVG files or run shell/Python scripts to fake image generation. The UI automatically displays the generated image in the ImageGeneration component card—do not embed raw base64 or markdown image links in your final text.
- "segment_image": Pixel-accurate object segmentation and bounding boxes using Meta SAM 3.1.
3. Workspace & Files (Strict Root Directory Isolation):
- "workspace_create": Initialize a dedicated run workspace directory.
- "file_read", "file_list", "file_search", "file_write", "file_edit", "file_delete".
- STRICT ROOT PRIVACY RULE: Neither you nor the user has access to the root directory. Never attempt to access, list, or reveal the name or location of the root directory or parent directories. Always use relative interior paths (e.g. "src/...", "app.js").
4. Sandboxed Execution:
- "shell_run": Execute terminal/bash commands in the isolated workspace sandbox.
- "shell_output": Check output or logs of running background commands.
- "shell_kill": Terminate running processes.
5. User Interaction (HITL):
- "ask_user": When you need a decision, preference, or confirmation from the user, invoke "ask_user" with:
  * "question": A brief 1-sentence question or recommendation (max 15-18 words).
  * "options": REQUIRED array of 2 to 3 short, concrete choices (2-6 words each). Put your top recommendation FIRST prefixed with "(Recommended)".
  * "questions": If the user asks for multiple questions at once (e.g. 3 questions), pass all of them in the "questions" array: [{ question: "...", options: ["..."] }, ...] in a SINGLE "ask_user" call.

CRITICAL EXECUTION RULES:
- DECISIVE TOOL USE: Never give conversational excuses or pretend you cannot access the web, generate images, or run tools. Invoke the appropriate tool immediately on turn 1.
- DO NOT CHATTER BEFORE CALLING TOOLS: When calling tools, emit ONLY the function call without conversational preambles.
- SYNTHESIZE AFTER RESULTS: Once tool results are returned, synthesize a concise, well-formatted Markdown response.`;

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

      case 'browser_action':
        return await executeBrowserAction(toolArgs);

      case 'snapshot_read':
        return await executeSnapshotRead(toolArgs);

      case 'browser_screenshot':
        return await executeBrowserScreenshot(toolArgs);

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

      case 'segment_image':
        return await executeSegmentImage(toolArgs, { workspaceRoot, runId, threadId: context.threadId });

      case 'generate_image':
      case 'image_generation':
      case 'create_image':
      case 'edit_image':
        return await executeGenerateImage(toolArgs);

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

    if (resume) {
      const approvedTool = resume.toolName || resume.pendingToolName;
      if (resume.approved && approvedTool && approvedTool !== 'ask_user') {
        addThreadApproval(threadId, approvedTool);
      }
      clearInterrupt(threadId);
    }

    const activeTools = getScopedTools({ phase: 'all', includeAskUser: true });
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
            const toolArgs = { ...(fc.args || {}) };
            if (typeof toolArgs.path === 'string') {
              toolArgs.path = sanitizeRelativeDisplayPath(toolArgs.path);
            }

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

            // 1.5. Cost-bearing tool per-run cap check
            const toolUsageCount = budgetTracker.callHistory.filter((c) => c.toolName === toolName).length;
            const capCheck = checkToolRunCap(toolName, toolUsageCount);
            if (!capCheck.allowed) {
              toolResults.push({
                name: toolName,
                id: fc.id,
                result: `Per-run cap reached: ${capCheck.reason}`
              });
              appendAuditLog({
                tool: toolName,
                input: toolArgs,
                result: { status: 'permanent_error', error: capCheck.reason },
                decision: 'deny',
                durationMs: 0
              });
              continue;
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

            if (toolName === 'ask_user' || perm.decision === 'ask') {
              const normalizeOptArray = (arr) => {
                const list = Array.isArray(arr) ? arr : [];
                let cleaned = list
                  .map((opt) => (typeof opt === 'string' ? opt.trim() : String(opt?.label || opt?.value || '').trim()))
                  .filter(Boolean)
                  .slice(0, 3);
                if (cleaned.length === 0) {
                  cleaned =
                    toolName === 'ask_user'
                      ? ['(Recommended) Proceed with recommended defaults', 'Specify custom details']
                      : ['(Recommended) Allow and proceed', 'Skip this action'];
                } else if (!cleaned.some((o) => /recommended/i.test(o))) {
                  cleaned[0] = `(Recommended) ${cleaned[0]}`;
                }
                return cleaned;
              };

              const rawQuestionsList = Array.isArray(toolArgs.questions) ? toolArgs.questions : [];
              const normalizedQuestions = rawQuestionsList
                .filter((q) => q && (q.question || q.title))
                .map((q) => ({
                  question: String(q.question || q.title).trim(),
                  options: normalizeOptArray(q.options || q.choices)
                }));

              const rawQuestion =
                normalizedQuestions[0]?.question ||
                toolArgs.question ||
                toolArgs.prompt ||
                toolArgs.message ||
                toolArgs.title ||
                toolArgs.stepTitle ||
                (toolName === 'ask_user'
                  ? 'How would you like to proceed?'
                  : `Approve ${toolName.replace(/_/g, ' ')}?`);

              const normalizedOptions =
                normalizedQuestions[0]?.options ||
                normalizeOptArray(toolArgs.options || toolArgs.choices);

              const enrichedArgs = {
                ...toolArgs,
                question: rawQuestion,
                options: normalizedOptions,
                ...(normalizedQuestions.length > 0 ? { questions: normalizedQuestions } : {})
              };

              saveInterrupt(threadId, {
                runId,
                pendingToolName: toolName,
                pendingToolArgs: enrichedArgs
              });
              this.emit('event', {
                type: 'INTERRUPT',
                threadId,
                runId,
                tool: toolName,
                args: enrichedArgs,
                question: rawQuestion,
                options: normalizedOptions,
                questions: normalizedQuestions.length > 0 ? normalizedQuestions : undefined,
                context: toolArgs.context || (toolName !== 'ask_user' ? perm.reason : undefined),
                reason: toolName === 'ask_user' ? 'user_question' : perm.reason || 'user_confirmation'
              });
              return {
                status: 'interrupted',
                threadId,
                runId,
                pendingTool: toolName,
                args: enrichedArgs,
                question: rawQuestion,
                options: normalizedOptions,
                questions: normalizedQuestions.length > 0 ? normalizedQuestions : undefined
              };
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

            const isFileOperation =
              toolName === 'file_read' ||
              toolName === 'file_write' ||
              toolName === 'file_edit' ||
              toolName === 'file_delete';
            const fileArtifact = isFileOperation ? getLatestFileArtifact(runId || 'default') : null;

            this.emit('event', {
              type: 'TOOL_RESULT',
              name: toolName,
              output: execResult.output,
              fileArtifact: fileArtifact || undefined,
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
