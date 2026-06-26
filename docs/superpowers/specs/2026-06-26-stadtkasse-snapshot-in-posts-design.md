# Stadtkasse snapshot in posts — Design

**Date:** 2026-06-26
**Scope:** `apps/expo` only (composer + feed). Web app out of scope.

## Goal

Let a user attach a **frozen snapshot of the Stadtkasse** (the civic treasury euro
figure) to a feed post. A new `@` button in the composer toolbar opens a small menu;
choosing „Stadtkasse" captures the current treasury value and embeds a tappable card
in the post. The card renders **between the body text and the images** and, when
tapped in the feed, navigates to the Stadtkasse/treasury screen.

The card matches the provided design: piggy-bank image · bold euro figure
(`263,45 €`, `de-DE`) · `Stadtkasse` label · chevron `›`. **No date is shown.**

## Decisions (locked with user)

- **Frozen, not live.** The euro figure is captured at the moment „Stadtkasse" is
  picked in the composer and stored on the post. It never re-reads the chain on feed
  scroll. (Honest historical artifact; no per-scroll RPC cost.)
- **No date line.** The stored snapshot keeps a `captured_at` timestamp as metadata,
  but the card never displays a date — it matches the screenshot exactly.
- **`@` opens a small menu** (bottom sheet) with one row today: „Stadtkasse". Built so
  more reference types (people/events) can be added later, but those are **out of scope** now.
- **One snapshot per post.**
- **Storage = jsonb column** on `posts` (not a numeric column, not a join table —
  there is no Stadtkasse table; the value is computed from chain reads).

## Data model

New nullable column on `posts`:

```
posts.stadtkasse_snapshot  jsonb null
```

Shape when present:

```json
{ "euro": 263.45, "captured_at": "2026-06-26T18:22:00.000Z" }
```

- `euro` — `number`, the frozen treasury figure (full precision; formatted at render).
- `captured_at` — ISO string, metadata only (not displayed). Recorded at @-pick time.

`null` (or absent) → no card. `select('*')` in `fetchFeedPosts()` already returns new
columns, so **no query change** is required — only the TypeScript types and renderers.

Migration applied via the **Supabase MCP** (CLAUDE.md mandates MCP, not the CLI):

```sql
alter table posts add column if not exists stadtkasse_snapshot jsonb;
```

## Value source

Same source as the rewards card and treasury screen:

```ts
import { getTreasuryEuro } from '@/lib/roebel-taler';
import { attesterSafeGnosisAddress } from '@/constants/gnosis';

const euro = await getTreasuryEuro(attesterSafeGnosisAddress);
```

`getTreasuryEuro` aggregates native xDAI (× 0.92 USD→EUR) + EURe (1:1) + Röbel Münzen
(1:1) read from the Attester Safe on Gnosis. It can throw / be slow — handle loading
and failure (see Error handling).

## Components

### `components/feed/StadtkasseSnapshotCard.tsx` (new, shared)

One presentational component used in **both** the composer preview and the feed.

```ts
type Props = {
  euro: number;
  onPress?: () => void;   // feed: router.push('/treasury')
  onRemove?: () => void;  // composer: remove the snapshot
};
```

- Layout mirrors the existing embed cards (`PostLinkedEventCard` /
  `PostLinkedMarketplaceCard`): a `Pressable` row, `colors.card` background,
  `softShadow`, rounded corners, `useTheme()` + `StyleSheet.create()`.
- Left: piggy-bank image (reuse `STADTKASSE_IMG` asset already used on the rewards
  card — confirm/move to a shared import).
- Center: `Text` bold euro `${euro.toLocaleString('de-DE', { minimumFractionDigits: 2,
  maximumFractionDigits: 2 })} €` over a `Stadtkasse` label.
- Right: chevron `›` when `onPress` is set (feed); a remove `×` button when `onRemove`
  is set (composer). Exactly one of the two is provided per usage.
- No date text anywhere.

## Composer flow

### Toolbar `@` button — `apps/expo/app/create/index.tsx`

- Add `import AtIcon from '@/assets/icons/at-sign.svg';` (new asset, stroke/currentColor
  so the `color` prop themes it like `ImageIcon`/`VideoIcon`).
- Add a `Pressable` to `toolbarLeft` after the emoji button, rendering
  `<AtIcon width={22} height={22} color={draft.stadtkasseSnapshot ? colors.primary : colors.textSecondary} />`.
  When a snapshot is already attached the icon reads as "active" (primary color).
- On press: `Keyboard.dismiss()` then open the `@` menu (a small bottom sheet /
  modal — follow whatever sheet pattern the emoji/sticker picker already uses in this
  screen to stay consistent).

### The `@` menu

