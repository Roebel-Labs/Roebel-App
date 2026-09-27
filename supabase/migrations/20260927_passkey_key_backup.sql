-- Passkey key backup (feat/passkey-signin, PREVIEW-ONLY). NOT APPLIED.
-- Gate for Max: apply only when PASSKEY_KEY_BACKUP_ENABLED=1 goes onto the Vercel Preview env.
--
-- Purpose: a person on a passkey session gets back, on a NEW device, the secrets that used to be
-- derived from a (deterministic thirdweb) signature: the MACI voting keypair, the Nostr key and
-- the citizen-commitment salt. Passkey signatures are randomized, so those can no longer be
-- re-derived; instead they are wrapped under a key derived from the passkey's PRF output
-- (HKDF-SHA256 + AES-256-GCM, apps/expo/lib/passkey/prf-vault.ts, blob format 'pkv1:...').
--
-- The rows hold CIPHERTEXT ONLY. Without the passkey (whose PRF never leaves the authenticator)
-- a blob is useless, including to the service role and to anyone who dumps this table.
--
-- Access: server-only through the service role (apps/web/src/lib/passkey/key-backup-store-supabase.ts),
-- after the route checked a signature by the identity (verifyAccountSignature: Safe ERC-1271,
-- Safe-admin envelope for a legacy thirdweb account, or a thirdweb admin).
-- RLS on, NO policies, every privilege revoked from anon/authenticated. No functions are created
-- (Supabase would grant EXECUTE on new functions to anon by default).

create table if not exists public.passkey_key_backups (
  identity_address  text not null check (identity_address = lower(identity_address) and identity_address ~ '^0x[0-9a-f]{40}$'),
  slot              text not null check (slot in ('maci', 'nostr', 'salt')),
  blob              text not null check (blob ~ '^pkv1:[A-Za-z0-9_-]+$' and length(blob) between 43 and 4005),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (identity_address, slot)
);

alter table public.passkey_key_backups enable row level security;

revoke all on table public.passkey_key_backups from public, anon, authenticated;
grant select, insert, update, delete on table public.passkey_key_backups to service_role;

comment on table public.passkey_key_backups is
  'PRF-wrapped (passkey) ciphertext of the MACI / Nostr / commitment-salt secrets per identity. Useless without the passkey. Service role only.';
