-- Optional warning email for passkey Safes (feat/passkey-accounts, PREVIEW-ONLY).
-- NOT APPLIED. Gate for Max: apply only when the passkey email preview goes live.
--
-- Purpose: a passkey user MAY add an email. It is used ONLY for
--   (1) recovery alerts ("Jemand stellt dein Konto wieder her ..."), which is what makes the
--       SocialRecoveryModule's 3-day cancel window protective, and
--   (2) notifications the person opts into (later).
-- It is NEVER a login or a key, and it must NEVER subscribe anyone to the newsletter:
-- these tables are separate from users.email, so trg_newsletter_auto_enroll (on users) never
-- fires for them, and nothing here references newsletter_subscribers.
--
-- Access: server-only through the service role (apps/web/src/lib/passkey/email-store-supabase.ts).
-- RLS on, NO policies, and every privilege revoked from anon/authenticated. No functions are
-- created (Supabase would grant EXECUTE on new functions to anon by default).

create table if not exists public.passkey_contacts (
  safe_address       text primary key check (safe_address = lower(safe_address) and safe_address ~ '^0x[0-9a-f]{40}$'),
  email              text not null check (email = lower(email) and length(email) <= 254),
  email_verified_at  timestamptz,
  alerts_enabled     boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One open verification per Safe. Only a hash of the 6-digit code is stored.
create table if not exists public.passkey_email_challenges (
  safe_address  text primary key check (safe_address = lower(safe_address) and safe_address ~ '^0x[0-9a-f]{40}$'),
  email         text not null check (email = lower(email) and length(email) <= 254),
  code_hash     text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at    timestamptz not null,
  attempts      integer not null default 0 check (attempts >= 0),
  created_at    timestamptz not null default now()
);

-- Replay guard for the Safe-signed add/remove proofs (±10 min window).
create table if not exists public.passkey_email_used_proofs (
  proof_hash  text primary key check (proof_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz not null
);
create index if not exists passkey_email_used_proofs_expires_idx on public.passkey_email_used_proofs (expires_at);

-- Idempotency for recovery alerts: one mail per (wallet, SRM recovery nonce).
create table if not exists public.passkey_recovery_alerts (
  wallet_address  text not null check (wallet_address = lower(wallet_address) and wallet_address ~ '^0x[0-9a-f]{40}$'),
  recovery_nonce  numeric(78, 0) not null,
  execute_after   timestamptz not null,
  sent_at         timestamptz not null default now(),
  primary key (wallet_address, recovery_nonce)
);

-- Scan cursor of GET /api/passkey/recovery-alerts (last fully processed Gnosis block).
create table if not exists public.passkey_alert_cursor (
  id          text primary key,
  last_block  bigint not null check (last_block >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.passkey_contacts          enable row level security;
alter table public.passkey_email_challenges  enable row level security;
alter table public.passkey_email_used_proofs enable row level security;
alter table public.passkey_recovery_alerts   enable row level security;
alter table public.passkey_alert_cursor      enable row level security;

revoke all on table public.passkey_contacts          from public, anon, authenticated;
revoke all on table public.passkey_email_challenges  from public, anon, authenticated;
revoke all on table public.passkey_email_used_proofs from public, anon, authenticated;
revoke all on table public.passkey_recovery_alerts   from public, anon, authenticated;
revoke all on table public.passkey_alert_cursor      from public, anon, authenticated;

grant select, insert, update, delete on table public.passkey_contacts          to service_role;
grant select, insert, update, delete on table public.passkey_email_challenges  to service_role;
grant select, insert, update, delete on table public.passkey_email_used_proofs to service_role;
grant select, insert, update, delete on table public.passkey_recovery_alerts   to service_role;
grant select, insert, update, delete on table public.passkey_alert_cursor      to service_role;

comment on table public.passkey_contacts is
  'Optional warning email per passkey Safe. Recovery alerts + opted-in notifications only. Never a login, never a key, never the newsletter. Service role only.';
