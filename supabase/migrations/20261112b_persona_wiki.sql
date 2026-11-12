-- Personal context ("Wiki") for the Ortis assistants, suggestions, imports and skills.
-- Spec: docs/superpowers/specs/2026-11-12-ortis-personal-context-design.md
--
-- The wiki is built by a background job from connected sources (Gmail, Calendar, Röbel App,
-- imported memory, chat memory). Pages are Markdown; the user can edit every page.
-- Server-only tables: RLS on, no policies, grants revoked (service role only).

CREATE TABLE IF NOT EXISTS public.persona_pages (
  wallet          text NOT NULL,
  slug            text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('overview','goals','projects','profile','profile_section','notes','person','core')),
  title           text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  parent          text,
  body            text NOT NULL DEFAULT '',
  facts           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{label, value}]
  sources         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{n, label, date}]
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- person: {email, name, description, priority}
  edited_by_user  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, slug)
);

CREATE TABLE IF NOT EXISTS public.persona_updates (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet  text NOT NULL,
  at      timestamptz NOT NULL DEFAULT now(),
  text    text NOT NULL
);
CREATE INDEX IF NOT EXISTS persona_updates_wallet_idx ON public.persona_updates (wallet, at DESC);

-- One build job per wallet. checkpoint holds the working set of a running build
-- (collected mail excerpts, digests); it is cleared when the build finishes.
CREATE TABLE IF NOT EXISTS public.persona_jobs (
  wallet       text PRIMARY KEY,
  state        text NOT NULL DEFAULT 'empty' CHECK (state IN ('empty','building','ready','error')),
  mode         text NOT NULL DEFAULT 'full' CHECK (mode IN ('full','refresh')),
  stage        text,
  progress     real NOT NULL DEFAULT 0,
  error        text,
  attempts     int NOT NULL DEFAULT 0,
  checkpoint   jsonb,
  lease_until  timestamptz,
  started_at   timestamptz,
  built_at     timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS persona_jobs_building_idx ON public.persona_jobs (state, lease_until);

CREATE TABLE IF NOT EXISTS public.persona_imports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet      text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('claude','chatgpt','text')),
  title       text NOT NULL DEFAULT '',
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS persona_imports_wallet_idx ON public.persona_imports (wallet, created_at);

CREATE TABLE IF NOT EXISTS public.persona_suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       text NOT NULL,
  group_title  text NOT NULL DEFAULT 'Allgemein',
  kind         text NOT NULL CHECK (kind IN ('task','routine')),
  title        text NOT NULL,
  reason       text NOT NULL DEFAULT '',
  prompt       text NOT NULL,
  schedule     jsonb,
  people       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, slug}]
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new','dismissed','started')),
  sort         int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS persona_suggestions_wallet_idx ON public.persona_suggestions (wallet, status, sort);

-- Things the user removed (a person, a dismissed suggestion title): never derive them again.
CREATE TABLE IF NOT EXISTS public.persona_tombstones (
  wallet      text NOT NULL,
  key         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, key)
);

CREATE TABLE IF NOT EXISTS public.chat_skills (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       text NOT NULL,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_skills_wallet_idx ON public.chat_skills (wallet, created_at);

-- Routines installed from the catalog remember their template.
ALTER TABLE public.chat_routines ADD COLUMN IF NOT EXISTS template_id text;

ALTER TABLE public.persona_pages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_updates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_imports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_tombstones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_skills         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.persona_pages, public.persona_updates, public.persona_jobs, public.persona_imports,
  public.persona_suggestions, public.persona_tombstones, public.chat_skills FROM anon, authenticated;
