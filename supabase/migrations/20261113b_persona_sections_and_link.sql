-- Persona v2: sectioned suggestions ("Für dich") and link tokens that let the
-- person's own Claude read the wiki and write knowledge back over MCP.

ALTER TABLE public.persona_suggestions
  ADD COLUMN IF NOT EXISTS section       text NOT NULL DEFAULT 'projects'
    CHECK (section IN ('projects','collab','improve','peers')),
  ADD COLUMN IF NOT EXISTS section_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quick         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fresh         boolean NOT NULL DEFAULT false;

-- Only the SHA-256 of a token is stored; the secret is shown once.
CREATE TABLE IF NOT EXISTS public.persona_link_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet        text NOT NULL,
  label         text NOT NULL DEFAULT 'Claude',
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE INDEX IF NOT EXISTS persona_link_tokens_wallet_idx ON public.persona_link_tokens (wallet);

ALTER TABLE public.persona_imports ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.persona_link_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.persona_link_tokens FROM anon, authenticated;
