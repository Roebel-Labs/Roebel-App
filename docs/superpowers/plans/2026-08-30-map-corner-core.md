# Map Corner Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the main map screen (`apps/expo/app/location.tsx`) Corner-style: emoji/PNG pins with labels + clustering, a @gorhom/bottom-sheet place preview replacing the carousel, a bottom emoji filter bar with "jetzt geöffnet", full dark mode.

**Architecture:** Markers move from per-entity `PointAnnotation` React views to one clustered `ShapeSource` with CircleLayer/SymbolLayer (pattern proven in `components/map/EmbeddedMap.tsx`). The place preview becomes a gorhom sheet living inside the screen (map stays live). Emoji/PNG assignment is pure data in `lib/map/markers.ts` (unit-tested), wired through `lib/map/geojson.ts` feature properties.

**Tech Stack:** Expo SDK 56 / RN 0.85, `@rnmapbox/maps` 10.3.5, `@gorhom/bottom-sheet` v5 (new dep; peers reanimated 4.3.1 + gesture-handler 2.31.2 already installed), jest-expo for pure-logic tests.

**Spec:** `docs/superpowers/specs/2026-08-30-map-corner-core-design.md`

## Global Constraints

- Styling: `StyleSheet.create()` + `useTheme()` — NO NativeWind. Fonts via `fontFamily` tokens from `constants/theme.ts` (never literal `'Inter-*'` in new code).
- All UI copy German.
- Package manager: pnpm. Run installs from `apps/expo/`.
- Never per-file `tsc` (TS5112 false-passes). Gate = full `npx tsc --noEmit` in `apps/expo`, compare against baseline count (~431 pre-existing errors; only NEW errors block).
- Tests: jest-expo, colocated under `lib/__tests__/`. Run: `npx jest lib/__tests__/<file> --watchAll=false`.
- Never run `eas update` — done = commit + push.
- Deep links on `/location` must keep working: `selectedEventId`, `focusEntityType`+`focusEntityId`, `filterOnly=orgs`.
- Working branch: `feat/map-corner-core`.

---

### Task 1: Dependency + assets scaffold + tsc baseline

**Files:**
- Modify: `apps/expo/package.json` (via pnpm)
- Create: `apps/expo/assets/map-markers/README.md`

**Interfaces:**
- Produces: importable `@gorhom/bottom-sheet` (used by Task 5), `assets/map-markers/` dir (referenced by Task 2 registry).

- [ ] **Step 1: Record tsc baseline**

```bash
cd apps/expo && npx tsc --noEmit 2>&1 | grep -c "error TS" | tee /tmp/tsc-baseline.txt
```

Expected: a number (~431). Save it — the final gate compares against this.

- [ ] **Step 2: Install the sheet library**

```bash
cd apps/expo && pnpm add @gorhom/bottom-sheet@^5
```

Expected: resolves v5.x, no peer warnings for reanimated/gesture-handler.

- [ ] **Step 3: Create the marker-assets dir**

`apps/expo/assets/map-markers/README.md`:

```markdown
# Custom map marker PNGs

Drop marker images here (recommended: 128×128 px PNG with transparency).
Register each file in `lib/map/markers.ts` → `MARKER_IMAGES`, then reference
the registry key from a feature's `markerImage` property (per-place wiring
lands with the org-map-presence slice; slug-based wiring works today via
`SLUG_MARKER_IMAGE_OVERRIDES` in the same file).

Planned: `muehle.png` (windmill, size lg), Döner/Burger for An der Waage.
```

- [ ] **Step 4: Commit**

```bash
git add apps/expo/package.json pnpm-lock.yaml apps/expo/assets/map-markers/README.md
git commit -m "feat(expo): add @gorhom/bottom-sheet v5 + map-marker asset scaffold"
git push
```

---

### Task 2: `lib/map/markers.ts` — emoji dictionaries, overrides, PNG registry (TDD)

**Files:**
- Create: `apps/expo/lib/map/markers.ts`
- Test: `apps/expo/lib/__tests__/map-markers.test.ts`

**Interfaces:**
- Produces (consumed by Task 3):
  - `type MarkerSize = 'sm' | 'md' | 'lg'`
  - `eventEmoji(category: string | null | undefined): string`
  - `restaurantEmoji(slug: string | null): string`
  - `businessEmoji(slug: string | null, category: string | null | undefined): string`
  - `poiEmoji(type: string): string`
  - `markerImageForSlug(slug: string | null): string | undefined`
  - `MARKER_IMAGES: Record<string, number>` (consumed by Task 4 `<Mapbox.Images>`)

- [ ] **Step 1: Write the failing test** — `apps/expo/lib/__tests__/map-markers.test.ts`

```ts
import {
  eventEmoji,
  restaurantEmoji,
  businessEmoji,
  poiEmoji,
  markerImageForSlug,
} from '@/lib/map/markers';

describe('map marker emoji resolution', () => {
  it('maps event categories and falls back to 📍', () => {
    expect(eventEmoji('Musik')).toBe('🎵');
    expect(eventEmoji('Essen & Trinken')).toBe('🍴');
    expect(eventEmoji('Unbekannt')).toBe('📍');
    expect(eventEmoji(null)).toBe('📍');
  });

  it('maps business categories and falls back to 🏪', () => {
    expect(businessEmoji(null, 'gastronomie')).toBe('🍽️');
    expect(businessEmoji(null, 'handwerk')).toBe('🔨');
    expect(businessEmoji(null, null)).toBe('🏪');
  });

  it('slug overrides beat category emoji', () => {
    expect(businessEmoji('__test-doener', 'einzelhandel')).toBe('🥙');
    expect(restaurantEmoji('__test-doener')).toBe('🥙');
  });

  it('restaurants default to 🍽️', () => {
    expect(restaurantEmoji(null)).toBe('🍽️');
    expect(restaurantEmoji('unknown-slug')).toBe('🍽️');
  });

  it('maps poi types and falls back to ⭐', () => {
    expect(poiEmoji('swim_spot')).toBe('🏊');
    expect(poiEmoji('nope')).toBe('⭐');
  });

  it('resolves marker images by slug, undefined otherwise', () => {
    expect(markerImageForSlug('unknown')).toBeUndefined();
    expect(markerImageForSlug(null)).toBeUndefined();
  });
});
```

(`__test-doener` is a permanent test fixture entry in the override map, prefixed so it never collides with a real slug.)

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/map-markers.test.ts --watchAll=false
```

Expected: FAIL — module `@/lib/map/markers` not found.

- [ ] **Step 3: Implement** — `apps/expo/lib/map/markers.ts`

```ts
/**
 * Marker appearance for the main map — emoji per category, per-place slug
 * overrides, and the custom PNG registry (Corner-style pins).
 *
 * Slug overrides let individual places get a distinctive emoji without a DB
 * migration (per-entity DB columns arrive with the org-map-presence slice).
 */

export type MarkerSize = 'sm' | 'md' | 'lg';

const EVENT_CATEGORY_EMOJI: Record<string, string> = {
  Musik: '🎵',
  Kultur: '🎭',
  Sport: '⚽',
  Fest: '🎉',
  Natur: '🌳',
  Mittelalter: '🏰',
  Lesung: '📖',
  Kirchliches: '⛪',
  Ausstellungen: '🖼️',
  Stadt: '🏛️',
  'Essen & Trinken': '🍴',
};

const BUSINESS_CATEGORY_EMOJI: Record<string, string> = {
  gastronomie: '🍽️',
  einzelhandel: '🛍️',
  handwerk: '🔨',
  dienstleistung: '🤝',
  gesundheit: '💊',
  bildung: '📚',
  kultur: '🎭',
  sport: '⚽',
  tourismus: '⛵',
  immobilien: '🏠',
  sonstiges: '🏪',
};

