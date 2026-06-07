-- ============================================================================
-- Shamir-split MACI coordinator key tables
--
-- Stores: each Attester's wallet-derived Curve25519 share-encryption pubkey,
-- the history of coordinator keypair generations, the encrypted shares per
-- generation, ephemeral reconstructor sessions, share submissions during
-- tally, and a full audit log.
--
-- Encrypted blobs are public-readable (they're useless without a wallet
-- signature). All writes are forbidden for anon/authenticated and must go
-- through API routes that validate wallet signatures with the service_role
-- key.
-- ============================================================================

-- 1. Per-wallet Curve25519 public keys for share encryption
create table if not exists public.coordinator_share_keys (
  wallet_address text primary key,
  curve25519_pubkey bytea not null,
  challenge text not null,
  signature text not null,
  registered_at timestamptz not null default now(),
  revoked_at timestamptz
);
comment on table public.coordinator_share_keys is
  'Curve25519 public encryption keys derived from each Attester wallet signature. Used to seal MACI coordinator key shares so only that wallet can decrypt them. Private keys never leave the browser.';
comment on column public.coordinator_share_keys.curve25519_pubkey is
  'Raw 32-byte NaCl crypto_box_curve25519xsalsa20poly1305 public key (bytea).';
comment on column public.coordinator_share_keys.challenge is
  'The exact deterministic challenge string the wallet signed to derive its keypair. Stored for auditability.';
comment on column public.coordinator_share_keys.signature is
  'Hex-encoded ECDSA signature over the challenge. Proves the wallet was actually present at registration time.';

create index if not exists coordinator_share_keys_active_idx
  on public.coordinator_share_keys (wallet_address)
  where revoked_at is null;

-- 2. One row per coordinator-keypair ceremony (rotation)
create table if not exists public.coordinator_key_generations (
  id uuid primary key default gen_random_uuid(),
  governor_address text not null,
  pubkey_x text not null,
  pubkey_y text not null,
  threshold smallint not null check (threshold > 0),
  total_shares smallint not null check (total_shares >= threshold),
  created_by_wallet text not null,
  created_at timestamptz not null default now(),
  proposal_id text,
  set_pubkey_tx_hash text,
  activated_at timestamptz,
  superseded_at timestamptz
);
comment on table public.coordinator_key_generations is
  'One row per MACI coordinator-key ceremony. Tracks the on-chain Babyjubjub pubkey, threshold/total used for the split, and the lifecycle from generation -> proposal -> activation -> supersession.';

create index if not exists coordinator_key_generations_governor_idx
  on public.coordinator_key_generations (governor_address, created_at desc);
create index if not exists coordinator_key_generations_active_idx
  on public.coordinator_key_generations (governor_address)
  where activated_at is not null and superseded_at is null;

-- 3. Encrypted shares per (generation, shareholder)
create table if not exists public.coordinator_shares (
  id uuid primary key default gen_random_uuid(),
  key_generation_id uuid not null references public.coordinator_key_generations(id) on delete cascade,
  wallet_address text not null,
  share_index smallint not null check (share_index >= 1),
  encrypted_share bytea not null,
  created_at timestamptz not null default now(),
  unique (key_generation_id, wallet_address),
  unique (key_generation_id, share_index)
);
comment on table public.coordinator_shares is
  'NaCl sealed-box encrypted Shamir shares, one per shareholder per generation. The cipher bytes are public; only the recipient wallet can open them.';

create index if not exists coordinator_shares_wallet_idx
  on public.coordinator_shares (wallet_address, created_at desc);

-- 4. Ephemeral reconstructor sessions (one per tally)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'coordinator_session_state') then
    create type public.coordinator_session_state as enum
      ('open', 'completed', 'expired', 'aborted');
  end if;
end $$;

