-- ============================================================
-- MIGRATION: Rename org sub_type 'partei' → 'stadt'
-- ============================================================

-- (a) Drop the old CHECK constraint first so the data update is allowed
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_sub_type_check;

-- (b) Move existing data
UPDATE accounts SET sub_type = 'stadt' WHERE sub_type = 'partei';

-- (c) Re-add the constraint with the new value list
ALTER TABLE accounts ADD CONSTRAINT accounts_sub_type_check
  CHECK (sub_type IS NULL OR sub_type IN (
    'restaurant','unternehmen','verein','stadt','fraktion','journalist'
  ));

-- (d) Same reorder for the legacy organizations table
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_org_type_check;
UPDATE organizations SET org_type = 'stadt' WHERE org_type = 'partei';
ALTER TABLE organizations ADD CONSTRAINT organizations_org_type_check
  CHECK (org_type IN ('business', 'verein', 'stadt', 'fraktion'));
