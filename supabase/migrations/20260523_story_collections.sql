-- ============================================================
-- MIGRATION: story_collections + story_slides
-- Adds admin-managed onboarding/learn story collections that
-- appear on the citizen profile and (optionally) on the home feed.
-- ============================================================

CREATE TABLE IF NOT EXISTS story_collections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID REFERENCES accounts(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  subtitle            TEXT,
  cover_image_url     TEXT,
  show_on_profile     BOOLEAN NOT NULL DEFAULT true,
  show_on_home_feed   BOOLEAN NOT NULL DEFAULT false,
  display_order       INTEGER NOT NULL DEFAULT 0,
  is_published        BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_collections_profile
  ON story_collections(is_published, show_on_profile, display_order);
CREATE INDEX IF NOT EXISTS idx_story_collections_home_feed
  ON story_collections(is_published, show_on_home_feed, display_order);
CREATE INDEX IF NOT EXISTS idx_story_collections_account
  ON story_collections(account_id);

CREATE TABLE IF NOT EXISTS story_slides (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id         UUID NOT NULL REFERENCES story_collections(id) ON DELETE CASCADE,
  background_image_url  TEXT NOT NULL,
  overlay_text          TEXT NOT NULL,
  text_color            TEXT DEFAULT '#FFFFFF',
  display_order         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_slides_collection
  ON story_slides(collection_id, display_order);

ALTER TABLE story_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_collections_select_public" ON story_collections
  FOR SELECT USING (is_published = true);

CREATE POLICY "story_slides_select_public" ON story_slides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM story_collections c
      WHERE c.id = story_slides.collection_id AND c.is_published = true
    )
  );

-- App-layer permissive write — same MVP pattern as blog_articles.
-- Membership + sub_type is enforced in the web server actions.
CREATE POLICY "story_collections_insert" ON story_collections
  FOR INSERT WITH CHECK (true);
CREATE POLICY "story_collections_update" ON story_collections
  FOR UPDATE USING (true);
CREATE POLICY "story_collections_delete" ON story_collections
  FOR DELETE USING (true);

CREATE POLICY "story_slides_insert" ON story_slides
  FOR INSERT WITH CHECK (true);
CREATE POLICY "story_slides_update" ON story_slides
  FOR UPDATE USING (true);
CREATE POLICY "story_slides_delete" ON story_slides
  FOR DELETE USING (true);