- A minimal sheet listing one selectable row: piggy icon + „Stadtkasse".
- If no snapshot attached → tapping the row triggers capture (below).
- If a snapshot is already attached → the row shows a check and tapping it removes the
  snapshot (toggle). Keeps "one per post" obvious.

### Capture

On „Stadtkasse" select with none attached:
1. Show an inline spinner / disabled state on the row.
2. `const euro = await getTreasuryEuro(attesterSafeGnosisAddress)`.
3. On success: `draft.setStadtkasseSnapshot({ euro, captured_at: new Date().toISOString() })`,
   close the sheet.
4. On failure: keep nothing attached, show a short error toast
   („Stadtkasse konnte nicht geladen werden"), close the sheet.

### Preview placement

Render `<StadtkasseSnapshotCard euro={draft.stadtkasseSnapshot.euro}
onRemove={() => draft.setStadtkasseSnapshot(null)} />` **under the body `TextInput`
and above the image previews** in the composer's scroll content — the same visual
order the feed uses. `×` removes it.

### Draft state — `apps/expo/context/CreatePostContext.tsx`

- Add to `CreatePostState`: `stadtkasseSnapshot: StadtkasseSnapshot | null` where
  `type StadtkasseSnapshot = { euro: number; captured_at: string }`.
- Add `stadtkasseSnapshot: null` to `initialState` (so `reset()` clears it).
- Add action `setStadtkasseSnapshot: (snap: StadtkasseSnapshot | null) => void` (a
  single setter handles attach and remove).
- Export the type for reuse by the card and the insert payload.

### Review step — `apps/expo/app/create/review.tsx`

- Render the same `StadtkasseSnapshotCard` (read-only, no `onRemove`/`onPress`, or a
  non-interactive variant) in the preview, in the text→card→images order.
- In `handlePost()` / the `createPost()` call, pass
  `stadtkasse_snapshot: draft.stadtkasseSnapshot ?? undefined`.

## Persistence — `apps/expo/lib/supabase-posts.ts` + `lib/types/feed.ts`

- `CreatePostInput` (in `lib/types/feed.ts`): add
  `stadtkasse_snapshot?: { euro: number; captured_at: string } | null;`.
- `createPost()` insert payload: add
  `stadtkasse_snapshot: input.stadtkasse_snapshot ?? null,`.
- `PostRecord` (in `lib/types/feed.ts`): add
  `stadtkasse_snapshot: { euro: number; captured_at: string } | null;`.
- `fetchFeedPosts()` uses `select('*')` → no change needed for the column to come back.

## Feed render — `apps/expo/components/feed/FeedPostCard.tsx`

In the existing text→embed→images slot (where `linked_event` / `linked_marketplace`
render, ~lines 105–115), add one conditional **after** the linked cards and **before**
`PostImageGrid`:

```jsx
{post.stadtkasse_snapshot && (
  <StadtkasseSnapshotCard
    euro={post.stadtkasse_snapshot.euro}
    onPress={() => router.push('/treasury')}
  />
)}
```

## Error handling & edge cases

- **Capture failure / slow RPC:** spinner during fetch; on throw, attach nothing +
  toast. Never attach a `0`/placeholder value.
- **One per post:** the menu toggles; the toolbar icon reflects attached state.
- **Coexists with media:** the snapshot card is independent of images/video (it sits
  above them), unlike the image/video mutual exclusivity. No `postType` change (it stays
  `'user'`; this is not a `linked_event`/`linked_marketplace` share).
- **Malformed/legacy rows:** `stadtkasse_snapshot` null/absent on every existing post →
  renders nothing. Card guards on `typeof euro === 'number'`.

## Out of scope (YAGNI)

- Mentioning people / events / other entities in the `@` menu.
- Web-app rendering of the card (web feed may ignore the column).
- Showing the xDAI / EURe / Münzen breakdown or any date in the snapshot card.
- Re-fetching / refreshing the value after capture (it is frozen by decision).

## Files touched

| File | Change |
|------|--------|
| Supabase migration (via MCP) | add `posts.stadtkasse_snapshot jsonb` |
| `apps/expo/assets/icons/at-sign.svg` | new `@` icon asset |
| `apps/expo/components/feed/StadtkasseSnapshotCard.tsx` | new shared card |
| `apps/expo/context/CreatePostContext.tsx` | snapshot state + setter + reset |
| `apps/expo/app/create/index.tsx` | `@` toolbar button + menu + preview |
| `apps/expo/app/create/review.tsx` | preview card + pass to `createPost` |
| `apps/expo/lib/supabase-posts.ts` | insert `stadtkasse_snapshot` |
| `apps/expo/lib/types/feed.ts` | `CreatePostInput` + `PostRecord` fields |
| `apps/expo/components/feed/FeedPostCard.tsx` | render card in the text→images slot |
