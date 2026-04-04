-- ============================================================
-- MIGRATION 4: Alter users and businesses tables
-- ============================================================

-- Users: add app_mode and org_id
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_mode TEXT DEFAULT 'tourist';
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Businesses: add Röbel Card partner fields
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_roebel_partner BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS partner_since TIMESTAMPTZ;
