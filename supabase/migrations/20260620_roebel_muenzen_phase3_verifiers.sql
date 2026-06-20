-- Röbel Münzen reward rail (Phase 3): more earn actions. Verifier logic lives in the
-- claim-reward edge function; these are the config rows. Applied via Supabase MCP 2026-06-20.
insert into public.reward_config (action, amount_atto, enabled, per_reference, daily_cap, description) values
  ('checkpoint', 500000000000000000,  true, true, null, 'Explorer-Checkpoint besucht (1x pro Checkpoint)'),
  ('referral',   2000000000000000000, true, true, 10,   'Jemand hat deine Einladung eingelöst (Belohnung für die einladende Person)')
on conflict (action) do nothing;