const POI_TYPE_EMOJI: Record<string, string> = {
  toilet: '🚻',
  drinking_water: '🚰',
  bike_repair: '🔧',
  bike_rental: '🚲',
  swim_spot: '🏊',
  indoor_alternative: '🏛️',
  tourist_info: 'ℹ️',
  pharmacy: '💊',
  observation_stand: '🦅',
  viewpoint: '🔭',
};

// Per-place emoji by slug (restaurants + businesses). Beats category emoji.
// '__test-*' entries are jest fixtures — leave them in.
export const SLUG_EMOJI_OVERRIDES: Record<string, string> = {
  '__test-doener': '🥙',
  // 'an-der-waage': '🍔',
};

// Custom PNG pins: registry key → bundled asset (128×128 recommended).
// Keys are referenced from GeoJSON feature `markerImage` properties and
// registered on the map via <Mapbox.Images images={MARKER_IMAGES} />.
export const MARKER_IMAGES: Record<string, number> = {
  // muehle: require('@/assets/map-markers/muehle.png'),
};

// Per-place PNG pin by slug. Beats emoji entirely when set.
export const SLUG_MARKER_IMAGE_OVERRIDES: Record<string, string> = {
  // 'muehle-roebel': 'muehle',
};

export function eventEmoji(category: string | null | undefined): string {
  return (category && EVENT_CATEGORY_EMOJI[category]) || '📍';
}

export function restaurantEmoji(slug: string | null): string {
  return (slug && SLUG_EMOJI_OVERRIDES[slug]) || '🍽️';
}

export function businessEmoji(
  slug: string | null,
  category: string | null | undefined
): string {
  if (slug && SLUG_EMOJI_OVERRIDES[slug]) return SLUG_EMOJI_OVERRIDES[slug];
  return (category && BUSINESS_CATEGORY_EMOJI[category]) || '🏪';
}

export function poiEmoji(type: string): string {
  return POI_TYPE_EMOJI[type] || '⭐';
}

