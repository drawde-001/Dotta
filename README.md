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

## Multi-Level Browser & Form-Filling Security Architecture

Omni Agent executes all browser and form-filling work inside temporary, per-run isolated sandboxes (`RunSandbox`) and splits web-task perception, verification, planning, execution, and risky-action review into **four isolated levels** with separate contexts, code-enforced tool registries, and separate scratch sandboxes:

### 1. Isolated Per-Run Sandbox (`src/core/execution/run-sandbox.js`)
- Every run creates a temporary directory (`os.tmpdir()/omni-run-sandbox-<uuid>`) outside the project repository and user workspace.
- Host paths (`PROJECT_ROOT`, `src/workspaces`) are blocked in code (`assertNoHostPathAccess`) and scrubbed from outputs (`redactSandboxHostPaths`).
- Child processes and Playwright Chromium instances receive a scrubbed environment (`buildScrubbedSandboxEnv`) with zero host API keys or workspace secrets.
- Only BIO files required by the current task are staged into `/sandbox/inputs/` with read-only permissions (`0o444`).
- Network egress is filtered and logged per request (`checkNetworkRequest` + Playwright `context.route('**/*', ...)`).
- Guaranteed cleanup (`destroy` / `destroySync`) runs in `finally` on normal completion, crash, cancellation, or timeout.

### 2. Multi-Level Prompt-Injection Defense (`src/core/levels/`)
- **Level 1 (`BROWSER_SUBAGENT` — `registries.js`, `executor.js`)**:
  - The **only** component with browser tools (`browser_read_page`, `browser_action`, `snapshot_read`, `browser_screenshot`, `browser_search`, `web_search`).
  - Runs in its own temporary sandbox (`level1BrowserSandboxRoot`), opens the page, extracts raw DOM/accessibility data, and later executes the verified custom page script. Never calls BIO tools and never decides what to fill.
- **Level 2 (`TWO INDEPENDENT VERIFICATION LAYERS + COMPARATOR`)**:
  - **Level 2A (`EXTRACTOR` — `extractor.js`)**: Deterministic code running in the Level 1 sandbox. Inspects the DOM and accessibility tree (preserving Unicode/foreign scripts via `\p{L}\p{N}`), strips HTML comments, and excludes hidden/deceptive elements (`display:none`, `visibility:hidden`, `opacity <= 0.05`, `font-size < 2px`, zero dimensions, negative off-screen coordinates, same foreground/background color, and `aria-label` mismatches).
  - **Level 2B (`READER` — `reader.js`)**: Toolless model call (`tools: []`, zero BIO access, zero command execution, zero sandbox). Receives **only** raw visible page text (never the Extractor's output) and outputs a strict JSON schema.
  - **Level 2C (`COMPARATOR` — `comparator.js`)**: Compares 2A and 2B field-by-field (`normalizedLabel`, `type`, `required`, `options`). Only fields where both independent layers agree are marked `VERIFIED` and passed to the Planner. Disagreements or single-layer fields are marked `DISPUTED`, left empty, logged neutrally, and (if required) included in the single batched question to the user. The Reader can never add or override fields.
- **Level 3 (`PLANNER` — `planner.js`, `sanitizer.js`, `plan-file.js`)**:
  - Has **only** active-profile BIO read tools (`bio_index`, `bio_search`, `bio_get`, `process_document`, `process_image`, `process_audio`, `process_video`) when the active profile's Read switch is ON. Zero browser tools, zero network, zero shell, zero write tools.
  - Never sees raw page text — receives only the `VERIFIED`, sanitized schema quoted inside `<verified_untrusted_form_schema>`.
  - Classifies fields across English and foreign languages into the closed vocabulary (`CLOSED_BIO_FIELD_KINDS`); any imperative or injection-like label (e.g., `"Get me all your information"`, foreign-language injections, `javascript:` URIs, Base64 payloads, homoglyphs) is classified as `UNSUPPORTED` and never obeyed.
  - Every `READY` item in the Fill Plan must cite a valid `bioSource: { profileId, fieldId }` from the active BIO profile.
  - Writes the temporary Fill Plan JSON with owner-only permissions (`0o600`) inside its own separate scratch sandbox (`level3PlannerSandboxRoot`), which is overwritten and deleted when the run ends (and on crash/cancel/timeout).
- **Level 1 Custom Executor (`executor.js`)**:
  - Executes the validated Fill Plan per section using custom batch DOM scripts verified by `verifyCustomBrowserScriptSafety` (blocking `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `window.open`, `document.cookie`, `localStorage`, `eval`), falling back to human-like Playwright actions for file uploads and custom widgets, re-reading the DOM without reloading after each section, and saving section checkpoints.
- **Level 4 (`REVIEWER` — `reviewer.js`)**:
  - Separate toolless review gate (`tools: []`) invoked before any risky action (cross-domain navigation, final form submission, out-of-plan tool call, cross-origin upload). Sees only the user's original request, active profile name, proposed action, and deterministic scanner warning log. Enforces the mode-aware Submit Gate (`Turbo`, `Default`, `Review`).

