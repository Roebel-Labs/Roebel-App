-- 20260416_roebel_card_employee_claim.sql
-- Employee claim flow (in-app, no web landing page needed).
--
-- Session 4: Sachbezug finalisation.
--
-- Flow:
--   1. Employer adds an employee → session 2 migration creates a
--      roebel_card row with wallet_address = 'pending:<invite_code>'
--      and a roebel_card_employees row with status = 'invited'.
--   2. Employer shares the ROEB-XXXX-XXXX code.
--   3. Employee enters the code in the app's claim screen → calls this
--      RPC → card is reassigned to their real wallet, employee row is
--      activated, and they are added to the employer's org as a
--      `member` so the org shows up in their account switcher.
--
-- The RPC is idempotent on the account_owners insert (ON CONFLICT DO
-- NOTHING) and validates that:
--   - The invite code matches an employee row with status='invited'.
--   - The caller is authenticated (auth.jwt()->>'sub').
--   - The caller hasn't already claimed a different pending card with
--     the same invite code (covers multi-device accidental double-tap).

begin;

create or replace function claim_roebel_card_employee_invite(
  p_invite_code text
)
returns roebel_card_employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet   text;
  v_employee roebel_card_employees;
begin
  v_wallet := auth.jwt() ->> 'sub';
  if v_wallet is null then
    raise exception 'nicht_authentifiziert' using errcode = 'P0001';
  end if;

  if p_invite_code is null or length(trim(p_invite_code)) = 0 then
    raise exception 'code_erforderlich' using errcode = 'P0020';
  end if;

  -- Lock the employee row for the duration of the transaction.
  select * into v_employee
  from roebel_card_employees
  where invite_code = upper(trim(p_invite_code))
  for update;

  if v_employee.id is null then
    raise exception 'einladung_nicht_gefunden' using errcode = 'P0021';
  end if;

  if v_employee.status = 'deactivated' then
    raise exception 'einladung_deaktiviert' using errcode = 'P0022';
  end if;

  if v_employee.status = 'active' then
    -- Already claimed. If the claiming wallet matches the existing one,
    -- return the row idempotently so the client can just show the card.
    if v_employee.employee_wallet_address = v_wallet then
      return v_employee;
    end if;
    raise exception 'einladung_bereits_eingeloest' using errcode = 'P0023';
  end if;

  -- Reassign the card to the real wallet and activate the employee row.
  update roebel_card
     set wallet_address = v_wallet,
         updated_at     = now()
   where id = v_employee.card_id;

  update roebel_card_employees
     set employee_wallet_address = v_wallet,
         status                  = 'active',
         activated_at            = now()
   where id = v_employee.id
  returning * into v_employee;

  -- Link the employee to the employer org as a regular member so the org
  -- shows up in their account switcher. The account_owners role enum
  -- from session 1 allows 'owner' / 'admin' / 'member' — we use 'member'
  -- since there's no dedicated 'employee' role yet.
  insert into account_owners (account_id, wallet_address, role)
  values (v_employee.employer_account_id, v_wallet, 'member')
  on conflict do nothing;

  return v_employee;
end;
$$;

grant execute on function claim_roebel_card_employee_invite(text) to authenticated;

commit;
