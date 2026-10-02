-- Small thumbnail per menu photo.
--
-- Menu photos are ~1376x768 JPEGs; lists show them at 96-160 px, so every
-- row pulled the full file (~700 KB each, ~90 MB for a 120-dish menu).
-- image_thumb_url holds a ~480 px copy for lists; clients fall back to
-- image_url when it is null. Whoever replaces image_url must also set or
-- clear image_thumb_url so a stale thumbnail never shows. Idempotent.

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image_thumb_url text;
ALTER TABLE public.special_menu_items ADD COLUMN IF NOT EXISTS image_thumb_url text;

NOTIFY pgrst, 'reload schema';
