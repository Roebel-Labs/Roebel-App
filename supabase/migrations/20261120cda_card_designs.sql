-- Card designs (Ausweis-Designer, plan D2 task 1).
-- Spec: docs/superpowers/specs/2026-11-20-credential-designer-design.md §6, §10
--
-- One working draft per credential type, immutable published versions (content-addressed by
-- sha256, served at /api/credentials/designs/<sha>) and the org's image assets. Server-only:
-- RLS on, no policies, grants revoked (Supabase default privileges grant anon/authenticated on
-- new tables, so the REVOKE is required). Only apps/web (service role) touches them.
-- NOT applied by agents: owner gate through the Supabase MCP.

CREATE TABLE IF NOT EXISTS public.credential_design_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- Set by the first publication (createType prepared); one draft per type.
  type_id       text UNIQUE,
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('role', 'membership', 'badge')),
  template      text,
  design        jsonb NOT NULL,
  -- Compare-and-set guard: two editors (Studio and phone) never overwrite each other silently.
  revision      integer NOT NULL DEFAULT 1,
  test_sent_at  timestamptz,
  updated_by    text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credential_design_drafts_account_idx
  ON public.credential_design_drafts (account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.credential_design_versions (
  sha           text PRIMARY KEY,
  draft_id      uuid NOT NULL REFERENCES public.credential_design_drafts(id) ON DELETE CASCADE,
  type_id       text,
  version       integer NOT NULL,
  design        jsonb NOT NULL,
  -- Frozen public text of the version: name, description, kind, organisation, aiGenerated.
  meta          jsonb NOT NULL DEFAULT '{}',
  preview_path  text NOT NULL,
  action_id     text,
  status        text NOT NULL CHECK (status IN ('pending', 'live', 'superseded', 'abandoned')),
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_id, version)
);

CREATE INDEX IF NOT EXISTS credential_design_versions_type_idx
  ON public.credential_design_versions (type_id, status);
CREATE INDEX IF NOT EXISTS credential_design_versions_action_idx
  ON public.credential_design_versions (action_id) WHERE action_id IS NOT NULL;

-- Assets are content-addressed per org: the same bytes uploaded by two orgs are two rows.
CREATE TABLE IF NOT EXISTS public.credential_design_assets (
  sha           text NOT NULL,
  account_id    uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('logo', 'sticker', 'background', 'image')),
  storage_path  text NOT NULL,
  mime          text NOT NULL,
  width         integer,
  height        integer,
  ai            boolean NOT NULL DEFAULT false,
  prompt        text,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, sha)
);

CREATE INDEX IF NOT EXISTS credential_design_assets_sha_idx
  ON public.credential_design_assets (sha);

ALTER TABLE public.credential_design_drafts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_design_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_design_assets   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.credential_design_drafts   FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_design_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_design_assets   FROM anon, authenticated;

INSERT INTO public.app_settings (key, value)
VALUES ('credential_designer_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
