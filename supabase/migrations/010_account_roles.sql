-- Add role column to account_owners for Owner/Admin/Member permissions
ALTER TABLE public.account_owners
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'
CHECK (role IN ('owner', 'admin', 'member'));
