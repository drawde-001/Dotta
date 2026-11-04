-- ==============================================================================
-- Migration: User-Funded Billing Architecture (BYOK for Meta & Modal)
-- Date: 2026-11-04
-- ==============================================================================

-- 1. User Credentials Secret Table
-- Stores AES-256-GCM encrypted secrets with zero RLS read/write access for client roles.
CREATE TABLE IF NOT EXISTS public.user_credentials_secret (
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'modal')),
  encrypted_payload TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- Enable Row Level Security (RLS) on user_credentials_secret
ALTER TABLE public.user_credentials_secret ENABLE ROW LEVEL SECURITY;

-- Service role full access policy ONLY.
-- Notice: NO policies are granted to 'authenticated' or 'anon'.
-- Clients can NEVER select, insert, update, or delete from this table directly.
CREATE POLICY "Service role full access on user_credentials_secret"
  ON public.user_credentials_secret
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- 2. User Integrations Status Table
-- Stores non-sensitive integration status and masked key hint (...last4).
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

-- Enable Row Level Security (RLS) on user_integrations
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- Service role full access for backend mutations
CREATE POLICY "Service role full access on user_integrations"
  ON public.user_integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can SELECT only their own integration rows.
-- Writes are strictly handled by the backend after verification.
CREATE POLICY "Users read own integrations"
  ON public.user_integrations
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);
