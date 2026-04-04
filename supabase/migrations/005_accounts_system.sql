-- ============================================================
-- MIGRATION 5: Accounts System
-- Unified account model: personal + org (group) accounts
-- ============================================================

-- 1. Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type  TEXT NOT NULL CHECK (account_type IN (
                  'personal', 'unternehmen', 'verein', 'partei', 'fraktion'
                )),
  name          TEXT NOT NULL,
  bio           TEXT,
  avatar_url    TEXT,
  cover_url     TEXT,
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_type ON accounts(account_type);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select" ON accounts FOR SELECT USING (true);
CREATE POLICY "accounts_insert" ON accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (true);

-- 2. Create account_owners join table
CREATE TABLE IF NOT EXISTS account_owners (
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'owner',
  invited_by      TEXT,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, wallet_address)
);

CREATE INDEX idx_account_owners_wallet ON account_owners(wallet_address);
ALTER TABLE account_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_owners_select" ON account_owners FOR SELECT USING (true);
CREATE POLICY "account_owners_insert" ON account_owners FOR INSERT WITH CHECK (true);
CREATE POLICY "account_owners_delete" ON account_owners FOR DELETE USING (true);

-- 3. Create personal accounts for all existing users
-- Use a DO block to reliably link each user to their own account
DO $$
DECLARE
  u RECORD;
  new_account_id UUID;
BEGIN
  FOR u IN SELECT wallet_address, username, profile_picture_url, cover_image_url, bio FROM users
  LOOP
    INSERT INTO accounts (account_type, name, avatar_url, cover_url, bio)
    VALUES (
      'personal',
      COALESCE(u.username, u.wallet_address),
      u.profile_picture_url,
      u.cover_image_url,
      u.bio
    )
    RETURNING id INTO new_account_id;

    INSERT INTO account_owners (account_id, wallet_address)
    VALUES (new_account_id, u.wallet_address);
  END LOOP;
END $$;

-- 4. Alter users table: add active_account_id first
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Set active_account_id for all existing users
UPDATE users u SET active_account_id = ao.account_id
FROM account_owners ao
WHERE ao.wallet_address = u.wallet_address;

-- 5. Rename role → tier: drop old constraint first, then rename, then remap values, then add new constraint
DO $$
BEGIN
  -- Drop any existing check constraint on role column
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    -- Try dropping common constraint names
    BEGIN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Rename column if it exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE users RENAME COLUMN role TO tier;
  END IF;
END $$;

-- Map old role values to new tier values
UPDATE users SET tier = 'citizen' WHERE tier IN ('resident', 'business', 'official');
-- 'tourist' stays as 'tourist'

-- Add new check constraint for tier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_tier_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_tier_check
      CHECK (tier IN ('guest', 'tourist', 'citizen'));
  END IF;
END $$;

-- Remove superseded columns
ALTER TABLE users DROP COLUMN IF EXISTS app_mode;
ALTER TABLE users DROP COLUMN IF EXISTS org_id;

-- 6. Create Stadt Roebel system account for legacy events
INSERT INTO accounts (id, account_type, name, bio, is_verified)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'personal',
  'Stadt Röbel/Müritz',
  'Offizielle Veranstaltungen der Stadt Röbel/Müritz',
  true
);

-- 7. Add account_id to content tables
ALTER TABLE events ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_account ON events(account_id);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_account ON posts(account_id);

ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- 8. Backfill account_id on posts from wallet → personal account
UPDATE posts p SET account_id = ao.account_id
FROM account_owners ao
JOIN accounts a ON a.id = ao.account_id AND a.account_type = 'personal'
WHERE ao.wallet_address = p.wallet_address
AND p.account_id IS NULL;

-- 9. Backfill account_id on post_comments
UPDATE post_comments pc SET account_id = ao.account_id
FROM account_owners ao
JOIN accounts a ON a.id = ao.account_id AND a.account_type = 'personal'
WHERE ao.wallet_address = pc.wallet_address
AND pc.account_id IS NULL;

-- 10. Assign all existing events to Stadt Roebel system account
UPDATE events SET account_id = '00000000-0000-0000-0000-000000000001'
WHERE account_id IS NULL;

-- 11. Add account columns to messaging tables
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS participant_one_account UUID REFERENCES accounts(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS participant_two_account UUID REFERENCES accounts(id);

ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_account_id UUID REFERENCES accounts(id);

-- 12. Backfill messaging account references
UPDATE conversations c SET
  participant_one_account = (
    SELECT ao.account_id FROM account_owners ao
    JOIN accounts a ON a.id = ao.account_id AND a.account_type = 'personal'
    WHERE ao.wallet_address = c.participant_one
    LIMIT 1
  ),
  participant_two_account = (
    SELECT ao.account_id FROM account_owners ao
    JOIN accounts a ON a.id = ao.account_id AND a.account_type = 'personal'
    WHERE ao.wallet_address = c.participant_two
    LIMIT 1
  )
WHERE participant_one_account IS NULL;

UPDATE direct_messages dm SET sender_account_id = (
  SELECT ao.account_id FROM account_owners ao
  JOIN accounts a ON a.id = ao.account_id AND a.account_type = 'personal'
  WHERE ao.wallet_address = dm.sender_address
  LIMIT 1
)
WHERE sender_account_id IS NULL;
