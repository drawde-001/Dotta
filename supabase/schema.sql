-- ==============================================================================
-- Dotta Supabase PostgreSQL Database Schema
-- Project ID: vjuoutdhpnnmasstfiwo
-- Project URL: https://vjuoutdhpnnmasstfiwo.supabase.co
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

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_uploads ENABLE ROW LEVEL SECURITY;

-- Service Role Policy (Full Access for backend API)
CREATE POLICY "Service role full access on users" ON public.users FOR ALL USING (true);
CREATE POLICY "Service role full access on user_profiles" ON public.user_profiles FOR ALL USING (true);
CREATE POLICY "Service role full access on user_settings" ON public.user_settings FOR ALL USING (true);
CREATE POLICY "Service role full access on user_sessions" ON public.user_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access on conversations" ON public.conversations FOR ALL USING (true);
CREATE POLICY "Service role full access on user_audit_logs" ON public.user_audit_logs FOR ALL USING (true);
CREATE POLICY "Service role full access on user_uploads" ON public.user_uploads FOR ALL USING (true);

