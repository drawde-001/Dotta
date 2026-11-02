# Omni Agent

Omni Agent is an autonomous, tool-using AI agent platform powered by **Meta Muse** by default, featuring an integrated **Assistant-UI** chat shell and an **AG-UI 1.0** event-streaming backend.

---

## Architecture Overview

Omni Agent is organized so that our repository remains clean and focused strictly on custom code, with all external dependencies declared in `package.json` for rapid installation on any development machine or production VM:

```
omni-agent/
├── package.json              # Declares all UI & backend dependencies (Assistant-UI, AG-UI, Express, Supabase)
├── setup.md                  # Complete VM setup & production deployment guide
├── vite.config.js            # Frontend build & API proxy setup
├── index.html                # Assistant-UI HTML shell
├── server/
│   ├── index.js              # Express server & API endpoints
│   ├── ag-ui-bridge.js       # AG-UI 1.0 Server-Sent Events bridge
│   └── caddy/
│       └── Caddyfile         # Caddy automatic HTTPS reverse proxy configuration
├── src/
│   ├── core/                 # Autonomous Engine Core
│   │   ├── orchestrator.js   # OmniEngine execution loop (Default: Meta Muse)
│   │   ├── env.js            # Environment key retriever
│   │   ├── models/           # Multi-provider model adapters (Meta Muse, Anthropic, Gemini, OpenAI)
│   │   ├── tools/            # Scoped tools catalog & security policies
│   │   ├── execution/        # Workspace file manager & WSL2/sandbox command executor
│   │   └── state/            # Multi-turn token budgeting & cycle detector
│   └── ui/                   # Assistant-UI Frontend Shell
│       ├── App.jsx           # Real-time chat interface & tool visualizer
│       ├── main.jsx          # React mount entry point
│       └── components/       # Visual cards for tool execution and interrupts
├── examples/
│   └── run-cli.js            # Headless terminal CLI runner
└── tests/
    └── core-smoke.test.js    # Unit & integration smoke test suite
```

---

## Default Model: Meta Muse

Omni Agent is configured to use **Meta Muse** (`meta-muse-spark`) out-of-the-box as the default model provider.

* **Default Model ID:** `meta-muse-spark` (or wire model `muse-spark-1.3`)
* **Endpoint:** `https://api.meta.ai/v1`
* **Configuration:** Provide `META_MUSE_API_KEY` in your `.env` file.
* **Alternative Providers:** Seamlessly supports Anthropic Claude, OpenAI, Google Gemini, and DeepSeek via unified adapters in `src/core/models/`.

---

## Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and configure your API keys:
```bash
cp .env.example .env
```
Ensure `META_MUSE_API_KEY` is populated.

