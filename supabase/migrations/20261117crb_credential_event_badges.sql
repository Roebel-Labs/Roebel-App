-- Credential Register: event badges (plan credreg-4, task 5).
-- Spec: docs/superpowers/specs/2026-11-17-credential-register-design.md (5.5)
--
-- One badge type per event; the org may appoint the node key as delegate so the node issues
-- small badge batches itself while the event runs (auto_badges, last_auto_at). The node key is
-- off until the owner sets credentials_badge_delegate_enabled to 'true' and configures
-- CREDENTIAL_BADGE_DELEGATE_KEY. NOT applied by agents: owner gate through the Supabase MCP.
-- Needs 20261117cra_credential_register.sql first.

ALTER TABLE public.credential_types
  add column if not exists auto_badges boolean not null default false,
  add column if not exists last_auto_at timestamptz;

-- One live badge type per event (a retired one frees the event for a new badge).
create unique index if not exists credential_types_event_badge_uq
  on public.credential_types (event_id)
  where kind = 'badge' and event_id is not null and not retired;

-- Kill switch of the node badge key (missing or anything but 'true' = off).
INSERT INTO public.app_settings (key, value)
VALUES ('credentials_badge_delegate_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
