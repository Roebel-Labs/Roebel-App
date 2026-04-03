-- ============================================================
-- MIGRATION 3: Organizations (Vereine, Parteien, Fraktionen)
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  org_type TEXT NOT NULL CHECK (org_type IN ('business', 'verein', 'partei', 'fraktion')),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  member_count INTEGER NOT NULL DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  admin_wallet_addresses TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_type ON organizations(org_type);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read orgs" ON organizations
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage orgs" ON organizations
  FOR ALL USING (true);
