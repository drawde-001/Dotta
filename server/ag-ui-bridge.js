import crypto from 'crypto';
import { DottaEngine } from '../src/core/index.js';
import {
  sanitizeUserId,
  getUserWorkspaceRoot
} from '../src/core/execution/workspace.js';
import { applyBioProposal, discardBioProposal } from '../src/core/bio/store.js';
import { getUserThread, saveUserThread } from '../src/core/state/store.js';
import { onAgentRunStart, onAgentRunEnd } from './browser-stream.js';
import {
  assertResourceOwnership,
  isResourceOwnedByOther,
  sendUniformNotFound
} from '../src/core/auth/access-control.js';

export function writeAgUiEvent(res, event) {
  if (res.writableEnded) return;
  const payload = {
    ...event,
    timestamp: event.timestamp || Date.now()
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function createAgUiHandler({ engine = new DottaEngine() } = {}) {
  return async function handleAgUiChat(req, res) {
    const startMs = Date.now();
    // Strict server session check: req.userId must be established from verified cookie
    const userId = sanitizeUserId(req.userId);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }

    const body = req.body || {};
    let threadId = body.threadId;

    if (threadId) {
      const isOwner = await assertResourceOwnership('thread', threadId, userId);
      if (!isOwner) {
        const ownedByOther = await isResourceOwnedByOther('thread', threadId, userId);
        if (ownedByOther) {
          return sendUniformNotFound(res, startMs, { req, resourceType: 'thread' });
        }
        // Thread does not exist yet anywhere: pre-register it for this authenticated user
        saveUserThread(userId, threadId, {
          title: 'New chat',
          status: 'active',
          model: body.model || process.env.DEFAULT_MODEL || 'muse-spark-open'
        });
      }
    } else {
      threadId = crypto.randomUUID();
      saveUserThread(userId, threadId, {
        title: 'New chat',
        status: 'active',
        model: body.model || process.env.DEFAULT_MODEL || 'muse-spark-open'
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const runId = crypto.randomUUID();
    const model = body.model || process.env.DEFAULT_MODEL || 'muse-spark-open';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const attachments = Array.isArray(body.attachments)
      ? body.attachments
      : Array.isArray(messages[messages.length - 1]?.attachments)
      ? messages[messages.length - 1].attachments
      : [];
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
    const effort = body.effort || 'medium';
    // Per-user sandbox: agent file tools are strictly confined to this user's folder
    const workspaceRoot = getUserWorkspaceRoot(userId);

    if (userId && threadId) {
      try {
        const userText = instruction || '';
        const autoTitle = userText.slice(0, 45).replace(/\s+/g, ' ').trim() || 'New chat';
        const existingThread = getUserThread(userId, threadId);
        if (!existingThread) {
          saveUserThread(userId, threadId, {
            title: autoTitle,
            status: 'active',
            model
          });
        }
      } catch (err) {
        console.warn('[ag-ui-bridge] Thread pre-registration warning:', err.message);
      }
    }

    console.log(
      `[Dotta Server] Incoming chat | thread: ${threadId} | model: ${model} | msgs: ${messages.length} | attachments: ${attachments.length} | prompt: "${instruction.slice(0, 100)}"`
    );

    let interruptEmitted = false;
    const eventListener = (evt) => {
      if (evt.type === 'INTERRUPT') {
        interruptEmitted = true;
      }
      if (evt.type === 'TOOL_CALL') {
        console.log(`[Dotta Server] Tool call -> ${evt.name}(${JSON.stringify(evt.args || {})})`);
      } else if (evt.type === 'TOOL_RESULT') {
        console.log(`[Dotta Server] Tool result -> ${evt.name} (${evt.status})`);
      } else if (evt.type === 'RUN_FINISHED') {
        console.log(`[Dotta Server] Run finished -> stopReason: ${evt.stopReason}`);
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
        console.error('[Dotta Server] BIO proposal resolution failed:', err.message);
      }
    }

    onAgentRunStart();
    try {
      const result = await engine.run({
        instruction,
        messages,
        attachments,
        threadId,
        runId,
        model,
        mode,
        effort,
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
      onAgentRunEnd();
    }
  };
}
