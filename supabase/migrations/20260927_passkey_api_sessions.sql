-- Passkey API session tokens (feat/passkey-fewer-prompts, PREVIEW-ONLY). NOT APPLIED.
-- Gate for Max: apply only when PASSKEY_SESSION_TOKENS_ENABLED=1 goes onto the Vercel Preview env.
--
-- Purpose: a person on a passkey session signs ONE message per device session ("Röbel Sitzung …")
-- instead of one per request. The server (apps/web/src/app/api/passkey/session/start) verifies it
-- with verifyAccountSignature and returns an HMAC token (secret PASSKEY_SESSION_SECRET, <= 30 days)
-- bound to the identity and the device installation id. This table holds the token IDS so every
-- token can be revoked; the token itself is never stored.
--
-- Readers: the web routes (signed-request tickets/Stripe Connect, chat session, key backup) and the
-- edge functions org-membership + merchant-registry (_shared/verify-session-token.ts). Each checks
-- "issued, not revoked, not expired" on every request and fails closed when this table is unreachable.
--
-- Access: service role only. RLS on, NO policies, every privilege revoked from anon/authenticated.
-- No functions are created (Supabase would grant EXECUTE on new functions to anon by default).
--
-- Revoke one token:       update public.passkey_api_sessions set revoked_at = now() where jti = '<id>';
-- Revoke a whole account: update public.passkey_api_sessions set revoked_at = now()
--                           where identity_address = '<0x… lowercase>' and revoked_at is null;
-- Revoke EVERY token at once: rotate PASSKEY_SESSION_SECRET (Vercel + edge secret).

create table if not exists public.passkey_api_sessions (
  jti               text primary key check (jti ~ '^[0-9a-f]{32}$'),
  identity_address  text not null check (identity_address ~ '^0x[0-9a-f]{40}$'),
  safe_address      text check (safe_address is null or safe_address ~ '^0x[0-9a-f]{40}$'),
  device_id         text not null check (device_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  issued_at         timestamptz not null,
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  check (expires_at > issued_at and expires_at <= issued_at + interval '30 days')
);

create index if not exists passkey_api_sessions_identity_idx
  on public.passkey_api_sessions (identity_address, device_id)
  where revoked_at is null;

alter table public.passkey_api_sessions enable row level security;

revoke all on table public.passkey_api_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.passkey_api_sessions to service_role;

comment on table public.passkey_api_sessions is
  'Ids of passkey API session tokens (one signature per device session). revoked_at set = token dead. Service role only.';
