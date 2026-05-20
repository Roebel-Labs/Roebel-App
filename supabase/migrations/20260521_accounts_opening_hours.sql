-- ============================================================
-- MIGRATION: Universal accounts.opening_hours for all org sub_types
-- ============================================================

-- (a) Column on accounts (nullable JSONB)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_hours JSONB;

-- (b) Backfill from restaurants (linked via restaurants.account_id)
UPDATE accounts a
SET    opening_hours = r.opening_hours
FROM   restaurants r
WHERE  r.account_id = a.id
   AND r.opening_hours IS NOT NULL
   AND a.opening_hours IS NULL;

-- (c) Backfill from businesses (linked via owner wallet → account_owners → accounts)
UPDATE accounts a
SET    opening_hours = b.opening_hours
FROM   businesses b
JOIN   account_owners ao
       ON lower(ao.wallet_address) = lower(b.owner_wallet_address)
      AND ao.role = 'owner'
WHERE  ao.account_id = a.id
   AND b.opening_hours IS NOT NULL
   AND a.opening_hours IS NULL;
