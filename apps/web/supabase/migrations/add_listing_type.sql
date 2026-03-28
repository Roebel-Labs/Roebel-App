-- Add listing_type column to marketplace_listings
-- Supports "product" (default, existing behavior) and "service" (new)
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'product';

-- Make condition nullable (services don't have a condition)
ALTER TABLE marketplace_listings
  ALTER COLUMN condition DROP NOT NULL;
