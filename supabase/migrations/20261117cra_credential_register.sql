-- Credential Register: node-side mirror tables (plan credreg-2, task 1).
-- Spec: docs/superpowers/specs/2026-11-17-credential-register-design.md
--
-- The chain is the truth; these tables make lists fast and hold the salts and claim keys that
-- make the proofs. Server-only: RLS on, no policies, grants revoked (Supabase default privileges
-- grant anon/authenticated on new tables, so the REVOKE is required). Only apps/web (service
-- role) touches them. NOT applied by agents: owner gate through the Supabase MCP.
-- All text ids are lowercase 0x-hex unless noted.

CREATE TABLE IF NOT EXISTS public.credential_types (
  type_id                  text PRIMARY KEY,
  registry                 text NOT NULL,
  account_id               uuid REFERENCES public.accounts(id) ON DELETE SET NULL, -- null = community
  org_id                   text NOT NULL,
  local_uuid               uuid,
  local_id                 text NOT NULL,
  kind                     text CHECK (kind IN ('role', 'membership', 'badge')),
  policy                   text CHECK (policy IN ('issuer_batch', 'self_claim', 'external')),
  name                     text NOT NULL,
  description              text,
  image_url                text,
  benefits                 jsonb NOT NULL DEFAULT '[]',
  template                 text,
  default_validity_seconds bigint NOT NULL DEFAULT 0,
  claim_start              timestamptz,
  claim_end                timestamptz,
  supply_cap               integer NOT NULL DEFAULT 0,
  public_claim             boolean NOT NULL DEFAULT true,
  recognised               boolean NOT NULL DEFAULT false,
  retired                  boolean NOT NULL DEFAULT false,
  chain_status             text NOT NULL DEFAULT 'draft' CHECK (chain_status IN ('draft', 'onchain')),
  event_id                 uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_by               text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credential_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid,
  steps         jsonb NOT NULL,
  summary       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'awaiting_confirmation'
                CHECK (status IN ('awaiting_confirmation', 'submitted', 'done', 'failed', 'cancelled', 'expired')),
  prepared_by   text NOT NULL,
  prepared_via  text NOT NULL CHECK (prepared_via IN ('app', 'dashboard', 'studio', 'node')),
  confirmed_by  text,
  tx_hash       text,
  error         text,
  -- Chain head when the action was prepared: a receipt from this block or earlier cannot be its transaction.
  prepared_block bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

-- One transaction settles at most one action.
CREATE UNIQUE INDEX IF NOT EXISTS credential_actions_tx_hash_idx
  ON public.credential_actions (tx_hash) WHERE tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credential_batches (
  id             uuid PRIMARY KEY,
  action_id      uuid REFERENCES public.credential_actions(id),
  type_id        text NOT NULL REFERENCES public.credential_types(type_id),
  root           text NOT NULL,
  count          integer NOT NULL,
  chain_batch_id bigint,
  status         text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'onchain', 'revoked', 'cancelled')),
  source         text NOT NULL CHECK (source IN ('people', 'member_list', 'event', 'node_delegate')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- A root may be reused only after its earlier batch was cancelled.
CREATE UNIQUE INDEX IF NOT EXISTS credential_batches_root_live_idx
  ON public.credential_batches (root) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.credential_invitations (
  id               uuid PRIMARY KEY,
  batch_id         uuid NOT NULL REFERENCES public.credential_batches(id) ON DELETE CASCADE,
  type_id          text NOT NULL,
  leaf_kind        text CHECK (leaf_kind IN ('account', 'claim_key')),
  subject          text NOT NULL,
  valid_until      bigint NOT NULL DEFAULT 0,
  salt             text NOT NULL,
  leaf_hash        text NOT NULL,
  proof            jsonb NOT NULL,
  claim_key_enc    text,
  token_hash       text UNIQUE,
  token_enc        text,
  recipient_wallet text,
  display_name     text,
  contact_email    text,
  email_sent_at    timestamptz,
  -- Mail sends started (counted when a sender takes the row). After 3 the address is erased and the
  -- invitation stays link-only, so the organiser can print a letter.
  mail_attempts    integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'prepared'
                   CHECK (status IN ('prepared', 'invited', 'accepted', 'declined', 'revoked')),
  claimed_onchain  boolean NOT NULL DEFAULT false,
  invited_at       timestamptz,
  responded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credential_invitations_recipient_idx
  ON public.credential_invitations (recipient_wallet, status);
CREATE INDEX IF NOT EXISTS credential_invitations_batch_idx
  ON public.credential_invitations (batch_id);
CREATE INDEX IF NOT EXISTS credential_invitations_leaf_idx
  ON public.credential_invitations (leaf_hash);
CREATE INDEX IF NOT EXISTS credential_invitations_type_idx
  ON public.credential_invitations (type_id);

CREATE TABLE IF NOT EXISTS public.credential_delegates (
  type_id   text NOT NULL,
  delegate  text NOT NULL,
  label     text,
  active    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (type_id, delegate)
);

CREATE TABLE IF NOT EXISTS public.credential_presentations (
  code_hash   text PRIMARY KEY,
  payload     jsonb NOT NULL,
  expires_at  timestamptz NOT NULL
);

-- Single row: which registry this mirror belongs to and how far the sync has read.
CREATE TABLE IF NOT EXISTS public.credential_sync_state (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  registry    text NOT NULL,
  last_block  bigint NOT NULL
);

ALTER TABLE public.credential_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_actions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_delegates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_sync_state    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.credential_types         FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_actions       FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_batches       FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_invitations   FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_delegates     FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_presentations FROM anon, authenticated;
REVOKE ALL ON TABLE public.credential_sync_state    FROM anon, authenticated;

-- null = never set on chain (the sub-type default applies). Written only by the sync from
-- OrgPrivateOnlySet, so it always mirrors the chain.
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS credentials_members_public boolean;

INSERT INTO public.app_settings (key, value)
VALUES ('credentials_enabled', 'false'), ('credentials_enabled_production', 'false')
ON CONFLICT (key) DO NOTHING;

-- RESET (switching registry address): truncate credential_presentations, credential_invitations, credential_batches, credential_actions, credential_delegates, credential_types, credential_sync_state;
