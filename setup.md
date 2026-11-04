# Dotta Production Setup & Deployment Guide

This guide provides end-to-end instructions for deploying Dotta to a Linux virtual machine (Ubuntu 22.04 / 24.04 LTS or Debian 12), configuring your own domain with automatic HTTPS via Caddy (e.g. `yourdomain.com`), isolating tool execution with Docker, integrating Supabase, and wiring PM2 for seamless continuous deployment.

---

## Architecture Flow

```
[Internet User / Browser]
       │
       ▼  (HTTPS / 443)
┌─────────────────────────────────────────────────────────┐
│  Virtual Machine (Public IP)                            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Caddy Reverse Proxy (Auto Let's Encrypt SSL)      │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │  (HTTP / 3001)                │
│                         ▼                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Node.js Server (PM2 / Docker Container)           │  │
│  │  - Assistant-UI Frontend Shell (/dist)            │  │
│  │  - AG-UI SSE Stream & CDP Screencast              │  │
│  │  - DottaEngine core                               │  │
│  │    (Meta Models - Muse Spark Open by default)     │  │
│  │  - Sandboxed Preview Server (/api/workspace/...)  │  │
│  └──────┬───────────────────────┬────────────────────┘  │
│         │                       │                       │
│         ▼                       ▼                       │
│  ┌─────────────────────┐ ┌───────────────────────────┐  │
│  │ 1. Ephemeral Run    │ │ 2. Persistent Thread      │  │
│  │    Sandbox (Docker) │ │    Workspace (Safe Files) │  │
│  │  - Bash & scripts   │ │  - Per-thread storage     │  │
│  │  - destroyRunSandbox│ │  - Directory organization │  │
│  │  - Zero persistence │ │  - Live loopback preview  │  │
│  └─────────────────────┘ └───────────────────────────┘  │
│         │                       │                       │
│         ▼                       ▼                       │
│  ┌─────────────────────┐ ┌───────────────────────────┐  │
│  │ BYOK Model Providers│ │ Supabase Cloud            │  │
│  │  • Core: Muse Spark │ │  - PostgreSQL DB & RLS    │  │
│  │    Open (Modal vLLM)│ │  - AES-256-GCM Secrets    │  │
│  │  • Meta Model API   │ │  - User Sessions & BIO    │  │
│  │  • Supporting: NIM  │ │                           │  │
│  │    (Muse Glimmer)   │ │                           │  │
│  └─────────────────────┘ └───────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 🚨 Step 0: Clear Out Old Containers & Files on the Machine

Before deploying fresh Dotta, wipe out any old lingering processes, Docker containers, and outdated code from your VM:

```bash
# 1. Stop and remove old Docker containers, networks, and orphaned volumes
cd /var/www/dotta 2>/dev/null || cd ~
docker compose down -v --remove-orphans 2>/dev/null || true

# 2. Kill any old PM2 or background Node processes running on port 3001
pm2 delete all 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true

# 3. Archive or delete old project directory on the VM
sudo mv /var/www/dotta /var/www/dotta_backup 2>/dev/null || true
```

---

## 1. Initial VM Preparation & Prerequisites

Connect to your remote VM via SSH:
```bash
ssh user@YOUR_SERVER_IP
```

Update packages and install core build tools:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw build-essential
```

