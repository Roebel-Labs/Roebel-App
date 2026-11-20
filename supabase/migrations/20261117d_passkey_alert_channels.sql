-- Passkey recovery alerts: one claim per channel (Sovereign Sign-up 2, Task 7). NOT APPLIED.
-- Gate for Max: apply together with (after) 20260927_passkey_contact_email.sql.
--
-- GET /api/passkey/recovery-alerts now alerts by email AND by push. Each channel claims the alert
-- on its own, so a failed push is retried without a second email (and the other way round):
-- the idempotency key grows from (wallet_address, recovery_nonce) to
-- (wallet_address, recovery_nonce, channel). Existing rows were emails and keep that channel.
-- Access, RLS and grants are unchanged (service role only). Safe to run twice.

alter table public.passkey_recovery_alerts
  add column if not exists channel text not null default 'email';

alter table public.passkey_recovery_alerts drop constraint if exists passkey_recovery_alerts_channel_check;
alter table public.passkey_recovery_alerts
  add constraint passkey_recovery_alerts_channel_check check (channel in ('email', 'push'));

alter table public.passkey_recovery_alerts drop constraint if exists passkey_recovery_alerts_pkey;
alter table public.passkey_recovery_alerts
  add constraint passkey_recovery_alerts_pkey primary key (wallet_address, recovery_nonce, channel);

comment on table public.passkey_recovery_alerts is
  'Idempotency for recovery alerts: one claim per (wallet, SRM recovery nonce, channel email|push). Service role only.';
