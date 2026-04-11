-- 20260413_roebel_card_charge_rpc.sql
-- Charge creation + atomic approval/decline for the Röbel Card voucher flow.
--
-- Session 3: end-to-end charge flow.
--
-- Adds:
--   1. INSERT policy on roebel_card_charges so approved partners can create
--      pending charges against a buyer's card.
--   2. approve_roebel_card_charge(p_charge_id) — atomic debit-and-credit.
--   3. decline_roebel_card_charge(p_charge_id) — simple status flip.
--
-- Both RPCs run as SECURITY DEFINER so they can bypass the
-- default-deny RLS policies for money-moving writes. Every RPC verifies
-- the caller's wallet (auth.jwt()->>'sub') matches the card owner
-- before making any change.

begin;

-- =============================================================================
-- 1. Partner-side INSERT policy for pending charges.
-- =============================================================================

create policy "roebel_card_charges: partner insert" on roebel_card_charges
  for insert
  with check (
    -- Only approved partners owned by the caller's wallet may insert.
    partner_id in (
      select p.id
      from roebel_card_partners p
      where p.status = 'approved'
        and p.account_id in (
          select ao.account_id
          from account_owners ao
          where ao.wallet_address = (auth.jwt()->>'sub')
        )
    )
    -- The inserted row must start as 'pending'.
    and status = 'pending'
    -- The targeted card must still be active (cheap guard — full balance
    -- check happens at approval time).
    and card_id in (
      select c.id from roebel_card c where c.status = 'active'
    )
  );

-- =============================================================================
-- 2. approve_roebel_card_charge — atomic balance debit + partner credit.
-- =============================================================================

create or replace function approve_roebel_card_charge(p_charge_id uuid)
returns roebel_card_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet      text;
  v_charge      roebel_card_charges;
  v_card        roebel_card;
begin
  v_wallet := auth.jwt() ->> 'sub';
  if v_wallet is null then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  -- Lock the charge row. Any concurrent approve/decline must wait.
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
    -- Auto-mark expired on read and bail out.
    update roebel_card_charges
       set status = 'expired'
     where id = v_charge.id;
    raise exception 'zahlung_abgelaufen' using errcode = 'P0004';
  end if;

  -- Lock the card row so balance can be debited atomically.
  select * into v_card
  from roebel_card
  where id = v_charge.card_id
  for update;

  if v_card.id is null then
    raise exception 'karte_nicht_gefunden' using errcode = 'P0005';
  end if;

  if v_card.wallet_address <> v_wallet then
    raise exception 'nicht_berechtigt' using errcode = 'P0006';
  end if;

  if v_card.status <> 'active' then
    raise exception 'karte_nicht_aktiv' using errcode = 'P0007';
  end if;

  if v_card.balance_cents < v_charge.amount_cents then
    raise exception 'guthaben_nicht_ausreichend' using errcode = 'P0008';
  end if;

  -- Debit buyer balance.
  update roebel_card
     set balance_cents = balance_cents - v_charge.amount_cents,
         updated_at    = now()
   where id = v_card.id;

  -- Credit partner pending balance + lifetime volume.
  update roebel_card_partners
     set pending_balance_cents = pending_balance_cents + v_charge.amount_cents,
         lifetime_volume_cents = lifetime_volume_cents + v_charge.amount_cents,
         updated_at            = now()
   where id = v_charge.partner_id;

  -- Flip charge status last so any earlier failure rolls back cleanly.
  update roebel_card_charges
     set status      = 'approved',
         approved_at = now()
   where id = v_charge.id
  returning * into v_charge;

  return v_charge;
end;
$$;

grant execute on function approve_roebel_card_charge(uuid) to authenticated;

-- =============================================================================
-- 3. decline_roebel_card_charge — simple status flip, no money moves.
-- =============================================================================

create or replace function decline_roebel_card_charge(p_charge_id uuid)
returns roebel_card_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet  text;
  v_charge  roebel_card_charges;
  v_card    roebel_card;
begin
  v_wallet := auth.jwt() ->> 'sub';
  if v_wallet is null then
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

  select * into v_card
  from roebel_card
  where id = v_charge.card_id;

  if v_card.wallet_address <> v_wallet then
    raise exception 'nicht_berechtigt' using errcode = 'P0006';
  end if;

  update roebel_card_charges
     set status      = 'declined',
         declined_at = now()
   where id = v_charge.id
  returning * into v_charge;

  return v_charge;
end;
$$;

grant execute on function decline_roebel_card_charge(uuid) to authenticated;

commit;
