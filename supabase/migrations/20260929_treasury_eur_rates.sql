-- Gemeinschaftskasse: one server-side source of truth (GET /api/treasury on apps/web).
-- NOT APPLIED by the branch. Apply before (or together with) the web deploy; the route
-- degrades without it (no persisted day rates, no history links) but stays correct.
--
-- 1) treasury_eur_rates: USD→EUR (= xDAI→EUR) per UTC day, used to value each history
--    row at its own day's rate. Filled lazily by the route from frankfurter's historical
--    endpoint (ECB fixing; weekends resolve to the previous business day, `source` keeps
--    the fixing date). Server-only: RLS on, NO policies, privileges revoked from
--    anon/authenticated; the service role writes it.
--
-- 2) treasury_tx_links: optional link from a treasury tx to where it was decided or
--    announced. Outflows → the proposal (Bürgerumfrage) that decided them; inflows → the
--    post that announced them. Public treasury info: anyone may SELECT, nobody but the
--    service role may write. The route resolves proposal title / first line of the post.
--      tx_hash     lowercase 0x… tx hash (primary key; CHECK enforces lowercase)
--      proposal_id proposals.id (uuid). If set, the row links to the proposal.
--      post_id     posts.id (uuid). Used when proposal_id is null.
--      note        free-text admin note, not shown in the app.
--
-- No functions are created here. Supabase grants EXECUTE on every NEW function to
-- anon/authenticated by default; should one be added later, revoke it explicitly.

create table if not exists public.treasury_eur_rates (
  day         date primary key,
  usd_eur     numeric(12, 8) not null check (usd_eur > 0.5 and usd_eur < 2),
  source      text not null,
  fetched_at  timestamptz not null default now()
);

alter table public.treasury_eur_rates enable row level security;

revoke all on table public.treasury_eur_rates from public, anon, authenticated;
grant select, insert, update, delete on table public.treasury_eur_rates to service_role;

comment on table public.treasury_eur_rates is
  'USD→EUR day rates (ECB via frankfurter) for valuing Gemeinschaftskasse history rows. Service role only; filled lazily by /api/treasury.';

create table if not exists public.treasury_tx_links (
  tx_hash     text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  proposal_id uuid null references public.proposals(id) on delete set null,
  post_id     uuid null references public.posts(id) on delete set null,
  note        text null,
  created_at  timestamptz not null default now()
);

alter table public.treasury_tx_links enable row level security;

revoke all on table public.treasury_tx_links from public, anon, authenticated;
grant select on table public.treasury_tx_links to anon, authenticated;
grant select, insert, update, delete on table public.treasury_tx_links to service_role;

drop policy if exists treasury_tx_links_public_read on public.treasury_tx_links;
create policy treasury_tx_links_public_read
  on public.treasury_tx_links
  for select
  to anon, authenticated
  using (true);

comment on table public.treasury_tx_links is
  'Links a Gemeinschaftskasse tx (lowercase hash) to the proposal that decided it (outflow) or the post that announced it (inflow). Public read, service-role write.';
