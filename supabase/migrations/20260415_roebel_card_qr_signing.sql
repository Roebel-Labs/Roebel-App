-- 20260415_roebel_card_qr_signing.sql
-- HMAC-signed card QR payloads + charge creation via server-verified RPC.
--
-- Session 4: QR security hardening.
--
-- Before: the buyer's card QR was the raw card_id. Any screenshot could
-- be replayed indefinitely. Partners inserted charges via an RLS policy
-- that trusted the caller-supplied card_id.
--
-- After: the buyer fetches a signed payload via sign_roebel_card_qr(),
-- which embeds a 60-second expiry and an HMAC computed from the card's
-- qr_secret (already in the schema). The partner scans the payload and
-- submits the FULL string to create_roebel_card_charge_from_qr(), which
-- parses and verifies the HMAC server-side before inserting. The v1
-- INSERT policy is dropped — no more client-trusted inserts.

begin;

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. sign_roebel_card_qr — generate a signed, short-lived QR payload.
--
-- Format: roebel-card:v2:<card_id>:<expires_at_unix_seconds>:<hex_hmac>
-- HMAC input: <card_id>:<expires_at_unix_seconds>
-- Key: roebel_card.qr_secret (stable per-card secret from session 1)
-- =============================================================================

create or replace function sign_roebel_card_qr(p_card_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet    text;
  v_card      roebel_card;
  v_expires   bigint;
  v_message   text;
  v_hmac_hex  text;
begin
  v_wallet := auth.jwt() ->> 'sub';
  if v_wallet is null then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  select * into v_card from roebel_card where id = p_card_id;
  if v_card.id is null then
    raise exception 'karte_nicht_gefunden' using errcode = 'P0005';
  end if;
  if v_card.wallet_address <> v_wallet then
    raise exception 'nicht_berechtigt' using errcode = 'P0006';
  end if;
  if v_card.status <> 'active' then
    raise exception 'karte_nicht_aktiv' using errcode = 'P0007';
  end if;

  v_expires := extract(epoch from (now() + interval '60 seconds'))::bigint;
  v_message := v_card.id::text || ':' || v_expires::text;
  v_hmac_hex := encode(
    hmac(v_message, v_card.qr_secret, 'sha256'),
    'hex'
  );

  return 'roebel-card:v2:' || v_card.id::text || ':' || v_expires::text || ':' || v_hmac_hex;
end;
$$;

grant execute on function sign_roebel_card_qr(uuid) to authenticated;

-- =============================================================================
-- 2. create_roebel_card_charge_from_qr — parse + verify + insert in one shot.
-- =============================================================================

create or replace function create_roebel_card_charge_from_qr(
  p_qr_payload   text,
  p_amount_cents bigint,
  p_partner_note text
)
returns roebel_card_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet       text;
  v_parts        text[];
  v_card_id      uuid;
  v_expires_unix bigint;
  v_claimed_hmac text;
  v_card         roebel_card;
  v_partner      roebel_card_partners;
  v_expected_msg text;
  v_expected_hex text;
  v_new_charge   roebel_card_charges;
begin
  v_wallet := auth.jwt() ->> 'sub';
  if v_wallet is null then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'betrag_ungueltig' using errcode = 'P0010';
  end if;
  if p_amount_cents > 1000000 then
    raise exception 'betrag_zu_hoch' using errcode = 'P0011';
  end if;

  -- Parse: roebel-card:v2:<uuid>:<expires>:<hex>
  v_parts := string_to_array(p_qr_payload, ':');
  if array_length(v_parts, 1) <> 5
     or v_parts[1] <> 'roebel-card'
     or v_parts[2] <> 'v2' then
    raise exception 'qr_ungueltig' using errcode = 'P0012';
  end if;

  begin
    v_card_id := v_parts[3]::uuid;
    v_expires_unix := v_parts[4]::bigint;
  exception when others then
    raise exception 'qr_ungueltig' using errcode = 'P0012';
  end;
  v_claimed_hmac := v_parts[5];

  -- Validate the card exists and is active.
  select * into v_card from roebel_card where id = v_card_id;
  if v_card.id is null then
    raise exception 'karte_nicht_gefunden' using errcode = 'P0005';
  end if;
  if v_card.status <> 'active' then
    raise exception 'karte_nicht_aktiv' using errcode = 'P0007';
  end if;

  -- Validate HMAC.
  v_expected_msg := v_card.id::text || ':' || v_expires_unix::text;
  v_expected_hex := encode(
    hmac(v_expected_msg, v_card.qr_secret, 'sha256'),
    'hex'
  );
  if v_expected_hex <> v_claimed_hmac then
    raise exception 'qr_signatur_ungueltig' using errcode = 'P0013';
  end if;

  -- Validate expiry.
  if to_timestamp(v_expires_unix) < now() then
    raise exception 'qr_abgelaufen' using errcode = 'P0014';
  end if;

  -- Validate caller is an approved partner.
  select p.* into v_partner
  from roebel_card_partners p
  where p.status = 'approved'
    and p.account_id in (
      select ao.account_id
      from account_owners ao
      where ao.wallet_address = v_wallet
    )
  limit 1;

  if v_partner.id is null then
    raise exception 'partner_nicht_freigeschaltet' using errcode = 'P0015';
  end if;

  -- Insert the pending charge.
  insert into roebel_card_charges (
    card_id,
    partner_id,
    amount_cents,
    partner_note,
    status
  ) values (
    v_card.id,
    v_partner.id,
    p_amount_cents,
    nullif(trim(p_partner_note), ''),
    'pending'
  )
  returning * into v_new_charge;

  return v_new_charge;
end;
$$;

grant execute on function create_roebel_card_charge_from_qr(text, bigint, text) to authenticated;

-- =============================================================================
-- 3. Drop the session 3 INSERT policy — all charge creation now flows
--    through the server-verified RPC above.
-- =============================================================================

drop policy if exists "roebel_card_charges: partner insert" on roebel_card_charges;

commit;
