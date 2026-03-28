-- Add marketplace share support to posts table
ALTER TABLE posts ADD COLUMN linked_marketplace_id UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL;

-- Extend post_type CHECK to allow 'marketplace_share'
ALTER TABLE posts DROP CONSTRAINT posts_post_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_post_type_check CHECK (post_type IN ('user', 'mecky', 'event_share', 'marketplace_share'));
