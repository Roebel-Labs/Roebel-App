/**
 * Mecky AI Chatbot — Tool definitions and executors
 * Each tool queries a Supabase domain and returns structured results
 */

import { z } from "zod";
import type { AnthropicToolDefinition, ToolResult } from "../types/anthropic";
import { zodToToolInputSchema } from "../utils/zod-to-json-schema";
import { supabase } from "../supabase";
import { fetchRestaurants } from "../supabase-restaurants";
import { fetchMarketplaceListings } from "../supabase-marketplace";
import {
  fetchPois,
  fetchTodayAdvisories,
  POI_TYPE_LABELS_DE,
  SWIM_STATUS_LABELS_DE,
  distanceKm,
  type PoiType,
} from "../supabase-pois";
import {
  fetchNextDepartures,
  TRANSIT_MODE_LABELS_DE,
  type TransitMode,
} from "../supabase-transit";
import {
  fetchTours,
  DIFFICULTY_LABELS_DE,
  HOURS_LABELS_DE,
  type TourDifficulty,
  type TourHoursBucket,
} from "../supabase-tours";
import {
  fetchSightings,
  fetchSeasonalEvents,
  fetchSpecies,
  isEventActive,
  freshnessLabelDe,
} from "../supabase-wildlife";
import {
  eventSubmissionToolDefinitions,
  executeSearchLocation,
  executeExtractFlyer,
  executeSubmitEvent,
} from "./event-submission-tools";

// ── Schemas ──────────────────────────────────────────────────────────

const searchEventsSchema = z.object({
  query: z.string().optional().describe("Suchtext für Event-Titel oder -Beschreibung"),
  category: z
    .enum(["Musik", "Kultur", "Sport", "Fest", "Natur", "Mittelalter", "Lesung", "Sonstiges"])
    .optional()
    .describe("Event-Kategorie"),
  startDate: z.string().optional().describe("Startdatum YYYY-MM-DD"),
  endDate: z.string().optional().describe("Enddatum YYYY-MM-DD"),
});

const searchRestaurantsSchema = z.object({
  query: z.string().optional().describe("Suchtext für Restaurant-Name"),
});

const searchMarketplaceSchema = z.object({
  query: z.string().optional().describe("Suchtext für Titel"),
  category: z.string().optional().describe("Kategorie-Filter"),
});

const searchNewsSchema = z.object({
  query: z.string().optional().describe("Suchtext für Artikel-Titel"),
});

const searchMoviesSchema = z.object({
  query: z.string().optional().describe("Suchtext für Film-Titel"),
});

const searchBusinessesSchema = z.object({
  query: z.string().optional().describe("Suchtext für Name"),
  category: z
    .enum([
      "gastronomie", "einzelhandel", "handwerk", "dienstleistung",
      "gesundheit", "bildung", "kultur", "sport", "tourismus",
      "immobilien", "sonstiges",
    ])
    .optional()
    .describe("Branche"),
});

const searchDealsSchema = z.object({
  query: z.string().optional().describe("Suchtext für Deal-Titel"),
});

const navigateUserSchema = z.object({
  route: z.string().describe("App-Route z.B. /event/abc-123, /restaurant/mein-lokal, /governance"),
  label: z.string().describe("Button-Beschriftung auf Deutsch"),
});

const searchPoisSchema = z.object({
  type: z
    .enum([
      "toilet",
      "drinking_water",
      "bike_repair",
      "bike_rental",
      "swim_spot",
      "indoor_alternative",
      "tourist_info",
      "pharmacy",
      "observation_stand",
      "viewpoint",
    ])
    .optional()
    .describe(
      "POI-Typ: toilet=Toilette, drinking_water=Trinkwasser, bike_repair=Fahrradwerkstatt, bike_rental=Fahrradverleih, swim_spot=Badestelle, indoor_alternative=Schlechtwetter-Tipp, tourist_info=Tourist-Info, pharmacy=Apotheke, observation_stand=Beobachtungsstand, viewpoint=Aussichtspunkt."
    ),
  near_lat: z.number().optional().describe("Breitengrad als Zentrum für Nähe-Suche."),
  near_lon: z.number().optional().describe("Längengrad als Zentrum für Nähe-Suche."),
  radius_km: z.number().optional().describe("Suchradius in km, Standard 5."),
});

