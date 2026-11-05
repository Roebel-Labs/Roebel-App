-- Comments on dishes: regular menu items (menu_items) and Mittagstisch dishes
-- (special_menu_items) share one table; exactly one target is set.
-- Same access model as proposal_comments: published rows are public, the app
-- inserts directly with the author's users.wallet_address. Moderation =
-- set status to 'hidden' in the table editor.

CREATE TABLE IF NOT EXISTS public.dish_comments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id         uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  special_menu_item_id uuid REFERENCES public.special_menu_items(id) ON DELETE CASCADE,
  wallet_address       text NOT NULL REFERENCES public.users(wallet_address) ON DELETE CASCADE,
  content              text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  status               text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dish_comments_one_target CHECK (num_nonnulls(menu_item_id, special_menu_item_id) = 1)
);

CREATE INDEX IF NOT EXISTS dish_comments_menu_item_idx
  ON public.dish_comments (menu_item_id, created_at DESC) WHERE menu_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dish_comments_special_menu_item_idx
  ON public.dish_comments (special_menu_item_id, created_at DESC) WHERE special_menu_item_id IS NOT NULL;

ALTER TABLE public.dish_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published dish comments are public" ON public.dish_comments;
CREATE POLICY "Published dish comments are public"
  ON public.dish_comments FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "Anyone can post a published dish comment" ON public.dish_comments;
CREATE POLICY "Anyone can post a published dish comment"
  ON public.dish_comments FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'published');

REVOKE ALL ON public.dish_comments FROM anon, authenticated;
GRANT SELECT, INSERT ON public.dish_comments TO anon, authenticated;
