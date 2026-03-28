-- =====================================================
-- HomeTown DAO - Gamification & Social Auth Update
-- =====================================================
-- This script adds:
-- 1. Vote tracking for gamification
-- 2. Social auth fields (email, Google, Apple, Facebook)
-- 3. Vote history table for detailed tracking
--
-- Run this AFTER the main users schema
-- =====================================================

-- 1. Add social auth and vote tracking columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auth_provider TEXT, -- 'phone', 'email', 'google', 'apple', 'facebook'
ADD COLUMN IF NOT EXISTS total_votes_cast BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS voting_streak BIGINT DEFAULT 0, -- Consecutive proposals voted on
ADD COLUMN IF NOT EXISTS last_vote_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS gamification_points BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '[]'::jsonb;

-- 2. Add indexes for social auth and gamification
CREATE INDEX IF NOT EXISTS idx_users_email
  ON public.users(email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_provider
  ON public.users(auth_provider)
  WHERE auth_provider IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_total_votes
  ON public.users(total_votes_cast DESC);

CREATE INDEX IF NOT EXISTS idx_users_gamification_points
  ON public.users(gamification_points DESC);

-- 3. Create vote_history table for detailed tracking
CREATE TABLE IF NOT EXISTS public.vote_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- User info
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,

  -- Proposal info
  proposal_id TEXT NOT NULL, -- Transaction hash
  blockchain_proposal_id TEXT NOT NULL, -- Numeric ID
  proposal_number INTEGER,
  proposal_title TEXT,

  -- Vote details
  vote_type SMALLINT NOT NULL, -- 0=Against, 1=For, 2=Abstain
  voting_power BIGINT NOT NULL,

  -- Gamification
  points_earned BIGINT DEFAULT 0,
  streak_at_vote BIGINT DEFAULT 0,

  -- Metadata
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  transaction_hash TEXT,
  block_number BIGINT,

  -- Constraints
  CONSTRAINT vote_type_valid CHECK (vote_type IN (0, 1, 2)),
  CONSTRAINT unique_user_proposal UNIQUE (wallet_address, proposal_id)
);

-- 4. Add comment to vote_history table
COMMENT ON TABLE public.vote_history IS 'Tracks all votes cast by users for gamification and analytics';

-- 5. Create indexes for vote_history
CREATE INDEX IF NOT EXISTS idx_vote_history_user_id
  ON public.vote_history(user_id);

CREATE INDEX IF NOT EXISTS idx_vote_history_wallet
  ON public.vote_history(wallet_address);

CREATE INDEX IF NOT EXISTS idx_vote_history_proposal
  ON public.vote_history(proposal_id);

CREATE INDEX IF NOT EXISTS idx_vote_history_voted_at
  ON public.vote_history(voted_at DESC);

CREATE INDEX IF NOT EXISTS idx_vote_history_vote_type
  ON public.vote_history(vote_type);

-- 6. Enable RLS on vote_history
ALTER TABLE public.vote_history ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for vote_history
DROP POLICY IF EXISTS "Vote history viewable by everyone" ON public.vote_history;
DROP POLICY IF EXISTS "Users can insert their own votes" ON public.vote_history;

CREATE POLICY "Vote history viewable by everyone"
  ON public.vote_history
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own votes"
  ON public.vote_history
  FOR INSERT
  WITH CHECK (true);

