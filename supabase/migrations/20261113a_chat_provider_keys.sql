-- Own model API keys ("eigener Schlüssel") per user, and which side a run was billed to.
-- Spec: docs/superpowers/specs/2026-11-13-ortis-credits-subscriptions-design.md §4
--
-- Keys are stored AES-GCM encrypted with CHAT_CONNECTOR_KEY (same scheme as connector secrets);
-- only the last 4 characters are ever returned. Server-only table: RLS on, no policies, grants revoked.

CREATE TABLE IF NOT EXISTS public.chat_provider_keys (
  wallet      text NOT NULL,
  provider    text NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  key_enc     text NOT NULL,
  last4       text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, provider)
);

ALTER TABLE public.chat_provider_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_provider_keys FROM anon, authenticated;

-- A run paid with the user's own key costs the platform nothing and never counts against the quota.
ALTER TABLE public.chat_runs
  ADD COLUMN IF NOT EXISTS billed_to text NOT NULL DEFAULT 'platform'
  CHECK (billed_to IN ('platform', 'own_key'));
