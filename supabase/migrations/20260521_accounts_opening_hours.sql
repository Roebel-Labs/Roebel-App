-- ============================================================
-- MIGRATION: Universal accounts.opening_hours for all org sub_types
-- ============================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_hours JSONB;
