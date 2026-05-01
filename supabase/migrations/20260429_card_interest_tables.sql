-- 20260429_card_interest_tables.sql
-- Lead-capture tables for the Röbel Card landing page (/roebel-card).
-- Two separate tables so the citizen flow can stay light (e-mail + PLZ)
-- while the merchant flow collects the full set of contact fields.
-- A SECURITY DEFINER RPC exposes counts to anonymous visitors for the
-- social-proof counter without leaking any row-level data.

begin;

create table if not exists card_interest (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  plz         text not null,
  first_name  text,
  source      text not null default 'roebel-card-landing',
  created_at  timestamptz not null default now(),
  unique (email)
);

create table if not exists merchant_interest (
  id            uuid primary key default gen_random_uuid(),
  contact_name  text not null,
  business_name text not null,
  address       text not null,
  phone         text not null,
  email         text not null,
  branche       text not null,
  source        text not null default 'roebel-card-landing',
  created_at    timestamptz not null default now(),
  unique (email)
);

create index if not exists idx_card_interest_created_at      on card_interest(created_at desc);
create index if not exists idx_merchant_interest_created_at  on merchant_interest(created_at desc);

-- RLS: locked down. Inserts go through the service-role client used by the
-- server actions; we deliberately do NOT add a public insert policy so
-- nothing can be written from the browser directly.
alter table card_interest     enable row level security;
alter table merchant_interest enable row level security;

-- Aggregate counts via a SECURITY DEFINER function so anon can read totals
-- without being able to list any row.
create or replace function get_card_interest_counts()
returns table (citizens bigint, merchants bigint)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from card_interest)     as citizens,
    (select count(*) from merchant_interest) as merchants;
$$;

revoke all on function get_card_interest_counts() from public;
grant execute on function get_card_interest_counts() to anon, authenticated;

commit;
