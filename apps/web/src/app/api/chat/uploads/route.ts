import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { imageSize } from "image-size";
import { db } from "@/lib/chat/store";
import { badRequest, handleError, jsonError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "chat-media";
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif", "image/gif": "gif",
};

/** POST /api/chat/uploads — multipart `file` (image ≤ 10 MB) → signed URL (7 days). */
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
  const type = (file.type || "").toLowerCase();
  const ext = EXT_BY_TYPE[type];
  if (!ext) return jsonError(415, "unsupported_type", "Dieses Bildformat wird nicht unterstützt.");
  if (file.size > MAX_BYTES) return jsonError(413, "too_large", "Das Bild ist größer als 10 MB.");
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const path = `${wallet}/${randomUUID()}.${ext}`;
    const up = await db().storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
    if (up.error) throw new Error(up.error.message);
    const signed = await db().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data) throw new Error(signed.error?.message ?? "signed url failed");
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dims = imageSize(buf);
      width = dims.width;
      height = dims.height;
    } catch { /* dimensions are optional */ }
    return NextResponse.json({ url: signed.data.signedUrl, ...(width && height ? { width, height } : {}) });
  } catch (err) {
    return handleError(err, "uploads");
  }
}
