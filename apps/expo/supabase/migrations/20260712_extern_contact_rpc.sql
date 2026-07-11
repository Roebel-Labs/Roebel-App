-- Extern XMTP contacts: atomic wallet → messageable personal account.
-- account_owners.wallet_address has an FK into users, so external wallets
-- (no Röbel user) need a stub users row first — done here atomically so the
-- client can't strand orphan accounts on partial failure.
-- Applied to live Supabase 2026-07-12 via MCP (extern_contact_rpc).

create or replace function public.create_extern_contact(p_wallet text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet text := lower(p_wallet);
  v_account uuid;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid wallet address';
  end if;

  -- Existing personal account for this wallet wins (never duplicate).
  select ao.account_id into v_account
  from account_owners ao
  join accounts a on a.id = ao.account_id
  where ao.wallet_address = v_wallet and a.account_type = 'personal'
  limit 1;
  if v_account is not null then
    return v_account;
  end if;

  insert into users (wallet_address)
  values (v_wallet)
  on conflict (wallet_address) do nothing;

  insert into accounts (account_type, name, is_extern)
  values ('personal', 'Externer Kontakt', true)
  returning id into v_account;

  insert into account_owners (account_id, wallet_address, role)
  values (v_account, v_wallet, 'owner');

  return v_account;
end;
$$;

grant execute on function public.create_extern_contact(text) to anon, authenticated;

-- Clean up orphaned extern accounts stranded by the pre-RPC client flow
-- (accounts created but the owner link insert failed on the users FK).
delete from accounts a
where a.is_extern = true
  and a.account_type = 'personal'
  and not exists (select 1 from account_owners ao where ao.account_id = a.id);
