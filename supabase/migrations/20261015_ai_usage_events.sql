-- AI usage ledger (KI-Kosten / burn rate): one row per paid AI call made by
-- apps/web (incl. the Expo proxy routes) and the Supabase edge functions.
-- chat_runs and event_poster_proposals keep their own cost columns; the
-- /admin/dashboard/ki-kosten page reads all three.
-- Written only through the service role (no RLS policies on purpose).

create table if not exists public.ai_usage_events (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  -- where the call ran: 'web' (Next.js), 'expo' (Expo traffic via a web proxy), 'edge' (Supabase function)
  source         text not null check (source in ('web','expo','edge')),
  -- what it was for, e.g. 'mecky.chat', 'newsletter.draft', 'moderation'
  feature        text not null,
  provider       text not null,
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  -- non-token billing units (images, TTS characters, audio seconds, web searches)
  units          numeric not null default 0,
  unit_type      text,
  -- estimated cost in micro-USD (1e-6 $)
  cost_micros    bigint not null default 0,
  meta           jsonb
);

create index if not exists idx_ai_usage_events_created
  on public.ai_usage_events (created_at desc);

alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon, authenticated;
