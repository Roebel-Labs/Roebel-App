// Card design assets: logos, stickers, backgrounds and images an org uploads for its designs.
// Content-addressed (sha256 of the stored bytes) per org, immutable, stored in the public
// `images` bucket under credential-designs/<accountId>/. SVG is sanitised and rasterised to PNG
// before storing, and large rasters are scaled down, so every renderer only ever sees bitmaps of
// at most 2048 px on the long side.
// Relative imports only: loaded by `npx tsx --test`.
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Caller } from "../caller";
import { publicBaseUrl } from "../config";
import { designOrgFor, fail, isFail, ok, type DesignDeps, type DesignResult } from "./drafts";
import type { AssetKind, AssetRow } from "./store";

/** Object storage of the asset bytes (Supabase bucket `images` in production). */
export interface AssetStorage {
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
  publicUrl(path: string): string;
}

export type AssetDeps = DesignDeps & { storage: AssetStorage };

export type AssetView = { sha: string; kind: AssetKind; url: string; width: number | null; height: number | null; ai: boolean };

export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_ASSET_SIDE = 2048;
export const ASSET_KINDS: readonly AssetKind[] = ["logo", "sticker", "background", "image"];
const MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const SHARP_FORMAT: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

const TOO_LARGE = fail(413, "TOO_LARGE", "Das Bild ist zu groß (höchstens 8 MB).");
const BAD_FORMAT = fail(415, "BAD_FORMAT", "Dieses Dateiformat geht nicht. Erlaubt sind PNG, JPG, WebP und SVG.");
const UNREADABLE = fail(400, "BAD_IMAGE", "Das Bild konnte nicht gelesen werden.");

export const assetUrl = (sha: string) => `${publicBaseUrl()}/api/credentials/designs/assets/${sha}`;
export const assetPath = (accountId: string, sha: string, ext: string) => `credential-designs/${accountId}/${sha}.${ext}`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export function assetView(a: AssetRow): AssetView {
  return { sha: a.sha, kind: a.kind, url: assetUrl(a.sha), width: a.width, height: a.height, ai: a.ai };
}

/**
 * Removes everything from an SVG that can run code or reach outside the file: <script>,
 * <foreignObject>, event handler attributes (on*=), javascript: URLs and every href that is not
 * a same-document fragment (#id). A data: image href is kept (it is the picture itself).
 */
export function sanitiseSvg(svg: string): string {
  // Repeat until stable: a single pass can be defeated by nesting (<!DOC<!DOCTYPE q>TYPE …>).
  let s = svg;
  for (let i = 0; i < 10; i++) {
    const next = sanitiseOnce(s);
    if (next === s) return s;
    s = next;
  }
  return s;
}

function sanitiseOnce(svg: string): string {
  let s = svg;
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  s = s.replace(/<!ENTITY[\s\S]*?>/gi, "");
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<script\b[^>]*\/?>/gi, "");
  s = s.replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "").replace(/<foreignObject\b[^>]*\/?>/gi, "");
  s = s.replace(/[\s/]on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, " ");
  s = s.replace(/\s(?:[\w-]+:)?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m, _q, a, b, c) => {
    const v = String(a ?? b ?? c ?? "").trim();
    if (v.startsWith("#")) return m;
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(v)) return m;
    return "";
  });
  s = s.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none");
  s = s.replace(/@import[^;]*;?/gi, "");
  return s;
}

/** Bytes and format to store: SVG → sanitised → PNG; rasters checked and scaled to MAX_ASSET_SIDE. */
async function normalise(bytes: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number } | typeof UNREADABLE | typeof BAD_FORMAT> {
  try {
    if (mime === "image/svg+xml") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (!/<svg[\s>]/i.test(text)) return UNREADABLE;
      const clean = Buffer.from(sanitiseSvg(text), "utf8");
      const png = await sharp(clean, { density: 300, limitInputPixels: 64_000_000 })
        .resize(MAX_ASSET_SIDE, MAX_ASSET_SIDE, { fit: "inside", withoutEnlargement: false })
        .png()
        .toBuffer({ resolveWithObject: true });
      return { bytes: new Uint8Array(png.data), mime: "image/png", width: png.info.width, height: png.info.height };
    }
    const meta = await sharp(bytes, { limitInputPixels: 64_000_000 }).metadata();
    const actual = meta.format ? SHARP_FORMAT[meta.format] : undefined;
    // The declared type must match the bytes (no HTML or script under an image name).
    if (!actual || actual !== mime) return BAD_FORMAT;
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) return UNREADABLE;
    // Always re-encode: strips EXIF/GPS from phone photos (stored in a public bucket) and applies
    // the EXIF orientation.
    const out = await sharp(bytes, { limitInputPixels: 64_000_000 })
      .rotate()
      .resize(MAX_ASSET_SIDE, MAX_ASSET_SIDE, { fit: "inside", withoutEnlargement: true })
      .toFormat(meta.format as "png" | "jpeg" | "webp")
      .toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(out.data), mime, width: out.info.width, height: out.info.height };
  } catch {
    return UNREADABLE;
  }
}

export async function storeAsset(
  d: AssetDeps,
  c: Caller,
  p: { accountId: string; kind: AssetKind; bytes: Uint8Array; mime: string; ai?: boolean; prompt?: string },
): Promise<DesignResult<AssetView>> {
  const org = await designOrgFor(d, c, p?.accountId);
  if (isFail(org)) return org;
  if (!ASSET_KINDS.includes(p.kind)) return fail(400, "BAD_REQUEST", "Unbekannte Bildart.");
  if (!(p.bytes instanceof Uint8Array) || p.bytes.byteLength === 0) return UNREADABLE;
  if (p.bytes.byteLength > MAX_ASSET_BYTES) return TOO_LARGE;
  const mime = String(p.mime ?? "").toLowerCase().split(";")[0].trim();
  if (!(MIMES as readonly string[]).includes(mime)) return BAD_FORMAT;
  if (p.prompt !== undefined && (typeof p.prompt !== "string" || p.prompt.length > 1000)) return fail(400, "BAD_REQUEST", "Die Beschreibung ist zu lang.");

  const n = await normalise(p.bytes, mime);
  if (isFail(n)) return n;
  const sha = sha256(n.bytes);
  const existing = await d.store.getAsset(sha, org.accountId);
  if (existing) return ok(assetView(existing));

  const storagePath = assetPath(org.accountId, sha, EXT[n.mime]);
  await d.storage.put(storagePath, n.bytes, n.mime);
  const row: AssetRow = {
    sha,
    accountId: org.accountId,
    kind: p.kind,
    storagePath,
    mime: n.mime,
    width: n.width,
    height: n.height,
    ai: p.ai === true,
    prompt: p.ai === true ? p.prompt?.trim() || null : null,
    createdBy: c.wallet.toLowerCase(),
    createdAt: new Date(d.now()).toISOString(),
  };
  await d.store.insertAsset(row);
  return ok(assetView(row));
}

/** design_assets_list: the org's uploaded and generated images, newest first. */
export async function listAssets(d: DesignDeps, c: Caller, p: { accountId: string }): Promise<DesignResult<AssetView[]>> {
  const org = await designOrgFor(d, c, p?.accountId);
  if (isFail(org)) return org;
  return ok((await d.store.assetsOf(org.accountId)).map(assetView));
}

/** Bytes of an org's asset for rendering; null when unknown to that org or missing in storage. */
export async function assetBytes(d: AssetDeps, accountId: string, sha: string): Promise<Uint8Array | null> {
  const a = await d.store.getAsset(sha, accountId);
  if (!a) return null;
  return d.storage.get(a.storagePath);
}
