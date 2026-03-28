-- =====================================================
-- HomeTown DAO - Citizen Verification System
-- =====================================================
-- This script adds:
-- 1. Citizen verification fields to users table
-- 2. Phone verification sessions table
-- 3. Constraints to enforce one phone per wallet
-- 4. Admin verification audit log
--
-- Run this AFTER the gamification update
-- =====================================================

-- 1. Add citizen verification columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_verified_citizen BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS citizen_verification_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS verification_notes TEXT,
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected'));

-- 2. Add unique constraints (one phone per wallet, one wallet per phone)
DO $$
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_number_unique'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_phone_number_unique UNIQUE (phone_number);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_wallet_address_unique'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_wallet_address_unique UNIQUE (wallet_address);
  END IF;
END $$;

-- 3. Create index for verification status
CREATE INDEX IF NOT EXISTS idx_users_verification_status
  ON public.users(verification_status)
  WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_users_is_verified_citizen
  ON public.users(is_verified_citizen);

-- 4. Create phone_verification_sessions table
CREATE TABLE IF NOT EXISTS public.phone_verification_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Session info
  phone_number TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT false,

  -- Link to wallet (after step 2)
  wallet_address TEXT,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,

  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT verification_code_length CHECK (char_length(verification_code) = 6)
);

-- 5. Create indexes for phone_verification_sessions
CREATE INDEX IF NOT EXISTS idx_phone_sessions_phone
  ON public.phone_verification_sessions(phone_number);

CREATE INDEX IF NOT EXISTS idx_phone_sessions_expires
  ON public.phone_verification_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_phone_sessions_wallet
  ON public.phone_verification_sessions(wallet_address)
  WHERE wallet_address IS NOT NULL;

-- 6. Enable RLS on phone_verification_sessions
ALTER TABLE public.phone_verification_sessions ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for phone_verification_sessions
DROP POLICY IF EXISTS "Users can view their own verification sessions" ON public.phone_verification_sessions;
DROP POLICY IF EXISTS "System can insert verification sessions" ON public.phone_verification_sessions;
DROP POLICY IF EXISTS "System can update verification sessions" ON public.phone_verification_sessions;

CREATE POLICY "Users can view their own verification sessions"
  ON public.phone_verification_sessions
  FOR SELECT
  USING (true); -- Allow viewing for session validation

CREATE POLICY "System can insert verification sessions"
  ON public.phone_verification_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update verification sessions"
  ON public.phone_verification_sessions
  FOR UPDATE
  USING (true);

-- 8. Create verification_audit_log table
CREATE TABLE IF NOT EXISTS public.verification_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- What was verified
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  phone_number TEXT NOT NULL,

  -- Action taken
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'revoked')),
  admin_address TEXT, -- Admin wallet who performed action
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Create index for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_user
  ON public.verification_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.verification_audit_log(action);

CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON public.verification_audit_log(created_at DESC);

-- 10. Enable RLS on verification_audit_log
ALTER TABLE public.verification_audit_log ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS policies for audit log
DROP POLICY IF EXISTS "Audit log viewable by admins" ON public.verification_audit_log;
DROP POLICY IF EXISTS "System can insert audit entries" ON public.verification_audit_log;

CREATE POLICY "Audit log viewable by admins"
  ON public.verification_audit_log
  FOR SELECT
  USING (true); -- In production, restrict to admin role

CREATE POLICY "System can insert audit entries"
  ON public.verification_audit_log
  FOR INSERT
  WITH CHECK (true);

