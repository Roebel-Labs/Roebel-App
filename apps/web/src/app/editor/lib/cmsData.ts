"use client";

// Client helpers for the Mini-CMS (/api/mini-apps/data, scope "app") used by
// the editor's Inhalte panel and the chat "In CMS übernehmen" flow. Same
// fetch contract as the dashboard ContentSection.

export interface CmsItem {
  key: string;
  value: unknown;
  updated_at: string;
}

function headers(wallet: string): HeadersInit {
  return { "content-type": "application/json", "x-wallet-address": wallet };
}

export async function loadCmsItems(appSlug: string): Promise<CmsItem[] | null> {
  const res = await fetch(
    `/api/mini-apps/data?app=${encodeURIComponent(appSlug)}&scope=app`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: CmsItem[] };
  return data.items ?? [];
}

export async function saveCmsValue(
  appSlug: string,
  wallet: string,
  key: string,
  value: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/mini-apps/data", {
    method: "POST",
    headers: headers(wallet),
    body: JSON.stringify({ app: appSlug, scope: "app", key, value }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? `HTTP ${res.status}` };
}

export async function deleteCmsKey(
  appSlug: string,
  wallet: string,
  key: string,
): Promise<boolean> {
  const res = await fetch("/api/mini-apps/data", {
    method: "DELETE",
    headers: headers(wallet),
    body: JSON.stringify({ app: appSlug, scope: "app", key }),
  });
  return res.ok;
}

/** Upload a chat/CMS image as a content asset; returns its public URL. */
export async function uploadContentImage(
  appSlug: string,
  wallet: string,
  blob: Blob,
  filename = "bild.jpg",
): Promise<string | null> {
  const form = new FormData();
  form.set("appId", appSlug);
  form.set("kind", "content");
  form.set("file", new File([blob], filename, { type: blob.type || "image/jpeg" }));
  const res = await fetch("/api/mini-apps/images/upload", {
    method: "POST",
    headers: { "x-wallet-address": wallet },
    body: form,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

const IMAGE_NAME_RE = /(bild|image|img|foto|photo|banner|logo|avatar|cover|icon)/i;
const IMAGE_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i;

/** Heuristic: does this object field hold an image URL? */
export function isImageField(name: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  return IMAGE_NAME_RE.test(name) || IMAGE_URL_RE.test(value);
}

export interface ImageFieldTarget {
  key: string;
  /** Path inside the value: e.g. [2, "bild"] = items[2].bild; [] = the value itself. */
  path: (string | number)[];
  label: string;
}

/** All image-URL fields across the CMS items — targets for "In CMS übernehmen". */
export function findImageFields(items: CmsItem[]): ImageFieldTarget[] {
  const targets: ImageFieldTarget[] = [];
  for (const item of items) {
    const v = item.value;
    if (typeof v === "string" && isImageField(item.key, v)) {
      targets.push({ key: item.key, path: [], label: item.key });
    } else if (Array.isArray(v)) {
      v.forEach((entry, i) => {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const rec = entry as Record<string, unknown>;
          const name =
            (typeof rec.titel === "string" && rec.titel) ||
            (typeof rec.name === "string" && rec.name) ||
            (typeof rec.title === "string" && rec.title) ||
            `#${i + 1}`;
          for (const [field, val] of Object.entries(rec)) {
            if (isImageField(field, val)) {
              targets.push({
                key: item.key,
                path: [i, field],
                label: `${item.key} → ${name} → ${field}`,
              });
            }
          }
        }
      });
    } else if (v && typeof v === "object") {
      for (const [field, val] of Object.entries(v as Record<string, unknown>)) {
        if (isImageField(field, val)) {
          targets.push({ key: item.key, path: [field], label: `${item.key} → ${field}` });
        }
      }
    }
  }
  return targets;
}

/** Immutable set of `path` inside `value` (arrays/objects cloned along the way). */
export function setAtPath(value: unknown, path: (string | number)[], next: unknown): unknown {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    const copy = [...value];
    copy[head as number] = setAtPath(copy[head as number], rest, next);
    return copy;
  }
  const obj = { ...((value ?? {}) as Record<string, unknown>) };
  obj[head as string] = setAtPath(obj[head as string], rest, next);
  return obj;
}
