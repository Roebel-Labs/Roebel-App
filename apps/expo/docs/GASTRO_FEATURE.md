# Gastronomie Org Accounts — Expo Implementation

This doc describes everything shipped in `apps/expo` for the Gastronomie ("Speisekarte") feature on Org accounts.

## Overview

A **Gastronomie Org account** is an `accounts` row with:

- `account_type = 'organisation'`
- `sub_type = 'restaurant'`

It is bridged to a `restaurants` row via `restaurants.account_id`. The menu lives in `menu_categories` + `menu_items` (linked to the restaurant), plus the new admin pieces (`menu_item_sides`, `menu_item_variants`, `account_ratings`, `menu_item_votes`).

Three live gastros at the time of writing:

| Name | Account ID | Restaurant slug |
| --- | --- | --- |
| Müritz Terrasse | `b207d640-3a22-4d2c-98fd-93aeb37c4a33` | `mueritz-terrasse-mpe9u0g6` |
| Delizia | `5070b038-018e-4c0d-867d-63fb23f97bd5` | `delizia-mpe9vch6` |
| Bistro zur Waage | `66affb91-abc1-4c0a-a3fe-b7ac84433138` | `bistro-zur-waage-mpe9wldb` |

Total seeded items: 25 (MT) + 48 (Delizia) + 122 (BzW incl. drinks) = 195. Five have v3 AI images so far; the rest are awaiting bulk gen.

## Public screens

### `apps/expo/app/account/[id]/index.tsx`

The public account page. For `sub_type === 'restaurant'` it shows three tabs:

- **Speisekarte** (default for gastros): renders Featured grid → sticky category bar → category sections.
- **Info**: existing contact / opening hours / events / blog / Mapbox map.
- **Beiträge**: posts list.

A `useEffect`-free derivation picks the default tab so gastros land on the menu from the first render (no info → menu flicker):

```ts
const activeTab: TabKey =
  tabSelection ?? (account?.sub_type === 'restaurant' ? 'menu' : 'info');
```

Floating overlay actions sit top-right on the hero (`HeaderFloatingActions`): search (gastro only) + star (rate, all org types).

### `apps/expo/app/account/[id]/menu/[itemId].tsx`

The Uber-Eats-style item detail. 16:9 hero, name, "ab €X,XX" if variants exist, description, thumbs row, `VariantSelectionGroup` ("Größe wählen") if applicable, `SideSelectionGroup` ("Wähle deine Beilage") if applicable, Special Instructions textarea (display-only — no order CTA), "Häufig zusammen gekauft" horizontal scroller.

### `apps/expo/app/restaurant/[slug].tsx`

Back-compat redirect. If the restaurant has an `account_id`, `router.replace('/account/<account_id>')`. Otherwise renders the legacy screen for unlinked restaurants.

## Sticky category navigator

`apps/expo/components/StickyCategoryBar.tsx` is a horizontally scrollable bar with a fixed `menu-01.svg` icon on the left (opens `MenuCategoriesSheet`). Active label is `Inter-Medium` with a `colors.primary` underline; inactive is `Inter-Regular` + `colors.textSecondary`. Auto-centers the active label as the user scrolls.

Wiring: the outer `ScrollView` in `account/[id]/index.tsx` uses `stickyHeaderIndices={[5]}`. Stable slot order:

```
0: banner
1: identity row
2: identity block (with rating summary)
3: ProfileTabs
4: FeaturedMenuItemsGrid (null when not on menu tab)
5: StickyCategoryBar       ← sticky
6: Category sections wrapper (null when not on menu tab)
7: Info tab
8: Posts tab
```

`onScroll` updates `activeCategoryIdx` based on each section's measured Y (`onLayout` → `sectionYs.current[id] = y`, offset by the wrapper's own Y).

Tapping a label or a row in `MenuCategoriesSheet` calls `jumpToCategory(idx)` which uses `scrollRef.current?.scrollTo({ y })`.

## Data model

### Existing tables (extended)

```sql
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS image_url TEXT,            -- already in DB; missing from TS type before
  ADD COLUMN IF NOT EXISTS sides_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sides_label TEXT DEFAULT 'Wähle deine Beilage',
  ADD COLUMN IF NOT EXISTS variants_label TEXT DEFAULT 'Größe wählen';
```

### New tables (migrations applied)

```sql
CREATE TABLE menu_item_sides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_delta NUMERIC(10,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- public read RLS

CREATE TABLE menu_item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,       -- "klein", "groß", "26 cm", "30 cm", "0,33 l", …
  price NUMERIC(10,2) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- public read RLS

CREATE TABLE account_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, wallet_address)
);

CREATE TABLE menu_item_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, wallet_address)
);
```

