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
