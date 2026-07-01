# Profile — Selling Items & Open Ads Rows (Expo)

**Date:** 2026-07-01
**App:** `apps/expo`
**Status:** Design approved, pending implementation plan

## Goal

On a public profile's first page, surface what that account is selling and its
currently-open ads, as horizontal rows placed **above the account's posts**.
Applies to both organisation profiles and citizen (personal) profiles.

## Scope & scoping rules

Two horizontal rows are inserted **between the identity/header block and the tab
strip**, so they sit above the posts on both profile screens. Each row renders
**only when it has items**.

Scoping is by the `account_id` column on `marketplace_listings`:

- **Citizen profile** (`apps/expo/app/user/[username].tsx`)
  - Selling row = listings where `seller_wallet_address` matches that user
    **AND `account_id IS NULL`** (personal listings only), `status = 'active'`.
  - No ads row — deals are organisation-only.
- **Organisation profile** (`apps/expo/app/account/[id]/index.tsx`)
  - Selling row = listings where `account_id = <org>` (already fetched via
    `fetchOrgListings`, active-filtered).
  - Ads row = that org's **open (active) deals** (already fetched, filtered to
    `is_active && status === 'active'`).

Consequence: a listing created via an org shows **only** on the org page, never
on the person's citizen page. A listing created on the personal account shows
only on that citizen's page.

## Rows

- **"Zu verkaufen"** — all active marketplace listings for the account
  (products + services combined). Each card taps to `/marketplace/[id]`.
- **"Anzeigen"** — the org's open/active deals. Cards are **non-tappable**,
  matching today's Info-tab behavior (no reliable deal-detail route exists).

Label choices confirmed with the user: `Zu verkaufen` (selling) and `Anzeigen`
(ads — same label as the existing `apps/expo/app/org/ads.tsx` screen).

## Components

### `apps/expo/components/profile/ProfileOfferRows.tsx` (new)

A **presentational** component — no data fetching.

- Props:
  - `listings: MarketplaceListingRecord[]` — active listings (already filtered).
  - `deals?: BusinessDealRecord[]` — active deals; omitted on citizen profiles.
  - `sellingTitle?: string` — defaults to `"Zu verkaufen"`.
- Behavior:
  - Guards each item (`item && item.id && typeof item.title === 'string'`),
    mirroring the org screen's existing `safe*` filters.
  - Renders the "Zu verkaufen" row when there are listings; renders "Anzeigen"
    when there are deals.
  - Returns `null` when both are empty.
- Visual: reuses the existing `mediaCard` pattern from the org screen (200px
  cards, horizontal `ScrollView`, image + title + meta), so the rows look
  identical to the Info-tab sections. Styles live locally in the component.
- Uses `useTheme()` + `StyleSheet.create()` (no NativeWind). Fonts via existing
  tokens/aliases. Never renders a wallet address (only titles + prices).

This component removes the copy-pasted card markup that the org screen currently
repeats for each media section.

## Data fetching

### Organisation screen — no new fetch

`listings` (active) and `deals` (active) already exist in component state. Just
render above the tabs:

```tsx
<ProfileOfferRows listings={listings} deals={deals} />
```

Insert between the identity block (ends ~line 823) and `tabsWrap` (~line 826).
No sticky-index concern — the org screen uses a custom absolute sticky bar, not
`ScrollView` `stickyHeaderIndices`, and the menu sticky math is measured via
`onLayout`, so it auto-adjusts to the added height.

Known existing constraint (not changed here): org deals are only fetched when
the org resolves to a linked `business` entity (`fetchDealsByBusiness` is keyed
by business id). Orgs without a linked business simply have no ads row.

### Citizen screen — one new lib function

Add to `apps/expo/lib/supabase-marketplace.ts`:

```ts
export async function fetchPersonalListingsByWallet(
  wallet: string
): Promise<MarketplaceListingRecord[]>
```

Query `marketplace_listings` where:
- `seller_wallet_address` matches `wallet` **case-insensitively** via `ilike`
  (seller wallets may be stored checksummed or lowercased),
- `account_id IS NULL` (`.is('account_id', null)`),
- `status = 'active'`,
- ordered by `created_at` desc.

Load it inside the existing `loadProfile` flow once the profile's
`wallet_address` is known; store in a `listings` state array; render
`<ProfileOfferRows listings={listings} />` above the tabs.

**Sticky-header index:** the citizen `ScrollView` uses
`stickyHeaderIndices={[3]}` (the tabs). Inserting the offer-rows element as a
new child bumps the tabs to index 4, so update to `stickyHeaderIndices={[4]}`.
The offer-rows element is **always present** (it returns `null` when empty), so
the child index stays stable regardless of whether the user has listings.

## Trade-offs / decisions

- **Org "Info" tab is left exactly as-is** (user decision). Produkte / Services
  / Deals still render there too. The new rows are an additional highlight above
  the tabs; the minor duplication is accepted to keep risk low.
- **Selling row combines products + services** into one "Zu verkaufen" row; the
  Info tab keeps them split. This is intentional — the row is a compact
  highlight, the Info tab is the detailed breakdown.
- **Ads cards non-tappable** — parity with the current Info-tab deals rendering.

## Out of scope

- No changes to how listings or deals are created.
- No new deal-detail route.
- No discovery/browse feed on the user's own `profile.tsx` (explicitly rejected
  during brainstorming — this is per-public-profile only).
- No moving of products/services/deals out of the org Info tab.

## Verification

- The repo has no evident React Native component test harness and ~431
  pre-existing `tsc` errors (untyped Supabase client). The implementation plan
  will confirm whether a test runner exists.
- Primary verification is manual/visual in the running Expo app:
  1. Citizen with a personal listing → "Zu verkaufen" row appears on their
     public profile above the tabs; org-scoped listing does **not** appear there.
  2. Org with active listings and an open deal → both "Zu verkaufen" and
     "Anzeigen" rows appear above the tabs; Info tab unchanged.
  3. Accounts with no listings/deals → no rows, layout unchanged, tabs still
     sticky on the citizen screen.
- Any pure/isolatable logic (case-insensitive wallet match, `account_id IS NULL`
  scoping, empty→null render) is the highest-value thing to guard if a test
  harness is available.

## Key files

| Purpose | Path |
|---|---|
| New offer-rows component | `apps/expo/components/profile/ProfileOfferRows.tsx` |
| Citizen public profile | `apps/expo/app/user/[username].tsx` |
| Org public profile | `apps/expo/app/account/[id]/index.tsx` |
| Marketplace lib (new fn) | `apps/expo/lib/supabase-marketplace.ts` |
| Types (existing) | `apps/expo/lib/types.ts` |
