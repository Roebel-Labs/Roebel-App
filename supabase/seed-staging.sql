-- =============================================================================
-- seed-staging.sql  —  STAGING ONLY. NEVER run against production.
-- =============================================================================
-- Loads a small amount of throwaway test data so the shared `roebel-staging`
-- backend isn't empty for contributors. Contains NO PII and NO real user data.
--
-- Safety properties:
--   * ARMED GUARD — this script REFUSES to run unless the DB has been explicitly
--     marked as staging (app_settings.roebel_env = 'staging'). Running it against
--     any un-marked DB (e.g. production) raises an exception and changes nothing.
--   * IDEMPOTENT — safe to re-run; uses fixed keys / ids + ON CONFLICT.
--   * EXISTENCE-GUARDED — skips any table that doesn't exist in this DB, so a
--     schema mismatch can't error the whole script.
--   * NON-DESTRUCTIVE — only inserts sample rows; never updates/deletes real data.
--
-- Usage (see docs/STAGING_ENVIRONMENT.md):
--   STEP 0 — arm this DB as staging (run ONCE, manually, against staging only):
--       insert into app_settings (key, value) values ('roebel_env', 'staging')
--       on conflict (key) do update set value = 'staging', updated_at = now();
--   STEP 1 — run this file against the staging project.
-- =============================================================================

DO $$
DECLARE
  v_env text;
BEGIN
  -- ---- Guard: only proceed on an explicitly-armed staging DB --------------
  IF to_regclass('public.app_settings') IS NULL THEN
    RAISE NOTICE 'app_settings table missing — apply migrations before seeding. Skipping.';
    RETURN;
  END IF;

  SELECT value INTO v_env FROM public.app_settings WHERE key = 'roebel_env';
  IF v_env IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION
      'Refusing to seed: app_settings.roebel_env = %, expected ''staging''. Arm the DB first (STEP 0 in the header). This guard protects production.',
      COALESCE(quote_literal(v_env), '<unset>');
  END IF;

  RAISE NOTICE 'Staging DB confirmed (roebel_env = staging). Seeding sample data...';

  -- ---- 1. Welcome announcement (visible in-app so staging looks alive) ----
  IF to_regclass('public.announcements') IS NOT NULL THEN
    INSERT INTO public.announcements (id, title, description, cta_label, is_active, priority, show_once)
    VALUES (
      'aaaaaaaa-0000-4000-8000-000000000001',
      'Willkommen in der Staging-Umgebung',
      'Dies ist die Test-/Staging-Instanz der Röbel App. Alle Daten hier sind Testdaten und können jederzeit zurückgesetzt werden.',
      'Alles klar',
      true,
      100,
      false
    )
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE '  + announcements: welcome row ensured';
  ELSE
    RAISE NOTICE '  - announcements table absent, skipped';
  END IF;

  -- ---- 2. Helpful staging flags (unknown keys are ignored by the app) -----
  INSERT INTO public.app_settings (key, value) VALUES
    ('staging_banner_text', 'STAGING — Testumgebung, keine echten Daten')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RAISE NOTICE '  + app_settings: staging_banner_text ensured';

END$$;

-- =============================================================================
-- OPTIONAL — richer content (feed posts, events, sample proposals).
-- The base `posts` / `events` tables are NOT defined in the repo migration dirs
-- (they were created outside them), so their exact columns must be read from the
-- LIVE staging schema before seeding. Add guarded blocks here once connected,
-- following the same pattern:
--
--   DO $$
--   BEGIN
--     IF to_regclass('public.posts') IS NOT NULL
--        AND (SELECT value FROM public.app_settings WHERE key = 'roebel_env') = 'staging'
--     THEN
--       INSERT INTO public.posts (...columns from live schema...) VALUES (...)
--       ON CONFLICT (id) DO NOTHING;
--     END IF;
--   END$$;
--
-- Keep every block armed (roebel_env = 'staging') and idempotent.
-- =============================================================================
