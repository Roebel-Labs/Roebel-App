// apps/web/src/lib/event-radio/storage.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RadioKind } from "./select";

export const RADIO_BUCKET = "story-audio";

export function segmentObjectPath(
  weekKey: string,
  kind: RadioKind,
  scopeKey: string,
  contentHash: string,
): string {
  return `radio/${weekKey}/${kind}-${scopeKey}-${contentHash.slice(0, 8)}.mp3`;
}

export function objectPathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${RADIO_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

export async function uploadSegmentAudio(
  supabase: SupabaseClient,
  path: string,
  audio: Buffer,
): Promise<string> {
  const { error } = await supabase.storage.from(RADIO_BUCKET).upload(path, audio, {
    contentType: "audio/mpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`Upload fehlgeschlagen (${path}): ${error.message}`);
  return supabase.storage.from(RADIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deleteSegmentAudio(supabase: SupabaseClient, urls: string[]): Promise<void> {
  const paths = urls.map(objectPathFromPublicUrl).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(RADIO_BUCKET).remove(paths);
  if (error) console.error("[EventRadio] delete audio failed:", error.message);
}
