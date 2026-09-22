import { supabase } from './supabase';
import type { MapMarkerIcons } from './map/markers';

/**
 * Per-pin overrides for the map (emoji and/or custom PNG), set in the web
 * admin under Karten-Icons. One small query for the whole map; the result is
 * keyed by feature fid (`<entityType>-<id>`) to match the GeoJSON features.
 */
export async function fetchMapMarkerIcons(): Promise<MapMarkerIcons> {
  const icons: MapMarkerIcons = new Map();
  const { data, error } = await supabase
    .from('map_marker_icons')
    .select('entity_type, entity_id, emoji, image_url');
  if (error || !data) return icons;
  for (const row of data as { entity_type: string; entity_id: string; emoji: string | null; image_url: string | null }[]) {
    icons.set(`${row.entity_type}-${row.entity_id}`, { emoji: row.emoji, image_url: row.image_url });
  }
  return icons;
}
