-- APPLIED to production 2026-11-21 via the Supabase MCP (migration name lock_passkey_session_keys_flag).
-- Security review H-1: app_settings is writable by anon/authenticated for every key except
-- newsletter_auto_enroll. The device-session kill switch must only be writable by the service role.
alter policy app_settings_insert on public.app_settings
  with check (key not in ('newsletter_auto_enroll', 'passkey_session_keys_enabled'));
alter policy app_settings_update on public.app_settings
  using (key not in ('newsletter_auto_enroll', 'passkey_session_keys_enabled'))
  with check (key not in ('newsletter_auto_enroll', 'passkey_session_keys_enabled'));
insert into public.app_settings (key, value) values ('passkey_session_keys_enabled', 'false')
  on conflict (key) do nothing;
