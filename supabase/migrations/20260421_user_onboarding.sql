-- User onboarding + terms consent flags
-- Added for the Mecky onboarding wizard + AGB/Datenschutz consent re-prompt logic.

alter table public.users
  add column if not exists preferred_role text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.users.preferred_role is
  'User-selected role during onboarding: ''buerger'' | ''tourist''. Informational; does not affect the verified tier.';
comment on column public.users.onboarding_completed_at is
  'When the user finished (or dismissed) the Mecky onboarding wizard. Null = wizard has never completed.';
comment on column public.users.terms_accepted_at is
  'When the user accepted AGB + Datenschutz. Null = consent not yet given; app re-prompts on every launch until set.';
