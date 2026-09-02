# Map chrome redesign + org sheet polish (slices A & B)

**Date:** 2026-08-30
**Status:** approved, in implementation
**Predecessors:** [org map sheet](2026-08-30-org-map-sheet-design.md) (slices 1–2, shipped)
**Successor:** slice C — category sheet content (own spec; decisions parked in `.slice-c-notes.md`)

## Problem

Two things are wrong with the map as it stands.

The org sheet works but reads as a form, not a place: photos scroll freely
without snapping, the opening-hours row sits flush while everything around it
is inset by 16px, and the comment field disappears behind the keyboard the
moment you tap it. An org owner can only add photos by leaving the map for
`edit-org.tsx`.

The map chrome has grown by accretion. Filter pills, a SOS/Erkunden/locate row
and the tab bar are all stacked at the bottom, and there is no way to browse by
what you actually want — somewhere to eat, a café, a recommendation.

## Scope

**Slice A — sheet polish.** Paged photo gallery, hours-row alignment, a comment
bar that rides above the keyboard, owner photo upload from the sheet.

**Slice B — map chrome.** Filter pills move to the top on a glass surface;
a new icon-and-label category row takes the bottom strip; SOS and Erkunden move
to the top-left; each category opens a real bottom sheet.

**Deliberately not here.** Category sheet *content* — the curated lists behind
Empfehlungen and the restaurant/meal grid behind Essen — is slice C. The sheets
open and behave correctly in this slice with a placeholder body, so the
navigation can be judged before the data model is built.

## Slice A — sheet polish

### Paged photo gallery

`OrgPhotoCarousel` today is a `FlatList` of 168×210 tiles with `horizontal` and
no snapping, so it drifts to rest between photos. It becomes a paged gallery:
tiles near full sheet width, `pagingEnabled` with `snapToInterval` matching tile
width plus gap, `decelerationRate="fast"`, and page dots beneath.

`getItemLayout` is supplied so paging maths does not depend on measurement, and
`snapToAlignment="start"` keeps the first tile flush with the 16px inset the
rest of the sheet uses.

### Hours row alignment

`OrgOpeningHours` renders inside the sheet's ungutterred wrapper while its
siblings (`description`, `counts`, the comment thread) each apply
`paddingHorizontal: 16`. It gains the same, so the "geöffnet …" line and the
expanded week align with everything else.

### Comment bar above the keyboard

The composer currently uses a plain `TextInput` inside a
`BottomSheetScrollView`. On focus the keyboard covers it — the field being typed
into is invisible.

Fix is two changes: the composer's `TextInput` becomes `BottomSheetTextInput`
from `@gorhom/bottom-sheet`, and the sheet sets `keyboardBehavior="interactive"`
with `keyboardBlurBehavior="restore"`. That is the library's supported path for
inputs inside a sheet; a bare `KeyboardAvoidingView` fights the sheet's own pan
gesture on Android.

Applies to both composers — `OrgCommentThread` (including its reply box) and
`OrgExperienceComposer`.

### Owner photo upload from the sheet

A `+` tile at the end of the carousel, rendered only when
`useAccount().isOwnerOf(accountId)` is true. It opens the picker, uploads via
`uploadMediaFile(uri, wallet, 'image', 'org-photos')` and appends through the
existing `addAccountPhoto`, then refreshes the carousel.

Reordering and deleting stay in `edit-org.tsx`. The sheet gets the one action an
owner wants while standing in their own shop; the management surface stays where
it already works.

## Slice B — map chrome

### Layout

```
┌──────────────────────────────────────┐
│ [SOS] [Erkunden]        pills ▸      │  ← top: glass icon buttons + filter pills
│                                      │
│                MAP                   │
│                                      │
│                          [locate]    │
│ ⭐   🍽   ☕   🍸   🎭   🛍   🛏      │  ← bottom: glass category row
│ Empf. Essen Cafés Bars …             │     icon above, centred label below
├──────────────────────────────────────┤
│           app tab bar                │
└──────────────────────────────────────┘
```

### Glass

Both new surfaces use the existing `GlassSurface` / `GlassBackdrop` from
`components/GlassSurface.tsx` — the recipe already validated on Android in
August (single sampler/target, `androidExperimentalBlur`, intensity tuned for
the chrome material). No new blur implementation, and no second sampler: that
was the specific thing that broke Android blur before.

### Filter pills to the top

`MapFilterBar` gains a `position: 'top' | 'bottom'` prop rather than being
rewritten, so its chip state, live-bus toggle and `MapFilterState` wiring stay
untouched. At `top` it renders below the safe-area inset, horizontally
scrollable, on a glass background.

### Category row

New `components/map/MapCategoryRow.tsx`. Configuration lives in
`lib/map/categories.ts` as a plain array so it is testable and slice C can
extend it without touching the component:

| key | label | icon |
| --- | --- | --- |
| `empfehlungen` | Empfehlungen | ⭐ |
| `essen` | Essen | 🍽️ |
| `cafes` | Cafés | ☕ |
| `bars` | Bars | 🍸 |
| `ausgehen` | Ausgehen | 🎭 |
| `shops` | Shops | 🛍️ |
| `uebernachten` | Übernachten | 🛏️ |

Icon above, label centred beneath, horizontally scrollable, glass background.
Labels are German per the app-wide rule.

### Category sheets

New `components/map/MapCategorySheet.tsx` — a `BottomSheet` opened by the row,
carrying the category's title and icon, with snap points `['55%', '92%']`.
In this slice the body is an explicit "kommt bald" placeholder naming the
category. It is a real sheet with real dismiss, drag and backdrop behaviour, so
the interaction can be judged now.

Slice C replaces the body only; the row, the sheet shell and the open/close
plumbing are final.

### SOS and Erkunden

Both move to the top-left as round glass icon buttons, freeing the bottom strip.
MyLocation stays bottom-right, above the category row.

## Testing

- `lib/map/categories.ts`: unit tests for key uniqueness and that every category
  carries a label and icon — cheap guards that catch a bad slice C edit.
- `MapFilterBar` at `position: 'top'` must not regress filter state; existing
  `map-filters` tests continue to cover the state itself.
- Paging maths: `getItemLayout` offset for index *n* equals
  *n* × (tile width + gap).
- Gallery, keyboard behaviour, glass rendering and the category sheets are
  verified on device — Android blur in particular has regressed silently before.

## Risks

- **Android blur** is the known-fragile piece. If the category row renders as a
  flat tint rather than frosted, the cause is almost always a second blur
  target, not the intensity.
- **Chrome density**: the top now carries two icon buttons plus a scrolling pill
  row. If it reads as crowded on a small device, the pills drop to a single row
  with the live-bus toggle moving into the category sheet.
