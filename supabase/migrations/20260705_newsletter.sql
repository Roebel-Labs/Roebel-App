-- Newsletter system: subscribers, issues, per-recipient sends.
-- Access model: RLS enabled with NO policies — service-role only.

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  status text not null default 'pending'
    check (status in ('pending','active','unsubscribed','bounced','complained')),
  source text not null
    check (source in ('signup','import','app_user','admin')),
  wallet_address text,
  confirm_token uuid not null default gen_random_uuid(),
  confirmed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  consent_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists newsletter_subscribers_status_idx on newsletter_subscribers (status);
create index if not exists newsletter_subscribers_confirm_idx on newsletter_subscribers (confirm_token);
create index if not exists newsletter_subscribers_unsub_idx on newsletter_subscribers (unsubscribe_token);

create table if not exists newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '',
  preheader text,
  content_html text not null default '',
  status text not null default 'draft'
    check (status in ('draft','sending','sent','failed')),
  generated_by text not null default 'manual' check (generated_by in ('ai','manual')),
  generation_sources jsonb,
  recipient_count int not null default 0,
  delivered_count int not null default 0,
  opened_count int not null default 0,
  clicked_count int not null default 0,
  bounced_count int not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references newsletter_issues(id) on delete cascade,
  subscriber_id uuid not null references newsletter_subscribers(id) on delete cascade,
  email text not null,
  resend_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','bounced','complained','failed')),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (issue_id, subscriber_id)
);
create index if not exists newsletter_sends_resend_idx on newsletter_sends (resend_id);
create index if not exists newsletter_sends_issue_idx on newsletter_sends (issue_id);

alter table newsletter_subscribers enable row level security;
alter table newsletter_issues enable row level security;
alter table newsletter_sends enable row level security;
-- intentionally no policies

-- Atomic per-issue stat counters (webhook uses this; supabase-js can't do col = col + 1)
create or replace function newsletter_bump_counter(p_issue_id uuid, p_counter text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_counter not in ('delivered_count','opened_count','clicked_count','bounced_count') then
    raise exception 'invalid counter %', p_counter;
  end if;
  execute format(
    'update newsletter_issues set %I = %I + 1, updated_at = now() where id = $1',
    p_counter, p_counter
  ) using p_issue_id;
end $$;

-- AGB auto-enroll: OFF by default; Max flips app_settings.newsletter_auto_enroll to 'on'
-- only after AGB/Datenschutzerklaerung contain the newsletter clause.
insert into app_settings (key, value) values ('newsletter_auto_enroll', 'off')
on conflict (key) do nothing;

create or replace function newsletter_auto_enroll_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or new.email = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email is not distinct from new.email then
    return new;
  end if;
  if (select value from app_settings where key = 'newsletter_auto_enroll') is distinct from 'on' then
    return new;
  end if;
  insert into newsletter_subscribers (email, status, source, wallet_address, confirmed_at, consent_note)
  values (lower(new.email), 'active', 'app_user', new.wallet_address, now(),
          'AGB-Zustimmung bei App-Registrierung')
  on conflict (email) do nothing;
  return new;
end $$;

drop trigger if exists trg_newsletter_auto_enroll on users;
create trigger trg_newsletter_auto_enroll
after insert or update of email on users
for each row execute function newsletter_auto_enroll_user();
