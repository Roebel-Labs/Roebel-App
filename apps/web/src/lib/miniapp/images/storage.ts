// Storage + row updates for mini-app images (icons, store previews, editor
// screenshots). Bucket: `images` (the app-wide public bucket), paths under
// mini-apps/<appId>/. Server-only.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MiniAppError, type MiniAppRow } from "../types";

const BUCKET = "images";
export const MAX_PREVIEWS = 5;

export type ImageKind = "icon" | "preview" | "feature" | "shot" | "content";

function extFor(contentType: string): string {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

function pathFor(appId: string, kind: ImageKind, slot?: number, contentType?: string): string {
  const ts = Date.now();
  if (kind === "icon") return `mini-apps/${appId}/icon_${ts}.png`;
  if (kind === "preview") return `mini-apps/${appId}/preview-${slot ?? 0}_${ts}.png`;
  if (kind === "feature") return `mini-apps/${appId}/feature_${ts}.png`;
  // Content images (Mini-CMS values, chat attachments): not tied to the app
  // row — the URL lands in mini_app_data values / the generated document.
  if (kind === "content")
    return `mini-apps/${appId}/content/${ts}.${extFor(contentType ?? "image/png")}`;
  return `mini-apps/${appId}/shots/${ts}.png`;
}

async function uploadToBucket(
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new MiniAppError("internal", `Upload fehlgeschlagen: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Persist an uploaded file (or downloaded KIE result) and return its public URL. */
export async function saveImageBytes(
  appId: string,
  kind: ImageKind,
  bytes: ArrayBuffer,
  contentType: string,
  slot?: number,
): Promise<string> {
  return uploadToBucket(pathFor(appId, kind, slot, contentType), bytes, contentType);
}

/** Download a generated image from KIE's CDN and store it in our bucket. */
export async function saveImageFromUrl(
  appId: string,
  kind: ImageKind,
  srcUrl: string,
  slot?: number,
): Promise<string> {
  const res = await fetch(srcUrl);
  if (!res.ok) {
    throw new MiniAppError("internal", "Generiertes Bild konnte nicht geladen werden.", 502);
  }
  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/png";
  return saveImageBytes(appId, kind, bytes, contentType, slot);
}

/** Write the stored URL onto the app row (icon_url or screenshots[slot]). */
export async function applyImageToApp(
  app: MiniAppRow,
  kind: Exclude<ImageKind, "shot">,
  publicUrl: string,
  slot?: number,
): Promise<void> {
  const supabase = createAdminClient();
  if (kind === "icon" || kind === "feature") {
    const column = kind === "icon" ? "icon_url" : "feature_image_url";
    const { error } = await supabase
      .from("mini_apps")
      .update({ [column]: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) throw new MiniAppError("internal", error.message);
    return;
  }
  const shots = [...(app.screenshots ?? [])];
  const idx = Math.min(Math.max(slot ?? shots.length, 0), MAX_PREVIEWS - 1);
  shots[idx] = publicUrl;
  // Lücken vermeiden (sparse array → null-Einträge herausfiltern)
  const cleaned = shots.filter((s): s is string => typeof s === "string" && s.length > 0);
  const { error } = await supabase
    .from("mini_apps")
    .update({ screenshots: cleaned, updated_at: new Date().toISOString() })
    .eq("id", app.id);
  if (error) throw new MiniAppError("internal", error.message);
}

/** Remove a preview slot (or clear the icon). */
export async function removeImageFromApp(
  app: MiniAppRow,
  kind: Exclude<ImageKind, "shot">,
  slot?: number,
): Promise<void> {
  const supabase = createAdminClient();
  if (kind === "icon" || kind === "feature") {
    const column = kind === "icon" ? "icon_url" : "feature_image_url";
    const { error } = await supabase
      .from("mini_apps")
      .update({ [column]: null, updated_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) throw new MiniAppError("internal", error.message);
    return;
  }
  const shots = (app.screenshots ?? []).filter((_, i) => i !== (slot ?? -1));
  const { error } = await supabase
    .from("mini_apps")
    .update({ screenshots: shots, updated_at: new Date().toISOString() })
    .eq("id", app.id);
  if (error) throw new MiniAppError("internal", error.message);
}

/** Editor screenshots pool for "Aus Screenshot" (newest first). */
export async function listShots(appId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const dir = `mini-apps/${appId}/shots`;
  const { data, error } = await supabase.storage.from(BUCKET).list(dir, {
    limit: 24,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error || !data) return [];
  return data
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => supabase.storage.from(BUCKET).getPublicUrl(`${dir}/${f.name}`).data.publicUrl);
}