create table if not exists public.coordinator_sessions (
  id uuid primary key default gen_random_uuid(),
  key_generation_id uuid not null references public.coordinator_key_generations(id) on delete restrict,
  governor_address text not null,
  poll_id text not null,
  proposal_id text,
  reconstructor_session_pubkey bytea not null,
  reconstructor_session_signature text not null,
  reconstructor_host text,
  expires_at timestamptz not null,
  state public.coordinator_session_state not null default 'open',
  submitted_shares_count smallint not null default 0 check (submitted_shares_count >= 0),
  tally_tx_hash text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
comment on table public.coordinator_sessions is
  'One row per reconstructor invocation (one per MACI poll tally). Records the ephemeral session pubkey so Attester browsers can verify which reconstructor instance they are submitting plaintext shares to.';

create index if not exists coordinator_sessions_open_idx
  on public.coordinator_sessions (governor_address, created_at desc)
  where state = 'open';
create index if not exists coordinator_sessions_poll_idx
  on public.coordinator_sessions (poll_id, created_at desc);

-- 5. Per-Attester submission record (audit; no plaintext)
create table if not exists public.coordinator_session_submissions (
  session_id uuid not null references public.coordinator_sessions(id) on delete cascade,
  wallet_address text not null,
  submitted_at timestamptz not null default now(),
  submission_proof text not null,
  primary key (session_id, wallet_address)
);
comment on table public.coordinator_session_submissions is
  'Records WHICH Attester submitted a share to a reconstructor session (not the share itself). submission_proof is a hash of the (session pubkey || share index || wallet) so the audit trail is non-repudiable without leaking key material.';

-- 6. Append-only audit log across all coordinator operations
create table if not exists public.coordinator_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_wallet text,
  target_id text,
  payload jsonb,
  tx_hash text,
  created_at timestamptz not null default now()
);
comment on table public.coordinator_audit_log is
  'Append-only timeline of coordinator operations. Used by /app/admin/coordinator/history to render the audit view. Insertions only via service_role API routes after signature verification.';

create index if not exists coordinator_audit_log_recent_idx
  on public.coordinator_audit_log (created_at desc);
create index if not exists coordinator_audit_log_event_idx
  on public.coordinator_audit_log (event_type, created_at desc);
create index if not exists coordinator_audit_log_target_idx
  on public.coordinator_audit_log (target_id, created_at desc);

-- ============================================================================
-- RLS policies
--
-- Strategy: SELECT is open to anon + authenticated (transparency + the
-- encrypted blobs are useless without wallet sigs). All writes go through
-- API routes using the service_role key, which bypasses RLS.
-- ============================================================================

alter table public.coordinator_share_keys enable row level security;
alter table public.coordinator_key_generations enable row level security;
alter table public.coordinator_shares enable row level security;
alter table public.coordinator_sessions enable row level security;
alter table public.coordinator_session_submissions enable row level security;
alter table public.coordinator_audit_log enable row level security;

drop policy if exists "coordinator_share_keys_public_read" on public.coordinator_share_keys;
create policy "coordinator_share_keys_public_read"
  on public.coordinator_share_keys for select
  using (true);

drop policy if exists "coordinator_key_generations_public_read" on public.coordinator_key_generations;
create policy "coordinator_key_generations_public_read"
  on public.coordinator_key_generations for select
  using (true);

drop policy if exists "coordinator_shares_public_read" on public.coordinator_shares;
create policy "coordinator_shares_public_read"
  on public.coordinator_shares for select
  using (true);

drop policy if exists "coordinator_sessions_public_read" on public.coordinator_sessions;
create policy "coordinator_sessions_public_read"
  on public.coordinator_sessions for select
  using (true);

drop policy if exists "coordinator_session_submissions_public_read" on public.coordinator_session_submissions;
create policy "coordinator_session_submissions_public_read"
  on public.coordinator_session_submissions for select
  using (true);

drop policy if exists "coordinator_audit_log_public_read" on public.coordinator_audit_log;
create policy "coordinator_audit_log_public_read"
  on public.coordinator_audit_log for select
  using (true);
