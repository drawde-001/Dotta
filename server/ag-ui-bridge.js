import { OmniEngine } from '../src/core/index.js';

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
    const model = body.model || process.env.DEFAULT_MODEL || 'meta-muse-spark';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const instruction = body.instruction || (messages.find((m) => m.role === 'user')?.content) || '';
    const resume = body.resume || null;
    const mode = body.mode || 'turbo';

    const eventListener = (evt) => {
      writeAgUiEvent(res, evt);
    };

    engine.on('event', eventListener);

    try {
      const result = await engine.run({
        instruction,
        messages,
        threadId,
        runId,
        model,
        mode,
        resume
      });

      if (result.status === 'interrupted') {
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
