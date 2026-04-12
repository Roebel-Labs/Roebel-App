-- 20260420_roebel_card_iban_vault.sql
-- Replace GUC-based IBAN encryption with Supabase Vault.
--
-- The original set_partner_iban / admin_get_partner_iban read the encryption
-- key from the app.roebel_iban_key GUC setting, but Supabase doesn't allow
-- ALTER DATABASE ... SET on hosted projects. The key is now stored in
-- Supabase Vault (vault.create_secret) under the name 'roebel_iban_key'.
--
-- Prerequisite: run once in the SQL Editor:
--   SELECT vault.create_secret('<key>', 'roebel_iban_key', 'IBAN encryption key');

begin;

create extension if not exists pgcrypto;

-- Ensure the bytea column exists (idempotent)
alter table roebel_card_partners
  add column if not exists iban_encrypted_bytea bytea;

-- =============================================================================
-- set_partner_iban — encrypt on write (Vault version)
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
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'roebel_iban_key'
  limit 1;

  if v_key is null or v_key = '' then
    raise exception 'iban_key_missing'
      using hint = 'Create the secret: SELECT vault.create_secret(''<key>'', ''roebel_iban_key'', ''...'');';
  end if;

  if p_iban_plain is null or p_iban_plain = '' then
    raise exception 'iban_required';
  end if;

  update roebel_card_partners
     set iban_encrypted_bytea = pgp_sym_encrypt(p_iban_plain, v_key),
         iban_last4           = right(regexp_replace(p_iban_plain, '\s', '', 'g'), 4),
         iban_encrypted       = null,
         updated_at           = now()
   where id = p_partner_id;
end;
$$;

grant execute on function set_partner_iban(uuid, text) to authenticated, anon;

-- =============================================================================
-- admin_get_partner_iban — decrypt on read (Vault version, service_role only)
-- =============================================================================

create or replace function admin_get_partner_iban(p_partner_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key    text;
  v_cipher bytea;
  v_legacy text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = 'P0009';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'roebel_iban_key'
  limit 1;

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

  return v_legacy;
end;
$$;

grant execute on function admin_get_partner_iban(uuid) to service_role;

commit;
