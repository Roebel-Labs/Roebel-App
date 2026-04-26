-- ============================================================
-- MIGRATION: Journalist sub_type, extern accounts, blog_articles
-- ============================================================

-- (a) Add 'journalist' to sub_type CHECK
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_sub_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_sub_type_check
  CHECK (sub_type IS NULL OR sub_type IN (
    'restaurant','unternehmen','verein','partei','fraktion','journalist'
  ));

-- (b) Extern flag + approval state on accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_extern BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS extern_status TEXT
  CHECK (extern_status IN ('pending','approved','rejected'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS extern_reason TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS extern_reviewed_by TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS extern_reviewed_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contact_email TEXT;
CREATE INDEX IF NOT EXISTS idx_accounts_extern_pending
  ON accounts(extern_status) WHERE extern_status = 'pending';

-- (c) Public org slug for /app/orgs/[slug]/blog and stable URLs
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_slug ON accounts(slug) WHERE slug IS NOT NULL;

-- Backfill slug from name for existing accounts (simple lowercase + hyphen)
UPDATE accounts
SET slug = lower(
  regexp_replace(
    regexp_replace(
      translate(name, 'äöüÄÖÜß', 'aouAOUs'),
      '[^a-zA-Z0-9]+', '-', 'g'
    ),
    '^-+|-+$', '', 'g'
  )
) || '-' || substring(id::text, 1, 8)
WHERE slug IS NULL;

-- (d) users: optional email + extern marker for the email-OTP signup path
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_extern BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL;

-- (e) Blog articles (mirrors news_articles, scoped by account_id)
CREATE TABLE IF NOT EXISTS blog_articles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  excerpt           TEXT,
  content           TEXT NOT NULL,
  cover_image_url   TEXT,
  category          TEXT,
  tags              JSONB NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),
  is_featured       BOOLEAN NOT NULL DEFAULT false,
  view_count        INTEGER NOT NULL DEFAULT 0,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_blog_articles_account ON blog_articles(account_id);
CREATE INDEX IF NOT EXISTS idx_blog_articles_status_pub
  ON blog_articles(status, published_at DESC);

ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;

-- Public read: only published rows
CREATE POLICY "blog_articles_select_public" ON blog_articles
  FOR SELECT USING (status = 'published');

-- App-layer permissive write — same MVP pattern as accounts/news_articles.
-- Membership + extern-approval is enforced in server actions.
CREATE POLICY "blog_articles_insert" ON blog_articles
  FOR INSERT WITH CHECK (true);
CREATE POLICY "blog_articles_update" ON blog_articles
  FOR UPDATE USING (true);
CREATE POLICY "blog_articles_delete" ON blog_articles
  FOR DELETE USING (true);

-- Increment view_count RPC (mirrors news_articles' helper)
CREATE OR REPLACE FUNCTION increment_blog_view_count(article_id UUID)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE blog_articles SET view_count = view_count + 1 WHERE id = article_id;
$$;

-- (f) Storage bucket for blog cover & inline images
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images','blog-images',true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on blog-images (matches the existing news-images pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'blog_images_public_read'
  ) THEN
    CREATE POLICY "blog_images_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'blog-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'blog_images_public_insert'
  ) THEN
    CREATE POLICY "blog_images_public_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'blog-images');
  END IF;
END $$;
