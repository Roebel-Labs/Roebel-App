# Gastronomie pages — apps/web build plan

This doc is a **build-this-later spec** for porting the Expo Gastronomie feature (see `apps/expo/docs/GASTRO_FEATURE.md`) onto the Next.js web app. Nothing in this doc is shipped yet on `apps/web`.

## Goal

Public web parity with the mobile Speisekarte: any visitor can browse the menu, see ratings and thumbs-up percentages, search within a gastro's menu, and view item detail screens. Owner-side editing stays in the Expo Org Dashboard.

## App router routes

The web app is Next.js 15 App Router + Tailwind + Shadcn. There is no `/account/[id]` route yet; the closest existing route is `/app/gewerbe/[slug]` which renders the `businesses` table — **not** what we want. Add a new public-facing route:

```
apps/web/src/app/gastro/
├── [slug]/
│   ├── page.tsx                        # server: header + tabs shell
│   ├── speisekarte.tsx (or layout)     # client island: sticky bar + categories
│   ├── menu/
│   │   └── [itemId]/page.tsx           # server: item detail
│   └── opengraph-image.tsx             # OG card with first image
├── layout.tsx                          # public layout (no auth required)
```

Public path `/gastro/<account-slug>`. Resolve via `accounts.slug` → `restaurants.account_id`.

Why under `/gastro/` (public) and not `/app/gastro/` (authenticated):

- SEO / discoverability.
- Sharing links from social.
- Mirrors the existing `/app/gewerbe/[slug]` pattern of using slugs.

## Data fetching

Server actions live under `apps/web/src/app/actions/gastro.ts`:

```ts
export async function getGastroBySlug(slug: string) { /* accounts + restaurants + opening_hours */ }
export async function getMenuForAccount(accountId: string) { /* menu_categories with embedded items + variants */ }
export async function getMenuItem(itemId: string) { /* item + sides + variants + vote_summary */ }
export async function searchGastroMenu(accountId: string, q: string) { /* search_menu_items RPC */ }
export async function getAccountRatingSummary(accountId: string) { /* account_rating_summary view */ }
```

All use `createClient()` from `apps/web/src/lib/supabase/server.ts`. None require auth for read.

Mutations (rating / voting) need the user's wallet — use the existing thirdweb client-side `useActiveAccount()` and call a server action that writes with the service role key, gated by an explicit wallet param. (Web ratings can ship in a follow-up; v1 is read-only.)

## Reuse

- `apps/web/src/types/restaurant.ts` already has `MenuCategory`, `MenuItem`, `SpecialMenu` types. Add `MenuItemSide`, `MenuItemVariant`, `AccountRatingSummary`, `MenuItemVoteSummary` types matching the Postgres schema.
- `apps/web/src/components/admin/restaurants/menu-tab.tsx` (admin-only) already proves the data layer reads/writes work — borrow its supabase patterns.

## Components (all client unless noted)

| Component | Type | Purpose |
| --- | --- | --- |
| `apps/web/src/components/gastro/GastroPageShell.tsx` | Server | Wraps the header (hero image, name, rating summary, contact). Defers Speisekarte to a client island so we can have client-side scroll behavior. |
| `apps/web/src/components/gastro/HeaderActions.tsx` | Client | Search icon button + Star (rating) button on the hero. Opens dialogs. |
| `apps/web/src/components/gastro/FeaturedItems.tsx` | Client | Horizontal scroll of the top-3 items by `percent_liked`. |
| `apps/web/src/components/gastro/StickyCategoryBar.tsx` | Client | `position: sticky; top: 0` with horizontal overflow scroll. Tracks active category via `IntersectionObserver`. Tap a label → smooth `scrollIntoView`. |
| `apps/web/src/components/gastro/MenuCategoriesSheet.tsx` | Client | Shadcn `Sheet` (right-side or bottom). Tap closes + scrolls. |
| `apps/web/src/components/gastro/MenuCategorySection.tsx` | Client | Each category's items list. `data-category-id` for the IntersectionObserver. |
| `apps/web/src/components/gastro/MenuItemRow.tsx` | Client | The list row. 13pt regular price (matches mobile). No placeholder thumb when `image_url` is null. Link to detail page. |
| `apps/web/src/components/gastro/MenuItemDetailPage.tsx` | Server | The full item detail page content. |
| `apps/web/src/components/gastro/RatingDialog.tsx` | Client | Shadcn `Dialog` with star pickers. Same wallet auth pattern via thirdweb. Mutating server action writes `account_ratings` keyed on wallet. |
| `apps/web/src/components/gastro/MenuSearchDialog.tsx` | Client | Shadcn `Command` / `Dialog` with debounced search hitting the RPC server action. |