### 3. Run Development Server
Start the backend and Vite frontend with hot-reload:
```bash
# Terminal 1: Backend API & AG-UI stream
npm run server

# Terminal 2: Vite UI shell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Headless Terminal Execution
Run Omni Agent directly in your terminal without a browser:
```bash
npm run cli -- "Explain your available tools and inspect the workspace"
```

### 5. Run Verification Tests
```bash
npm test
```

---

## Production Deployment
For complete instructions on deploying to a Linux VM, setting up machine IPs, domain DNS, Caddy with automatic SSL, Docker sandbox, and Supabase, see [setup.md](file:///C:/Users/USER/Downloads/omni-agent/setup.md).

---

## Autonomous Adaptive Browser & Form-Filling Architecture

Omni Agent features an autonomous, model-driven browser and form-filling architecture designed to handle web tasks adaptively and truthfully without fragile per-site hardcoding:

### 1. Isolated Run Sandbox (`src/core/execution/run-sandbox.js`)
- **Per-Run Boundary**: Every web task executes inside an ephemeral sandbox directory (`os.tmpdir()/omni-run-sandbox-<runId>`) isolated from the host repository and user workspace.
- **Strict Host Protection**: Access to project files, host configuration, or sensitive credentials outside the sandbox is rejected by `assertNoHostPathAccess`.
- **Environment Scrubbing**: Child processes and Playwright instances run with a scrubbed environment (`buildScrubbedSandboxEnv`) preventing secret leakage.
- **Scoped Read-Only Inputs**: Task-relevant BIO files are staged into `/sandbox/inputs/` with read-only permissions (`0o444`). Direct access to master BIO storage is blocked.
- **Guaranteed Destruction**: The sandbox and all scratch files are completely destroyed upon task completion, crash, user cancellation, or timeout.

### 2. Ephemeral Structured Notes & Adaptive Execution (`src/core/levels/sandbox-tools.js`)
- **Structured Notes File (`notes/page-structure.md`)**: Upon snapshotting the page, the accessibility tree and interactive elements are written to a scratch notes file in the sandbox. The model inspects sections on demand (`notes_read`, `notes_write`), eliminating token bloat and avoiding unnecessary page reloads.
- **Adaptive Execution Toolkit**:
  - `sandbox_run_script`: Generates and executes safe, batched JavaScript directly within the browser DOM or sandbox Node runner.
  - `browser_action`: Performs human-like Playwright keystrokes, clicks, selects, scrolls, and sandboxed file uploads.
  - `browser_screenshot_vision`: Visual inspection fallback for custom canvas elements or non-standard interactive widgets.
  - `checkpoint_save` & `checkpoint_load`: Persists progress across complex multi-step wizards or long forms.
- **Method Agility**: The agent dynamically selects the most efficient execution method (batch DOM script vs. human-like actions vs. vision) and adapts when a method encounters errors.

### 3. Truthful Verification Engine (`src/core/levels/verifier.js`)
- **Live DOM Verification**: After form actions, `verifyLiveFormDom` inspects:
  - HTML5 constraint validation (`el.checkValidity()`).
  - `aria-invalid="true"` attributes.
  - Container error classes (`.has-error`, `.is-invalid`, `.error`).
  - Visible error message elements (`.invalid-feedback`, `.help-block`, `.error-message`, `[role="alert"]`).
  - Computed CSS border colors to catch red error highlights (`rgb(r > 170, g < 90, b < 90)`).
- **Honest Status Reporting**: The agent enforces truthful execution statuses and is strictly blocked from claiming "done" when validation errors exist:
  - `SUBMITTED_CONFIRMED`: Verified form submission via URL change, submission removal, or explicit confirmation messages.
  - `FILLED_NOT_SUBMITTED`: All fields successfully filled and valid without form submission.
  - `PARTIAL`: Detected validation errors or red borders; lists failed fields and required corrections.
  - `FAILED`: No fields could be verified.

### 4. Real-Time Action Streaming (`server/index.js`)
- Every agent perception and action is broadcast in real time over Server-Sent Events (SSE) and WebSocket:
  - `AGENT_SNAPSHOT_TAKEN`: URL, title, detected field counts, and notes file path.
  - `AGENT_NOTES_WRITTEN`: Scratchpad updates and planning records.
  - `AGENT_SCRIPT_RUN`: Target (browser vs. node), status, and execution duration.
  - `AGENT_FIELD_FILLED`: Field selector, action type, and human-like flag.
  - `AGENT_VERIFICATION_RESULT`: Comprehensive verification summary with passed/failed counts.
- **100% PII Masking**: Personal values, email addresses, phone numbers, and profile details are sanitized using `maskPersonalValue` before emission.

### 5. Modes, Permissions & Safety Gates
- **Turbo Site Permission Gate**: When operating in Turbo mode, the agent asks user permission before visiting or interacting on unapproved external domains (`checkPermission` via `site_visit_permission`).
- **Submit Gates**:
  - `Turbo`: Automatically submits clean forms only when authorized by user intent; pauses if the user specified "do not submit" or "fill only".
  - `Default` & `Review`: Always requires explicit user confirmation before final submission.
- **Untrusted Page Isolation**: Page text and third-party DOM labels are treated as untrusted data. Prompt injection patterns and exfiltration scripts are quarantined. Risky actions trigger an isolated Reviewer call that evaluates only the user request, profile, and proposed action.


