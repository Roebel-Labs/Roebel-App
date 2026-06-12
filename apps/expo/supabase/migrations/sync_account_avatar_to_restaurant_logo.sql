-- Restaurant slider cards read restaurants.logo_url, but the org dashboards
-- (web dashboard/profile + expo edit-org) only write accounts.avatar_url —
-- there is no UI that sets restaurants.logo_url. Keep the two in sync at the
-- DB level so every avatar writer is covered.

CREATE OR REPLACE FUNCTION sync_account_avatar_to_restaurant_logo()
RETURNS trigger AS $$
BEGIN
  UPDATE restaurants
  SET logo_url = NEW.avatar_url,
      updated_at = now()
  WHERE account_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_account_avatar_to_restaurant_logo ON accounts;
CREATE TRIGGER trg_sync_account_avatar_to_restaurant_logo
AFTER UPDATE OF avatar_url ON accounts
FOR EACH ROW
WHEN (NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
EXECUTE FUNCTION sync_account_avatar_to_restaurant_logo();

-- Backfill: restaurants that never got a logo but whose account has an avatar
-- (e.g. Seglerheim). Restaurants with an existing logo are left untouched.
UPDATE restaurants r
SET logo_url = a.avatar_url,
    updated_at = now()
FROM accounts a
WHERE a.id = r.account_id
  AND r.logo_url IS NULL
  AND a.avatar_url IS NOT NULL;
