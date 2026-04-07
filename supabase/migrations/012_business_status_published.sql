-- 012: Rename business status 'approved' → 'published'

-- 1. Drop existing CHECK constraint
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_status_check;

-- 2. Update all existing 'approved' rows to 'published'
UPDATE businesses SET status = 'published' WHERE status = 'approved';

-- 3. Add new CHECK constraint with 'published' instead of 'approved'
ALTER TABLE businesses ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('pending', 'published', 'rejected'));