Ratings and votes are **wallet-based**, not `auth.uid()`-based, to match the rest of this app's wallet-auth pattern.

### Views

```sql
CREATE OR REPLACE VIEW account_rating_summary AS
SELECT account_id, COUNT(*)::int AS rating_count, ROUND(AVG(stars)::numeric, 1) AS avg_stars
FROM account_ratings GROUP BY account_id;

CREATE OR REPLACE VIEW menu_item_vote_summary AS
SELECT menu_item_id,
       COUNT(*)::int AS vote_count,
       ROUND(100.0 * SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0))::int AS percent_liked
FROM menu_item_votes GROUP BY menu_item_id;
```

### RPC

```sql
CREATE OR REPLACE FUNCTION search_menu_items(p_account_id UUID, p_query TEXT)
RETURNS SETOF menu_items LANGUAGE sql STABLE AS $$
  SELECT mi.* FROM menu_items mi
  JOIN restaurants r ON r.id = mi.restaurant_id
  WHERE r.account_id = p_account_id
    AND (mi.name ILIKE '%' || p_query || '%' OR mi.description ILIKE '%' || p_query || '%')
  ORDER BY mi.sort_order, mi.name LIMIT 50;
$$;
```

## Hooks & data layer

| File | Purpose |
| --- | --- |
| `apps/expo/lib/types.ts` | `MenuItemRecord` extended (`image_url`, `sides_required`, `sides_label`, `variants_label`); `MenuItemSide`, `MenuItemVariant`, `AccountRatingRecord`, `AccountRatingSummary`, `MenuItemVoteRecord`, `MenuItemVoteSummary`, `MenuItemWithDetails`. |
| `apps/expo/lib/supabase-menu.ts` | `fetchMenuItemDetail`, `fetchMenuItemSides`, `fetchMenuItemVariants`, `fetchMenuItemVoteSummary`, `fetchMenuItemVoteSummaries`, `searchMenuItems`, plus the existing category/item CRUD. |
| `apps/expo/lib/supabase-ratings.ts` | `fetchAccountRatingSummary`, `fetchUserRatingForAccount`, `upsertAccountRating`, `deleteAccountRating`, `fetchUserMenuItemVote`, `voteMenuItem`, `clearMenuItemVote`. |
| `apps/expo/hooks/useGastroData.ts` | Loads restaurant + categories (with item-variant flags) + vote summaries for an account. Used by the public Speisekarte tab. |
| `apps/expo/hooks/useAccountRating.ts` | Wallet-based stars rating with optimistic update. |
| `apps/expo/hooks/useMenuItemDetail.ts` | Loads item + sides + variants + vote summary + the current user's vote. |

## Components

| Component | What it does |
| --- | --- |
| `HeaderFloatingActions.tsx` | Floating dark pill icons on the top-right of the hero (search + star). |
| `RatingModal.tsx` / `RatingSummary.tsx` | 1–5 star rating modal + the "4.7★ (500+)" badge. |
| `MenuSearchModal.tsx` | Calls the `search_menu_items` RPC and links results to the detail screen. |
| `MenuItemThumbs.tsx` | SVG thumbs-up / thumbs-down with summary `92% (13)`. Filled variant for the user's own vote. Theme-aware colors. |
| `FeaturedMenuItemsGrid.tsx` | Horizontal scroll of the top-3 items by `percent_liked` with "#N most liked" pills. |
| `SideSelectionGroup.tsx` | Required radio group for `menu_item_sides`. |
| `VariantSelectionGroup.tsx` | Required radio group for `menu_item_variants`, shows absolute prices. |
| `StickyCategoryBar.tsx` | Horizontally scrollable category tabs with a fixed menu icon. |
| `MenuCategoriesSheet.tsx` | Bottom-sheet Modal with all categories. |

## AI image generation pipeline (Seedream 4.5 via kie.ai)

Edge Function: `apps/expo/supabase/functions/generate-menu-image/index.ts`. Already deployed, status `ACTIVE`.

Request body:

```json
{
  "menu_item_id": "uuid",
  "prompt_hint": "optional extra prompt text",
  "dry_run": false,
  "quality": "basic"
}
```

Required headers:

- `Content-Type: application/json`
- `x-seed-token: <SEED_TOKEN env>` (shared secret)

Optional: `x-kie-key: <kie key>` to override `KIE_API_KEY` env during local testing.