const todayAdvisoriesSchema = z.object({});

const searchTransitSchema = z.object({
  mode: z
    .enum(['bus_regio', 'bus_city', 'bus_park', 'buergerbus', 'ferry', 'train'])
    .optional()
    .describe(
      "Verkehrsmittel: bus_regio=Linie 12 (MVVG/dat Bus), bus_city=Stadtbus 024, bus_park=Nationalpark-Linien 9/10, buergerbus=Elli-Bus, ferry=MS Diana / MS Fontane."
    ),
  near_lat: z.number().optional().describe("Breitengrad des Nutzers für Nähe-Sortierung."),
  near_lon: z.number().optional().describe("Längengrad des Nutzers für Nähe-Sortierung."),
});

const searchWildlifeSchema = z.object({
  species_slug: z.string().optional()
    .describe("Slug einer bestimmten Art (z.B. 'fischadler', 'seeadler', 'kranich')."),
  hours: z.number().optional().describe("Nur Sichtungen der letzten N Stunden (Standard: 48)."),
  category: z.enum(['vogel', 'saeugetier', 'reptil', 'amphibie', 'fisch', 'insekt', 'sonstiges'])
    .optional().describe("Tier-Kategorie."),
});

const seasonalCalendarSchema = z.object({
  active_only: z.boolean().optional().describe("Nur derzeit laufende Saison-Events?"),
});

const recommendTourSchema = z.object({
  hours: z.enum(['2h', '4h', 'tag', 'mehrtag']).optional()
    .describe("Wieviel Zeit hat der Nutzer? 2h, 4h, ganztag, mehrtag."),
  category: z
    .enum([
      'familie', 'wildlife', 'faehre_kombi', 'bus_kombi',
      'badewetter', 'schlechtwetter', 'sonnenuntergang', 'sonnenaufgang',
      'altstadt', 'kultur', 'naturpark', 'flach', 'rad', 'wandern',
    ])
    .optional()
    .describe("Themen-Filter, z.B. familie oder schlechtwetter."),
  family: z.boolean().optional().describe("Familienfreundlich (Kinder dabei)?"),
  bad_weather: z.boolean().optional().describe("Schlechtes Wetter — Indoor / regenfest gewünscht?"),
  difficulty: z.enum(['leicht', 'mittel', 'sportlich']).optional()
    .describe("Schwierigkeit gewünscht."),
  ferry_combo: z.boolean().optional().describe("Mit Schiffsfahrt kombinieren?"),
  q: z.string().optional().describe("Freitextsuche im Titel."),
});

// ── Tool definitions ─────────────────────────────────────────────────

