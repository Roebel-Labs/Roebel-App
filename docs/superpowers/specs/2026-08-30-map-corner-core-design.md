# Map Corner Core — Design Spec (Slice 1)

**Date:** 2026-08-30
**Status:** Approved (design approved in chat; slice decomposition + data-model decisions approved via structured questions)
**Branch:** `feat/map-corner-core` (off `origin/main`, post-Umfragen merge, SDK 56 / RN 0.85)

## Goal

Rebuild the main map experience (`apps/expo/app/location.tsx`) in the spirit of the
Corner app (corner.inc): emoji/PNG pins with name labels, a real draggable bottom
sheet for place previews, clustering, a Corner-style bottom filter bar with an
"open now" toggle, and full dark-mode support. This slice is the visual/UX core;
lists, comments, AI search, and org self-serve pins are later slices (see Roadmap).

## Approved slice decomposition

| Slice | Content | Status |
|---|---|---|
| 1 | Map core UX (this spec) | building |
| 2 | Saved places + curated lists — personal private lists + official public curations; list items polymorphic `(entity_type, entity_id)` so a list can also hold meals/menu items | later |
| 3 | Comments: generalize `event_experiences` into polymorphic `experiences` keyed `(entity_type, entity_id)` — events, org accounts, restaurants, businesses, POIs; one UI component set | later |
| 4 | AI search bottom sheet: Mecky tool loop + map-bounds-aware place tools + places rich-card that drops pins / flies camera | later |
| 5 | Org map presence: geo + marker columns on `accounts` (lat/lng, address, map_category, marker_emoji, marker_image_url, marker_size), org-settings pin editor, Mühle windmill PNG at size `lg` | later |

## Slice 1 architecture

### Approach (chosen)

`@gorhom/bottom-sheet` v5 + data-driven Mapbox layers. Rationale:

- Peer deps satisfied: reanimated 4.3.1, gesture-handler 2.31.2, `GestureHandlerRootView`
  already wraps the app (`app/_layout.tsx`).
- Markers move from per-entity `Mapbox.PointAnnotation` React views to a single
  `Mapbox.ShapeSource` + CircleLayer/SymbolLayer — the pattern already proven in
  `components/map/EmbeddedMap.tsx:205-239`. This unlocks native clustering and
  `iconImage` PNG markers.

Rejected: hand-rolled Reanimated sheet (rebuilds physics gorhom ships);
incremental carousel restyle (not a sheet; would be redone in slice 4).

### 1. Marker system — `components/map/MapboxMapView.tsx` rewrite

One `ShapeSource` with `cluster` enabled (`clusterRadius≈50`, `clusterMaxZoomLevel≈14`):

- **Pin background** — CircleLayer: white circle (light) / elevated surface (dark),
  subtle stroke + shadow-ish halo; radius from `size` feature property
  (`sm`/`md`/`lg` ≈ 12/16/22). The selected pin renders at `lg` with an accent ring.
- **Emoji** — SymbolLayer, `textField: ['get','emoji']`, size scaled with pin size.
- **Custom PNG pins** — `<Mapbox.Images>` registry (assets under
  `apps/expo/assets/map-markers/`) + SymbolLayer with `iconImage` for features
  carrying a `markerImage` property. Filter: features with `markerImage` render the
  icon layer; all others the emoji layer. Slice 1 ships the mechanism; per-entity
  data arrives with slice 5 (user provides PNGs: Mühle windmill, Döner, etc.).
- **Labels** — SymbolLayer with title (+ optional subtitle) beside the pin,
  text halo for basemap legibility. Featured entities (`is_featured`) always show
  labels; others only above a zoom threshold.
- **Clusters** — CircleLayer bubble + count SymbolLayer; tap zooms toward the cluster.
- Tap handling via `ShapeSource.onPress`: cluster → zoom; point → select entity.

Emoji assignment in new `lib/map/markers.ts`:

- Dictionaries: 11 `BusinessCategory` values → emoji; event categories → emoji;
  POI types (reuse existing `POI_EMOJIS` / `POI_TYPE_COLORS` sources); restaurants
  default 🍽️.
- **Slug-keyed override map** (code-level) for per-place emoji without DB changes
  (e.g. `an-der-waage` → 🍔). Easy for the user to extend.
- PNG registry: name → `require()` of bundled asset.

### 2. Place sheet — new `components/map/MapPlaceSheet.tsx`

`@gorhom/bottom-sheet` rendered inside the map screen (NOT a Modal — map stays
live and visible behind it):