Pipeline:

1. Validate `x-seed-token` against `SEED_TOKEN` env.
2. Load item + restaurant via service-role Supabase client.
3. Compose prompt using `gastroFor` + `backgroundFor` + `angleFor` (per-gastro brand).
4. `POST https://api.kie.ai/api/v1/jobs/createTask` with the prompt.
5. Poll `GET …/recordInfo?taskId=…` every 2.5 s up to 50 s. Returns `data.resultJson.resultUrls[0]`.
6. Download the kie.ai temp URL, upload to the `images` bucket at `menu-items/<rest_id>/<item_id>_v3_<unixms>.jpg` (timestamped to bypass the bucket's no-update RLS and to cache-bust the client).
7. `UPDATE menu_items SET image_url = '<public url>' WHERE id = $1`.

Required Supabase secrets:

- `KIE_API_KEY` = kie.ai key (`458e8b6eb764f9a6ca7907522bf530d1` currently).
- `SEED_TOKEN` = random shared secret for header gating.

### Per-gastro style v3

- **Müritz Terrasse**: anthracite stoneware plate on a matte dark surface, top-down.
- **Delizia**: white plate on beige-and-white gingham tablecloth, top-down.
- **Bistro zur Waage**: light grey concrete-textured surface, top-down for plates / side 3/4 for burgers / döner / dürüm.
- Camera angle is item-name-aware via `angleFor()`.
- 16:9, fully sharp (no DOF), subject perfectly centered, hard "absolutely no text, letters, logos" negative.

### Test images shipped

| Gastro | Item | Storage path |
| --- | --- | --- |
| MT | Linsencurry | `_v3b.jpg` (white plate override) |
| MT | Big Bacon Cheese | `_v3.jpg` |
| Delizia | Pizza Margherita | `_v3.jpg` |
| Delizia | Spaghetti alla Carbonara | `_v3.jpg` |
| BzW | Döner | `_v3.jpg` |

### Memory note

Style preferences saved as a project memory: see `feedback_ai_food_photo.md` in `~/.claude/projects/.../memory/`.

## Known issues

- **Info tab Mapbox crash**: switching to the Info tab on a gastro account that has location data can blank the screen because `@rnmapbox/maps` sometimes crashes natively under GL pressure. Mitigation: the menu tab is the default for gastros so this rarely surfaces. Real fix is deferred — likely needs gating Mapbox behind a viewport-intersection check.
- **Only 5 of ~190 items have AI images.** Bulk run is paused pending user approval of the test batch.
- **Drinks (Getränke)** intentionally keep `image_url=NULL` (brand risk with AI-generated cans).

## File map (created / edited in this feature)

- Routes: `apps/expo/app/account/[id]/index.tsx`, `apps/expo/app/account/[id]/menu/[itemId].tsx`, `apps/expo/app/restaurant/[slug].tsx`.
- Components: `apps/expo/components/HeaderFloatingActions.tsx`, `RatingModal.tsx`, `RatingSummary.tsx`, `MenuSearchModal.tsx`, `MenuItemThumbs.tsx`, `FeaturedMenuItemsGrid.tsx`, `SideSelectionGroup.tsx`, `VariantSelectionGroup.tsx`, `StickyCategoryBar.tsx`, `MenuCategoriesSheet.tsx`.
- Hooks: `apps/expo/hooks/useGastroData.ts`, `useAccountRating.ts`, `useMenuItemDetail.ts`.
- Data: `apps/expo/lib/supabase-menu.ts` (extended), `apps/expo/lib/supabase-ratings.ts` (new).
- Types: `apps/expo/lib/types.ts` (extended).
- Edge Function: `apps/expo/supabase/functions/generate-menu-image/index.ts`.
- Icons added: `apps/expo/assets/icons/thumbs-up.svg`, `thumbs-up-filled.svg`, `thumbs-down.svg`, `menu-01.svg`. Aliased existing `StarIconComponent` as `StarIcon` in `Icons.tsx`.
- Migrations applied via Supabase MCP (Postgres project `wwbeqhkslxdxhktqzqti`): `menu_item_sides`, `account_ratings` (wallet-based), `menu_item_votes` (wallet-based), `menu_item_variants`, `search_menu_items` RPC, `restaurants_orphan_cleanup`.

## App version

App version `3.1.0`, iOS build `26`, Android `versionCode 33` (set in `app.json`, `app.config.ts`, `package.json`, plus local-only `ios/Rbel/Info.plist` + `android/app/build.gradle`).
