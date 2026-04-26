// Row type definitions for the tourist domain (POIs, transit, tours, wildlife).
// Mirrors the schema in apps/expo/supabase/migrations/007–010 and the expo
// helpers in apps/expo/lib/supabase-{pois,transit,tours,wildlife}.ts.

// ---------- POIs / advisories / help requests ----------

export type PoiType =
  | "toilet"
  | "drinking_water"
  | "bike_repair"
  | "bike_rental"
  | "swim_spot"
  | "indoor_alternative"
  | "tourist_info"
  | "pharmacy"
  | "observation_stand"
  | "viewpoint";

export type PoiStatus =
  | "open"
  | "closed"
  | "seasonal"
  | "unknown"
  | "swim_green"
  | "swim_yellow"
  | "swim_red"
  | "swim_forbidden";

export interface PoiRecord {
  id: string;
  type: PoiType;
  name_de: string;
  description_de: string | null;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours_de: string | null;
  is_24h: boolean;
  is_pannendienst: boolean;
  has_gaestekarte_discount: boolean;
  status: PoiStatus | null;
  status_note_de: string | null;
  status_updated_at: string | null;
  status_source_de: string | null;
  meta: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AdvisoryType =
  | "mosquito"
  | "tick"
  | "cyanobacteria"
  | "pollen"
  | "sun";
export type AdvisoryLevel = "niedrig" | "mittel" | "hoch" | "sehr_hoch";

export interface AdvisoryRecord {
  id: string;
  advisory_date: string;
  type: AdvisoryType;
  level: AdvisoryLevel;
  message_de: string;
  recommendation_de: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type HelpRequestType = "breakdown" | "lost" | "medical" | "general";
export type HelpRequestStatus =
  | "open"
  | "responded"
  | "resolved"
  | "cancelled";

export interface HelpRequestRecord {
  id: string;
  user_wallet: string | null;
  user_name: string | null;
  contact_phone: string | null;
  request_type: HelpRequestType;
  lat: number | null;
  lon: number | null;
  message_de: string | null;
  status: HelpRequestStatus;
  responded_by_wallet: string | null;
  responded_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ---------- Transit ----------

export type TransitMode =
  | "bus_regio"
  | "bus_city"
  | "bus_park"
  | "buergerbus"
  | "ferry"
  | "train";

export interface TransitLineRecord {
  id: string;
  code: string;
  name_de: string;
  mode: TransitMode;
  operator_de: string | null;
  free_with_gaestekarte: boolean;
  carries_bikes: boolean;
  bike_fee_eur: number | null;
  fare_de: string | null;
  season_window_de: string | null;
  call_phone: string | null;
  call_email: string | null;
  call_window_de: string | null;
  website: string | null;
  notes_de: string | null;
  is_active: boolean;
  is_electric: boolean;
  is_volunteer: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransitStopRecord {
  id: string;
  line_id: string;
  name_de: string;
  lat: number | null;
  lon: number | null;
  stop_order: number;
  notes_de: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TransitDepartureRecord {
  id: string;
  line_id: string;
  stop_id: string | null;
  service_days: string;
  season_start: string | null;
  season_end: string | null;
  departure_time: string;
  arrival_time: string | null;
  destination_de: string | null;
  trip_label_de: string | null;
  notes_de: string | null;
  is_last_of_day: boolean;
  is_active: boolean;
  created_at: string;
}

// ---------- Tours ----------

export type TourDifficulty = "leicht" | "mittel" | "sportlich";
export type TourHoursBucket = "2h" | "4h" | "tag" | "mehrtag";
export type TourStopType =
  | "start"
  | "finish"
  | "observation_stand"
  | "swim_spot"
  | "viewpoint"
  | "eisdiele"
  | "restaurant"
  | "toilet"
  | "transit_stop"
  | "sehenswuerdigkeit";

export interface TourRecord {
  id: string;
  slug: string;
  title_de: string;
  subtitle_de: string | null;
  description_de: string | null;
  cover_image_url: string | null;
  start_lat: number | null;
  start_lon: number | null;
  start_label_de: string | null;
  distance_km: number | null;
  duration_min: number | null;
  elevation_gain_m: number | null;
  surface_de: string | null;
  difficulty: TourDifficulty;
  categories: string[];
  hours_bucket: TourHoursBucket | null;
  is_sternfahrt: boolean;
  is_meckys_tipp_today: boolean;
  ferry_combo: boolean;
  bus_combo: boolean;
  has_swim_stop: boolean;
  has_eis_stop: boolean;
  family_friendly: boolean;
  bad_weather_alternative: boolean;
  season_de: string | null;
  best_start_time_de: string | null;
  return_options_de: string | null;
  gpx_url: string | null;
  komoot_url: string | null;
  alltrails_url: string | null;
  highlights_de: string[];
  warnings_de: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TourStopRecord {
  id: string;
  tour_id: string;
  stop_order: number;
  name_de: string;
  description_de: string | null;
  lat: number | null;
  lon: number | null;
  km_from_start: number | null;
  stop_type: TourStopType | null;
  poi_id: string | null;
  created_at: string;
}

export interface TourCompletionRecord {
  id: string;
  tour_id: string;
  user_wallet: string;
  completed_at: string;
  notes_de: string | null;
}

// ---------- Wildlife ----------

export type WildlifeCategory =
  | "vogel"
  | "saeugetier"
  | "reptil"
  | "amphibie"
  | "fisch"
  | "insekt"
  | "sonstiges";

export type WildlifeAlarmKind =
  | "sunrise_minus_30"
  | "sunset"
  | "morning"
  | "evening"
  | "none";

export interface WildlifeSpeciesRecord {
  id: string;
  slug: string;
  name_de: string;
  name_scientific: string | null;
  category: WildlifeCategory;
  is_protected: boolean;
  protect_coordinates: boolean;
  description_de: string | null;
  best_months: number[];
  best_locations_de: string | null;
  image_url: string | null;
  mecky_tipp_de: string | null;
  ornitho_species_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WildlifeSeasonalEventRecord {
  id: string;
  species_id: string | null;
  title_de: string;
  description_de: string | null;
  start_month: number;
  end_month: number;
  start_date_hint_de: string | null;
  peak_window_de: string | null;
  best_location_de: string | null;
  alarm_kind: WildlifeAlarmKind | null;
  trigger_hint: string | null;
  push_message_de: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WildlifeSightingRecord {
  id: string;
  species_id: string | null;
  observer_wallet: string | null;
  observer_name_de: string | null;
  observed_at: string;
  lat: number;
  lon: number;
  raw_lat: number | null;
  raw_lon: number | null;
  individual_count: number;
  notes_de: string | null;
  photo_url: string | null;
  near_landmark_de: string | null;
  verified_by_mecky: boolean;
  mecky_verification_note_de: string | null;
  ranger_verified: boolean;
  is_visible: boolean;
  helpful_count: number;
  ornitho_cross_posted: boolean;
  ornitho_url: string | null;
  created_at: string;
}

// ---------- Display helpers ----------

export const POI_TYPE_LABELS_DE: Record<PoiType, string> = {
  toilet: "Toilette",
  drinking_water: "Trinkwasser",
  bike_repair: "Fahrrad-Reparatur",
  bike_rental: "Fahrrad-Verleih",
  swim_spot: "Badestelle",
  indoor_alternative: "Indoor-Alternative",
  tourist_info: "Tourist-Info",
  pharmacy: "Apotheke",
  observation_stand: "Beobachtungs-Stand",
  viewpoint: "Aussichtspunkt",
};

export const POI_STATUS_LABELS_DE: Record<PoiStatus, string> = {
  open: "Geöffnet",
  closed: "Geschlossen",
  seasonal: "Saisonal",
  unknown: "Unbekannt",
  swim_green: "Bade-Ampel grün",
  swim_yellow: "Bade-Ampel gelb",
  swim_red: "Bade-Ampel rot",
  swim_forbidden: "Bade-Verbot",
};

export const ADVISORY_TYPE_LABELS_DE: Record<AdvisoryType, string> = {
  mosquito: "Mücken",
  tick: "Zecken",
  cyanobacteria: "Blaualgen",
  pollen: "Pollen",
  sun: "Sonne / UV",
};

export const ADVISORY_LEVEL_LABELS_DE: Record<AdvisoryLevel, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  sehr_hoch: "Sehr hoch",
};

export const HELP_REQUEST_TYPE_LABELS_DE: Record<HelpRequestType, string> = {
  breakdown: "Panne",
  lost: "Verloren",
  medical: "Medizinisch",
  general: "Sonstiges",
};

export const HELP_REQUEST_STATUS_LABELS_DE: Record<HelpRequestStatus, string> =
  {
    open: "Offen",
    responded: "Reagiert",
    resolved: "Gelöst",
    cancelled: "Abgebrochen",
  };

export const TRANSIT_MODE_LABELS_DE: Record<TransitMode, string> = {
  bus_regio: "Bus (Regio)",
  bus_city: "Stadtbus",
  bus_park: "Nationalpark-Bus",
  buergerbus: "Bürgerbus",
  ferry: "Schiff",
  train: "Zug",
};

export const TOUR_DIFFICULTY_LABELS_DE: Record<TourDifficulty, string> = {
  leicht: "Leicht",
  mittel: "Mittel",
  sportlich: "Sportlich",
};

export const TOUR_HOURS_LABELS_DE: Record<TourHoursBucket, string> = {
  "2h": "~ 2 h",
  "4h": "~ 4 h",
  tag: "Tag",
  mehrtag: "Mehrtag",
};

export const TOUR_STOP_TYPE_LABELS_DE: Record<TourStopType, string> = {
  start: "Start",
  finish: "Ziel",
  observation_stand: "Beobachtungs-Stand",
  swim_spot: "Badestelle",
  viewpoint: "Aussichtspunkt",
  eisdiele: "Eisdiele",
  restaurant: "Restaurant",
  toilet: "Toilette",
  transit_stop: "ÖPNV-Halt",
  sehenswuerdigkeit: "Sehenswürdigkeit",
};

export const WILDLIFE_CATEGORY_LABELS_DE: Record<WildlifeCategory, string> = {
  vogel: "Vogel",
  saeugetier: "Säugetier",
  reptil: "Reptil",
  amphibie: "Amphibie",
  fisch: "Fisch",
  insekt: "Insekt",
  sonstiges: "Sonstiges",
};

export const WILDLIFE_ALARM_LABELS_DE: Record<WildlifeAlarmKind, string> = {
  sunrise_minus_30: "Sonnenaufgang − 30 min",
  sunset: "Sonnenuntergang",
  morning: "Morgen",
  evening: "Abend",
  none: "Kein Alarm",
};

export const WEEKDAYS = [
  { key: "mo", label: "Mo" },
  { key: "tu", label: "Di" },
  { key: "we", label: "Mi" },
  { key: "th", label: "Do" },
  { key: "fr", label: "Fr" },
  { key: "sa", label: "Sa" },
  { key: "su", label: "So" },
] as const;

export const MONTHS_DE = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];