-- 8. Create function to record a vote and update user stats
CREATE OR REPLACE FUNCTION record_vote(
  p_wallet_address TEXT,
  p_proposal_id TEXT,
  p_blockchain_proposal_id TEXT,
  p_proposal_number INTEGER,
  p_proposal_title TEXT,
  p_vote_type SMALLINT,
  p_voting_power BIGINT,
  p_transaction_hash TEXT,
  p_block_number BIGINT
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_current_votes BIGINT;
  v_current_streak BIGINT;
  v_last_vote_date TIMESTAMP WITH TIME ZONE;
  v_points_to_award BIGINT := 10; -- Base points per vote
  v_new_streak BIGINT;
  v_streak_bonus BIGINT := 0;
BEGIN
  -- Get user info
  SELECT id, total_votes_cast, voting_streak, last_vote_date
  INTO v_user_id, v_current_votes, v_current_streak, v_last_vote_date
  FROM public.users
  WHERE wallet_address = p_wallet_address;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found for wallet address: %', p_wallet_address;
  END IF;

  -- Calculate streak
  IF v_last_vote_date IS NULL THEN
    v_new_streak := 1;
  ELSIF v_last_vote_date::date = CURRENT_DATE - INTERVAL '1 day' THEN
    -- Consecutive day voting
    v_new_streak := v_current_streak + 1;
    v_streak_bonus := LEAST(v_new_streak * 2, 50); -- Up to 50 bonus points for streaks
  ELSIF v_last_vote_date::date < CURRENT_DATE - INTERVAL '1 day' THEN
    -- Streak broken
    v_new_streak := 1;
  ELSE
    -- Same day vote on different proposal
    v_new_streak := v_current_streak;
  END IF;

  -- Total points with streak bonus
  v_points_to_award := v_points_to_award + v_streak_bonus;

  -- Insert vote history
  INSERT INTO public.vote_history (
    user_id,
    wallet_address,
    proposal_id,
    blockchain_proposal_id,
    proposal_number,
    proposal_title,
    vote_type,
    voting_power,
    points_earned,
    streak_at_vote,
    transaction_hash,
    block_number
  ) VALUES (
    v_user_id,
    p_wallet_address,
    p_proposal_id,
    p_blockchain_proposal_id,
    p_proposal_number,
    p_proposal_title,
    p_vote_type,
    p_voting_power,
    v_points_to_award,
    v_new_streak,
    p_transaction_hash,
    p_block_number
  )
  ON CONFLICT (wallet_address, proposal_id) DO NOTHING;

  -- Update user stats
  UPDATE public.users
  SET
    total_votes_cast = v_current_votes + 1,
    voting_streak = v_new_streak,
    last_vote_date = NOW(),
    gamification_points = gamification_points + v_points_to_award
  WHERE id = v_user_id;

  -- Return summary
  RETURN jsonb_build_object(
    'success', true,
    'points_earned', v_points_to_award,
    'new_streak', v_new_streak,
    'streak_bonus', v_streak_bonus,
    'total_votes', v_current_votes + 1
  );
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to get user voting stats
CREATE OR REPLACE FUNCTION get_user_voting_stats(p_wallet_address TEXT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_votes_cast', COALESCE(total_votes_cast, 0),
    'voting_streak', COALESCE(voting_streak, 0),
    'gamification_points', COALESCE(gamification_points, 0),
    'last_vote_date', last_vote_date,
    'for_votes', (
      SELECT COUNT(*)
      FROM public.vote_history
      WHERE wallet_address = p_wallet_address AND vote_type = 1
    ),
    'against_votes', (
      SELECT COUNT(*)
      FROM public.vote_history
      WHERE wallet_address = p_wallet_address AND vote_type = 0
    ),
    'abstain_votes', (
      SELECT COUNT(*)
      FROM public.vote_history
      WHERE wallet_address = p_wallet_address AND vote_type = 2
    )
  )
  INTO v_result
  FROM public.users
  WHERE wallet_address = p_wallet_address;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- 10. Create leaderboard function
CREATE OR REPLACE FUNCTION get_voting_leaderboard(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  rank BIGINT,
  wallet_address TEXT,
  username TEXT,
  profile_picture_url TEXT,
  total_votes_cast BIGINT,
  gamification_points BIGINT,
  voting_streak BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY u.gamification_points DESC, u.total_votes_cast DESC) as rank,
    u.wallet_address,
    u.username,
    u.profile_picture_url,
    u.total_votes_cast,
    u.gamification_points,
    u.voting_streak
  FROM public.users u
  WHERE u.total_votes_cast > 0
  ORDER BY u.gamification_points DESC, u.total_votes_cast DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 11. Verify setup
DO $$
BEGIN
  RAISE NOTICE '✅ Social auth fields added to users table!';
  RAISE NOTICE '✅ Vote tracking columns added!';
  RAISE NOTICE '✅ Vote history table created!';
  RAISE NOTICE '✅ Gamification functions created!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 New columns in users table:';
  RAISE NOTICE '  - email (for email auth)';
  RAISE NOTICE '  - auth_provider (phone/email/google/apple/facebook)';
  RAISE NOTICE '  - total_votes_cast (gamification)';
  RAISE NOTICE '  - voting_streak (consecutive voting days)';
  RAISE NOTICE '  - gamification_points (rewards)';
  RAISE NOTICE '';
  RAISE NOTICE '🎮 Gamification system ready!';
  RAISE NOTICE '  - Base: 10 points per vote';
  RAISE NOTICE '  - Streak bonus: up to 50 extra points';
  RAISE NOTICE '  - Leaderboard enabled';
END $$;

-- 12. Display updated table structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('email', 'auth_provider', 'total_votes_cast', 'voting_streak', 'gamification_points')
ORDER BY ordinal_position;

-- 13. Display vote_history structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vote_history'
ORDER BY ordinal_position;
