-- "Röbel App unterstützen" (Christmas 2026): one row per Stripe Checkout started from /unterstuetzen.
-- Written only by the web backend (service role). The public sees settled rows through
-- app_supporters_public(): the name only when the supporter ticked "öffentlich zeigen", else null
-- (the app shows "Jemand"); the comment only for public supporters.

create table if not exists app_supporters (
  id uuid primary key default gen_random_uuid(),
  amount_cents integer not null check (amount_cents between 100 and 50000),
  interval text not null default 'once' check (interval in ('once', 'month')),
  show_name boolean not null default false,
  display_name text check (char_length(display_name) <= 60),
  message text check (char_length(message) <= 140),
  wallet text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  stripe_checkout_session_id text unique,
  stripe_account_id text,
  livemode boolean,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists app_supporters_paid_idx on app_supporters (paid_at desc) where status = 'paid';

alter table app_supporters enable row level security;
-- No policies: anon/authenticated cannot read or write the table directly.
revoke all on app_supporters from anon, authenticated;

create or replace function app_supporters_public(p_limit integer default 50)
returns table (id uuid, name text, message text, amount_cents integer, "interval" text, paid_at timestamptz, total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         case when s.show_name then s.display_name end as name,
         case when s.show_name then s.message end as message,
         s.amount_cents,
         s.interval,
         s.paid_at,
         count(*) over () as total_count
  from app_supporters s
  where s.status = 'paid'
  order by s.paid_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function app_supporters_public(integer) from public;
grant execute on function app_supporters_public(integer) to anon, authenticated;