### Install Node.js (v20 LTS or v22 LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Verify v20+
npm -v
```

### Install Docker Engine (for isolated tool execution)
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

### Install Caddy Web Server
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### Install PM2 Process Manager
```bash
sudo npm install -g pm2
```

---

## 2. Obtain Machine IP & Configure Domain DNS

### Find Your Server's Public IP
Run the following command on your VM to display your exact public IP address:
```bash
curl -4 ifconfig.me
# Example output: 198.51.100.42
```

### Configure DNS in Your Domain Registrar (Cloudflare, Namecheap, GoDaddy, etc.)
1. Log into your DNS management dashboard.
2. Add an **A Record**:
   - **Type:** `A`
   - **Name:** `@` (for root domain, e.g. `yourdomain.com`) or `dotta` (for subdomain)
   - **IPv4 Address:** Paste your VM public IP (e.g., `198.51.100.42`)
   - **TTL:** Auto or 300 seconds
   - **Proxy Status (if Cloudflare):** DNS only (gray cloud) during initial SSL provisioning, or enabled (orange cloud) with Full (Strict) SSL.
3. Wait 1-2 minutes and verify DNS propagation:
   ```bash
   dig +short yourdomain.com
   ```

---

## 3. Clone Repository & Install Dependencies

Clone your clean repository onto the server:
```bash
cd /var/www || sudo mkdir -p /var/www && cd /var/www
sudo git clone https://github.com/drawde-001/Dotta.git dotta
sudo chown -R $USER:$USER /var/www/dotta
cd /var/www/dotta
```

### Install All Declared Dependencies
This installs all UI packages (`@assistant-ui/react`), AG-UI streaming modules, Express, Supabase client, and build tools:
```bash
npm install
```

### Build the Frontend Assistant-UI Shell
```bash
npm run build
```
This bundles the React Assistant-UI frontend into the `/dist` directory for production serving.

---

## 4. Configure Environment Variables

Create your production `.env` file from the template:
```bash
cp .env.example .env
nano .env
```

Set your production keys:
```env
# Primary Model Provider
DEFAULT_MODEL=muse-spark-open
MODAL_MUSE_SPARK_URL=https://your-model-endpoint.example.com/v1
MODAL_PROXY_TOKEN_ID=your_modal_proxy_token_id
MODAL_PROXY_TOKEN_SECRET=your_modal_proxy_token_secret
MODAL_API_KEY=your_modal_api_key

# Meta Model API (Fallback & Multimodal Tools)
META_MUSE_API_KEY=your_actual_meta_muse_api_key_here
META_MUSE_BASE_URL=https://api.meta.ai/v1
MODEL_API_KEY=your_model_api_key

# Optional Supporting Model: NVIDIA NIM Integration (for Muse Glimmer 30B)
# Note: Users can also bring their own key directly in Settings -> API Keys & Compute
NVIDIA_API_KEY=your_nvidia_api_key_here

# Server Settings
PORT=3001
NODE_ENV=production
PUBLIC_DOMAIN=yourdomain.com

# Long random string used to sign sessions:  openssl rand -hex 32
SESSION_SECRET=your_long_random_string

# Supabase Database Configuration (your own project)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Tool Execution & Sandbox
DOTTA_SANDBOX_DISTRO=dotta-sandbox
```

> **100% Bring Your Own Key (BYOK)**: In production, users add their own API keys for Meta AI, Modal Compute, or NVIDIA NIM directly inside **Settings -> API Keys & Compute** in the web interface. All keys are encrypted at rest with application-level **AES-256-GCM** with zero exposure to client browsers.
>
> Keep your `.env` file private. It is git-ignored; never commit it or paste its contents anywhere public.

### Supabase Database Initialization
Create your own project at [supabase.com](https://supabase.com), then apply the Dotta schema:
```bash
# Option A: paste the contents of supabase/schema.sql into the Supabase SQL Editor and run it

# Option B: use the Supabase CLI
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### Accounts
Create your account from the **Sign up** page once the app is running. No default accounts or passwords exist.

To provision an admin account on a fresh install instead, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters) in `.env` before the first start.

---

## 5. Configure Caddy Reverse Proxy & Automatic SSL

Caddy automatically obtains, provisions, and renews SSL/TLS certificates from Let's Encrypt for your domain.

Copy the included Caddyfile to the system configuration:
```bash
sudo cp /var/www/dotta/server/caddy/Caddyfile /etc/caddy/Caddyfile
```

Edit `/etc/caddy/Caddyfile` and replace `yourdomain.com` with your actual domain name:
```bash
sudo nano /etc/caddy/Caddyfile
```