const meckySearchToolDefinitions: AnthropicToolDefinition[] = [
  {
    name: "searchEvents",
    description:
      "Suche nach Events/Veranstaltungen in Röbel. Kann nach Text, Kategorie und Datum filtern. Gibt max. 5 Ergebnisse zurück.",
    input_schema: zodToToolInputSchema(searchEventsSchema),
  },
  {
    name: "searchRestaurants",
    description:
      "Suche nach Restaurants und Gaststätten in Röbel. Gibt Name, Adresse und Beschreibung zurück.",
    input_schema: zodToToolInputSchema(searchRestaurantsSchema),
  },
  {
    name: "searchMarketplace",
    description:
      "Suche auf dem Marktplatz nach Produkten und Dienstleistungen von Nutzern. Gibt Titel, Preis und Zustand zurück.",
    input_schema: zodToToolInputSchema(searchMarketplaceSchema),
  },
  {
    name: "searchNews",
    description:
      "Suche nach Nachrichten und Artikeln über Röbel. Gibt Titel, Auszug und Veröffentlichungsdatum zurück.",
    input_schema: zodToToolInputSchema(searchNewsSchema),
  },
  {
    name: "searchMovies",
    description:
      "Suche nach aktuellen Kinofilmen. Gibt Titel, Datum, Uhrzeit und FSK zurück.",
    input_schema: zodToToolInputSchema(searchMoviesSchema),
  },
  {
    name: "searchBusinesses",
    description:
      "Suche nach lokalen Unternehmen und Geschäften in Röbel. Kann nach Name oder Branche filtern.",
    input_schema: zodToToolInputSchema(searchBusinessesSchema),
  },
  {
    name: "searchDeals",
    description:
      "Suche nach aktiven Angeboten und Aktionen von Geschäften in Röbel.",
    input_schema: zodToToolInputSchema(searchDealsSchema),
  },
  {
    name: "navigateUser",
    description:
      "Erstellt einen klickbaren Link zu einer bestimmten Seite in der App, z.B. Event-Detail, Restaurant, Governance.",
    input_schema: zodToToolInputSchema(navigateUserSchema),
  },
  {
    name: "searchPois",
    description:
      "Findet Mecky-Tipps in der Nähe: Toiletten, Trinkwasser, Fahrradverleih, 24h Pannendienst, Badestellen mit Wasserqualität (Heute baden? Ja/Mit Vorsicht/Lieber nicht), Schlechtwetter-Alternativen, Tourist-Infos, Apotheken, Beobachtungsstände im Nationalpark, Aussichtspunkte.",
    input_schema: zodToToolInputSchema(searchPoisSchema),
  },
  {
    name: "todayAdvisories",
    description:
      "Liefert die Tagesempfehlungen von Mecky: Mücken-, Zecken-, Blaualgen- und UV-Index. Nutze das, wenn jemand fragt 'Soll ich heute baden?', 'Sind heute viele Mücken?' o.ä.",
    input_schema: zodToToolInputSchema(todayAdvisoriesSchema),
  },
  {
    name: "searchTransit",
    description:
      "Findet die nächsten Abfahrten aus Röbel und Umgebung: Linie 12 (Waren ↔ Neubrandenburg), Stadtbus Röbel 024, Nationalpark-Linien 9/10, MS Diana (Schiff) und Elli-Bus (auf Anruf). Berücksichtigt Wochentag, Saison und Tageszeit. Markiert die letzte Abfahrt des Tages.",
    input_schema: zodToToolInputSchema(searchTransitSchema),
  },
  {
    name: "recommendTour",
    description:
      "Empfiehlt eine Mecky-Sternfahrt aus dem 30-Touren-Katalog. Filtert nach verfügbarer Zeit (2h/4h/Tag/Mehrtag), Thema (Familie, Wildlife, Schiff-Kombi, Schlechtwetter, Sonnenuntergang…), Schwierigkeit. Ideal für 'Ich habe X Stunden, was kann ich machen?' oder 'Was kann ich bei Regen machen?'",
    input_schema: zodToToolInputSchema(recommendTourSchema),
  },
  {
    name: "searchWildlife",
    description:
      "Findet aktuelle Wildlife-Sichtungen in der Müritz-Region — Fischadler, Seeadler, Kranich, Singschwan, Silberreiher, Rothirsch, Damhirsch, Wolf, Fischotter und mehr. Sortiert nach Aktualität, mit Mecky-bestätigten Sichtungen zuerst.",
    input_schema: zodToToolInputSchema(searchWildlifeSchema),
  },
  {
    name: "seasonalCalendar",
    description:
      "Liefert den Wildlife-Saisonkalender — Kraniche-Rast, Fischadler-Brut, Hirschbrunft, Singschwan-Winterrast, Kranichtanz, Reiherenten-Schwärme. Mit Push-Nachrichten und Zeitfenstern.",
    input_schema: zodToToolInputSchema(seasonalCalendarSchema),
  },
];

