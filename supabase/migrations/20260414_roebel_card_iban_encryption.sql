-- 20260414_roebel_card_iban_encryption.sql
-- Server-side symmetric encryption for partner IBANs using pgcrypto.
--
-- Session 4: IBAN hardening.
--
-- The session 2 migration added `iban_encrypted TEXT` but stored the IBAN
-- as plaintext (the column name was aspirational). This migration fixes
-- that by:
--   1. Adding a new `iban_encrypted_bytea` column that stores
--      pgp_sym_encrypt() output.
--   2. Adding set_partner_iban(partner_id, iban_plain) — encrypts with a
--      key read from the `app.roebel_iban_key` Postgres setting.
--   3. Adding admin_get_partner_iban(partner_id) — decrypts using the
--      same GUC key, gated on the caller being the service_role so only
--      the admin backend (using the service role key) can read plaintext.
--
-- Key setup (one-time, run once in the Supabase SQL editor):
--
--     alter database postgres set app.roebel_iban_key
--       = '<long random secret, store it in your password manager>';
--
-- Rotate the key by re-encrypting all rows with the new key inside a
-- transaction. Keep the old key around long enough to re-encrypt every
-- existing row.
--
-- The legacy `iban_encrypted TEXT` column is kept for backward compat so
-- existing rows (session 2 plaintext inserts) don't break — but new writes
-- must set it to NULL. A later migration can drop it once all rows are
-- migrated to the bytea column.

begin;

create extension if not exists pgcrypto;

alter table roebel_card_partners
  add column iban_encrypted_bytea bytea;

-- =============================================================================
-- set_partner_iban — encrypt on write
-- =============================================================================

create or replace function set_partner_iban(
  p_partner_id uuid,
  p_iban_plain text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  v_key := current_setting('app.roebel_iban_key', true);
  if v_key is null or v_key = '' then
    raise exception 'iban_key_missing'
      using hint = 'Set app.roebel_iban_key via alter database ... set app.roebel_iban_key = ''...'';';
  end if;

  if p_iban_plain is null or p_iban_plain = '' then
    raise exception 'iban_required';
  end if;

  update roebel_card_partners
     set iban_encrypted_bytea = pgp_sym_encrypt(p_iban_plain, v_key),
         iban_last4           = right(regexp_replace(p_iban_plain, '\s', '', 'g'), 4),
         -- Null out the legacy plaintext column so session 2 inserts get
         -- cleaned up automatically the next time a partner re-submits.
         iban_encrypted       = null,
         updated_at           = now()
   where id = p_partner_id;
end;
$$;

grant execute on function set_partner_iban(uuid, text) to authenticated;

-- =============================================================================
-- admin_get_partner_iban — decrypt on read (service_role only)
-- =============================================================================

create or replace function admin_get_partner_iban(p_partner_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key  text;
  v_cipher bytea;
  v_legacy text;
begin
  -- Only the admin backend (using the Supabase service_role key) should
  -- ever be able to decrypt an IBAN.
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = 'P0009';
  end if;

  v_key := current_setting('app.roebel_iban_key', true);
  if v_key is null or v_key = '' then
    raise exception 'iban_key_missing';
  end if;

  select iban_encrypted_bytea, iban_encrypted
    into v_cipher, v_legacy
  from roebel_card_partners
  where id = p_partner_id;

  if v_cipher is not null then
    return pgp_sym_decrypt(v_cipher, v_key);
  end if;

  -- Fallback: session 2 rows with plaintext in iban_encrypted. Returned
  -- as-is so the admin dashboard can still process historic registrations.
  return v_legacy;
end;
$$;

grant execute on function admin_get_partner_iban(uuid) to service_role;

commit;
