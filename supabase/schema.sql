-- ==============================================================================
-- Dotta Supabase PostgreSQL Database Schema
-- Run this in the SQL editor of your own Supabase project.
-- ==============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT,
  bio TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  default_model TEXT DEFAULT 'muse-spark-open',
  thinking_budget INTEGER DEFAULT 2048,
  auto_save BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. User Sessions Table
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  last_active_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at TIMESTAMPTZ
);

-- 5. Conversations / Threads Table
CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New chat',
  messages JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. User Audit Logs Table
CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. User Uploads Table (Attachments & Media tied to User Profile ID)
CREATE TABLE IF NOT EXISTS public.user_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  thread_id TEXT,
  name TEXT NOT NULL,
  size BIGINT,
  mime_type TEXT,
  workspace_path TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. User Credentials Secret Table (Encrypted API keys, service_role access ONLY)
CREATE TABLE IF NOT EXISTS public.user_credentials_secret (
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'modal')),
  encrypted_payload TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- 9. User Integrations Status Table (Integration status & masked hints, SELECT for authenticated users)
CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'modal')),
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'connected', 'error')),
  masked_hint TEXT,
  verified_at TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credentials_secret ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access Policies (only backend service role can bypass)
CREATE POLICY "Service role full access on users" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_profiles" ON public.user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_settings" ON public.user_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_sessions" ON public.user_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on conversations" ON public.conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_audit_logs" ON public.user_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_uploads" ON public.user_uploads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_credentials_secret" ON public.user_credentials_secret FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_integrations" ON public.user_integrations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated User Scoped Access Policies (Strict user_id = auth.uid()::text)
CREATE POLICY "Users access own record" ON public.users FOR ALL TO authenticated USING (auth.uid()::text = id) WITH CHECK (auth.uid()::text = id);
CREATE POLICY "Users access own profile" ON public.user_profiles FOR ALL TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users access own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users access own conversations" ON public.conversations FOR ALL TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users access own uploads" ON public.user_uploads FOR ALL TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users read own integrations" ON public.user_integrations FOR SELECT TO authenticated USING (auth.uid()::text = user_id);


