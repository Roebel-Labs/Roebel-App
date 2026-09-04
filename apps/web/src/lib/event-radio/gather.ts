// apps/web/src/lib/event-radio/gather.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { toPublicEvent, type PublicEvent } from "./hash";
import type { ExistingRow } from "./plan";
import type { RadioKind } from "./select";
import type { WeekWindow } from "./window";

/** Public fields only (spec 6.1). Never organizer_email / organizer_phone. */
export const EVENT_SELECT =
  "id, title, description, date, time, end_time, location, organizer_name, category, ticket_price, website_url, is_cancelled";

/** Same query as apps/expo fetchThisWeekEvents: approved, today..Sunday, by date, max 10. */
export async function gatherWeekEvents(
  supabase: SupabaseClient,
  window: WeekWindow,
): Promise<PublicEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("status", "approved")
    .gte("date", window.start)
    .lte("date", window.end)
    .order("date", { ascending: true })
    .limit(10);
  if (error) throw new Error(`Events laden fehlgeschlagen: ${error.message}`);
  return (data ?? []).map((row) => toPublicEvent(row as unknown as Record<string, unknown>));
}

type SegmentRowRaw = {
  id: string;
  kind: RadioKind;
  scope_key: string;
  content_hash: string;
  audio_url: string;
  script: string;
  duration_ms: number;
  created_at: string;
  events: { date: string } | null;
};

/** Every row (the table stays small: expiry runs daily). */
export async function loadExistingRows(supabase: SupabaseClient): Promise<ExistingRow[]> {
  const { data, error } = await supabase
    .from("event_radio_segments")
    .select("id, kind, scope_key, content_hash, audio_url, script, duration_ms, created_at, events(date)");
  if (error) throw new Error(`Segmente laden fehlgeschlagen: ${error.message}`);
  return ((data ?? []) as unknown as SegmentRowRaw[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    scope_key: r.scope_key,
    content_hash: r.content_hash,
    audio_url: r.audio_url,
    script: r.script,
    duration_ms: r.duration_ms,
    created_at: r.created_at,
    event_date: r.events?.date ?? null,
  }));
}

export async function readSetting(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error(`[EventRadio] app_settings ${key}:`, error.message);
    return null;
  }
  const value = (data as { value: string | null } | null)?.value ?? null;
  return value && value.trim() !== "" ? value : null;
}