- **Peek snap (~280px)**: horizontal pager of place cards (image / emoji
  placeholder, title, category chip with emoji, open/closed badge, "Details" +
  "Route" actions, optional call). Swiping between cards flies the camera —
  preserves today's carousel browsing behavior inside a real sheet.
- **Expanded snap (~60%)**: the selected place grows into a richer card:
  description, opening hours, address, phone/website row, photo strip (gallery
  images where available). "Details" still navigates to the existing detail
  screens (`/event/[id]`, `/restaurant/[slug]`, `/business/[slug]`, `/poi/[id]`);
  the sheet is a preview, not a replacement.
- Drag below peek → dismiss + deselect marker.
- Card layout leaves visual room for slice-2 save buttons and slice-3 comments,
  but slice 1 does not stub them (YAGNI).
- Retires `components/map/MapPreviewCarousel.tsx`; deletes already-dead
  `MapPreviewCard.tsx` and `EventPreviewCard.tsx`.

### 3. Filter bar + theme — new `components/map/MapFilterBar.tsx`

- Filters move from top overlay to a **bottom Corner-style chip row**: emoji +
  German label — 🎪 Veranstaltungen, 🍽️ Gastro, 🛍️ Unternehmen, ⭐ Tipps,
  🚌 Live-ÖPNV — same multi-toggle `MapFilter` semantics as today.
- **"jetzt geöffnet" toggle**: filters restaurants/businesses by opening hours,
  reusing the open/closed computation the carousel already performs.
- Replaces `components/map/MapFilterChips.tsx`. Advisory chips (mosquito/tick/…)
  keep working, restyled into the new bar area.
- **All map chrome becomes theme-aware** via `useTheme()`: container, header
  circle buttons, chips, sheet surfaces, markers (circle bg + label halo).
  New code uses `fontFamily` tokens from `constants/theme.ts`, not legacy
  `'Inter-*'` strings.

### 4. Data behavior change (approved)

`lib/map/geojson.ts` `ensureCoordinates()` fabricates random coordinates within
2km of Röbel for entities missing lat/lng. On the redesigned map these fake pins
would mislead. **Change:** entities without real coordinates do not render on the
map (they remain in lists/search). The random-coordinate fabrication is removed.

### 5. Touched files

| File | Action |
|---|---|
| `apps/expo/package.json` | add `@gorhom/bottom-sheet` v5 |
| `apps/expo/lib/map/markers.ts` | new — emoji dictionaries, slug overrides, PNG registry |
| `apps/expo/lib/map/geojson.ts` | add `emoji`/`size`/`markerImage`/label props; drop fabricated coords |
| `apps/expo/components/map/MapboxMapView.tsx` | rewrite markers: ShapeSource + layers, clustering, Images, selected state, theme |
| `apps/expo/components/map/MapPlaceSheet.tsx` | new — gorhom sheet: card pager (peek) + rich card (expanded) |
| `apps/expo/components/map/MapFilterBar.tsx` | new — bottom emoji chips + open-now toggle, theme-aware |
| `apps/expo/app/location.tsx` | wire sheet + filter bar, remove carousel, theme fixes |
| `apps/expo/components/map/MapPreviewCarousel.tsx` | delete (replaced) |
| `apps/expo/components/map/MapPreviewCard.tsx` | delete (dead) |
| `apps/expo/components/map/EventPreviewCard.tsx` | delete (dead) |
| `apps/expo/assets/map-markers/` | new dir for custom PNG pins (user-provided) |

Deep links preserved: `focusEntityType`/`focusEntityId`/`filterOnly`/`selectedEventId`
query params on `/location` keep working (they select + fly + open the sheet).

### 6. Error handling

- Expo Go / Mapbox unavailable: existing `isMapboxAvailable` fallback path stays.
- Missing images on cards: emoji placeholder (existing pattern).
- Entities without coordinates: skipped from GeoJSON (see §4).
- Sheet with zero items: never presented; deselect closes it.

### 7. Verification

- Full-project `tsc` gate on **new** errors only (~431 pre-existing errors are
  known; never per-file tsc — TS5112 false-passes).
- On-device walkthrough on a dev build (Mapbox does not run in Expo Go):
  marker rendering light+dark, cluster tap, marker tap → sheet, card paging →
  camera fly, drag to expand/dismiss, filters, open-now, deep links from
  event/account pages, live ÖPNV layer untouched.
- User runs EAS himself; done = commit + push.
