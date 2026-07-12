// Import images from an external website into a mini app's Mini-CMS:
// fetch the page server-side, extract <img>/og:image candidates, download
// each image into the app's content storage (public URLs on our origin) and
// write them as [{ url, alt }] into a mini_app_data app-scope key. Used by
// the editor chat ("Hol die Bilder von <url> …"), the cms-import-images API
// route and the MCP tool.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { setData, DATA_KEY_RE } from "../dataStore";
import { MiniAppError } from "../types";

const BUCKET = "images";

const FETCH_TIMEOUT_MS = 12_000;
const IMAGE_TIMEOUT_MS = 15_000;
const MIN_BYTES = 5_000; // skip tracking pixels / tiny icons
const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 16;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const UA =
  "Mozilla/5.0 (compatible; RoebelMiniAppBot/1.0; +https://www.roebel.app/developers/mini-apps)";

export interface ImportedImage {
  url: string;
  alt: string;
}

export interface ImportResult {
  key: string;
  images: ImportedImage[];
  /** candidates found on the page (before download filters) */
  found: number;
  sourceHost: string;
}

/** SSRF guard: public http(s) origins only. */
function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MiniAppError("invalid_params", "Ungültige URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new MiniAppError("invalid_params", "Nur http(s)-URLs sind erlaubt.");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    host === "[::1]"
  ) {
    throw new MiniAppError("invalid_params", "Diese Adresse ist nicht erreichbar.");
  }
  return url;
}

async function fetchWithTimeout(url: string, ms: number, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Pull image candidates (absolute https URLs + alt text) out of an HTML page. */
export function extractImageCandidates(html: string, baseUrl: string): ImportedImage[] {
  const out: ImportedImage[] = [];
  const seen = new Set<string>();

  const push = (src: string | undefined, alt = "") => {
    if (!src) return;
    let abs: string;
    try {
      abs = new URL(src.trim(), baseUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:/.test(abs) || abs.startsWith("data:")) return;
    // srcset descriptors sneak in occasionally — strip anything after a space.
    abs = abs.split(" ")[0];
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ url: abs, alt: alt.trim().slice(0, 200) });
  };

  // og:image / twitter:image first — usually the hero.
  for (const m of html.matchAll(
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/gi,
  )) {
    push(m[1]);
  }
  for (const m of html.matchAll(
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/gi,
  )) {
    push(m[1]);
  }

  // <img> tags: src / data-src (lazy loading) / first srcset entry, with alt.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name: string) =>
      tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
    const alt = attr("alt") ?? "";
    const srcset = attr("srcset") ?? attr("data-srcset");
    // Last srcset entry is typically the largest rendition.
    const fromSet = srcset?.split(",").map((s) => s.trim()).filter(Boolean).pop();
    push(attr("data-src") ?? attr("data-lazy-src") ?? fromSet ?? attr("src"), alt);
  }

  return out;
}

/**
 * Fetch `pageUrl`, download up to `limit` of its images into the app's
 * content storage and write them into the `key` CMS value as [{url, alt}].
 * Replaces the key's previous value.
 */
export async function importImagesFromWebsite(params: {
  appId: string;
  pageUrl: string;
  key?: string;
  limit?: number;
}): Promise<ImportResult> {
  const url = assertSafeUrl(params.pageUrl);
  const key = (params.key ?? "bilder").toLowerCase();
  if (!DATA_KEY_RE.test(key)) {
    throw new MiniAppError("invalid_params", `Ungültiger CMS-Schlüssel "${params.key}".`);
  }
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS, "text/html,*/*");
  } catch {
    throw new MiniAppError("internal", `Die Website ${url.hostname} antwortet nicht.`, 502);
  }
  if (!res.ok) {
    throw new MiniAppError("internal", `Die Website antwortet mit Fehler ${res.status}.`, 502);
  }

  const contentType = res.headers.get("content-type") ?? "";
  let candidates: ImportedImage[];
  if (contentType.startsWith("image/")) {
    // A direct image link imports as a single image.
    candidates = [{ url: url.toString(), alt: "" }];
  } else {
    const html = await res.text();
    candidates = extractImageCandidates(html.slice(0, 2_000_000), url.toString());
  }
  if (candidates.length === 0) {
    throw new MiniAppError(
      "not_found",
      `Auf ${url.hostname} wurden keine Bilder gefunden (Seite prüfen oder direkte Bild-URL angeben).`,
      404,
    );
  }

  // Download + persist until `limit` images made it through the filters.
  const supabase = createAdminClient();
  const imported: ImportedImage[] = [];
  for (const cand of candidates) {
    if (imported.length >= limit) break;
    try {
      const imgRes = await fetchWithTimeout(cand.url, IMAGE_TIMEOUT_MS, "image/*");
      if (!imgRes.ok) continue;
      const type = (imgRes.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!ALLOWED_TYPES.has(type)) continue;
      const bytes = await imgRes.arrayBuffer();
      if (bytes.byteLength < MIN_BYTES || bytes.byteLength > MAX_BYTES) continue;
      const ext = type.includes("jpeg")
        ? "jpg"
        : type.includes("webp")
          ? "webp"
          : type.includes("gif")
            ? "gif"
            : "png";
      const path = `mini-apps/${params.appId}/content/${Date.now()}_${imported.length}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: type, upsert: false });
      if (error) continue;
      imported.push({
        url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
        alt: cand.alt,
      });
    } catch {
      /* next candidate */
    }
  }

  if (imported.length === 0) {
    throw new MiniAppError(
      "internal",
      `Von ${url.hostname} konnte kein Bild geladen werden (Formate/Größen geprüft: PNG, JPEG, WebP, GIF, 5 KB – 8 MB).`,
      502,
    );
  }

  await setData(params.appId, "app", key, imported, null);

  return { key, images: imported, found: candidates.length, sourceHost: url.hostname };
}
