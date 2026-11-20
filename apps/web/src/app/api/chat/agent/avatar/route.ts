import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { imageSize } from "image-size";
import { AVATAR_UPLOAD_PREFIX } from "@/lib/chat/agent/avatar-image";
import { db } from "@/lib/chat/store";
import { badRequest, handleError, jsonError, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "images";
const MAX_BYTES = 4 * 1024 * 1024;
const MIN_SIDE = 96;
const MAX_SIDE = 4096;
const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** First bytes of each accepted format: the declared type alone is not trusted. */
function sniff(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * POST /api/chat/agent/avatar — multipart `file`: an own picture for an agent (JPEG, PNG or WebP, ≤ 4 MB).
 * Clients crop it square and scale it to about 512 px first. Stored publicly under a random name (no wallet
 * in the path) and returned as {url}; the url goes into POST/PATCH /api/chat/agent/agents as imageUrl.
 */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Ungültiger Upload.");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return badRequest("Bitte wähle ein Bild aus.");
  if (file.size > MAX_BYTES) return jsonError(413, "too_large", "Das Bild ist größer als 4 MB.");
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniff(buf);
    if (!type) return jsonError(415, "unsupported_type", "Bitte nimm ein JPEG-, PNG- oder WebP-Bild.");
    let width = 0;
    let height = 0;
    try {
      const dims = imageSize(buf);
      width = dims.width ?? 0;
      height = dims.height ?? 0;
    } catch {
      return jsonError(415, "unsupported_type", "Das Bild konnte nicht gelesen werden.");
    }
    if (Math.min(width, height) < MIN_SIDE) return badRequest("Das Bild ist zu klein. Nimm eins mit mindestens 96 Pixeln Breite.");
    if (Math.max(width, height) > MAX_SIDE) return badRequest("Das Bild ist zu groß. Höchstens 4096 Pixel pro Seite.");
    const path = `${AVATAR_UPLOAD_PREFIX}/${randomUUID()}.${EXT_BY_TYPE[type]}`;
    // 1-year cacheControl marks the object as processed for the weekly re-encode job.
    const up = await db().storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false, cacheControl: "31536000" });
    if (up.error) throw new Error(up.error.message);
    console.log(`[agent/avatar] uploaded ${width}x${height} ${type}`);
    return NextResponse.json({ url: db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl, width, height });
  } catch (err) {
    return handleError(err, "agent/avatar");
  }
}
