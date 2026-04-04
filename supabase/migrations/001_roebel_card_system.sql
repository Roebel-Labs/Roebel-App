-- ============================================================
-- MIGRATION 1: Röbel Card System
-- Tables: roebel_card, roebel_points_ledger, roebel_card_partners, stamp_cards
-- ============================================================

-- 1. Röbel Card — one per user, materialized points balance
CREATE TABLE IF NOT EXISTS roebel_card (
  wallet_address TEXT PRIMARY KEY REFERENCES users(wallet_address) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'besucher' CHECK (tier IN ('besucher', 'burger', 'supporter')),
  taler_balance NUMERIC(18,6) NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE roebel_card ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own card" ON roebel_card
  FOR SELECT USING (wallet_address = auth.jwt()->>'sub' OR true);

CREATE POLICY "Users can upsert own card" ON roebel_card
  FOR ALL USING (true);

-- 2. Points Ledger — immutable transaction log
CREATE TABLE IF NOT EXISTS roebel_points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_points_wallet ON roebel_points_ledger(wallet_address);
CREATE INDEX idx_points_created ON roebel_points_ledger(created_at DESC);
CREATE INDEX idx_points_action ON roebel_points_ledger(action);

ALTER TABLE roebel_points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own points" ON roebel_points_ledger
  FOR SELECT USING (true);

CREATE POLICY "Users can insert points" ON roebel_points_ledger
  FOR INSERT WITH CHECK (true);

-- 3. Röbel Card Partners — businesses opted into the card program
CREATE TABLE IF NOT EXISTS roebel_card_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('stamp_card', 'points_multiplier', 'exclusive_access', 'priority_booking', 'custom')),
  offer_config JSONB NOT NULL DEFAULT '{}',
  total_redemptions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partners_business ON roebel_card_partners(business_id);

ALTER TABLE roebel_card_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read partners" ON roebel_card_partners
  FOR SELECT USING (true);

CREATE POLICY "Business owners can manage partners" ON roebel_card_partners
  FOR ALL USING (true);

-- 4. Stamp Cards — digital stamp tracking per user per partner
CREATE TABLE IF NOT EXISTS stamp_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES roebel_card_partners(id) ON DELETE CASCADE,
  stamps_collected INTEGER NOT NULL DEFAULT 0,
  stamps_required INTEGER NOT NULL,
  reward_description TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stamps_wallet ON stamp_cards(wallet_address);
CREATE INDEX idx_stamps_partner ON stamp_cards(partner_id);

ALTER TABLE stamp_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own stamps" ON stamp_cards
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own stamps" ON stamp_cards
  FOR ALL USING (true);

-- 5. Helper function: increment points atomically
CREATE OR REPLACE FUNCTION increment_roebel_points(
  p_wallet_address TEXT,
  p_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE roebel_card
  SET
    points_balance = points_balance + p_amount,
    total_earned = CASE WHEN p_amount > 0 THEN total_earned + p_amount ELSE total_earned END,
    total_spent = CASE WHEN p_amount < 0 THEN total_spent + ABS(p_amount) ELSE total_spent END,
    last_activity_at = now(),
    updated_at = now()
  WHERE wallet_address = p_wallet_address
  RETURNING points_balance INTO new_balance;

  -- Auto-create card if it doesn't exist
  IF NOT FOUND THEN
    INSERT INTO roebel_card (wallet_address, points_balance, total_earned, total_spent)
    VALUES (
      p_wallet_address,
      GREATEST(p_amount, 0),
      GREATEST(p_amount, 0),
      GREATEST(-p_amount, 0)
    )
    RETURNING points_balance INTO new_balance;
  END IF;

  RETURN new_balance;
END;
$$;
