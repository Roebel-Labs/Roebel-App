// apps/web/src/lib/maps/marker-emoji.ts
// Default pin emoji per map entity, mirrored from the Expo app so the admin
// list shows exactly what the map draws when no override is set.
// SOURCE OF TRUTH: apps/expo/lib/map/markers.ts — keep both in sync.

export type MapMarkerEntityType = "event" | "restaurant" | "business" | "poi" | "org";

const EVENT_CATEGORY_EMOJI: Record<string, string> = {
  Musik: "🎵",
  Kultur: "🎭",
  Sport: "⚽",
  Fest: "🎉",
  Natur: "🌳",
  Mittelalter: "🏰",
  Lesung: "📖",
  Kirchliches: "⛪",
  Ausstellungen: "🖼️",
  Stadt: "🏛️",
  "Essen & Trinken": "🍴",
};

const BUSINESS_CATEGORY_EMOJI: Record<string, string> = {
  gastronomie: "🍽️",
  einzelhandel: "🛍️",
  handwerk: "🔨",
  dienstleistung: "🤝",
  gesundheit: "💊",
  bildung: "📚",
  kultur: "🎭",
  sport: "⚽",
  tourismus: "⛵",
  immobilien: "🏠",
  sonstiges: "🏪",
};

const ORG_SUB_TYPE_EMOJI: Record<string, string> = {
  verein: "🎗️",
  stadt: "🏛️",
  fraktion: "🗳️",
  unternehmen: "🏪",
  restaurant: "🍽️",
};

const POI_TYPE_EMOJI: Record<string, string> = {
  toilet: "🚻",
  drinking_water: "🚰",
  bike_repair: "🔧",
  bike_rental: "🚲",
  swim_spot: "🏊",
  indoor_alternative: "🏛️",
  tourist_info: "ℹ️",
  pharmacy: "💊",
  observation_stand: "🦅",
  viewpoint: "🔭",
};

const RESTAURANT_KEYWORD_EMOJI: [RegExp, string][] = [
  [/pizz/, "🍕"],
  [/d(ö|oe)ner|kebap|kebab|gyros/, "🥙"],
  [/burger/, "🍔"],
  [/sushi|asia|wok|china|thai|viet/, "🍣"],
  [/ind(isch|ia)|curry/, "🍛"],
  [/eis(cafe|café|diele|-)|gelat/, "🍦"],
  [/b(ä|ae)cker|backhaus|backstube|b(ä|ae)ckerei|brot|konditor/, "🥐"],
  [/caf(e|é)|kaffee|r(ö|oe)sterei/, "☕"],
  [/fisch|fish|r(ä|ae)ucher/, "🐟"],
  [/steak|grill|bbq/, "🥩"],
  [/bar\b|pub\b|kneipe|brau|bier/, "🍺"],
  [/wein|vinothek/, "🍷"],
  [/imbiss|pommes|currywurst/, "🍟"],
  [/hotel|pension|gasthof|gasthaus/, "🏨"],
];

export function restaurantEmoji(slug: string | null, name?: string | null): string {
  const haystack = `${slug ?? ""} ${name ?? ""}`.toLowerCase();
  for (const [pattern, emoji] of RESTAURANT_KEYWORD_EMOJI) {
    if (pattern.test(haystack)) return emoji;
  }
  return "🍽️";
}

export function defaultMarkerEmoji(input: {
  entityType: MapMarkerEntityType;
  category?: string | null;
  slug?: string | null;
  name?: string | null;
}): string {
  switch (input.entityType) {
    case "event":
      return (input.category && EVENT_CATEGORY_EMOJI[input.category]) || "📍";
    case "restaurant":
      return restaurantEmoji(input.slug ?? null, input.name);
    case "business":
      return (input.category && BUSINESS_CATEGORY_EMOJI[input.category]) || "🏪";
    case "org":
      return (input.category && ORG_SUB_TYPE_EMOJI[input.category]) || "🎗️";
    case "poi":
      return (input.category && POI_TYPE_EMOJI[input.category]) || "⭐";
  }
}

export const ENTITY_TYPE_LABELS: Record<MapMarkerEntityType, string> = {
  event: "Veranstaltung",
  restaurant: "Restaurant",
  business: "Gewerbe",
  poi: "POI",
  org: "Organisation",
};
