-- Passkey key backup: slots for the recovery words (Sovereign Sign-up 2, Task 4). NOT APPLIED.
-- Gate for Max: apply together with (after) 20260927_passkey_key_backup.sql.
--
-- Additive on top of 20260927_passkey_key_backup.sql (left unchanged): the slot check grows from
-- the three PRF-wrapped secrets to seven values:
--   maci, nostr, salt           the secrets wrapped under the passkey PRF (unchanged)
--   maci_w, nostr_w, salt_w     the same secrets wrapped a second time under the recovery-words
--                               vault key (HKDF of a key derived from the 12 words)
--   wvk                         that vault key, wrapped under the passkey PRF
-- Every row is still CIPHERTEXT ONLY ('pkv1:...'): without the passkey or the 12 words a blob is
-- useless, including to the service role. Access, RLS and grants are unchanged (service role only).
-- No functions are created.

alter table public.passkey_key_backups drop constraint if exists passkey_key_backups_slot_check;

alter table public.passkey_key_backups
  add constraint passkey_key_backups_slot_check
  check (slot in ('maci', 'nostr', 'salt', 'maci_w', 'nostr_w', 'salt_w', 'wvk'));

comment on table public.passkey_key_backups is
  'Wrapped ciphertext of the MACI / Nostr / commitment-salt secrets per identity: under the passkey PRF (maci, nostr, salt), under the recovery-words vault key (maci_w, nostr_w, salt_w), and the vault key under the PRF (wvk). Useless without the passkey or the words. Service role only.';
