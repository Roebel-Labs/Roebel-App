/**
 * Marker appearance for the main map — emoji per category, per-place slug
 * overrides, and the custom PNG registry (Corner-style pins).
 *
 * Slug overrides let individual places get a distinctive emoji without a DB
 * migration (per-entity DB columns arrive with the org-map-presence slice).
 */

export type MarkerSize = 'sm' | 'md' | 'lg';

/**
 * Per-pin override from the `map_marker_icons` table (set in the web admin
 * under Karten-Icons): an emoji instead of the computed default and/or a
 * custom circular PNG. Keyed by the feature fid (`<entityType>-<id>`).
 */
export type MapMarkerIcon = { emoji: string | null; image_url: string | null };
export type MapMarkerIcons = Map<string, MapMarkerIcon>;

/** Custom marker PNGs are rendered at 288 px; scale 3 makes them 96 "points"
 *  before ICON_SCALE, i.e. the same pixel budget as a bundled @3x asset. */
export const MARKER_IMAGE_SCALE = 3;

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

// Orgs that carry their own coordinates — Vereine, Fraktionen, die Stadt.
// Restaurants and Unternehmen never reach here: they are already on the map
// through their own restaurants/businesses row.
const ORG_SUB_TYPE_EMOJI: Record<string, string> = {
  verein: '🎗️',
  stadt: '🏛️',
  fraktion: '🗳️',
  unternehmen: '🏪',
  restaurant: '🍽️',
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

// Restaurants carry no cuisine column, so the kind of place is read off the
// slug or the name. First match wins; order = most specific first.
const RESTAURANT_KEYWORD_EMOJI: [RegExp, string][] = [
  [/pizz/, '🍕'],
  [/d(ö|oe)ner|kebap|kebab|gyros/, '🥙'],
  [/burger/, '🍔'],
  [/sushi|asia|wok|china|thai|viet/, '🍣'],
  [/ind(isch|ia)|curry/, '🍛'],
  [/eis(cafe|café|diele|-)|gelat/, '🍦'],
  [/b(ä|ae)cker|backhaus|backstube|b(ä|ae)ckerei|brot|konditor/, '🥐'],
  [/caf(e|é)|kaffee|r(ö|oe)sterei/, '☕'],
  [/fisch|fish|r(ä|ae)ucher/, '🐟'],
  [/steak|grill|bbq/, '🥩'],
  [/bar\b|pub\b|kneipe|brau|bier/, '🍺'],
  [/wein|vinothek/, '🍷'],
  [/imbiss|pommes|currywurst/, '🍟'],
  [/hotel|pension|gasthof|gasthaus/, '🏨'],
];

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

export function restaurantEmoji(slug: string | null, name?: string | null): string {
  if (slug && SLUG_EMOJI_OVERRIDES[slug]) return SLUG_EMOJI_OVERRIDES[slug];
  const haystack = `${slug ?? ''} ${name ?? ''}`.toLowerCase();
  for (const [pattern, emoji] of RESTAURANT_KEYWORD_EMOJI) {
    if (pattern.test(haystack)) return emoji;
  }
  return '🍽️';
}

export function businessEmoji(
  slug: string | null,
  category: string | null | undefined
): string {
  if (slug && SLUG_EMOJI_OVERRIDES[slug]) return SLUG_EMOJI_OVERRIDES[slug];
  return (category && BUSINESS_CATEGORY_EMOJI[category]) || '🏪';
}

export function orgEmoji(subType: string | null | undefined): string {
  return (subType && ORG_SUB_TYPE_EMOJI[subType]) || '🎗️';
}

export function poiEmoji(type: string): string {
  return POI_TYPE_EMOJI[type] || '⭐';
}

export function markerImageForSlug(slug: string | null): string | undefined {
  if (!slug) return undefined;
  return SLUG_MARKER_IMAGE_OVERRIDES[slug];
}
