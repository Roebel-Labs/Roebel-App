-- App Store rejection (Guideline 4): we skip the welcome name step when the
-- user signed in with Apple. Persisting which provider the wallet was
-- created with lets us branch the onboarding flow per-user.
alter table public.users add column if not exists auth_provider text;
