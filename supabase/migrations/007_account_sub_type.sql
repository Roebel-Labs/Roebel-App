-- 007: Add sub_type to accounts, simplify account_type to personal/organisation
-- Also add account_id to marketplace_listings for org-scoped listings

-- 1. Add sub_type column
ALTER TABLE accounts ADD COLUMN sub_type TEXT
  CHECK (sub_type IN ('restaurant', 'unternehmen', 'verein', 'partei', 'fraktion'));

-- 2. Backfill sub_type from current account_type for all non-personal accounts
UPDATE accounts SET sub_type = account_type WHERE account_type != 'personal';

-- 3. Backfill restaurants (currently stored as account_type = 'unternehmen')
UPDATE accounts a SET sub_type = 'restaurant'
FROM restaurants r WHERE r.account_id = a.id;

-- 4. Drop old CHECK constraint BEFORE updating values
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

-- 5. Collapse all non-personal account_types to 'organisation'
UPDATE accounts SET account_type = 'organisation' WHERE account_type != 'personal';

-- 6. Add new CHECK constraint
ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check
  CHECK (account_type IN ('personal', 'organisation'));

-- 7. Index on sub_type
CREATE INDEX IF NOT EXISTS idx_accounts_sub_type ON accounts USING btree (sub_type);

-- 8. Add account_id to marketplace_listings for org-scoped product/service listings
ALTER TABLE marketplace_listings ADD COLUMN account_id UUID REFERENCES accounts(id);
CREATE INDEX IF NOT EXISTS idx_marketplace_account ON marketplace_listings USING btree (account_id);
