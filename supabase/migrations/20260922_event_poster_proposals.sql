-- Event poster proposals (Plakat-Vorschläge): two AI-proposed DIN-A posters per
-- event, reviewed in the admin dashboard or picked in the submission chats.
-- Spec: docs/superpowers/specs/2026-09-22-event-poster-proposals-design.md
-- Written only through the service role (no RLS policies on purpose).

create table if not exists public.event_poster_proposals (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null,
  event_id         uuid references public.events(id) on delete cascade,
  draft_id         uuid,
  account_id       uuid references public.accounts(id) on delete set null,
  requested_by     text not null check (requested_by in ('admin','org','submitter')),
  mode             text not null check (mode in ('reformat','design')),
  variant          smallint not null check (variant in (1,2)),
  direction        text not null,
  source_image_url text,
  image_url        text not null,
  analysis         jsonb not null default '{}'::jsonb,
  prompt           text not null,
  model            text not null,
  usage            jsonb,
  cost_usd         numeric(8,4),
  status           text not null default 'proposed' check (status in ('proposed','selected','rejected')),
  created_at       timestamptz not null default now(),
  check (event_id is not null or draft_id is not null)
);

create index if not exists idx_event_poster_proposals_event
  on public.event_poster_proposals (event_id, created_at desc);
create index if not exists idx_event_poster_proposals_draft
  on public.event_poster_proposals (draft_id) where draft_id is not null;
create index if not exists idx_event_poster_proposals_batch
  on public.event_poster_proposals (batch_id);
create index if not exists idx_event_poster_proposals_created
  on public.event_poster_proposals (created_at desc);

alter table public.event_poster_proposals enable row level security;
revoke all on public.event_poster_proposals from anon, authenticated;

alter table public.events
  add column if not exists original_image_url text,
  add column if not exists poster_proposal_id uuid references public.event_poster_proposals(id) on delete set null,
  add column if not exists poster_reviewed_at timestamptz,
  add column if not exists poster_checked_at timestamptz,
  add column if not exists poster_check jsonb;

comment on column public.events.original_image_url is 'Image before a poster proposal was applied (set once).';
comment on column public.events.poster_check is 'Last poster analysis: {checkedAt,width,height,ratio,mode,analysis}.';

insert into public.app_settings (key, value)
values ('poster_proposals_enabled', 'true'), ('poster_daily_budget_usd', '20')
on conflict (key) do nothing;
