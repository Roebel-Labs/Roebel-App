// POST: commit a KI-Studio variant (or any image already stored in this
// app's bucket folder) onto the app row — icon_url, feature_image_url or a
// preview slot. Counterpart of /status?preview=1, which stores variants
// without applying them.
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/miniapp/http";
import { requireAppAccess } from "@/lib/miniapp/images/access";
import { MAX_PREVIEWS, applyImageToApp } from "@/lib/miniapp/images/storage";
import { MiniAppError } from "@/lib/miniapp/types";

export const runtime = "nodejs";

type Body = {
  appId?: string;
  kind?: string;
  slot?: number;
  url?: string;
  wallet?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const appId = body?.appId ?? "";
    const kind = body?.kind ?? "";
    const url = body?.url?.trim() ?? "";
    if (!appId || (kind !== "icon" && kind !== "preview" && kind !== "feature")) {
      throw new MiniAppError(
        "invalid_params",
        "appId und kind (icon|preview|feature) erforderlich.",
      );
    }
    const slot = body?.slot;
    if (
      kind === "preview" &&
      (slot === undefined || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PREVIEWS)
    ) {
      throw new MiniAppError("invalid_params", "Ungültiger Vorschau-Slot.");
    }

    const app = await requireAppAccess(req, appId);

    // Only images that already live in THIS app's storage folder may be
    // committed — no arbitrary external URLs onto the store card.
    if (
      !/^https:\/\//.test(url) ||
      !url.includes(`/storage/v1/object/public/images/mini-apps/${app.id}/`)
    ) {
      throw new MiniAppError(
        "invalid_params",
        "url muss ein gespeichertes Bild dieser App sein.",
      );
    }

    await applyImageToApp(app, kind, url, kind === "preview" ? slot : undefined);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return jsonError(e);
  }
}
