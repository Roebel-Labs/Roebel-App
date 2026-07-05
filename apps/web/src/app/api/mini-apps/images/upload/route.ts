// Direct image upload for mini-app icons, store previews and editor
// screenshots ("shots" feed the "Aus Screenshot" NB2 reference picker).
// GET lists the screenshot pool for an app.
import { NextResponse } from "next/server";
import { jsonError, getParam } from "@/lib/miniapp/http";
import { requireAppAccess } from "@/lib/miniapp/images/access";
import {
  MAX_PREVIEWS,
  applyImageToApp,
  listShots,
  saveImageBytes,
} from "@/lib/miniapp/images/storage";
import { MiniAppError } from "@/lib/miniapp/types";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    if (!form) throw new MiniAppError("invalid_params", "Erwarte multipart/form-data.");

    const appId = String(form.get("appId") ?? "");
    const kind = String(form.get("kind") ?? "");
    const slotRaw = form.get("slot");
    const file = form.get("file");

    if (!appId || !["icon", "preview", "feature", "shot"].includes(kind)) {
      throw new MiniAppError(
        "invalid_params",
        "appId und kind (icon|preview|feature|shot) erforderlich.",
      );
    }
    if (!(file instanceof File)) {
      throw new MiniAppError("invalid_params", "Keine Datei erhalten.");
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new MiniAppError("invalid_params", "Nur PNG, JPEG oder WebP erlaubt.");
    }
    if (file.size > MAX_BYTES) {
      throw new MiniAppError("invalid_params", "Datei zu groß (max. 5 MB).");
    }
    const slot = slotRaw === null ? undefined : Number(slotRaw);
    if (
      kind === "preview" &&
      (slot === undefined || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PREVIEWS)
    ) {
      throw new MiniAppError("invalid_params", "Ungültiger Vorschau-Slot.");
    }

    const app = await requireAppAccess(req, appId);
    const url = await saveImageBytes(
      app.id,
      kind as "icon" | "preview" | "feature" | "shot",
      await file.arrayBuffer(),
      file.type,
      slot,
    );
    if (kind === "icon" || kind === "preview" || kind === "feature") {
      await applyImageToApp(app, kind, url, slot);
    }
    return NextResponse.json({ url });
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET(req: Request) {
  try {
    const appId = getParam(req, "appId") ?? "";
    if (!appId) throw new MiniAppError("invalid_params", "appId erforderlich.");
    await requireAppAccess(req, appId);
    return NextResponse.json({ shots: await listShots(appId) });
  } catch (e) {
    return jsonError(e);
  }
}
