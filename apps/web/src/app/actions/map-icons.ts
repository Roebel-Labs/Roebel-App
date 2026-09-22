"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  defaultMarkerEmoji,
  type MapMarkerEntityType,
} from "@/lib/maps/marker-emoji";

export const MAP_ICONS_PATH = "/admin/dashboard/karten-icons";

/** One pinned thing on the Expo map, with what the pin currently shows. */
export type MapMarkerEntity = {
  entityType: MapMarkerEntityType;
  entityId: string;
  name: string;
  /** Category / type / sub_type the default emoji is matched from. */
  category: string | null;
  defaultEmoji: string;
  /** Admin override, null = default. */
  emoji: string | null;
  /** Custom circular pin image, null = emoji pin. */
  imageUrl: string | null;
  /** The entity's own picture (logo/avatar/cover) — a handy source to crop from. */
  sourceImageUrl: string | null;
};

type IconRow = { entity_type: string; entity_id: string; emoji: string | null; image_url: string | null };

/**
 * Everything the Expo map draws a pin for, in the same selection the app
 * uses (apps/expo/app/location.tsx + lib/map/geojson.ts): approved events,
 * published restaurants and businesses, active POIs and organisation
 * accounts, each only with coordinates. Events are limited to today onward.
 */
export async function listMapMarkerEntities(): Promise<MapMarkerEntity[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [events, restaurants, businesses, pois, orgs, icons] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, category, image_url, latitude, longitude")
      .eq("status", "approved")
      .gte("date", today)
      .not("latitude", "is", null)
      .order("date", { ascending: true }),
    supabase
      .from("restaurants")
      .select("id, name, slug, logo_url, cover_image_url, latitude, longitude")
      .eq("status", "published")
      .not("latitude", "is", null)
      .order("name"),
    supabase
      .from("businesses")
      .select("id, name, slug, category, logo_url, cover_image_url, latitude, longitude")
      .eq("status", "published")
      .not("latitude", "is", null)
      .order("name"),
    supabase
      .from("pois")
      .select("id, name_de, type, lat, lon")
      .eq("is_active", true)
      .order("name_de"),
    supabase
      .from("accounts")
      .select("id, name, sub_type, avatar_url, latitude, longitude")
      .eq("account_type", "organisation")
      .not("latitude", "is", null)
      .order("name"),
    supabase.from("map_marker_icons").select("entity_type, entity_id, emoji, image_url"),
  ]);

  const overrides = new Map<string, IconRow>();
  for (const row of (icons.data ?? []) as IconRow[]) {
    overrides.set(`${row.entity_type}-${row.entity_id}`, row);
  }

  const build = (
    entityType: MapMarkerEntityType,
    entityId: string,
    name: string,
    category: string | null,
    slug: string | null,
    sourceImageUrl: string | null,
  ): MapMarkerEntity => {
    const override = overrides.get(`${entityType}-${entityId}`);
    return {
      entityType,
      entityId,
      name,
      category,
      defaultEmoji: defaultMarkerEmoji({ entityType, category, slug, name }),
      emoji: override?.emoji ?? null,
      imageUrl: override?.image_url ?? null,
      sourceImageUrl,
    };
  };

  const out: MapMarkerEntity[] = [];
  for (const e of events.data ?? []) {
    out.push(build("event", String(e.id), e.title, e.category, null, e.image_url));
  }
  for (const r of restaurants.data ?? []) {
    out.push(build("restaurant", String(r.id), r.name, null, r.slug, r.logo_url || r.cover_image_url));
  }
  // A place that is both a restaurant and a business only gets the restaurant pin.
  const restaurantNames = new Set((restaurants.data ?? []).map((r) => r.name.trim().toLowerCase()));
  for (const b of businesses.data ?? []) {
    if (restaurantNames.has(b.name.trim().toLowerCase())) continue;
    out.push(build("business", String(b.id), b.name, b.category, b.slug, b.logo_url || b.cover_image_url));
  }
  for (const p of pois.data ?? []) {
    out.push(build("poi", String(p.id), p.name_de, p.type, null, null));
  }
  for (const o of orgs.data ?? []) {
    out.push(build("org", String(o.id), o.name, o.sub_type, null, o.avatar_url));
  }
  return out;
}

const ENTITY_TYPES: MapMarkerEntityType[] = ["event", "restaurant", "business", "poi", "org"];

/**
 * Set or clear the override for one pin. Pass `emoji: null` / `imageUrl: null`
 * to fall back to the default; a row with nothing set is removed.
 */
export async function setMapMarkerIcon(input: {
  entityType: MapMarkerEntityType;
  entityId: string;
  emoji?: string | null;
  imageUrl?: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (!ENTITY_TYPES.includes(input.entityType)) throw new Error("unknown entity type");
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("map_marker_icons")
      .select("emoji, image_url")
      .eq("entity_type", input.entityType)
      .eq("entity_id", input.entityId)
      .maybeSingle();

    const emoji = input.emoji === undefined ? (existing?.emoji ?? null) : (input.emoji?.trim() || null);
    const imageUrl = input.imageUrl === undefined ? (existing?.image_url ?? null) : (input.imageUrl || null);

    if (emoji === null && imageUrl === null) {
      const { error } = await admin
        .from("map_marker_icons")
        .delete()
        .eq("entity_type", input.entityType)
        .eq("entity_id", input.entityId);
      if (error) throw error;
    } else {
      const { error } = await admin.from("map_marker_icons").upsert(
        {
          entity_type: input.entityType,
          entity_id: input.entityId,
          emoji,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_type,entity_id" },
      );
      if (error) throw error;
    }
    revalidatePath(MAP_ICONS_PATH);
    return { success: true };
  } catch (error) {
    console.error("setMapMarkerIcon error", error);
    return { success: false, error: "Karten-Icon konnte nicht gespeichert werden" };
  }
}
