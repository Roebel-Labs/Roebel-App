-- "Für dich" inspiration screen: cards a user marked "Nicht relevant".
-- Server-only (service role via /api/chat/inspiration/*): RLS on, no policies, no client grants.
create table if not exists public.chat_inspiration_dismissals (
  wallet text not null,
  task_id text not null,
  created_at timestamptz not null default now(),
  primary key (wallet, task_id)
);

alter table public.chat_inspiration_dismissals enable row level security;
revoke all on table public.chat_inspiration_dismissals from anon, authenticated;
