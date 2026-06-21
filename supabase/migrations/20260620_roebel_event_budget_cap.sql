-- Anti-Sybil hardening for event_attend rewards (applied via Supabase MCP 2026-06-20).
-- max_rewards: hard ceiling on how many attendees ONE event can pay out (default 500 →
-- 2500 RCRC at 5 each). The claim-reward event_attend verifier rejects once reached.
-- daily_cap caps how many event rewards a single wallet can claim per day.
alter table public.reward_events add column if not exists max_rewards integer default 500;
update public.reward_events set max_rewards = 500 where max_rewards is null;
update public.reward_config set daily_cap = 5, updated_at = now() where action = 'event_attend';