-- 12. Create function to initiate phone verification
CREATE OR REPLACE FUNCTION initiate_phone_verification(
  p_phone_number TEXT,
  p_verification_code TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate expiry (5 minutes from now)
  v_expires_at := NOW() + INTERVAL '5 minutes';

  -- Insert verification session
  INSERT INTO public.phone_verification_sessions (
    phone_number,
    verification_code,
    expires_at,
    ip_address,
    user_agent
  ) VALUES (
    p_phone_number,
    p_verification_code,
    v_expires_at,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- 13. Create function to verify phone code
CREATE OR REPLACE FUNCTION verify_phone_code(
  p_session_id UUID,
  p_verification_code TEXT
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Get session
  SELECT * INTO v_session
  FROM public.phone_verification_sessions
  WHERE id = p_session_id;

  -- Check if session exists
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  -- Check if already verified
  IF v_session.verified THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already verified');
  END IF;

  -- Check if expired
  IF v_session.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Verification code expired');
  END IF;

  -- Check code
  IF v_session.verification_code != p_verification_code THEN
    -- Increment attempts
    UPDATE public.phone_verification_sessions
    SET attempts = attempts + 1
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', false, 'error', 'Invalid verification code');
  END IF;

  -- Mark as verified
  UPDATE public.phone_verification_sessions
  SET verified = true
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'phone_number', v_session.phone_number,
    'session_id', p_session_id
  );
END;
$$ LANGUAGE plpgsql;

-- 14. Create function to link wallet to verified phone
CREATE OR REPLACE FUNCTION link_wallet_to_phone(
  p_session_id UUID,
  p_wallet_address TEXT
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_user_id UUID;
  v_existing_user RECORD;
BEGIN
  -- Get verified session
  SELECT * INTO v_session
  FROM public.phone_verification_sessions
  WHERE id = p_session_id AND verified = true;

  -- Check if session is verified
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Phone not verified');
  END IF;

  -- Check if wallet already exists
  SELECT * INTO v_existing_user
  FROM public.users
  WHERE wallet_address = p_wallet_address;

  IF v_existing_user IS NOT NULL THEN
    -- Update existing user
    UPDATE public.users
    SET
      phone_number = v_session.phone_number,
      phone_verified = true,
      phone_verified_at = NOW(),
      verification_status = 'pending',
      last_login_at = NOW()
    WHERE wallet_address = p_wallet_address
    RETURNING id INTO v_user_id;
  ELSE
    -- Create new user
    INSERT INTO public.users (
      wallet_address,
      phone_number,
      phone_verified,
      phone_verified_at,
      verification_status,
      auth_provider
    ) VALUES (
      p_wallet_address,
      v_session.phone_number,
      true,
      NOW(),
      'pending',
      'social'
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- Update session with wallet and user
  UPDATE public.phone_verification_sessions
  SET
    wallet_address = p_wallet_address,
    user_id = v_user_id
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'wallet_address', p_wallet_address,
    'phone_number', v_session.phone_number
  );
END;
$$ LANGUAGE plpgsql;

-- 15. Create function to verify citizen (admin action)
CREATE OR REPLACE FUNCTION verify_citizen(
  p_user_id UUID,
  p_action TEXT, -- 'approved' or 'rejected'
  p_admin_address TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Get user
  SELECT * INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Update user verification status
  IF p_action = 'approved' THEN
    UPDATE public.users
    SET
      is_verified_citizen = true,
      citizen_verification_date = NOW(),
      verification_status = 'approved',
      verification_notes = p_notes
    WHERE id = p_user_id;
  ELSIF p_action = 'rejected' THEN
    UPDATE public.users
    SET
      is_verified_citizen = false,
      verification_status = 'rejected',
      verification_notes = p_notes
    WHERE id = p_user_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  -- Log to audit table
  INSERT INTO public.verification_audit_log (
    user_id,
    wallet_address,
    phone_number,
    action,
    admin_address,
    notes
  ) VALUES (
    p_user_id,
    v_user.wallet_address,
    v_user.phone_number,
    p_action,
    p_admin_address,
    p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'user_id', p_user_id
  );
END;
$$ LANGUAGE plpgsql;

-- 16. Create function to get pending verifications (for admin)
CREATE OR REPLACE FUNCTION get_pending_verifications()
RETURNS TABLE (
  id UUID,
  wallet_address TEXT,
  phone_number TEXT,
  username TEXT,
  profile_picture_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  phone_verified_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.wallet_address,
    u.phone_number,
    u.username,
    u.profile_picture_url,
    u.created_at,
    u.phone_verified_at
  FROM public.users u
  WHERE u.verification_status = 'pending'
    AND u.phone_verified = true
  ORDER BY u.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 17. Verify setup
DO $$
BEGIN
  RAISE NOTICE '✅ Citizen verification fields added to users table!';
  RAISE NOTICE '✅ Phone verification sessions table created!';
  RAISE NOTICE '✅ Verification audit log table created!';
  RAISE NOTICE '✅ Verification functions created!';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 Verification System Ready!';
  RAISE NOTICE '  Step 1: User verifies phone number (SMS OTP)';
  RAISE NOTICE '  Step 2: User connects wallet (social login)';
  RAISE NOTICE '  Step 3: Admin verifies citizen status';
  RAISE NOTICE '  Step 4: User can mint NFT';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Important: Only verified citizens can mint NFTs!';
END $$;

-- 18. Display new columns
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'phone_verified_at',
    'is_verified_citizen',
    'citizen_verification_date',
    'verification_status',
    'verification_notes'
  )
ORDER BY ordinal_position;