// ── Executors ────────────────────────────────────────────────────────

async function executeSearchEvents(
  input: z.infer<typeof searchEventsSchema>
): Promise<ToolResult> {
  try {
    let query = supabase
      .from("events")
      .select("id, title, date, time, location, category, image_url, organizer_name")
      .eq("status", "approved")
      .order("date", { ascending: true })
      .limit(5);

    if (input.query) {
      query = query.ilike("title", `%${input.query}%`);
    }
    if (input.category) {
      query = query.eq("category", input.category);
    }
    if (input.startDate) {
      query = query.gte("date", input.startDate);
    } else {
      // Default: only future events
      query = query.gte("date", new Date().toISOString().split("T")[0]);
    }
    if (input.endDate) {
      query = query.lte("date", input.endDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: {
        items: data || [],
        count: data?.length || 0,
        displayType: "events",
        message: data?.length
          ? `${data.length} Event(s) gefunden.`
          : "Keine Events gefunden.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error), data: { message: "Fehler bei der Event-Suche." } };
  }
}

async function executeSearchRestaurants(
  input: z.infer<typeof searchRestaurantsSchema>
): Promise<ToolResult> {
  try {
    const all = await fetchRestaurants();
    let results = all;
    if (input.query) {
      const q = input.query.toLowerCase();
      results = all.filter(
        (r) => r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
      );
    }
    const items = results.slice(0, 5).map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description?.slice(0, 100) || null,
      address: r.address,
      phone: r.phone,
      logo_url: r.logo_url,
    }));

    return {
      success: true,
      data: {
        items,
        count: items.length,
        displayType: "restaurants",
        message: items.length
          ? `${items.length} Restaurant(s) gefunden.`
          : "Keine Restaurants gefunden.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error), data: { message: "Fehler bei der Restaurant-Suche." } };
  }
}

async function executeSearchMarketplace(
  input: z.infer<typeof searchMarketplaceSchema>
): Promise<ToolResult> {
  try {
    const listings = await fetchMarketplaceListings({
      category: input.category,
      limit: 20,
    });
    let results = listings;
    if (input.query) {
      const q = input.query.toLowerCase();
      results = listings.filter(
        (l) => l.title.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q)
      );
    }
    const items = results.slice(0, 5).map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      price_type: l.price_type,
      condition: l.condition,
      image_url: l.media_urls?.[0] || null,
    }));

    return {
      success: true,
      data: {
        items,
        count: items.length,
        displayType: "marketplace",
        message: items.length
          ? `${items.length} Anzeige(n) gefunden.`
          : "Keine Anzeigen gefunden.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error), data: { message: "Fehler bei der Marktplatz-Suche." } };
  }
}

