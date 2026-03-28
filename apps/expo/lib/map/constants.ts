// Centralized map constants

export const ROEBEL_CENTER: [number, number] = [12.6000, 53.3667]; // [lng, lat] - GeoJSON order

export const DEFAULT_ZOOM = 13;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 18;
export const CLUSTER_RADIUS = 50;
export const CLUSTER_MAX_ZOOM = 14;

export const MAP_PRIVACY_STORAGE_KEY = '@map_privacy_accepted';

// Category colors for map markers — covers all canonical categories from lib/categories.ts
export const CATEGORY_COLORS: Record<string, string> = {
  'Kultur': '#4ECDC4',
  'Musik': '#FF6B6B',
  'Essen & Trinken': '#FF8C42',
  'Kirchliches': '#C7CEEA',
  'Ausstellungen': '#A8E6CF',
  'Stadt': '#95E1D3',
  'Sport': '#FFE66D',
  'Sonstige': '#374453',
};

export const DEFAULT_MARKER_COLOR = '#374453';

// Entity type marker colors
export const ENTITY_TYPE_COLORS: Record<string, string> = {
  event: '#194383',
  restaurant: '#E85D04',
  business: '#2B9348',
};

// German labels for business categories
export const BUSINESS_CATEGORY_LABELS: Record<string, string> = {
  gastronomie: 'Gastronomie',
  einzelhandel: 'Einzelhandel',
  handwerk: 'Handwerk',
  dienstleistung: 'Dienstleistung',
  gesundheit: 'Gesundheit',
  bildung: 'Bildung',
  kultur: 'Kultur',
  sport: 'Sport',
  tourismus: 'Tourismus',
  immobilien: 'Immobilien',
  sonstiges: 'Sonstiges',
};

// German labels for marketplace categories
export const MARKETPLACE_CATEGORY_LABELS: Record<string, string> = {
  elektronik: 'Elektronik',
  moebel: 'Möbel',
  kleidung: 'Kleidung',
  fahrzeuge: 'Fahrzeuge',
  sport_freizeit: 'Sport & Freizeit',
  haus_garten: 'Haus & Garten',
  familie_kind: 'Familie & Kind',
  haustiere: 'Haustiere',
  dienstleistungen: 'Dienstleistungen',
  sonstiges: 'Sonstiges',
};

// Price type labels for marketplace
export const PRICE_TYPE_LABELS: Record<string, string> = {
  fixed: '',
  negotiable: 'VB',
  free: 'Gratis',
};

// Condition labels for marketplace
export const CONDITION_LABELS: Record<string, string> = {
  neu: 'Neu',
  wie_neu: 'Wie neu',
  gut: 'Gut',
  akzeptabel: 'Akzeptabel',
};

// Deal type labels
export const DEAL_TYPE_LABELS: Record<string, string> = {
  discount: 'Rabatt',
  special: 'Spezial',
  event: 'Event',
  new_product: 'Neues Produkt',
};

// German labels for entity type filter chips
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  event: 'Veranstaltungen',
  restaurant: 'Gastronomie',
  business: 'Unternehmen',
};
