-- Mini-app shared collections ("rows") — data that many people write to: bookings,
-- sign-ups, check-ins, votes. Reached only through /api/mini-apps/rows (sdk.data.collection).
--
--   scope 'shared'  — every user of the app reads every row's `data`; `private_data` only
--                     the row's author and the app's owner.
--   scope 'private' — only the author reads and writes their rows.
--
-- `key` is optional and unique within a collection (per author for 'private'), so a slot
-- like 'raum1|2026-12-01|14:00' can be booked only once — the database decides, not the app.

create table if not exists public.mini_app_rows (
  id            uuid primary key default gen_random_uuid(),
  mini_app_id   uuid not null references public.mini_apps(id) on delete cascade,
  collection    text not null check (collection ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  scope         text not null check (scope in ('shared', 'private')),
  owner_wallet  text not null check (owner_wallet = lower(owner_wallet)),
  key           text check (key is null or (length(key) between 1 and 120)),
  data          jsonb not null default '{}'::jsonb,
  private_data  jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists mini_app_rows_key_idx
  on public.mini_app_rows (
    mini_app_id, scope, collection,
    (case when scope = 'private' then owner_wallet else '' end),
    key
  )
  where key is not null;

create index if not exists mini_app_rows_list_idx
  on public.mini_app_rows (mini_app_id, scope, collection, created_at desc);

create index if not exists mini_app_rows_owner_idx
  on public.mini_app_rows (mini_app_id, scope, collection, owner_wallet);

-- Service role only: the API enforces scope, authorship, quotas and the owner view.
alter table public.mini_app_rows enable row level security;
revoke all on public.mini_app_rows from anon, authenticated;