async function executeSearchNews(
  input: z.infer<typeof searchNewsSchema>
): Promise<ToolResult> {
  try {
    let query = supabase
      .from("news_articles")
      .select("id, title, slug, excerpt, published_at, cover_image_url")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5);

    if (input.query) {
      query = query.ilike("title", `%${input.query}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: {
        items: data || [],
        count: data?.length || 0,
        displayType: "news",
        message: data?.length
          ? `${data.length} Artikel gefunden.`
          : "Keine Nachrichten gefunden.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error), data: { message: "Fehler bei der Nachrichten-Suche." } };
  }
}

async function executeSearchMovies(
  input: z.infer<typeof searchMoviesSchema>
): Promise<ToolResult> {
  try {
    let query = supabase
      .from("movies")
      .select("id, title, date, time, cover_image_url, fsk")
      .eq("status", "published")
      .gte("date", new Date().toISOString().split("T")[0])
      .order("date", { ascending: true })
      .limit(5);

    if (input.query) {
      query = query.ilike("title", `%${input.query}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: {
        items: data || [],
        count: data?.length || 0,
        displayType: "movies",
        message: data?.length
          ? `${data.length} Film(e) gefunden.`
          : "Keine Filme im Programm gefunden.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error), data: { message: "Fehler bei der Film-Suche." } };
  }
}

async function executeSearchBusinesses(
  input: z.infer<typeof searchBusinessesSchema>
): Promise<ToolResult> {
  try {
    let query = supabase
      .from("businesses")
      .select("id, name, slug, category, address, logo_url, phone")
      .eq("status", "approved")
      .order("name", { ascending: true })
      .limit(5);

    if (input.query) {
      query = query.ilike("name", `%${input.query}%`);
    }
    if (input.category) {
      query = query.eq("category", input.category);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: {
        items: data || [],
        count: data?.length || 0,
        displayType: "businesses",
        message: data?.length
          ? `${data.length} Unternehmen gefunden.`
          : "Keine Unternehmen gefunden.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error), data: { message: "Fehler bei der Unternehmens-Suche." } };
  }
}

async function executeSearchDeals(
  input: z.infer<typeof searchDealsSchema>
): Promise<ToolResult> {
  try {
    let query = supabase
      .from("business_deals")
      .select("id, title, deal_type, deal_value, image_url, business_id")
      .eq("is_active", true)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5);

    if (input.query) {
      query = query.ilike("title", `%${input.query}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: {
        items: data || [],
        count: data?.length || 0,
        displayType: "deals",
        message: data?.length
          ? `${data.length} Angebot(e) gefunden.`
          : "Keine aktiven Angebote gefunden.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error), data: { message: "Fehler bei der Angebots-Suche." } };
  }
}

async function executeNavigateUser(
  input: z.infer<typeof navigateUserSchema>
): Promise<ToolResult> {
  return {
    success: true,
    data: {
      route: input.route,
      label: input.label,
      displayType: "navigation",
      message: `Link: ${input.label}`,
    },
  };
}

async function executeSearchPois(
  input: z.infer<typeof searchPoisSchema>
): Promise<ToolResult> {
  try {
    const all = await fetchPois(input.type ? [input.type as PoiType] : undefined);
    let results = all;
    if (input.near_lat != null && input.near_lon != null) {
      const radius = input.radius_km ?? 5;
      results = all
        .map((p) => ({
          ...p,
          _distance: distanceKm(input.near_lat!, input.near_lon!, p.lat, p.lon),
        }))
        .filter((p) => p._distance <= radius)
        .sort((a, b) => a._distance - b._distance);
    }
    const items = results.slice(0, 8).map((p) => ({
      id: p.id,
      type: p.type,
      type_label_de: POI_TYPE_LABELS_DE[p.type],
      name: p.name_de,
      description: p.description_de,
      address: p.address,
      phone: p.phone,
      website: p.website,
      opening_hours_de: p.opening_hours_de,
      is_24h: p.is_24h,
      is_pannendienst: p.is_pannendienst,
      status: p.status,
      status_label_de: p.status?.startsWith("swim_")
        ? SWIM_STATUS_LABELS_DE[p.status as string]
        : null,
      status_note_de: p.status_note_de,
      lat: p.lat,
      lon: p.lon,
    }));
    return {
      success: true,
      data: {
        items,
        count: items.length,
        displayType: "pois",
        message: items.length
          ? `${items.length} Mecky-Tipp(s) gefunden.`
          : "Keine passenden Tipps gefunden.",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      data: { message: "Fehler bei der Tipp-Suche." },
    };
  }
}

async function executeSearchTransit(
  input: z.infer<typeof searchTransitSchema>
): Promise<ToolResult> {
  try {
    const departures = await fetchNextDepartures({
      lat: input.near_lat,
      lon: input.near_lon,
      limit: 30,
    });
    const filtered = input.mode
      ? departures.filter((d) => d.line.mode === (input.mode as TransitMode))
      : departures;
    const items = filtered.slice(0, 8).map((d) => ({
      line_code: d.line.code,
      line_name: d.line.name_de,
      mode: d.line.mode,
      mode_label_de: TRANSIT_MODE_LABELS_DE[d.line.mode],
      departure_time: d.departure.departure_time.slice(0, 5),
      destination: d.departure.destination_de,
      trip_label: d.departure.trip_label_de,
      stop: d.stop?.name_de ?? null,
      free_with_gaestekarte: d.line.free_with_gaestekarte,
      carries_bikes: d.line.carries_bikes,
      is_last_of_day: d.departure.is_last_of_day,
      distance_km: d.distance_km == null ? null : Number(d.distance_km.toFixed(2)),
      notes: d.line.notes_de,
    }));
    return {
      success: true,
      data: {
        items,
        count: items.length,
        displayType: "transit",
        message: items.length
          ? `${items.length} kommende Abfahrt(en) gefunden.`
          : "Heute keine weiteren Abfahrten — vielleicht den Elli-Bus rufen?",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      data: { message: "Fehler bei der Verkehrs-Suche." },
    };
  }
}

async function executeRecommendTour(
  input: z.infer<typeof recommendTourSchema>
): Promise<ToolResult> {
  try {
    const tours = await fetchTours({
      hours_bucket: input.hours as TourHoursBucket | undefined,
      category: input.category,
      family_friendly: input.family,
      bad_weather_alternative: input.bad_weather,
      ferry_combo: input.ferry_combo,
      difficulty: input.difficulty as TourDifficulty | undefined,
      q: input.q,
    });
    const items = tours.slice(0, 6).map((t) => ({
      slug: t.slug,
      title: t.title_de,
      subtitle: t.subtitle_de,
      distance_km: t.distance_km,
      duration_min: t.duration_min,
      difficulty: t.difficulty,
      difficulty_label_de: DIFFICULTY_LABELS_DE[t.difficulty],
      hours_bucket: t.hours_bucket,
      hours_label_de: t.hours_bucket ? HOURS_LABELS_DE[t.hours_bucket] : null,
      categories: t.categories,
      is_sternfahrt: t.is_sternfahrt,
      ferry_combo: t.ferry_combo,
      bus_combo: t.bus_combo,
      family_friendly: t.family_friendly,
      bad_weather_alternative: t.bad_weather_alternative,
      season: t.season_de,
      best_start_time: t.best_start_time_de,
      highlights: t.highlights_de,
    }));
    return {
      success: true,
      data: {
        items,
        count: items.length,
        displayType: "tours",
        message: items.length
          ? `${items.length} Mecky-Tour(en) gefunden.`
          : "Keine passende Tour gefunden — Filter lockern?",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      data: { message: "Fehler bei der Tour-Suche." },
    };
  }
}

async function executeSearchWildlife(
  input: z.infer<typeof searchWildlifeSchema>
): Promise<ToolResult> {
  try {
    const all = await fetchSpecies();
    let speciesId: string | undefined;
    if (input.species_slug) {
      speciesId = all.find((s) => s.slug === input.species_slug)?.id;
    }
    const sightings = await fetchSightings({
      species_id: speciesId,
      hours: input.hours ?? 48,
      limit: 30,
    });
    const speciesById = new Map(all.map((s) => [s.id, s]));
    let filtered = sightings;
    if (input.category) {
      filtered = sightings.filter((s) => {
        const sp = s.species_id ? speciesById.get(s.species_id) : null;
        return sp?.category === input.category;
      });
    }
    const items = filtered.slice(0, 8).map((s) => {
      const sp = s.species_id ? speciesById.get(s.species_id) : null;
      return {
        species_de: sp?.name_de ?? 'Unbekannt',
        species_slug: sp?.slug ?? null,
        is_protected: sp?.is_protected ?? false,
        individual_count: s.individual_count,
        observed_at: s.observed_at,
        freshness: freshnessLabelDe(s.observed_at),
        near_landmark: s.near_landmark_de,
        notes: s.notes_de,
        observer: s.observer_name_de,
        verified_by_mecky: s.verified_by_mecky,
        helpful_count: s.helpful_count,
      };
    });
    return {
      success: true,
      data: {
        items,
        count: items.length,
        displayType: "wildlife",
        message: items.length
          ? `${items.length} aktuelle Sichtung(en) gefunden.`
          : "Aktuell keine Sichtungen — sei der erste, der eine meldet!",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      data: { message: "Fehler bei der Wildlife-Suche." },
    };
  }
}

async function executeSeasonalCalendar(
  input: z.infer<typeof seasonalCalendarSchema>
): Promise<ToolResult> {
  try {
    const events = await fetchSeasonalEvents();
    const filtered = input.active_only ? events.filter((e) => isEventActive(e)) : events;
    const items = filtered.map((e) => ({
      title: e.title_de,
      description: e.description_de,
      start_month: e.start_month,
      end_month: e.end_month,
      start_date_hint: e.start_date_hint_de,
      peak_window: e.peak_window_de,
      best_location: e.best_location_de,
      alarm_kind: e.alarm_kind,
      push_message: e.push_message_de,
      is_active_now: isEventActive(e),
    }));
    return {
      success: true,
      data: {
        items,
        count: items.length,
        displayType: "wildlife_calendar",
        message: items.length
          ? `${items.length} Saison-Termine im Kalender.`
          : "Keine Termine.",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      data: { message: "Fehler beim Saisonkalender." },
    };
  }
}

async function executeTodayAdvisories(): Promise<ToolResult> {
  try {
    const advisories = await fetchTodayAdvisories();
    return {
      success: true,
      data: {
        items: advisories.map((a) => ({
          type: a.type,
          level: a.level,
          message: a.message_de,
          recommendation: a.recommendation_de,
        })),
        count: advisories.length,
        displayType: "advisories",
        message: advisories.length
          ? `Mecky hat ${advisories.length} Tagestipp(s) für dich.`
          : "Heute keine besonderen Hinweise.",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      data: { message: "Fehler bei den Tagestipps." },
    };
  }
}

// ── Registry ─────────────────────────────────────────────────────────

export const meckyToolDefinitions: AnthropicToolDefinition[] = [
  ...eventSubmissionToolDefinitions,
  ...meckySearchToolDefinitions,
];

const meckyToolExecutors: Record<string, (input: any) => Promise<ToolResult>> = {
  // Existing event submission tools
  searchLocation: executeSearchLocation,
  extractFlyer: executeExtractFlyer,
  submitEvent: executeSubmitEvent,
  // Mecky search tools
  searchEvents: executeSearchEvents,
  searchRestaurants: executeSearchRestaurants,
  searchMarketplace: executeSearchMarketplace,
  searchNews: executeSearchNews,
  searchMovies: executeSearchMovies,
  searchBusinesses: executeSearchBusinesses,
  searchDeals: executeSearchDeals,
  navigateUser: executeNavigateUser,
  searchPois: executeSearchPois,
  todayAdvisories: executeTodayAdvisories,
  searchTransit: executeSearchTransit,
  recommendTour: executeRecommendTour,
  searchWildlife: executeSearchWildlife,
  seasonalCalendar: executeSeasonalCalendar,
};

export async function executeMeckyTool(
  name: string,
  input: any
): Promise<ToolResult> {
  const executor = meckyToolExecutors[name];
  if (!executor) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
      errorType: "UnknownTool",
    };
  }
  try {
    return await executor(input);
  } catch (error) {
    console.error(`Mecky tool ${name} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
