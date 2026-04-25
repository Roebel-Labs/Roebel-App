-- DSGVO consent system: current state mirror + immutable audit log.
--
-- Schema:
--   consent_preferences   one row per device, optional wallet linkage. Upserted on every change.
--   consent_audit_log     append-only history of every preference change (Art. 7(1) DSGVO accountability).
--
-- RLS follows the established permissive pattern in 20260418_roebel_card_relax_rls.sql:
-- the anon client has no JWT, so we allow open read + insert and rely on the
-- audit log being append-only (no UPDATE/DELETE policies = service_role only).

CREATE TABLE IF NOT EXISTS public.consent_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       text NOT NULL UNIQUE,
  wallet_address  text REFERENCES public.users(wallet_address) ON DELETE SET NULL,
  preferences     jsonb NOT NULL,
  policy_version  text NOT NULL,
  app_version     text,
  platform        text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_preferences_wallet
  ON public.consent_preferences (wallet_address)
  WHERE wallet_address IS NOT NULL;

ALTER TABLE public.consent_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_preferences_read"
  ON public.consent_preferences FOR SELECT
  USING (true);

CREATE POLICY "consent_preferences_insert"
  ON public.consent_preferences FOR INSERT
  WITH CHECK (true);

CREATE POLICY "consent_preferences_update"
  ON public.consent_preferences FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.consent_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       text NOT NULL,
  wallet_address  text,
  category        text NOT NULL,
  previous_value  boolean,
  new_value       boolean,
  source          text NOT NULL,
  policy_version  text NOT NULL,
  app_version     text,
  platform        text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_audit_device     ON public.consent_audit_log (device_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_wallet     ON public.consent_audit_log (wallet_address) WHERE wallet_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consent_audit_created    ON public.consent_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_audit_category   ON public.consent_audit_log (category);

ALTER TABLE public.consent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_audit_log_read"
  ON public.consent_audit_log FOR SELECT
  USING (true);

CREATE POLICY "consent_audit_log_insert"
  ON public.consent_audit_log FOR INSERT
  WITH CHECK (true);

-- Intentionally no UPDATE / DELETE policies. The audit log is append-only.

COMMENT ON TABLE  public.consent_preferences  IS 'DSGVO consent — current granular preferences per device. Mirrors expo-secure-store on the client.';
COMMENT ON TABLE  public.consent_audit_log    IS 'DSGVO consent — append-only history of every consent change (Art. 7(1) accountability).';
COMMENT ON COLUMN public.consent_audit_log.category IS 'category id, plus pseudo-categories __migration__ and __reconcile__';
COMMENT ON COLUMN public.consent_audit_log.source   IS 'first_launch | customize_screen | reconsent | banner | banner_dismissed | migration | reconcile | welcome_terms';
