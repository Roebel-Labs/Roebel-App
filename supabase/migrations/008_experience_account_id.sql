-- 008: Add account_id to event_experiences for org-scoped experience posts
ALTER TABLE event_experiences ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_experiences_account ON event_experiences USING btree (account_id);