export function markerImageForSlug(slug: string | null): string | undefined {
  if (!slug) return undefined;
  return SLUG_MARKER_IMAGE_OVERRIDES[slug];
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/map-markers.test.ts --watchAll=false
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/map/markers.ts apps/expo/lib/__tests__/map-markers.test.ts
git commit -m "feat(expo): map marker emoji dictionaries, slug overrides, PNG pin registry"
git push
```

---

### Task 3: `lib/map/geojson.ts` — marker props + drop fabricated coordinates (TDD)

**Files:**
- Modify: `apps/expo/lib/map/geojson.ts` (full rewrite below)
- Test: `apps/expo/lib/__tests__/map-geojson.test.ts`

**Interfaces:**
- Consumes: Task 2 emoji/size helpers.
- Produces (consumed by Tasks 4/6):
  - `MapFeatureProperties` gains `fid: string` (`"${entityType}-${id}"`), `emoji: string`, `size: MarkerSize`, `featured: boolean`, optional `markerImage?: string`; loses `maki`.
  - `entitiesToGeoJSON(events, restaurants, businesses, pois)` — same signature.
  - `processEventsWithCoordinates(events)` now FILTERS OUT events without coordinates (no more random fallback).
  - Deleted: `generateFallbackCoordinates`, `ensureCoordinates`, `eventsToGeoJSON`, `EventGeoJSON`, `EventFeatureProperties` (verified unused).

- [ ] **Step 1: Write the failing test** — `apps/expo/lib/__tests__/map-geojson.test.ts`

```ts
import { entitiesToGeoJSON, processEventsWithCoordinates } from '@/lib/map/geojson';
import type { EventRecord, RestaurantRecord, BusinessRecord } from '@/lib/types';
import type { PoiRecord } from '@/lib/supabase-pois';

const event = (over: Partial<EventRecord> = {}): EventRecord =>
  ({
    id: 'e1',
    title: 'Stadtfest',
    category: 'Fest',
    latitude: 53.37,
    longitude: 12.6,
    image_url: null,
    date: '2026-09-01',
    location: 'Marktplatz',
    is_popular: false,
    ...over,
  }) as unknown as EventRecord;

const restaurant = (over: Partial<RestaurantRecord> = {}): RestaurantRecord =>
  ({
    id: 'r1',
    name: 'Seeblick',
    slug: 'seeblick',
    latitude: 53.37,
    longitude: 12.61,
    address: 'Am See 1',
    cover_image_url: null,
    logo_url: null,
    is_featured: false,
    opening_hours: null,
    ...over,
  }) as unknown as RestaurantRecord;

const business = (over: Partial<BusinessRecord> = {}): BusinessRecord =>
  ({
    id: 'b1',
    name: 'Backhaus',
    slug: 'backhaus',
    category: 'gastronomie',
    latitude: 53.36,
    longitude: 12.59,
    address: 'Str. 2',
    cover_image_url: null,
    logo_url: null,
    is_featured: true,
    opening_hours: null,
    ...over,
  }) as unknown as BusinessRecord;

const poi = (over: Partial<PoiRecord> = {}): PoiRecord =>
  ({
    id: 'p1',
    type: 'swim_spot',
    name_de: 'Badestelle',
    lat: 53.35,
    lon: 12.58,
    address: null,
    status: 'swim_good',
    ...over,
  }) as unknown as PoiRecord;

describe('entitiesToGeoJSON marker properties', () => {
  it('sets fid, emoji, size and featured', () => {
    const fc = entitiesToGeoJSON(
      [event() as any],
      [restaurant()],
      [business()],
      [poi()]
    );
    const byFid = Object.fromEntries(fc.features.map((f) => [f.properties.fid, f.properties]));
    expect(byFid['event-e1'].emoji).toBe('🎉');
    expect(byFid['event-e1'].size).toBe('md');
    expect(byFid['restaurant-r1'].emoji).toBe('🍽️');
    expect(byFid['business-b1'].emoji).toBe('🍽️');
    expect(byFid['business-b1'].featured).toBe(true);
    expect(byFid['business-b1'].size).toBe('lg');
    expect(byFid['poi-p1'].emoji).toBe('🏊');
    expect(byFid['poi-p1'].size).toBe('sm');
  });

  it('omits the markerImage key when no PNG is registered', () => {
    const fc = entitiesToGeoJSON([], [restaurant()], [], []);
    expect('markerImage' in fc.features[0].properties).toBe(false);
  });

  it('drops restaurants/businesses without coordinates instead of faking them', () => {
    const fc = entitiesToGeoJSON(
      [],
      [restaurant({ latitude: null as any, longitude: null as any })],
      [business({ latitude: null as any })],
      []
    );
    expect(fc.features).toHaveLength(0);
  });
});

describe('processEventsWithCoordinates', () => {
  it('filters events without coordinates', () => {
    const out = processEventsWithCoordinates([
      event() as any,
      event({ id: 'e2', latitude: null as any, longitude: null as any }) as any,
    ]);
    expect(out.map((e) => e.id)).toEqual(['e1']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/map-geojson.test.ts --watchAll=false
```

Expected: FAIL — `fid`/`emoji` undefined on properties; the no-coords test fails because fabricated coordinates keep the features.

- [ ] **Step 3: Rewrite `apps/expo/lib/map/geojson.ts`**

```ts
import type { EventRecord, RestaurantRecord, BusinessRecord, MapEntityType } from '@/lib/types';
import type { PoiRecord } from '@/lib/supabase-pois';
import {
  businessEmoji,
  eventEmoji,
  markerImageForSlug,
  poiEmoji,
  restaurantEmoji,
  type MarkerSize,
} from './markers';

export type EventWithCoordinates = EventRecord & {
  latitude: number;
  longitude: number;
};

export type MapFeatureProperties = {
  id: string;
  entityType: MapEntityType;
  // Unique feature id across entity types — used for selected-pin styling.
  fid: string;
  title: string;
  subtitle: string;
  category: string;
  image_url: string | null;
  date: string | null;
  slug: string | null;
  poi_type: string | null;
  poi_status: string | null;
  emoji: string;
  size: MarkerSize;
  featured: boolean;
  // Key into MARKER_IMAGES (lib/map/markers.ts). Omitted (not null) when no
  // PNG pin is registered, so Mapbox `['has','markerImage']` filters work.
  markerImage?: string;
};

export type MapGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, MapFeatureProperties>;

/**
 * Keep only events with real coordinates. Entities without geocoding no
 * longer get fabricated positions — a wrong pin is worse than no pin.
 */
export function processEventsWithCoordinates(events: EventRecord[]): EventWithCoordinates[] {
  return events.filter(
    (e): e is EventWithCoordinates => e.latitude != null && e.longitude != null
  );
}

function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  item: T
): item is T & { latitude: number; longitude: number } {
  return item.latitude != null && item.longitude != null;
}

function feature(
  lon: number,
  lat: number,
  props: Omit<MapFeatureProperties, 'fid'> & { markerImage?: string }
): GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties> {
  const { markerImage, ...rest } = props;
  return {
    type: 'Feature',
    id: `${props.entityType}-${props.id}`,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      ...rest,
      fid: `${props.entityType}-${props.id}`,
      ...(markerImage ? { markerImage } : {}),
    },
  };
}

/**
 * Convert events, restaurants, businesses and POIs into a unified GeoJSON
 * FeatureCollection for the clustered map source. [lng, lat] order.
 */
export function entitiesToGeoJSON(
  events: EventWithCoordinates[],
  restaurants: RestaurantRecord[],
  businesses: BusinessRecord[],
  pois: PoiRecord[] = []
): MapGeoJSON {
  const features: GeoJSON.Feature<GeoJSON.Point, MapFeatureProperties>[] = [];

  for (const e of events) {
    const featured = !!e.is_popular;
    features.push(
      feature(e.longitude, e.latitude, {
        id: e.id,
        entityType: 'event',
        title: e.title,
        subtitle: e.location || '',
        category: e.category || 'Sonstige',
        image_url: e.image_url,
        date: e.date,
        slug: null,
        poi_type: null,
        poi_status: null,
        emoji: eventEmoji(e.category),
        size: featured ? 'lg' : 'md',
        featured,
      })
    );
  }

  for (const r of restaurants.filter(hasCoordinates)) {
    const featured = !!r.is_featured;
    features.push(
      feature(r.longitude, r.latitude, {
        id: r.id,
        entityType: 'restaurant',
        title: r.name,
        subtitle: r.address || '',
        category: 'restaurant',
        image_url: r.cover_image_url || r.logo_url,
        date: null,
        slug: r.slug,
        poi_type: null,
        poi_status: null,
        emoji: restaurantEmoji(r.slug),
        size: featured ? 'lg' : 'md',
        featured,
        markerImage: markerImageForSlug(r.slug),
      })
    );
  }

  for (const b of businesses.filter(hasCoordinates)) {
    const featured = !!b.is_featured;
    features.push(
      feature(b.longitude, b.latitude, {
        id: b.id,
        entityType: 'business',
        title: b.name,
        subtitle: b.address || '',
        category: b.category || 'sonstiges',
        image_url: b.cover_image_url || b.logo_url,
        date: null,
        slug: b.slug,
        poi_type: null,
        poi_status: null,
        emoji: businessEmoji(b.slug, b.category),
        size: featured ? 'lg' : 'md',
        featured,
        markerImage: markerImageForSlug(b.slug),
      })
    );
  }

  for (const p of pois) {
    features.push(
      feature(p.lon, p.lat, {
        id: p.id,
        entityType: 'poi',
        title: p.name_de,
        subtitle: p.address || '',
        category: p.type,
        image_url: null,
        date: null,
        slug: null,
        poi_type: p.type,
        poi_status: p.status,
        emoji: poiEmoji(p.type),
        size: 'sm',
        featured: false,
      })
    );
  }

  return { type: 'FeatureCollection', features };
}
```

Note: `EventRecord.is_popular` exists (`lib/types.ts`); `feature()` builds `fid` and conditionally spreads `markerImage` so absent PNGs leave the key off entirely.

- [ ] **Step 4: Run tests + confirm no stale importers**

```bash
cd apps/expo && npx jest lib/__tests__/map-geojson.test.ts lib/__tests__/map-markers.test.ts --watchAll=false
grep -rn "eventsToGeoJSON\|EventGeoJSON\|EventFeatureProperties\|generateFallbackCoordinates\|maki" --include="*.ts" --include="*.tsx" app/ components/ lib/ | grep -v node_modules | grep -v MakiIcon
```

Expected: tests PASS. Grep shows only `components/map/MapboxMapView.tsx` (`props.maki` — replaced in Task 4).

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/map/geojson.ts apps/expo/lib/__tests__/map-geojson.test.ts
git commit -m "feat(expo): map GeoJSON carries emoji/size/featured/PNG props; no more fabricated coordinates"
git push
```

---

### Task 4: `MapboxMapView` rewrite — clustered emoji/PNG layers, selected pin, theme

**Files:**
- Modify: `apps/expo/components/map/MapboxMapView.tsx` (full rewrite below)
- Modify: `apps/expo/components/map/MapboxMapView.web.tsx` (props sync)
- Delete: `apps/expo/components/map/MakiIcon.tsx` (only importer was MapboxMapView)

**Interfaces:**
- Consumes: Task 3 `MapGeoJSON` (props `fid`/`emoji`/`size`/`featured`/`markerImage`), Task 2 `MARKER_IMAGES`.
- Produces (consumed by Task 6): `Props` gains `selectedFeatureId?: string | null` (a `fid`). `onMarkerPress`, `flyToCoordinate`, `vehiclesGeoJSON`, `onVehiclePress` unchanged.

- [ ] **Step 1: Rewrite `apps/expo/components/map/MapboxMapView.tsx`**

```tsx
import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  ROEBEL_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  CLUSTER_RADIUS,
  CLUSTER_MAX_ZOOM,
} from '@/lib/map/constants';
import type { MapGeoJSON } from '@/lib/map/geojson';
import { MARKER_IMAGES } from '@/lib/map/markers';
import type { MapEntityType } from '@/lib/types';
import { Mapbox } from '@/lib/map/mapbox';

type Props = {
  geojson: MapGeoJSON;
  onMarkerPress: (id: string, entityType: MapEntityType) => void;
  flyToCoordinate?: [number, number] | null; // [lng, lat]
  // fid ("entityType-id") of the currently selected pin — gets an accent ring
  selectedFeatureId?: string | null;
  vehiclesGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  onVehiclePress?: (departureId: string) => void;
};

// Marker circle radius / emoji text size / PNG icon scale per size class
const PIN_RADIUS = ['match', ['get', 'size'], 'sm', 11, 'md', 15, 'lg', 21, 15];
const EMOJI_SIZE = ['match', ['get', 'size'], 'sm', 12, 'md', 17, 'lg', 24, 17];
const ICON_SCALE = ['match', ['get', 'size'], 'sm', 0.25, 'md', 0.35, 'lg', 0.5, 0.35];
const LABEL_FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];

const NOT_CLUSTER = ['!', ['has', 'point_count']];
const IS_CLUSTER = ['has', 'point_count'];
const HAS_IMAGE = ['has', 'markerImage'];
const NO_IMAGE = ['!', ['has', 'markerImage']];

export default function MapboxMapView({
  geojson,
  onMarkerPress,
  flyToCoordinate,
  selectedFeatureId,
  vehiclesGeoJSON,
  onVehiclePress,
}: Props) {
  const { isDark, colors } = useTheme();
  const cameraRef = useRef<any>(null);
  const entitySourceRef = useRef<any>(null);

  const styleURL = Mapbox
    ? isDark
      ? Mapbox.StyleURL.Dark
      : Mapbox.StyleURL.Outdoors || Mapbox.StyleURL.Light
    : '';

  React.useEffect(() => {
    if (flyToCoordinate && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: flyToCoordinate,
        zoomLevel: 15,
        animationDuration: 1000,
        animationMode: 'flyTo',
      });
    }
  }, [flyToCoordinate]);

  const handleVehiclePress = useCallback(
    (e: any) => {
      const feature = e.features?.[0];
      const id = feature?.properties?.id;
      if (id && onVehiclePress) onVehiclePress(id);
    },
    [onVehiclePress]
  );

  const handleEntityPress = useCallback(
    async (e: any) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties ?? {};
      if (props.cluster) {
        // Cluster tap — zoom to the level where it splits apart
        const coords = feat.geometry?.coordinates as [number, number] | undefined;
        if (!coords) return;
        let zoom = DEFAULT_ZOOM + 2;
        try {
          zoom = await entitySourceRef.current?.getClusterExpansionZoom(feat);
        } catch {
          // fall back to a fixed step
        }
        cameraRef.current?.setCamera({
          centerCoordinate: coords,
          zoomLevel: Math.min(zoom ?? MAX_ZOOM, MAX_ZOOM),
          animationDuration: 500,
          animationMode: 'easeTo',
        });
        return;
      }
      if (props.id && props.entityType) {
        onMarkerPress(props.id, props.entityType as MapEntityType);
      }
    },
    [onMarkerPress]
  );

  if (!Mapbox) return null;

  // Theme-aware layer colors (Mapbox styles need literal values, not tokens)
  const pinBg = isDark ? '#2d2e31' : '#ffffff';
  const pinStroke = isDark ? '#5f6368' : '#E5E7EB';
  const labelColor = isDark ? '#e8eaed' : '#111827';
  const labelHalo = isDark ? '#18191B' : '#ffffff';
  const accent = colors.primary;

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={styleURL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: ROEBEL_CENTER,
            zoomLevel: DEFAULT_ZOOM,
          }}
          minZoomLevel={MIN_ZOOM}
          maxZoomLevel={MAX_ZOOM}
          animationMode="flyTo"
          animationDuration={1000}
        />

        <Mapbox.Images images={MARKER_IMAGES} />

        {/* Entities — one clustered source, Corner-style emoji/PNG pins */}
        <Mapbox.ShapeSource
          id="entities-source"
          ref={entitySourceRef}
          shape={geojson}
          cluster
          clusterRadius={CLUSTER_RADIUS}
          clusterMaxZoomLevel={CLUSTER_MAX_ZOOM}
          onPress={handleEntityPress}
        >
          {/* Cluster bubbles */}
          <Mapbox.CircleLayer
            id="entity-clusters"
            filter={IS_CLUSTER as any}
            style={{
              circleRadius: 20,
              circleColor: pinBg,
              circleStrokeWidth: 2,
              circleStrokeColor: accent,
              circleOpacity: 0.95,
            }}
          />
          <Mapbox.SymbolLayer
            id="entity-cluster-count"
            filter={IS_CLUSTER as any}
            style={{
              textField: ['get', 'point_count_abbreviated'] as any,
              textSize: 14,
              textColor: labelColor,
              textFont: LABEL_FONT as any,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />

          {/* Selected pin — accent ring under the pin */}
          <Mapbox.CircleLayer
            id="entity-selected-ring"
            filter={
              ['all', NOT_CLUSTER, ['==', ['get', 'fid'], selectedFeatureId ?? '']] as any
            }
            style={{
              circleRadius: ['+', PIN_RADIUS, 5] as any,
              circleColor: 'rgba(0,0,0,0)',
              circleStrokeWidth: 3,
              circleStrokeColor: accent,
            }}
          />

          {/* Pin background circles (emoji pins only) */}
          <Mapbox.CircleLayer
            id="entity-pin-bg"
            filter={['all', NOT_CLUSTER, NO_IMAGE] as any}
            style={{
              circleRadius: PIN_RADIUS as any,
              circleColor: pinBg,
              circleStrokeWidth: 1.5,
              circleStrokeColor: pinStroke,
            }}
          />
          <Mapbox.SymbolLayer
            id="entity-pin-emoji"
            filter={['all', NOT_CLUSTER, NO_IMAGE] as any}
            style={{
              textField: ['get', 'emoji'] as any,
              textSize: EMOJI_SIZE as any,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textHaloWidth: 0,
            }}
          />

          {/* Custom PNG pins (Mühle & friends) */}
          <Mapbox.SymbolLayer
            id="entity-pin-image"
            filter={['all', NOT_CLUSTER, HAS_IMAGE] as any}
            style={{
              iconImage: ['get', 'markerImage'] as any,
              iconSize: ICON_SCALE as any,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />

          {/* Name labels — featured always, the rest from zoom 14 */}
          <Mapbox.SymbolLayer
            id="entity-label-featured"
            filter={['all', NOT_CLUSTER, ['==', ['get', 'featured'], true]] as any}
            style={{
              textField: ['get', 'title'] as any,
              textSize: 12,
              textColor: labelColor,
              textHaloColor: labelHalo,
              textHaloWidth: 1.4,
              textFont: LABEL_FONT as any,
              textAnchor: 'left',
              textOffset: [1.6, 0] as any,
              textMaxWidth: 9,
              textOptional: true,
            }}
          />
          <Mapbox.SymbolLayer
            id="entity-label"
            filter={['all', NOT_CLUSTER, ['!=', ['get', 'featured'], true]] as any}
            minZoomLevel={14}
            style={{
              textField: ['get', 'title'] as any,
              textSize: 11,
              textColor: labelColor,
              textHaloColor: labelHalo,
              textHaloWidth: 1.4,
              textFont: LABEL_FONT as any,
              textAnchor: 'left',
              textOffset: [1.6, 0] as any,
              textMaxWidth: 9,
              textOptional: true,
            }}
          />
        </Mapbox.ShapeSource>

        {/* Live vehicles — simulated bus / ferry positions */}
        {vehiclesGeoJSON && vehiclesGeoJSON.features.length > 0 ? (
          <Mapbox.ShapeSource
            id="live-vehicles-source"
            shape={vehiclesGeoJSON}
            onPress={handleVehiclePress}
          >
            <Mapbox.CircleLayer
              id="live-vehicles-bg"
              style={{
                circleRadius: 18,
                circleColor: ['get', 'color'] as any,
                circleStrokeWidth: 3,
                circleStrokeColor: '#ffffff',
                circleSortKey: 10,
              }}
            />
            <Mapbox.SymbolLayer
              id="live-vehicles-emoji"
              style={{
                textField: ['get', 'emoji'] as any,
                textSize: 18,
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
            <Mapbox.SymbolLayer
              id="live-vehicles-label"
              style={{
                textField: ['get', 'line_code'] as any,
                textOffset: [0, 1.4] as any,
                textSize: 11,
                textColor: '#ffffff',
                textHaloColor: '#000000',
                textHaloWidth: 1.2,
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textFont: LABEL_FONT as any,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        <Mapbox.UserLocation
          visible={true}
          showsUserHeadingIndicator={true}
          androidRenderMode="compass"
        />
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
```

Implementation notes:
- `getClusterExpansionZoom(feat)` exists on ShapeSource in @rnmapbox/maps 10.x; the try/catch falls back to a fixed zoom step.
- Empty `MARKER_IMAGES` passed to `<Mapbox.Images>` is fine (no-op).
- `featured` in filters compares against boolean `true` — GeoJSON properties survive as booleans through ShapeSource.

- [ ] **Step 2: Sync `apps/expo/components/map/MapboxMapView.web.tsx` Props**

Replace its `type Props` block with:

```tsx
type Props = {
  geojson: MapGeoJSON;
  onMarkerPress: (id: string, entityType: MapEntityType) => void;
  flyToCoordinate?: [number, number] | null;
  selectedFeatureId?: string | null;
  vehiclesGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  onVehiclePress?: (departureId: string) => void;
};
```

(body of the stub unchanged)

- [ ] **Step 3: Delete MakiIcon**

```bash
git rm apps/expo/components/map/MakiIcon.tsx
```

- [ ] **Step 4: Verify no new tsc errors**

```bash
cd apps/expo && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: count ≤ baseline from Task 1.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/map/MapboxMapView.tsx apps/expo/components/map/MapboxMapView.web.tsx
git commit -m "feat(expo): clustered emoji/PNG map pins with labels + selected ring, dark-mode layers"
git push
```

---

### Task 5: `MapPlaceSheet` — gorhom sheet with card pager + expanding detail

**Files:**
- Create: `apps/expo/components/map/MapPlaceSheet.tsx`

**Interfaces:**
- Consumes: `@gorhom/bottom-sheet` (Task 1), `isRestaurantOpen` from `@/lib/utils`, `BUSINESS_CATEGORY_LABELS` from `@/lib/map/constants`, POI label/color maps from `@/lib/supabase-pois`.
- Produces (consumed by Task 6):
  - `export type PlaceItem = { id, entityType: 'event', lat, lon, data: EventRecord } | …'restaurant'/'business'/'poi' variants` (same shape as the old `CarouselItem`).
  - `export default MapPlaceSheet({ items, selectedId, onClose, onSelectionChange }: Props)` — `onSelectionChange(item: PlaceItem)`, `onClose()` fired when dragged below peek.

- [ ] **Step 1: Create `apps/expo/components/map/MapPlaceSheet.tsx`**

Full file:

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import { useTheme } from '@/context/ThemeContext';
import { useLocation } from '@/context/LocationContext';
import { LocationIcon, CalendarIcon, CallIcon } from '@/components/Icons';
import { isRestaurantOpen } from '@/lib/utils';
import { BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import {
  businessEmoji,
  eventEmoji,
  poiEmoji,
  restaurantEmoji,
} from '@/lib/map/markers';
import { fontFamily } from '@/constants/theme';
import type { EventRecord, RestaurantRecord, BusinessRecord, OpeningHours } from '@/lib/types';
import {
  POI_TYPE_LABELS_DE,
  SWIM_STATUS_COLORS,
  SWIM_STATUS_LABELS_DE,
  type PoiRecord,
} from '@/lib/supabase-pois';

export type PlaceItem =
  | { id: string; entityType: 'event'; lat: number; lon: number; data: EventRecord }
  | { id: string; entityType: 'restaurant'; lat: number; lon: number; data: RestaurantRecord }
  | { id: string; entityType: 'business'; lat: number; lon: number; data: BusinessRecord }
  | { id: string; entityType: 'poi'; lat: number; lon: number; data: PoiRecord };

type Props = {
  items: PlaceItem[];
  selectedId: string;
  onClose: () => void;
  onSelectionChange: (item: PlaceItem) => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;
const GAP = 10;
const SNAP = CARD_WIDTH + GAP;
export const PEEK_HEIGHT = 264;

const WEEKDAYS: { key: keyof OpeningHours & string; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

export default function MapPlaceSheet({ items, selectedId, onClose, onSelectionChange }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<FlatList<PlaceItem>>(null);

  const selectedIndex = useMemo(
    () => Math.max(0, items.findIndex((it) => it.id === selectedId)),
    [items, selectedId]
  );
  const selected = items[selectedIndex];

  const scrollX = useRef(new Animated.Value(selectedIndex * SNAP)).current;

  const snapPoints = useMemo(() => [PEEK_HEIGHT, '62%'], []);

  // Keep the pager in sync when the selection comes from outside (marker tap)
  useEffect(() => {
    if (selectedIndex >= 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: selectedIndex, animated: true });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [selectedIndex]);

  const handleMomentumEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const item = items[clamped];
      if (item && item.id !== selectedId) onSelectionChange(item);
    },
    [items, selectedId, onSelectionChange]
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: colors.background, borderRadius: 24 }}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 44 }}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetContent}
      >
        <Animated.FlatList
          ref={listRef as any}
          horizontal
          showsHorizontalScrollIndicator={false}
          data={items}
          keyExtractor={(it) => it.id}
          snapToInterval={SNAP}
          decelerationRate="fast"
          bounces
          contentContainerStyle={{ paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2 }}
          getItemLayout={(_data, index) => ({ length: SNAP, offset: SNAP * index, index })}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
          initialNumToRender={Math.min(items.length, 5)}
          initialScrollIndex={selectedIndex}
          renderItem={({ item, index }) => {
            const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.94, 1, 0.94],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.7, 1, 0.7],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                style={{ width: CARD_WIDTH, marginRight: GAP, transform: [{ scale }], opacity }}
              >
                <PlaceCard item={item} onNavigate={() => navigate(item, router)} />
              </Animated.View>
            );
          }}
        />

        {/* Revealed by dragging the sheet up */}
        {selected ? <PlaceDetail item={selected} /> : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function PlaceCard({ item, onNavigate }: { item: PlaceItem; onNavigate: () => void }) {
  const { colors } = useTheme();
  const { location, hasLocationPermission, requestLocation } = useLocation();
  const imageUrl = getImageUrl(item);

  const handleRoutePress = async () => {
    let coords = location?.coords;
    if (!coords) {
      const granted = hasLocationPermission || (await requestLocation());
      if (granted) {
        try {
          const fresh = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = fresh.coords;
        } catch (err) {
          console.warn('Failed to read current location for route', err);
        }
      }
    }
    openRoute(item.lat, item.lon, coords?.latitude, coords?.longitude);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardRow}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.cardPlaceholderEmoji}>{getEmoji(item)}</Text>
          </View>
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {getTitle(item)}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.categoryChip, { backgroundColor: colors.background }]}>
                <Text style={[styles.categoryChipText, { color: colors.textSecondary }]}>
                  {getEmoji(item)} {getCategoryLabel(item)}
                </Text>
              </View>
              <StatusBadge item={item} />
            </View>
            {getSubtitle(item) ? (
              <View style={styles.metaRow}>
                <LocationIcon width={12} height={12} color={colors.textTertiary} />
                <Text
                  style={[styles.cardSubtitle, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {getSubtitle(item)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.detailsButton, { backgroundColor: colors.textPrimary }]}
              onPress={onNavigate}
            >
              <Text style={[styles.detailsButtonText, { color: colors.background }]}>
                {getButtonLabel(item)}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.routeButton,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
              onPress={handleRoutePress}
            >
              <Text style={[styles.routeButtonText, { color: colors.textPrimary }]}>Route</Text>
            </Pressable>
            {item.entityType === 'poi' && item.data.phone ? (
              <Pressable
                style={[styles.callButton, { backgroundColor: colors.background }]}
                onPress={() => Linking.openURL(`tel:${item.data.phone!.replace(/\s+/g, '')}`)}
              >
                <CallIcon size={16} color={colors.textPrimary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function StatusBadge({ item }: { item: PlaceItem }) {
  const { colors } = useTheme();
  if (item.entityType === 'restaurant' || item.entityType === 'business') {
    if (!item.data.opening_hours) return null;
    const status = isRestaurantOpen(item.data.opening_hours);
    const color = status.isOpen ? '#2B9348' : '#D32F2F';
    return (
      <View style={styles.metaRow}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={[styles.statusText, { color }]}>
          {status.isOpen ? 'Geöffnet' : 'Geschlossen'}
        </Text>
      </View>
    );
  }
  if (item.entityType === 'event' && item.data.date) {
    return (
      <View style={styles.metaRow}>
        <CalendarIcon width={12} height={12} color={colors.textSecondary} />
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          {new Date(item.data.date).toLocaleDateString('de-DE', {
            day: 'numeric',
            month: 'short',
          })}
        </Text>
      </View>
    );
  }
  if (item.entityType === 'poi') {
    const p = item.data;
    const isSwim = p.type === 'swim_spot' && p.status?.startsWith('swim_');
    if (isSwim && SWIM_STATUS_COLORS[p.status as string]) {
      const c = SWIM_STATUS_COLORS[p.status as string];
      return (
        <View style={styles.metaRow}>
          <View style={[styles.statusDot, { backgroundColor: c }]} />
          <Text style={[styles.statusText, { color: c }]}>
            {SWIM_STATUS_LABELS_DE[p.status as string]}
          </Text>
        </View>
      );
    }
  }
  return null;
}

function PlaceDetail({ item }: { item: PlaceItem }) {
  const { colors } = useTheme();
  const description = getDescription(item);
  const hours = item.entityType === 'restaurant' || item.entityType === 'business'
    ? item.data.opening_hours
    : null;
  const gallery = item.entityType === 'business' ? item.data.gallery_images : null;
  const phone = getPhone(item);
  const website = getWebsite(item);

  return (
    <View style={styles.detail}>
      {description ? (
        <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}

      {getSubtitle(item) ? (
        <View style={styles.detailRow}>
          <LocationIcon width={14} height={14} color={colors.textSecondary} />
          <Text style={[styles.detailRowText, { color: colors.textPrimary }]}>
            {getSubtitle(item)}
          </Text>
        </View>
      ) : null}

      {item.entityType === 'poi' && item.data.opening_hours_de ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailRowEmoji}>🕐</Text>
          <Text style={[styles.detailRowText, { color: colors.textPrimary }]}>
            {item.data.opening_hours_de}
          </Text>
        </View>
      ) : null}

      {hours ? (
        <View style={styles.hoursBlock}>
          <Text style={[styles.detailSectionTitle, { color: colors.textPrimary }]}>
            Öffnungszeiten
          </Text>
          {WEEKDAYS.map(({ key, label }) => {
            const day = hours[key];
            return (
              <View key={key} style={styles.hoursRow}>
                <Text style={[styles.hoursDay, { color: colors.textSecondary }]}>{label}</Text>
                <Text style={[styles.hoursValue, { color: colors.textPrimary }]}>
                  {!day || day.closed ? 'Geschlossen' : `${day.open} – ${day.close}`}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {phone || website ? (
        <View style={styles.contactRow}>
          {phone ? (
            <Pressable
              style={[styles.contactButton, { backgroundColor: colors.surface }]}
              onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)}
            >
              <Text style={[styles.contactButtonText, { color: colors.textPrimary }]}>
                📞 Anrufen
              </Text>
            </Pressable>
          ) : null}
          {website ? (
            <Pressable
              style={[styles.contactButton, { backgroundColor: colors.surface }]}
              onPress={() => Linking.openURL(website)}
            >
              <Text style={[styles.contactButtonText, { color: colors.textPrimary }]}>
                🌐 Website
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {gallery && gallery.length > 0 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={gallery}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          contentContainerStyle={styles.galleryRow}
          renderItem={({ item: uri }) => <Image source={{ uri }} style={styles.galleryImage} />}
        />
      ) : null}
    </View>
  );
}

function getTitle(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.title;
    case 'restaurant':
    case 'business':
      return item.data.name;
    case 'poi':
      return item.data.name_de;
  }
}

function getSubtitle(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.location || '';
    default:
      return item.data.address || '';
  }
}

function getEmoji(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return eventEmoji(item.data.category);
    case 'restaurant':
      return restaurantEmoji(item.data.slug);
    case 'business':
      return businessEmoji(item.data.slug, item.data.category);
    case 'poi':
      return poiEmoji(item.data.type);
  }
}

function getCategoryLabel(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return item.data.category || 'Veranstaltung';
    case 'restaurant':
      return 'Gastronomie';
    case 'business':
      return BUSINESS_CATEGORY_LABELS[item.data.category] || 'Sonstiges';
    case 'poi':
      return POI_TYPE_LABELS_DE[item.data.type] || item.data.type;
  }
}

function getDescription(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'event':
      return item.data.description || null;
    case 'business':
      return item.data.description || null;
    case 'poi':
      return item.data.description_de || null;
    default:
      return null;
  }
}

function getPhone(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'business':
      return item.data.phone;
    case 'poi':
      return item.data.phone;
    default:
      return null;
  }
}

function getWebsite(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'business':
      return item.data.website_url;
    case 'poi':
      return item.data.website;
    default:
      return null;
  }
}

function getImageUrl(item: PlaceItem): string | null {
  switch (item.entityType) {
    case 'event':
      return item.data.image_url;
    case 'restaurant':
    case 'business':
      return item.data.cover_image_url || item.data.logo_url;
    case 'poi':
      return null;
  }
}

function getButtonLabel(item: PlaceItem): string {
  switch (item.entityType) {
    case 'event':
      return 'Details';
    case 'restaurant':
      return 'Speisekarte';
    case 'business':
      return 'Mehr erfahren';
    case 'poi':
      return 'Details';
  }
}

function openRoute(destLat: number, destLon: number, originLat?: number, originLon?: number) {
  const dest = `${destLat},${destLon}`;
  const origin = originLat != null && originLon != null ? `${originLat},${originLon}` : null;
  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${dest}&dirflg=d${origin ? `&saddr=${origin}` : ''}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving${
          origin ? `&origin=${origin}` : ''
        }`;
  Linking.openURL(url).catch((err) => {
    console.warn('Failed to open maps app', err);
  });
}

function navigate(item: PlaceItem, router: ReturnType<typeof useRouter>) {
  switch (item.entityType) {
    case 'event':
      router.push(`/event/${item.data.id}` as any);
      break;
    case 'restaurant':
      router.push(`/restaurant/${item.data.slug}` as any);
      break;
    case 'business':
      router.push(`/business/${item.data.slug}` as any);
      break;
    case 'poi':
      router.push(`/poi/${item.data.id}` as any);
      break;
  }
}

const styles = StyleSheet.create({
  sheetContent: { paddingBottom: 40 },
  card: { borderRadius: 20, padding: 12, minHeight: 148 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardImage: { width: 96, height: 124, borderRadius: 14 },
  cardImagePlaceholder: {
    width: 96,
    height: 124,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardPlaceholderEmoji: { fontSize: 36 },
  cardContent: { flex: 1, gap: 10, minHeight: 124, justifyContent: 'space-between' },
  cardText: { gap: 6 },
  cardTitle: { fontSize: 17, fontFamily: fontFamily.heading },
  cardSubtitle: { fontSize: 12, fontFamily: fontFamily.regular, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryChipText: { fontSize: 11, fontFamily: fontFamily.medium },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontFamily: fontFamily.medium },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsButton: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20 },
  detailsButtonText: { fontSize: 13, fontFamily: fontFamily.heading },
  routeButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  routeButtonText: { fontSize: 13, fontFamily: fontFamily.heading },
  callButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detail: { paddingHorizontal: 24, paddingTop: 20, gap: 14 },
  detailDescription: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 21 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailRowEmoji: { fontSize: 14 },
  detailRowText: { fontSize: 14, fontFamily: fontFamily.medium, flex: 1 },
  detailSectionTitle: { fontSize: 15, fontFamily: fontFamily.heading, marginBottom: 6 },
  hoursBlock: { gap: 2 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  hoursDay: { fontSize: 13, fontFamily: fontFamily.regular },
  hoursValue: { fontSize: 13, fontFamily: fontFamily.medium },
  contactRow: { flexDirection: 'row', gap: 10 },
  contactButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  contactButtonText: { fontSize: 13, fontFamily: fontFamily.medium },
  galleryRow: { gap: 8 },
  galleryImage: { width: 110, height: 82, borderRadius: 10 },
});
```

Note: `OpeningHours` must be exported from `@/lib/types` (verify; it is used as an exported type by `lib/utils.ts`). If the import fails, import it from wherever `isRestaurantOpen` gets it.

- [ ] **Step 2: Verify no new tsc errors**

```bash
cd apps/expo && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: count ≤ baseline.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/components/map/MapPlaceSheet.tsx
git commit -m "feat(expo): MapPlaceSheet — draggable place preview with card pager and expanding detail"
git push
```

---

### Task 6: Wire the sheet into `location.tsx`, retire the carousel

**Files:**
- Modify: `apps/expo/app/location.tsx`
- Delete: `apps/expo/components/map/MapPreviewCarousel.tsx`, `apps/expo/components/map/MapPreviewCard.tsx`, `apps/expo/components/map/EventPreviewCard.tsx`

**Interfaces:**
- Consumes: `MapPlaceSheet`, `PlaceItem` (Task 5); `selectedFeatureId` prop (Task 4).
- Produces: selection state shape `{ items: PlaceItem[]; selectedId: string } | null` named `selection` (Task 7 reuses the hide-chrome behavior).

- [ ] **Step 1: Rewire `app/location.tsx`**

Changes (keep everything else intact — transit, advisories, deep links, privacy gate):

1. Replace the carousel import with:
```tsx
import MapPlaceSheet, { type PlaceItem } from '@/components/map/MapPlaceSheet';
```
2. Rename state `carousel` → `selection` (type `{ items: PlaceItem[]; selectedId: string } | null`); rename `buildCarouselItems` → `buildPlaceItems` (returns `PlaceItem[]`), `openCarouselFor` → `openSelectionFor`, `handleCarouselSelectionChange` → `handleSheetSelectionChange` (same bodies, new names).
3. Compute the selected fid:
```tsx
const selectedFeatureId = useMemo(() => {
  if (!selection) return null;
  const item = selection.items.find((it) => it.id === selection.selectedId);
  return item ? `${item.entityType}-${item.id}` : null;
}, [selection]);
```
4. Pass `selectedFeatureId={selectedFeatureId}` to `<MapboxMapView …>`.
5. Replace the bottom-row slide animation with a fade-out while the sheet is open:
```tsx
const chromeOpacity = useRef(new Animated.Value(1)).current;
useEffect(() => {
  Animated.timing(chromeOpacity, {
    toValue: selection ? 0 : 1,
    duration: 200,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start();
}, [selection, chromeOpacity]);
```
Bottom row becomes:
```tsx
<Animated.View
  style={[styles.bottomRow, { bottom: bottomBase, opacity: chromeOpacity }]}
  pointerEvents={selection ? 'none' : 'box-none'}
>
```
(remove `SHEET_LIFT_PX`, `bottomTranslate`, and the old slide effect)
6. Replace the `<MapPreviewCarousel …>` block with:
```tsx
{selection ? (
  <MapPlaceSheet
    items={selection.items}
    selectedId={selection.selectedId}
    onClose={() => setSelection(null)}
    onSelectionChange={handleSheetSelectionChange}
  />
) : null}
```

- [ ] **Step 2: Delete the retired components**

```bash
git rm apps/expo/components/map/MapPreviewCarousel.tsx apps/expo/components/map/MapPreviewCard.tsx apps/expo/components/map/EventPreviewCard.tsx
```

- [ ] **Step 3: Verify no stale references + tsc**

```bash
grep -rn "MapPreviewCarousel\|CarouselItem\|MapPreviewCard\|EventPreviewCard" apps/expo/app apps/expo/components apps/expo/lib
cd apps/expo && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: no hits; count ≤ baseline.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/app/location.tsx
git commit -m "feat(expo): map place sheet replaces preview carousel; selected-pin ring; chrome fades behind sheet"
git push
```

---

### Task 7: Bottom filter bar + "jetzt geöffnet" (TDD on the filter)

**Files:**
- Create: `apps/expo/lib/map/filters.ts`
- Test: `apps/expo/lib/__tests__/map-filters.test.ts`
- Create: `apps/expo/components/map/MapFilterBar.tsx`
- Modify: `apps/expo/app/location.tsx`
- Delete: `apps/expo/components/map/MapFilterChips.tsx`

**Interfaces:**
- Consumes: `isRestaurantOpen` (`@/lib/utils`), `chromeOpacity` pattern from Task 6.
- Produces:
  - `lib/map/filters.ts`: `export type MapFilterState = { events: boolean; restaurants: boolean; businesses: boolean; pois: boolean; openNow: boolean }` and `export function filterOpenNow<T extends { opening_hours: OpeningHours | null }>(items: T[], enabled: boolean): T[]`
  - `MapFilterBar` default export with props `{ filter: MapFilterState; onFilterChange: (f: MapFilterState) => void; liveBuses?: boolean; onToggleLiveBuses?: () => void; liveBusCount?: number; bottom: number }`

- [ ] **Step 1: Write the failing test** — `apps/expo/lib/__tests__/map-filters.test.ts`

```ts
import { filterOpenNow } from '@/lib/map/filters';
import type { OpeningHours } from '@/lib/types';

// Wednesday 2026-09-02 12:00 local
const WEDNESDAY_NOON = new Date(2026, 8, 2, 12, 0, 0);

const hours = (open: string, close: string): OpeningHours =>
  ({
    monday: { open, close },
    tuesday: { open, close },
    wednesday: { open, close },
    thursday: { open, close },
    friday: { open, close },
    saturday: { open, close },
    sunday: { open, close },
  }) as unknown as OpeningHours;

describe('filterOpenNow', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(WEDNESDAY_NOON);
  });
  afterAll(() => jest.useRealTimers());

  const openPlace = { id: 'a', opening_hours: hours('09:00', '18:00') };
  const closedPlace = { id: 'b', opening_hours: hours('14:00', '18:00') };
  const noHours = { id: 'c', opening_hours: null };

  it('passes everything through when disabled', () => {
    expect(filterOpenNow([openPlace, closedPlace, noHours], false)).toHaveLength(3);
  });

  it('keeps only currently open places when enabled', () => {
    const out = filterOpenNow([openPlace, closedPlace, noHours], true);
    expect(out.map((p) => p.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/expo && npx jest lib/__tests__/map-filters.test.ts --watchAll=false
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/expo/lib/map/filters.ts`**

```ts
import { isRestaurantOpen } from '@/lib/utils';
import type { OpeningHours } from '@/lib/types';

export type MapFilterState = {
  events: boolean;
  restaurants: boolean;
  businesses: boolean;
  pois: boolean;
  openNow: boolean;
};

/**
 * "Jetzt geöffnet" — keeps only places whose opening hours say they are open
 * right now. Places without opening hours are treated as closed (a place that
 * never told us its hours shouldn't pass an explicit open-now filter).
 */
export function filterOpenNow<T extends { opening_hours: OpeningHours | null }>(
  items: T[],
  enabled: boolean
): T[] {
  if (!enabled) return items;
  return items.filter((item) => isRestaurantOpen(item.opening_hours).isOpen);
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd apps/expo && npx jest lib/__tests__/map-filters.test.ts --watchAll=false
```

Expected: PASS.

- [ ] **Step 5: Create `apps/expo/components/map/MapFilterBar.tsx`**

```tsx
import React from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MapFilterState } from '@/lib/map/filters';

type Props = {
  filter: MapFilterState;
  onFilterChange: (filter: MapFilterState) => void;
  liveBuses?: boolean;
  onToggleLiveBuses?: () => void;
  liveBusCount?: number;
  // Absolute offset from the screen bottom (sits above the action row)
  bottom: number;
  opacity?: Animated.Value;
};

type LayerChip = {
  key: 'events' | 'restaurants' | 'businesses' | 'pois';
  label: string;
  emoji: string;
};

const CHIPS: LayerChip[] = [
  { key: 'events', label: 'Events', emoji: '🎪' },
  { key: 'restaurants', label: 'Gastro', emoji: '🍽️' },
  { key: 'businesses', label: 'Shops', emoji: '🛍️' },
  { key: 'pois', label: 'Tipps', emoji: '⭐' },
];

export default function MapFilterBar({
  filter,
  onFilterChange,
  liveBuses,
  onToggleLiveBuses,
  liveBusCount = 0,
  bottom,
  opacity,
}: Props) {
  const { colors } = useTheme();

  const toggle = (key: LayerChip['key'] | 'openNow') => {
    onFilterChange({ ...filter, [key]: !filter[key] });
  };

  const chipStyle = (active: boolean) => [
    styles.chip,
    {
      backgroundColor: colors.card,
      borderColor: active ? colors.textPrimary : colors.border,
      opacity: active ? 1 : 0.62,
    },
  ];
  const chipTextStyle = (active: boolean) => [
    styles.chipText,
    { color: active ? colors.textPrimary : colors.textTertiary },
  ];

  return (
    <Animated.View
      style={[styles.container, { bottom }, opacity ? { opacity } : null]}
      pointerEvents="box-none"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {/* Jetzt geöffnet — leading toggle, Corner's "open now" */}
        <Pressable style={chipStyle(filter.openNow)} onPress={() => toggle('openNow')}>
          <Text style={styles.chipEmoji}>🕐</Text>
          <Text style={chipTextStyle(filter.openNow)}>Jetzt geöffnet</Text>
        </Pressable>

        {CHIPS.map((c) => {
          const active = filter[c.key];
          return (
            <Pressable key={c.key} style={chipStyle(active)} onPress={() => toggle(c.key)}>
              <Text style={styles.chipEmoji}>{c.emoji}</Text>
              <Text style={chipTextStyle(active)}>{c.label}</Text>
            </Pressable>
          );
        })}

        {onToggleLiveBuses ? (
          <Pressable style={chipStyle(!!liveBuses)} onPress={onToggleLiveBuses}>
            {liveBuses ? (
              <View style={[styles.liveDot, { backgroundColor: '#2BD46B' }]} />
            ) : (
              <Text style={styles.chipEmoji}>🚌</Text>
            )}
            <Text style={chipTextStyle(!!liveBuses)}>
              ÖPNV{liveBuses && liveBusCount > 0 ? ` · ${liveBusCount}` : ''}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 150,
  },
  row: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
});
```

- [ ] **Step 6: Wire into `app/location.tsx`**

1. Swap imports:
```tsx
import MapFilterBar from '@/components/map/MapFilterBar';
import { filterOpenNow, type MapFilterState } from '@/lib/map/filters';
```
(remove the `MapFilterChips` import)
2. Filter state gains `openNow` (both initializers and the `filterOnly==='orgs'` effect get `openNow: false`; type becomes `MapFilterState`).
3. Apply open-now before GeoJSON:
```tsx
const visibleRestaurants = useMemo(
  () => filterOpenNow(restaurants, mapFilter.openNow),
  [restaurants, mapFilter.openNow]
);
const visibleBusinesses = useMemo(
  () => filterOpenNow(businesses, mapFilter.openNow),
  [businesses, mapFilter.openNow]
);
```
and use `visibleRestaurants`/`visibleBusinesses` in the `entitiesToGeoJSON` memo (deps updated). `buildPlaceItems` keeps using the UNfiltered lists (a marker tap always finds its entity).
4. Replace the `<MapFilterChips …>` element (top position) with the bar above the bottom row:
```tsx
<MapFilterBar
  filter={mapFilter}
  onFilterChange={setMapFilter}
  liveBuses={showLiveBuses}
  onToggleLiveBuses={() => setShowLiveBuses((v) => !v)}
  liveBusCount={vehicles.length}
  bottom={bottomBase + 62}
  opacity={chromeOpacity}
/>
```
5. Advisory chips: change hardcoded `#ffffff` to `colors.card` and move the row to sit above the filter bar is NOT needed — keep them top-left (unchanged position), only theme the background.

- [ ] **Step 7: Delete the old chips + verify**

```bash
git rm apps/expo/components/map/MapFilterChips.tsx
grep -rn "MapFilterChips" apps/expo/app apps/expo/components
cd apps/expo && npx jest lib/__tests__ --watchAll=false --testPathPattern="map-" && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: no grep hits, map tests PASS, tsc ≤ baseline.

- [ ] **Step 8: Commit**

```bash
git add apps/expo/lib/map/filters.ts apps/expo/lib/__tests__/map-filters.test.ts apps/expo/components/map/MapFilterBar.tsx apps/expo/app/location.tsx
git commit -m "feat(expo): Corner-style bottom filter bar with emoji chips + 'jetzt geöffnet'"
git push
```

---

### Task 8: Theme sweep on remaining map chrome + final gate

**Files:**
- Modify: `apps/expo/app/location.tsx`

**Interfaces:** none new — final polish + verification.

- [ ] **Step 1: Theme the remaining hardcoded chrome in `location.tsx`**

- `styles.container` → drop `backgroundColor` from the stylesheet, use `[styles.container, { backgroundColor: colors.background }]` on the root `View`.
- Header circles: `style={[styles.headerCircle, { backgroundColor: colors.card }]}` and icons `color={colors.textPrimary}` (both back + search).
- Bottom row buttons + Erkunden pill: `backgroundColor: colors.card`; `DiscoverStroke`/icons `color={colors.textPrimary}`; `erkundenText` gets `color: colors.textPrimary` inline (drop the hardcoded `#000000` from the stylesheet).
- Advisory chip background `colors.card` (done in Task 7 — verify).
- Replace remaining `fontFamily: 'Inter-*'` literals in `location.tsx` styles with `fontFamily.medium` / `fontFamily.regular` / `fontFamily.semiBold` tokens (`import { fontFamily } from '@/constants/theme'`).

- [ ] **Step 2: Full verification gate**

```bash
cd apps/expo && npx jest lib/__tests__ --watchAll=false --testPathPattern="map-"
npx tsc --noEmit 2>&1 | grep -c "error TS"   # must be ≤ Task 1 baseline
grep -rn "'#ffffff'\|'#000000'\|Inter-" apps/expo/app/location.tsx apps/expo/components/map/MapFilterBar.tsx apps/expo/components/map/MapPlaceSheet.tsx apps/expo/components/map/MapboxMapView.tsx
```

Expected: tests pass; tsc ≤ baseline; grep hits only the deliberate Mapbox layer literals in `MapboxMapView.tsx` (layer colors can't consume tokens) and status colors (`#2B9348`/`#D32F2F`/`#2BD46B`).

- [ ] **Step 3: Commit + push**

```bash
git add apps/expo/app/location.tsx
git commit -m "feat(expo): map chrome fully theme-aware — dark mode, Mona Sans tokens"
git push
```

- [ ] **Step 4: Device walkthrough note**

Manual verification requires a dev build (Mapbox doesn't run in Expo Go): markers light+dark, cluster tap splits, marker tap opens sheet at peek, card paging flies camera, drag up reveals detail, drag down closes + deselects, filters + Jetzt geöffnet, ÖPNV layer, deep links from event detail and org profile. The user runs builds/EAS himself — report the walkthrough checklist at handoff.
