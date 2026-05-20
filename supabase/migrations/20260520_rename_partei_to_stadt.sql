-- ============================================================
-- MIGRATION: Rename org sub_type 'partei' → 'stadt'
-- ============================================================

-- (a) Update existing data first
UPDATE accounts SET sub_type = 'stadt' WHERE sub_type = 'partei';

-- (b) Replace the CHECK constraint on accounts.sub_type
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_sub_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_sub_type_check
  CHECK (sub_type IS NULL OR sub_type IN (
    'restaurant','unternehmen','verein','stadt','fraktion','journalist'
  ));

-- (c) Legacy organizations table from migration 003 (kept consistent)
UPDATE organizations SET org_type = 'stadt' WHERE org_type = 'partei';
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_org_type_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_org_type_check
  CHECK (org_type IN ('business', 'verein', 'stadt', 'fraktion'));
