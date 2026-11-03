# Dotta Production Setup & Deployment Guide

This guide provides end-to-end instructions for deploying Dotta to a Linux virtual machine (Ubuntu 22.04 / 24.04 LTS or Debian 12), configuring your own domain with automatic HTTPS via Caddy (e.g. `yourdomain.com`), isolating tool execution with Docker, integrating Supabase, and wiring PM2 for seamless continuous deployment.

---

## Architecture Flow

```
[Internet User]
       │
       ▼  (HTTPS / 443)
┌──────────────────────────────────────────────┐
│  Virtual Machine (Public IP)                 │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Caddy Reverse Proxy (Auto Let's Encrypt)│  │
│  └──────────────────┬─────────────────────┘  │
│                     │  (HTTP / 3001)         │
│                     ▼                        │
│  ┌────────────────────────────────────────┐  │
│  │ Node.js Server (PM2)                   │  │
│  │  - Static Assistant-UI (/dist)         │  │
│  │  - AG-UI SSE Stream (/api/chat)        │  │
│  │  - DottaEngine (Meta Muse Core)        │  │
│  └──────────────────┬─────────────────────┘  │
│                     │                        │
│         ┌───────────┴───────────┐            │
│         ▼                       ▼            │
│  ┌──────────────┐       ┌──────────────┐     │
│  │ Docker / WSL │       │   Supabase   │     │
│  │ Tool Sandbox │       │ PostgreSQL DB│     │
│  └──────────────┘       └──────────────┘     │
└──────────────────────────────────────────────┘
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

## 7. Start the Dotta Service with PM2

Start the application with PM2 to keep it running 24/7 with automatic restart on crashes:
```bash
cd /var/www/dotta
pm2 start server/index.js --name "dotta" --time
```

Save the process list and configure PM2 to restart on system boot:
```bash
pm2 save
pm2 startup
# Copy and run the command printed by pm2 startup
```

### Useful PM2 Commands
```bash
pm2 status          # View application status
pm2 logs dotta      # Stream live backend & agent execution logs
pm2 restart dotta   # Restart backend server
pm2 reload dotta    # Zero-downtime reload
```

---

## 8. Continuous Deployment (Updating the Server)

Whenever you push updates to your repository, deploy the changes to your VM with this single command:
```bash
cd /var/www/dotta && git pull && npm install && npm run build && pm2 reload dotta
```

You can save this as a deployment script (`deploy.sh`):
```bash
#!/bin/bash
set -e
echo "Deploying latest Dotta..."
git pull origin main
npm install
npm run build
pm2 reload dotta
echo "Deployment successful! Live at https://yourdomain.com"
```
Make it executable:
```bash
chmod +x deploy.sh
```

---

## 9. Verification & Health Check

1. **Verify Backend Health:**
   ```bash
   curl -i http://localhost:3001/api/health
   # Returns: {"status":"healthy","defaultModel":"muse-spark-open", ...}
   ```
2. **Verify Public HTTPS:**
   Open `https://yourdomain.com` in your browser.
   - You will see the Assistant-UI chat shell connected to Dotta.
   - Enter a prompt: *"Create a file called notes.txt and list files"*.
   - The streaming tokens and real-time tool execution cards will render smoothly.