## Styling

Tailwind. Match Expo theme tokens:

- Primary: `#194383` → `bg-primary-700` or a custom `bg-roebel-navy`.
- Inter font (already in the web bundle).
- Active category underline: 2px `bg-primary-700`.
- Card image radius: `rounded-lg`.

Per-gastro background hint is **not needed** on web — the AI-generated images already bake in the brand. The page itself stays neutral.

## Mobile parity matrix

| Feature | Expo | Web (v1) | Notes |
| --- | --- | --- | --- |
| Speisekarte tab default | ✓ | ✓ | Auto-renders for `sub_type='restaurant'`. |
| Sticky category bar | ✓ stickyHeaderIndices | ✓ CSS `position: sticky` | Easier on web — no React Native ScrollView dance. |
| Featured items grid | ✓ | ✓ | |
| Item detail with sides + variants | ✓ | ✓ | Server-rendered; no order CTA. |
| Search dialog | ✓ Modal | ✓ Shadcn Dialog | |
| 5-star rate on account | ✓ Modal | ✓ Dialog | Requires wallet. |
| Thumbs up/down on item | ✓ | post-v1 | Skip for the first cut. |
| Open Info tab | ✓ via tab | route to `/gastro/<slug>/info` or section anchor | |
| Posts tab | ✓ via tab | optional v1 | Already covered by `/app/posts/`. |
| Owner edit | Org Dashboard | n/a | Editing remains Expo-only in v1. |

## Tailwind page outline

```
/gastro/<slug>
├── Cover hero (1600×400) — uses account.cover_url
├── HeaderActions overlay (search + star)
├── Identity block — name + verified badge + RatingSummary
├── Tabs (Speisekarte / Info / Beiträge) — anchor scroll or proper sub-routes
├── FeaturedItems (only when categories.length > 0)
├── <sticky> StickyCategoryBar
└── CategorySections (each section is a card with title + item rows)
```

## SEO

- Page `metadata` with `title = ${account.name} · Speisekarte`, description from `account.bio` or "Restaurant in Röbel/Müritz".
- `opengraph-image.tsx` returning the first available `menu_items.image_url` of the gastro (or the cover image).
- `application/ld+json` `Restaurant` schema + `MenuItem` schema on the detail page.

## Out of scope for the web build

- Owner-side menu editing.
- AI image generation UI.
- Order / cart.
- Bulk image regeneration.

## Open questions for the web implementer

- Should `/gastro/<slug>` be **public** (no auth) or live under `/app/`? Recommendation: **public**, for SEO + share links.
- How to handle thirdweb auth when a guest taps "Bewerten"? Show a wallet-connect prompt (already used elsewhere on web).
- Should we add a Sentry tag `feature=gastro-web` to track failures separately?

## Reference

- Expo implementation: `apps/expo/docs/GASTRO_FEATURE.md`
- AI image pipeline: same Edge Function `generate-menu-image` runs server-side regardless of client; web doesn't need to call it directly in v1.
- Supabase project ref: `wwbeqhkslxdxhktqzqti`.
