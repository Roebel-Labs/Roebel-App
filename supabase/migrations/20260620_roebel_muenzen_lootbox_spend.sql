-- Röbel Münzen reward rail (Phase 2): spend Münzen on lootbox keys → back to the funder.
-- The user pays the funder on-chain (ERC-1155 transfer); the spend-muenzen edge fn verifies
-- the payment tx and grants the key. Closes the economic loop. Applied via Supabase MCP 2026-06-20.

-- Per-lootbox Münzen price (admin-tunable, atto = 18 dp). NULL = not purchasable with Münzen.
alter table public.lootboxes add column if not exists muenzen_price_atto numeric;

-- Idempotent record of every Münzen spend. unique(tx_hash) = one key per payment tx.
create table if not exists public.muenzen_charges (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null,
  kind          text not null,                 -- 'lootbox_key' (extensible to tips, tickets…)
  reference_id  text,                          -- lootbox id, etc.
  amount_atto   numeric not null,
  tx_hash       text not null unique,          -- the user's payment tx (idempotency spine)
  status        text not null default 'pending', -- pending | settled | rejected
  error         text,
  created_at    timestamptz not null default now(),
  settled_at    timestamptz
);
alter table public.muenzen_charges enable row level security;

-- Grant lootbox keys WITHOUT touching points (the Münzen path already charged on-chain).
-- Service-role only (called by the edge fn after it verifies the payment).
create or replace function public.grant_lootbox_key(p_wallet text, p_lootbox_id uuid, p_count int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_new int;
begin
  insert into public.user_lootbox_keys (wallet_address, lootbox_id, key_count, total_purchased, total_used, updated_at)
  values (p_wallet, p_lootbox_id, p_count, p_count, 0, now())
  on conflict (wallet_address, lootbox_id) do update
    set key_count = user_lootbox_keys.key_count + p_count,
        total_purchased = user_lootbox_keys.total_purchased + p_count,
        updated_at = now()
  returning key_count into v_new;
  return v_new;
end$$;
revoke all on function public.grant_lootbox_key(text, uuid, int) from anon, authenticated;

-- Starting placeholder price (5 Münzen) for currently-published boxes; tune per box anytime.
update public.lootboxes set muenzen_price_atto = 5000000000000000000
where is_published = true and muenzen_price_atto is null;
