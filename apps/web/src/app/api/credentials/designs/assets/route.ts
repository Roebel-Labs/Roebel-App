// Upload of a card design image (multipart: accountId, kind, file).
//
// Auth (action `design_asset_upload`):
// - Studio / browser: `Authorization: Bearer <pairing token>`; accountId and kind as form fields.
// - Röbel App: a form field `request` holding the usual signed JSON envelope
//   ({ scope, action, wallet, timestampSec, payload, signature }, or the passkey session headers)
//   whose payload is { accountId, kind, sha256 } — sha256 = hex of the file bytes, so the
//   signature covers the file. accountId/kind are taken from the signed payload.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { failResponse, jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { authenticateCaller } from "@/lib/credentials/caller";
import { MAX_ASSET_BYTES, storeAsset } from "@/lib/credentials/designs/assets";
import { designDeps } from "@/lib/credentials/designs/runtime";
import type { AssetKind } from "@/lib/credentials/designs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // No body is parsed before its size is known (a chunked upload would be buffered before auth).
  const raw = request.headers.get("content-length");
  if (!raw) return jsonFail(411, "LENGTH_REQUIRED", "Die Bildgröße fehlt in der Anfrage.");
  const len = Number(raw);
  if (!Number.isFinite(len) || len > MAX_ASSET_BYTES + 64 * 1024) return jsonFail(413, "TOO_LARGE", "Das Bild ist zu groß (höchstens 8 MB).");
  const form = await request.formData().catch(() => null);
  if (!form) return jsonFail(400, "BAD_REQUEST", "Bitte ein Bild als Formular senden.");

  const signed = form.get("request");
  let body: unknown;
  if (typeof signed === "string") {
    try {
      body = JSON.parse(signed);
    } catch {
      return jsonFail(400, "BAD_REQUEST", "Ungültige Anfrage.");
    }
  } else {
    body = { action: "design_asset_upload", payload: { accountId: form.get("accountId"), kind: form.get("kind") } };
  }
  const c = await authenticateCaller(request, body, ["design_asset_upload"]);
  if (!c.ok) return failResponse(c);

  const file = form.get("file");
  if (!file || typeof file === "string") return jsonFail(400, "BAD_REQUEST", "Es fehlt ein Bild.");
  if (file.size > MAX_ASSET_BYTES) return jsonFail(413, "TOO_LARGE", "Das Bild ist zu groß (höchstens 8 MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());

  const p = c.payload;
  if (c.via === "signature") {
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (typeof p.sha256 !== "string" || p.sha256.toLowerCase() !== sha) return jsonFail(400, "BAD_REQUEST", "Das Bild passt nicht zur Signatur.");
  }
  try {
    const r = await storeAsset(designDeps(), c, {
      accountId: String(p.accountId ?? ""),
      kind: String(p.kind ?? "") as AssetKind,
      bytes,
      mime: file.type,
    });
    return r.ok ? jsonOk(r.data) : jsonFail(r.status, r.code, r.message);
  } catch (err) {
    console.error("[credentials/designs/assets]", err instanceof Error ? err.message : err);
    return jsonFail(502, "UNAVAILABLE", "Gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
  }
}
