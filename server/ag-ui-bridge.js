import { OmniEngine } from '../src/core/index.js';
import {
  sanitizeUserId,
  getUserWorkspaceRoot
} from '../src/core/execution/workspace.js';
import { applyBioProposal, discardBioProposal } from '../src/core/bio/store.js';

export function writeAgUiEvent(res, event) {
  if (res.writableEnded) return;
  const payload = {
    ...event,
    timestamp: event.timestamp || Date.now()
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function createAgUiHandler({ engine = new OmniEngine() } = {}) {
  return async function handleAgUiChat(req, res) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const body = req.body || {};
    const threadId = body.threadId || `thread-${Date.now()}`;
    const runId = body.runId || `run-${Date.now()}`;
    const model = body.model || process.env.DEFAULT_MODEL || 'muse-spark-open';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const latestUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const instruction =
      body.instruction ||
      (typeof latestUserMsg?.content === 'string'
        ? latestUserMsg.content
        : Array.isArray(latestUserMsg?.parts)
        ? latestUserMsg.parts.map((p) => p.text).join('')
        : '');
    const resume = body.resume || null;
    const mode = body.mode || 'turbo';
    // Per-user sandbox: agent file tools are confined to this user's folder.
    // The server-issued session (req.userId) wins over any client-supplied ID.
    const userId = sanitizeUserId(req.userId || body.userId || req.get('x-user-id'));
    const workspaceRoot = userId ? getUserWorkspaceRoot(userId) : null;

    console.log(
      `[Omni Server] Incoming chat | thread: ${threadId} | model: ${model} | msgs: ${messages.length} | prompt: "${instruction.slice(0, 100)}"`
    );

    let interruptEmitted = false;
    const eventListener = (evt) => {
      if (evt.type === 'INTERRUPT') {
        interruptEmitted = true;
      }
      if (evt.type === 'TOOL_CALL') {
        console.log(`[Omni Server] Tool call -> ${evt.name}(${JSON.stringify(evt.args || {})})`);
      } else if (evt.type === 'TOOL_RESULT') {
        console.log(`[Omni Server] Tool result -> ${evt.name} (${evt.status})`);
      } else if (evt.type === 'RUN_FINISHED') {
        console.log(`[Omni Server] Run finished -> stopReason: ${evt.stopReason}`);
      }
      writeAgUiEvent(res, evt);
    };

    engine.on('event', eventListener);

    // BIO write approval: the value was stored in the proposal at interrupt
    // time (from a stored user answer). Apply or discard it here — never
    // take a value from the resume payload or model text.
    if (resume?.toolName === 'bio_propose_write' && userId) {
      try {
        if (resume.approved) {
          applyBioProposal(userId, threadId);
        } else {
          discardBioProposal(userId, threadId);
        }
      } catch (err) {
        console.error('[Omni Server] BIO proposal resolution failed:', err.message);
      }
    }

    try {
      const result = await engine.run({
        instruction,
        messages,
        threadId,
        runId,
        model,
        mode,
        resume,
        workspaceRoot,
        userId
      });

      if (result.status === 'interrupted' && !interruptEmitted) {
        writeAgUiEvent(res, {
          type: 'INTERRUPT',
          threadId,
          runId,
          pendingTool: result.pendingTool
        });
      }

      res.end();
    } catch (err) {
      writeAgUiEvent(res, {
        type: 'RUN_ERROR',
        threadId,
        runId,
        message: err.message
      });
      res.end();
    } finally {
      engine.off('event', eventListener);
    }
  };
}