Example configuration:
```caddy
yourdomain.com {
    reverse_proxy localhost:3001 {
        # Disable buffering so AG-UI SSE streaming tokens appear instantly
        flush_interval -1
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

Reload Caddy to apply the changes:
```bash
sudo systemctl reload caddy
```

---

## 6. Firewall Configuration (UFW)

Open HTTP, HTTPS, and SSH ports:
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

---

---

## 7. Launch Dotta

You can launch Dotta using either **Option A: Docker Compose (Recommended)** or **Option B: PM2 on Host**.

### Option A: 1-Command Docker Compose (Production Standard)
This is the recommended deployment method used in production. It launches both the Dotta Node container (`dotta_app`) and Caddy (`dotta_caddy`) with automated SSL, health checks, and persistent volumes:

```bash
cd /var/www/dotta

# Build the container and start the services in background
docker compose up -d --build

# Verify running services
docker compose ps
```

Persistent volumes automatically preserve your data across redeploys:
- `bio_data`: User BIO profiles, sessions, and database backups (`/app/src/data`)
- `workspaces_data`: Persistent thread workspaces, created artifacts, web builds, and seeded assets (`/app/src/workspaces`)
- `caddy_data`: Automated Let's Encrypt certificates (`/data`)

To view live application logs:
```bash
docker compose logs -f app
```

---

### Option B: PM2 Process Manager (Host Node)

If you prefer running Node directly on the host machine:

```bash
cd /var/www/dotta

# 1. Install Playwright browser dependencies on the host
npx playwright install chromium
npx playwright install-deps chromium

# 2. Build the production React frontend
npm run build

# 3. Start the application with PM2
pm2 start server/index.js --name "dotta" --time

# 4. Save the process list and configure PM2 startup
pm2 save
pm2 startup
```

---

## 8. Continuous Deployment & Updates

Whenever you push updates to your repository, deploy the changes to your server:

### For Docker Compose (Option A):
```bash
cd /var/www/dotta
git pull origin main
docker compose build --no-cache
docker compose up -d --force-recreate app
```

### For PM2 (Option B):
```bash
cd /var/www/dotta
git pull origin main
npm install
npm run build
pm2 reload dotta
```

---

## 9. Reproducible Verification & Health Check

Confirm your instance is running correctly:

1. **Verify Backend Health:**
   ```bash
   curl -i http://localhost:3001/api/health
   # Returns: {"status":"healthy","defaultModel":"muse-spark-open", ...}
   ```

2. **Verify Public HTTPS & User Onboarding:**
   Open `https://yourdomain.com/new` in your browser.
   - You will see the Assistant-UI chat shell connected to Dotta.
   - Register a personal account at `/login`.
   - Your account is automatically seeded with the canonical **Alex Morgan BIO profile** (`https://yourdomain.com/bio`).
   - Open **Settings** -> **API Keys** (`https://yourdomain.com/settings/keys`) and configure your Meta API key (or Modal / NVIDIA NIM key).
   - Run a web navigation or form-filling task to verify real-time browser actions!

3. **Verify Thread Workspaces & Local Web Previews:**
   - Ask Dotta to create a website or document in your chat.
   - The agent writes the files into the dedicated persistent thread workspace (`src/workspaces/<userId>/threads/<threadId>/<folder>/`).
   - Open the **Workspace Panel** in the UI to inspect generated files.
   - Click the live preview URL or open `https://yourdomain.com/api/workspace/preview/<threadId>/<folder>/` to see the site rendered inside the secured CSP sandbox.

4. **Run Comprehensive Security, Isolation & Crypto Test Suites:**
   ```bash
   # Run in the repository directory (or inside container via docker exec)
   node tests/bio.test.js
   node tests/user-funded-billing.test.js
   node tests/credentials-crypto.test.js
   node tests/settings-verification.test.js
   node tests/thread-workspace-preview.test.js
   ```

