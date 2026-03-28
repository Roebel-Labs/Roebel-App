-- Create feedback table for user feedback submissions
-- This table stores bug reports, feature requests, and general feedback from app users

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User information (nullable for anonymous feedback)
  user_wallet_address TEXT,

  -- Feedback details
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('bug_report', 'feature_request', 'general', 'improvement')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Optional contact information
  contact_email TEXT,
  contact_phone TEXT,

  -- Device and app information (stored as JSONB for flexibility)
  device_info JSONB DEFAULT '{}'::jsonb,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved', 'closed')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on created_at for efficient sorting
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- Create index on feedback_type for filtering
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(feedback_type);

-- Create index on user_wallet_address for user-specific queries
CREATE INDEX IF NOT EXISTS idx_feedback_user_wallet ON feedback(user_wallet_address) WHERE user_wallet_address IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert feedback (both authenticated and anonymous users)
CREATE POLICY "Anyone can submit feedback"
  ON feedback
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Policy: Allow users to view their own feedback (if they provided wallet address)
CREATE POLICY "Users can view their own feedback"
  ON feedback
  FOR SELECT
  TO public
  USING (user_wallet_address = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: Allow admins to view all feedback (you'll need to set up admin role)
-- Uncomment and modify this if you have an admin role set up:
-- CREATE POLICY "Admins can view all feedback"
--   ON feedback
--   FOR ALL
--   TO authenticated
--   USING (
--     current_setting('request.jwt.claims', true)::json->>'role' = 'admin'
--   );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before update
CREATE TRIGGER set_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();

-- Add comments for documentation
COMMENT ON TABLE feedback IS 'Stores user feedback including bug reports, feature requests, and general feedback';
COMMENT ON COLUMN feedback.user_wallet_address IS 'Wallet address of the user who submitted feedback (nullable for anonymous submissions)';
COMMENT ON COLUMN feedback.feedback_type IS 'Type of feedback: bug_report, feature_request, general, or improvement';
COMMENT ON COLUMN feedback.device_info IS 'JSON object containing device information like OS, app version, and device model';
COMMENT ON COLUMN feedback.status IS 'Current status of the feedback: new, in_review, resolved, or closed';
