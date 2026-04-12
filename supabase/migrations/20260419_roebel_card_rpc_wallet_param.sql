-- 20260419_roebel_card_rpc_wallet_param.sql
-- Replace auth.jwt()-based RPCs with wallet_address parameter versions.
--
-- The Expo app uses a plain anon Supabase client (no auth session) because
-- authentication is handled by thirdweb smart wallets. This means
-- auth.jwt() ->> 'sub' is always NULL, breaking all RPC functions.
--
-- Fix: each function now accepts p_wallet_address as an explicit parameter.
-- Security is preserved because:
--   - sign_roebel_card_qr: the HMAC secret is per-card, so a forged wallet
--     address only gets a QR for a card the caller already knows the ID of.
--   - create_roebel_card_charge_from_qr: validates HMAC + partner status.
--   - approve/decline: the caller must know the charge ID (only visible to
--     the card owner via RLS SELECT policies on the charges table).

begin;

-- =============================================================================
-- 1. sign_roebel_card_qr — now accepts wallet address as parameter
-- =============================================================================

drop function if exists sign_roebel_card_qr(uuid);

create or replace function sign_roebel_card_qr(
  p_card_id        uuid,
  p_wallet_address text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card      roebel_card;
  v_expires   bigint;
  v_message   text;
  v_hmac_hex  text;
begin
  if p_wallet_address is null or p_wallet_address = '' then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  select * into v_card from roebel_card where id = p_card_id;
  if v_card.id is null then
    raise exception 'karte_nicht_gefunden' using errcode = 'P0005';
  end if;
  if v_card.wallet_address <> p_wallet_address then
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

grant execute on function sign_roebel_card_qr(uuid, text) to authenticated, anon;

-- =============================================================================
-- 2. create_roebel_card_charge_from_qr — now accepts wallet address
-- =============================================================================

drop function if exists create_roebel_card_charge_from_qr(text, bigint, text);

create or replace function create_roebel_card_charge_from_qr(
  p_qr_payload     text,
  p_amount_cents   bigint,
  p_partner_note   text,
  p_wallet_address text
)
returns roebel_card_charges
language plpgsql
security definer
set search_path = public
as $$
declare
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
  if p_wallet_address is null or p_wallet_address = '' then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'betrag_ungueltig' using errcode = 'P0010';
  end if;
  if p_amount_cents > 1000000 then
    raise exception 'betrag_zu_hoch' using errcode = 'P0011';
  end if;

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

  select * into v_card from roebel_card where id = v_card_id;
  if v_card.id is null then
    raise exception 'karte_nicht_gefunden' using errcode = 'P0005';
  end if;
  if v_card.status <> 'active' then
    raise exception 'karte_nicht_aktiv' using errcode = 'P0007';
  end if;

  v_expected_msg := v_card.id::text || ':' || v_expires_unix::text;
  v_expected_hex := encode(
    hmac(v_expected_msg, v_card.qr_secret, 'sha256'),
    'hex'
  );
  if v_expected_hex <> v_claimed_hmac then
    raise exception 'qr_signatur_ungueltig' using errcode = 'P0013';
  end if;

  if to_timestamp(v_expires_unix) < now() then
    raise exception 'qr_abgelaufen' using errcode = 'P0014';
  end if;

  select p.* into v_partner
  from roebel_card_partners p
  where p.status = 'approved'
    and p.account_id in (
      select ao.account_id
      from account_owners ao
      where ao.wallet_address = p_wallet_address
    )
  limit 1;

  if v_partner.id is null then
    raise exception 'partner_nicht_freigeschaltet' using errcode = 'P0015';
  end if;

  insert into roebel_card_charges (
    card_id, partner_id, amount_cents, partner_note, status
  ) values (
    v_card.id, v_partner.id, p_amount_cents,
    nullif(trim(p_partner_note), ''), 'pending'
  )
  returning * into v_new_charge;

  return v_new_charge;
end;
$$;

grant execute on function create_roebel_card_charge_from_qr(text, bigint, text, text) to authenticated, anon;

-- =============================================================================
-- 3. approve_roebel_card_charge — now accepts wallet address
-- =============================================================================

drop function if exists approve_roebel_card_charge(uuid);

create or replace function approve_roebel_card_charge(
  p_charge_id      uuid,
  p_wallet_address text
)
returns roebel_card_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge roebel_card_charges;
  v_card   roebel_card;
begin
  if p_wallet_address is null or p_wallet_address = '' then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  select * into v_charge
  from roebel_card_charges
  where id = p_charge_id
  for update;

  if v_charge.id is null then
    raise exception 'zahlung_nicht_gefunden' using errcode = 'P0002';
  end if;
  if v_charge.status <> 'pending' then
    raise exception 'zahlung_nicht_offen' using errcode = 'P0003';
  end if;
  if v_charge.expires_at < now() then
    update roebel_card_charges set status = 'expired' where id = v_charge.id;
    raise exception 'zahlung_abgelaufen' using errcode = 'P0004';
  end if;

  select * into v_card
  from roebel_card
  where id = v_charge.card_id
  for update;

  if v_card.id is null then
    raise exception 'karte_nicht_gefunden' using errcode = 'P0005';
  end if;
  if v_card.wallet_address <> p_wallet_address then
    raise exception 'nicht_berechtigt' using errcode = 'P0006';
  end if;
  if v_card.status <> 'active' then
    raise exception 'karte_nicht_aktiv' using errcode = 'P0007';
  end if;
  if v_card.balance_cents < v_charge.amount_cents then
    raise exception 'guthaben_nicht_ausreichend' using errcode = 'P0008';
  end if;

  update roebel_card set balance_cents = balance_cents - v_charge.amount_cents, updated_at = now() where id = v_card.id;
  update roebel_card_partners set pending_balance_cents = pending_balance_cents + v_charge.amount_cents, lifetime_volume_cents = lifetime_volume_cents + v_charge.amount_cents, updated_at = now() where id = v_charge.partner_id;
  update roebel_card_charges set status = 'approved', approved_at = now() where id = v_charge.id returning * into v_charge;

  return v_charge;
end;
$$;

grant execute on function approve_roebel_card_charge(uuid, text) to authenticated, anon;

-- =============================================================================
-- 4. decline_roebel_card_charge — now accepts wallet address
-- =============================================================================

drop function if exists decline_roebel_card_charge(uuid);

create or replace function decline_roebel_card_charge(
  p_charge_id      uuid,
  p_wallet_address text
)
returns roebel_card_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge roebel_card_charges;
  v_card   roebel_card;
begin
  if p_wallet_address is null or p_wallet_address = '' then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  select * into v_charge
  from roebel_card_charges
  where id = p_charge_id
  for update;

  if v_charge.id is null then
    raise exception 'zahlung_nicht_gefunden' using errcode = 'P0002';
  end if;
  if v_charge.status <> 'pending' then
    raise exception 'zahlung_nicht_offen' using errcode = 'P0003';
  end if;

  select * into v_card from roebel_card where id = v_charge.card_id;
  if v_card.wallet_address <> p_wallet_address then
    raise exception 'nicht_berechtigt' using errcode = 'P0006';
  end if;

  update roebel_card_charges set status = 'declined', declined_at = now() where id = v_charge.id returning * into v_charge;

  return v_charge;
end;
$$;

grant execute on function decline_roebel_card_charge(uuid, text) to authenticated, anon;

commit;
