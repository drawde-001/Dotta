# Plan: Secure, Persistent Per-Thread Workspace & Live Preview Server

## Problem Statement & Audit Summary
- **Problem A (Artifacts not visible):** Files were previously saved to the ephemeral `RunSandbox.workDir` (`tmp/dotta-sandbox-<runId>`), which was wiped at the end of each run by `destroyRunSandbox`. The UI only queried `user-<userId>` root without thread context.
- **Problem B (No folder organization):** Agent dumped all files into the root without folder grouping.
- **Problem C (Local server / preview failed):** No static preview server existed for thread workspaces, and Chromium's network egress filter blocked `localhost` requests by default.
- **Cross-thread leakage:** User root was flatly shared across all threads for that user.

## Checklist & Order of Work

- [x] **1. Per-Thread Workspace Layer (`src/core/execution/workspace.js`)**
  - Add `sanitizeThreadId(raw)`.
  - Add `getThreadWorkspaceRoot(userId, threadId)`.
  - Add `hasThreadWorkspace(userId, threadId)` and `deleteThreadWorkspace(userId, threadId)`.
  - Enforce limits: `MAX_FILE_SIZE = 10MB`, `MAX_WORKSPACE_BYTES = 50MB`, `MAX_FILE_COUNT = 200`.
  - Enforce strict path traversal, UNC, control char, and symlink boundary checks.
  - Support folder nesting (e.g. `website/index.html`, `app/main.js`).

- [x] **2. Engine Orchestration & Workspace Reuse (`src/core/orchestrator.js`)**
  - Pass `threadWorkspaceRoot = getThreadWorkspaceRoot(userId, threadId)` to all file tools.
  - Keep `RunSandbox` isolated for dangerous/untrusted execution (commands, scrapers), destroyed per-run.
  - Instruct model in system prompt to reuse existing thread workspace, group related files into project folders, and use preview URL.

- [x] **3. Server API & Preview Server (`server/index.js` & `src/core/execution/preview-server.js`)**
  - Update `/api/workspace/files`, `/api/workspace/file`, `/api/workspace/raw`, `/api/workspace/download` with `threadId` parameter.
  - Enforce thread ownership check (`assertResourceOwnership('thread', threadId, userId)`). Nonexistent or unauthorized threads return identical 404.
  - Add `/api/workspace/preview/:threadId/*`:
    - Loopback/authenticated route only (`127.0.0.1`).
    - Serve static HTML/CSS/JS with restrictive CSP and sandboxed framing (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`).
    - Idle timer to track activity and reap idle servers.
  - In `app.delete('/api/threads/:threadId')`, delete the thread workspace folder and stop preview server.

- [x] **4. Browser Egress for Localhost Preview (`server/browser-stream.js` & `src/core/execution/run-sandbox.js`)**
  - In `browser-stream.js`, allow requests to `localhost:${PORT}/api/workspace/preview/*` and local dev server ports.
  - In `run-sandbox.js`, allow loopback preview requests.

- [x] **5. Frontend UI Integration (`src/ui/App.jsx` & `src/ui/components/WorkspacePanel.jsx`)**
  - Pass `threadId={activeThreadId}` to `WorkspacePanel` in desktop and mobile drawer.
  - Fetch files per thread; switch cleanly when active thread changes.
  - Render folder tree hierarchy cleanly with collapsible folders.
  - Add "Preview" button to launch live preview in Chromium.

- [x] **6. Automated Verification Test Suite (`tests/thread-workspace-preview.test.js`)**
  - Verify isolation across threads & users (identical 404).
  - Verify path traversal & symlink prevention.
  - Verify storage limits.
  - Verify workspace reuse & folder grouping.
  - Verify preview server & CSP.
  - Verify thread deletion deletes workspace.
  - Verify `destroyRunSandbox` is unaffected.
