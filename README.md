# Dotta

[![Live Deployment](https://img.shields.io/badge/Live_Site-dotta.duckdns.org-10b981?style=for-the-badge)](https://dotta.duckdns.org)
[![Model](https://img.shields.io/badge/Powered_by-Meta_Muse_Spark_Open-0668E1?style=for-the-badge&logo=meta&logoColor=white)](https://dev.meta.ai)
[![Inference Partner](https://img.shields.io/badge/Inference_Partner-Modal-00D26A?style=for-the-badge&logoColor=white)](https://modal.com)
[![Repository](https://img.shields.io/badge/GitHub-drawde--001%2FDotta-black?style=for-the-badge&logo=github)](https://github.com/drawde-001/Dotta)

🌐 **Live Application:** [https://dotta.duckdns.org](https://dotta.duckdns.org)

Dotta is powered by **Meta Muse** (`meta-muse-spark open`) out-of-the-box.

Dotta is an autonomous web task automation AI agent featuring an integrated **Assistant-UI** chat shell, an **AG-UI 1.0** event-streaming backend, an isolated execution sandbox, adaptive live browser control, and the **BIO Digital Identity Engine**.

---

## What is Dotta?

Dotta is built to eliminate the tedious, repetitive friction of interacting with the modern web. Instead of manually filling out 15-page application forms, navigating clunky e-commerce checkout funnels, re-entering your shipping and contact information, or copying and pasting profile data into registration portals, you delegate the entire workflow to Dotta.

Dotta executes web tasks directly in a live browser, adapts to dynamic DOM structures, stages your verified documents and identity assets, verifies every field constraint, and reports back with verifiable proof.

### Everyday Web Tasks Dotta Automates
Dotta is purpose-built to handle routine, multi-step web tasks autonomously on behalf of the user—acting strictly as a **user-side productivity agent** that eliminates repetitive data entry:

* 📝 **Applicant-Side Talent & Job Submissions**: Navigates modern application portals (Lever, Greenhouse, Ashby, Workday, talent portals), autofills complex work history and contact fields on behalf of the applicant, and stages verified PDF resumes and headshots directly from your BIO—freeing applicants from hours of repetitive typing *(Note: Dotta is an applicant-side form assistant, not an HR candidate screener)*.
* 🛒 **E-Commerce Cart Checkout & Purchasing Flows**: Browses stores, searches for products matching your criteria, selects sizes/options, adds items to cart, navigates to the checkout funnel, and populates shipping addresses and contact information from your BIO—holding securely at the final payment gate for your review.
* 🍽️ **Table & Service Reservations**: Searches platforms like OpenTable and Resy for available dining slots, selects party sizes, and completes reservation bookings with your contact preferences.
* 🎟️ **Conference & Event Registrations**: Automatically completes multi-page attendee registrations, developer portals, and hackathon applications without manual data entry.
* 🏢 **Vendor & Portal Onboarding**: Completes vendor registrations, business profiles, and account creation wizards across SaaS tools and service portals.
* 📄 **Government & Portal Submissions**: Handles surveys, utility applications, permit filings, and customer support inquiries with truthful DOM validation and cryptographic document staging.

---

## Risk-Tiered Automation Architecture

A truly useful automation agent must be aggressive on tedious work while remaining rock-solid on financial and legal safety:

```
┌─────────────────────────────────────────────────────────────┐
│               Autonomous Execution Layer                     │
│  (Zero Interruption • Handled Completely by Dotta)          │
│                                                             │
│  • Web Search & Navigation      • Product & Role Matching   │
│  • Dropdown & Option Selection  • Cart Addition             │
│  • Form Field Autofill from BIO • Resume & File Staging     │
│  • Live HTML5 Constraint Checks • Red-Border DOM Validation │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Protected Action Gate                       │
│  (Explicit User Confirmation Before Final Commit)           │
│                                                             │
│  • Payment Card Submission      • Final "Place Order" Click │
│  • Irreversible Legal Forms     • Turbo Unapproved Domains  │
└─────────────────────────────────────────────────────────────┘
```

1. **High-Friction, Non-Destructive Tasks (100% Autonomous)**:
   Navigating sites, searching catalogs, comparing products, selecting variants, adding to cart, filling out multi-step form fields, staging resumes, and validating inputs are executed autonomously without interrupting you.
2. **High-Risk Commitments (Explicit Approval Gate)**:
   Actions involving financial expenditure (submitting credit card information, clicking "Place Order") or irreversible final submission trigger an interactive approval card. You maintain total financial authority while Dotta handles 95% of the data-entry legwork.

---

## BIO: The Digital Identity Engine for Autonomous Agents

### What is BIO?
**BIO** is Dotta's user-owned **Digital Identity Engine**. It serves as your verified digital passport, giving autonomous AI agents the rich, structured context they need to act faithfully on your behalf in the real world—especially when you are away from your screen.

Unlike conventional chatbot interactions where the user must repeatedly explain who they are, copy-paste their resume, re-type contact numbers, or manually upload headshots, Dotta consults your BIO to complete complex, multi-step real-world workflows autonomously.

---

### Why BIO Matters: Beyond Ordinary LLM Memory & Skills

Most current AI agent architectures rely on simple flat-text memory or "skills" folders—typically single `.txt` or `.md` files injected blindly into the system prompt. While suitable for basic conversational tone, this traditional approach fails when applied to real-world autonomous tasks:

| Capability | Standard LLM Memory / Skills (`.txt` / `.md`) | Dotta's BIO Digital Identity Engine |
| :--- | :--- | :--- |
| **Data Types** | Plain text only | **Multimodal & Multi-file** (PDF documents, PNG/JPG images, WAV/MP3 audio, MP4 video, structured JSON) |
| **Real File Operations** | Cannot attach or upload real files to web forms or APIs | **Cryptographic Staging (`uploadRef`)** stages authentic PDF resumes, portfolio assets, and headshots directly into `<input type="file">` elements |
| **Security Boundaries** | Blind prompt injection; all text is visible to the model at all times | **Granular Dual-Switch Privacy Gates** (`Read` & `Write` master switches) with strict policy-level enforcement |
| **Privilege Model** | All-or-nothing (full context dumped into every request) | **Least-Privilege On-Demand Retrieval** (`bio_index` enumerates schema without exposing values; `bio_get` fetches only necessary fields) |
| **Sensitive Media Protection** | No concept of sensitive media | **Tailored Per-Entry Grants** (audio voice notes and intro videos require explicit individual permission beyond the master read switch) |
| **Write Integrity** | Model can overwrite or hallucinate false user memory from untrusted web pages | **Two-Phase Write Proposals (`bio_propose_write`)**; writes resolve strictly against verified user answers recorded in the thread session |
| **Verification & Inspection** | Hallucinates file content without verification | **Pre-Action Processors** (`process_document`, `process_image`, `process_audio`, `process_video`) let Dotta inspect and verify assets before use |
| **Isolation** | Shared or unstructured scratchpads | **Strict Cross-User & Cross-Profile Cryptographic Isolation** with read-only sandboxed mounts (`0o444`) |

---

### Autonomous Execution While You're Away

The core mission of Dotta is true autonomy. When you delegate an automation task to Dotta—such as finding and applying for specialized engineering roles, registering for conferences, submitting creative work, or filling complex government and vendor portals—Dotta uses your BIO to work completely independently:

1. **Job Applications & Talent Portals**: Dotta navigates multi-step application wizards, inspects form requirements, pulls accurate career history and contact details from your BIO, stages your verified PDF resume, attaches your official headshot, and ensures every required field is answered faithfully.
2. **E-Commerce Checkout Preparation**: Dotta navigates stores, finds requested items, selects appropriate sizes/options, adds items to your cart, navigates to the shipping address page, populates your shipping details from BIO, and holds at the final payment gate for your one-click authorization.
3. **True Verification Before Submission**: Dotta never guesses or submits blindly. Through its DOM verification engine, Dotta checks field validity, flags red borders or missing requirements, and verifies against your BIO. If an application requires information not present in your BIO, Dotta pauses and prepares a concise question for when you return, rather than hallucinating answers.
4. **Continuous Identity Learning**: As you answer new questions during conversations, Dotta can propose saving those answers back to your BIO via `bio_propose_write`. Once you approve, Dotta's context expands permanently, meaning you will never be asked that question again.

---

### The BIO Tool Lifecycle

The BIO engine operates through four tightly-coupled, security-enforced tools:

```
                  ┌────────────────┐
                  │   User Task    │
                  └───────┬────────┘
                          │
                          ▼
                  ┌────────────────┐
                  │   bio_index    │ ◄── Enumerates available fields & entries
                  └───────┬────────┘     (Leaks ZERO private values)
                          │
                          ▼
                  ┌────────────────┐
                  │    bio_get     │ ◄── Fetches ONLY the specific requested fields
                  └───────┬────────┘     (Enforces master Read switch & per-entry grants)
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
   ┌──────────────────┐      ┌──────────────────┐
   │ process_document │      │   browser_action │
   │ process_image    │      │  (upload staged  │
   │ process_audio    │      │     biofile)     │
   └─────────┬────────┘      └──────────────────┘
             │
             ▼
   ┌────────────────────┐
   │ bio_propose_write  │ ◄── Two-phase proposal from verified user answers
   └────────────────────┘     (Requires explicit user approval before saving)
```

1. **`bio_index`**: Scans the user's active profile and returns the list of available fields, custom entries, and media attachments along with their status (`filled: true/false`). It strictly never returns values, preserving privacy and minimizing token consumption.
2. **`bio_get`**: Retrieves only the targeted field IDs requested by the agent (e.g. `['role', 'email', 'cv']`). Denies requests across profile boundaries. For documents, it extracts raw text; for images, it supplies inline multimodal data for visual model verification.
3. **File Processors (`process_document`, `process_image`, `process_audio`, `process_video`)**: Validates that files are intact, extracts text from PDFs, inspects image dimensions and formats, transcribes audio notes, and stages files with a secure temporary upload reference (`biofile-<hash>`).
4. **`bio_propose_write`**: When new user details are provided during a session, the agent creates a write proposal linked to the authenticated answer ID. Direct writes from scraped web pages or model hallucinations are rejected. The change is committed only after explicit user confirmation.

---

### Privacy, Permissions & Anti-Hallucination Architecture

* **Dual-Switch Profile Controls**: Every user profile features independent `Read` and `Write` switches. If Read is toggled off, any attempt by an agent to access BIO tools is denied immediately at the policy engine level (`checkPermission`).
* **Tailored Audio/Video Grants**: Audio name pronunciations, voice introductions, and video clips carry individual `agentReadable` toggles. Even if master Read is enabled, Dotta cannot access audio or video without your tailored grant for that specific file.
* **Ephemeral Read-Only Staging (`0o444`)**: During web runs, staged BIO files are mounted into the runner sandbox in read-only mode (`0o444`). Neither running browser scripts nor child processes can modify your original source files.
* **PII Redaction in Telemetry**: All events emitted across Server-Sent Events, WebSockets, or UI logs pass through `maskPersonalValue` and `redactPiiAndInternalIds`. Personal phone numbers, home addresses, dates of birth, and internal file IDs are automatically scrubbed from client-facing trace streams.

---

## Autonomous Adaptive Browser & Form-Filling Architecture

Dotta features an autonomous, model-driven browser and form-filling architecture designed to handle web tasks adaptively and truthfully without fragile per-site hardcoding:

### 1. Isolated Run Sandbox (`src/core/execution/run-sandbox.js`)
- **Per-Run Boundary**: Every web task executes inside an ephemeral sandbox directory (`os.tmpdir()/dotta-run-sandbox-<runId>`) isolated from the host repository and user workspace.
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
- **Untrusted Page Isolation**: Page text and untrusted web DOM labels are treated as untrusted data. Prompt injection patterns and exfiltration scripts are quarantined. Risky actions trigger an isolated Reviewer call that evaluates only the user request, profile, and proposed action.

---

## Meta AI & Partner Inference Stack

Dotta is powered by **Meta Muse** (`meta-muse-spark open`) out-of-the-box.

Built natively for the Meta Global AI Developer Hackathon, Dotta leverages Meta's frontier open-weights and multimodal model ecosystem across dedicated serving endpoints:

### 1. Core Reasoning & Autonomous Planning: Meta Muse Spark Open
* **Primary Brain:** `meta-models/Muse-Spark-Open-816B-A42B` (Meta Muse Spark Open 816B Mixture-of-Experts)
* **Inference Partner:** Hosted on **Modal** serverless vLLM GPU infrastructure (`https://edelobi--ep-muse-spark-open-816b-a42b-server.us-west.modal.direct/v1`), leveraging hackathon infrastructure partner endpoints.
* **Role:** Drives the multi-turn autonomous execution loop—inspecting live DOM snapshots, synthesizing sandbox scripts, verifying form constraints, evaluating security gates, and orchestrating browser tools.
* **Hackathon Award Alignment:** Purpose-built for the **$10,000 Best Build on Meta Open Weight Models** bonus award and the **$5,000 Best Agentic Use-Case** award.

### 2. Speech Perception: Meta Voice Transcribe
* **Model:** `muse-voice-transcribe-1.0` (Meta Voice Transcribe)
* **Role:** High-fidelity verbatim audio-to-text dictation across the chat input dock and the media processing pipeline (`src/core/media/media-processor.js`).
* **Strict Same-Family Fallback:** Incoming voice notes strictly query Meta Voice Transcribe first across Meta serving endpoints before evaluating sister Meta models, preserving in-family privacy and accuracy.

### 3. Visual Grounding: Meta Muse Vision & SAM 3.1
* **Models:** Meta Muse Vision, SAM 3.1, and Muse Image adapters.
* **Role:** Inspects non-standard interactive widgets, verifies uploaded image aspect ratios and dimensions, and visually grounds DOM elements before executing high-risk browser clicks.

### 4. 100% Meta Runtime Architecture
* **Strict Intra-Family Execution:** Every model invoked across perception, planning, tool execution, and voice is strictly a Meta model.
* **Intra-Family Fallback:** If primary serverless inference on Modal encounters cold starts or rate limits, the engine gracefully transitions to Meta Model API endpoints (`muse-spark-1.3`, `muse-wonder-1.0`), maintaining strict intra-family privacy and data sovereignty.
* **Honest Error Handling:** If all Meta endpoints are unreachable, Dotta halts honestly with an explicit service notification and never routes user requests outside the Meta ecosystem.

---

## Architecture Overview

```
dotta/
├── package.json              # All UI & backend dependencies (Assistant-UI, AG-UI, Express, Supabase)
├── setup.md                  # Complete VM setup & production deployment guide
├── vite.config.js            # Frontend build & API proxy setup
├── index.html                # Assistant-UI HTML shell
├── supabase/
│   └── schema.sql            # Authoritative Supabase PostgreSQL schema
├── server/
│   ├── index.js              # Express server & API endpoints
│   ├── ag-ui-bridge.js       # AG-UI 1.0 Server-Sent Events bridge
│   └── caddy/
│       └── Caddyfile         # Caddy automatic HTTPS reverse proxy (dotta.duckdns.org)
├── src/
│   ├── core/                 # Autonomous Engine Core
│   │   ├── orchestrator.js   # DottaEngine execution loop (Powered by Meta Muse)
│   │   ├── env.js            # Environment key retriever
│   │   ├── db/               # Supabase database client & synchronizer (users, profiles, conversations)
│   │   ├── models/           # Meta Muse model adapter & content protocol (Muse Spark Open, Wonder, Voice, SAM)
│   │   ├── bio/              # BIO Digital Identity Engine (store, executors, staging, processors)
│   │   ├── levels/           # Verification engine, reviewer, sandbox tools, DOM extractor
│   │   ├── media/            # Multimodal media processor (audio, image, vision)
│   │   ├── tools/            # Scoped tools catalog & security policies
│   │   ├── execution/        # Workspace file manager & WSL2/sandbox command executor
│   │   └── state/            # Multi-turn token budgeting & cycle detector
│   └── ui/                   # Assistant-UI Frontend Shell
│       ├── App.jsx           # Real-time chat interface & tool visualizer
│       ├── main.jsx          # React mount entry point
│       └── components/       # Visual cards for tool execution, BIO management, and interrupts
├── examples/
│   └── run-cli.js            # Headless terminal CLI runner
└── tests/
    ├── core-smoke.test.js    # Unit & integration smoke test suite
    ├── bio.test.js           # BIO Digital Identity comprehensive test suite (45/45 passed)
    └── phase1-sandbox.test.js# Sandbox isolation & security test suite
```

---

## Supabase Database Integration & Multi-User Architecture

Dotta is connected to **Supabase** (`vjuoutdhpnnmasstfiwo`) for persistent multi-tenant session storage, user credential mapping, conversation history, and security audit logs:

### 1. Database Schema (`supabase/schema.sql`)
The PostgreSQL database is organized into six synchronized tables:
* **`public.users`**: Unique user identifiers, normalized emails, cryptographic password hashes (`scrypt`), and creation timestamps.
* **`public.user_profiles`**: Display names, roles (`admin`, `judge`, `user`), and bio identity preferences.
* **`public.user_settings`**: Default model preferences (`muse-spark-open`), thinking budgets, and auto-save toggles.
* **`public.user_sessions`**: Authenticated sessions with IP addresses, user-agent metadata, and expiration windows.
* **`public.conversations`**: Multi-turn conversation threads, AG-UI streaming message turns, and run metadata indexed strictly per `user_id`.
* **`public.user_audit_logs`**: Immutable audit logs capturing every tool execution, BIO access request, and permission grant.

### 2. Built-in Accounts for Hackathon Judges & Administrators
Dotta comes with pre-configured, database-synchronized accounts:
* **Master Admin (Eddy)**: `eddy@dotta.ai` / `Dotta2026!`
* **Official Hackathon Judges & Reviewers**: `judges@dotta.ai` / `DottaJudges2026!`

### 3. Dynamic User Onboarding
When any new user creates an account via the UI (`/api/auth/signup`), Dotta automatically:
1. Generates an isolated user ID (`user-<timestamp>-<hash>`).
2. Creates an isolated sandbox filesystem directory (`src/workspaces/<userId>`).
3. Writes and synchronizes the user record and profile directly to Supabase (`syncUserToDb`).
4. Binds all subsequent conversations, BIO digital identity entries, and audit traces strictly to that user ID.

### 4. Supabase Setup & CLI Configuration
To inspect or manage the database directly:
```bash
# Link local environment to Supabase project
supabase login
supabase link --project-ref vjuoutdhpnnmasstfiwo

# Push schema changes
supabase db push
```

* **Project URL:** `https://vjuoutdhpnnmasstfiwo.supabase.co`
* **Direct Connection String:** `postgresql://postgres:[YOUR-PASSWORD]@db.vjuoutdhpnnmasstfiwo.supabase.co:5432/postgres`

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
Run Dotta directly in your terminal without a browser:
```bash
npm run cli -- "Explain your available tools and inspect the workspace"
```

### 5. Run Verification Tests
```bash
# Core smoke tests
npm test

# Full BIO Digital Identity verification suite
node tests/bio.test.js

# Sandbox & security isolation suite
node tests/phase1-sandbox.test.js
```

---

## Production Deployment

Dotta is configured for production deployment under **`dotta.duckdns.org`** with automatic SSL via Caddy reverse proxy and containerized microservices:

* **Primary Domain:** `https://dotta.duckdns.org`
* **Automated SSL/TLS:** Handled by Caddy via Let's Encrypt / ZeroSSL in `server/caddy/Caddyfile`.
* **Container Architecture:** Defined in `docker-compose.yml` (`dotta_caddy`, `dotta_app`, `dotta_network`).
* **Deployment Guide:** For detailed step-by-step setup on a clean Linux VM or VPS, see [`setup.md`](setup.md).
