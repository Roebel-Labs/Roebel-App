// Poll a KIE (Seedream 4.5) task. On success the result is copied into the
// `images` bucket and written onto the app row (icon_url / screenshots[slot]).
import { NextResponse } from "next/server";
import { jsonError, getParam } from "@/lib/miniapp/http";
import { requireAppAccess } from "@/lib/miniapp/images/access";
import { getImageTask } from "@/lib/miniapp/images/kie";
import {
  MAX_PREVIEWS,
  applyImageToApp,
  saveImageFromUrl,
} from "@/lib/miniapp/images/storage";
import { MiniAppError } from "@/lib/miniapp/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const taskId = getParam(req, "taskId") ?? "";
    const appId = getParam(req, "appId") ?? "";
    const kind = getParam(req, "kind") ?? "";
    const slotRaw = getParam(req, "slot");
    if (!taskId || !appId || (kind !== "icon" && kind !== "preview" && kind !== "feature")) {
      throw new MiniAppError(
        "invalid_params",
        "taskId, appId und kind (icon|preview|feature) erforderlich.",
      );
    }
    const slot = slotRaw === null ? undefined : Number(slotRaw);
    if (
      kind === "preview" &&
      (slot === undefined || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PREVIEWS)
    ) {
      throw new MiniAppError("invalid_params", "Ungültiger Vorschau-Slot.");
    }
    const app = await requireAppAccess(req, appId);

    const task = await getImageTask(taskId);
    if (task.state === "pending") {
      return NextResponse.json({ status: "pending" });
    }
    if (task.state === "fail") {
      return NextResponse.json({ status: "error", error: task.error });
    }

    // KI-Studio preview mode: store the result as an uncommitted variant
    // (KIE CDN URLs expire) and do NOT touch the app row — committing
    // happens explicitly via /api/mini-apps/images/commit.
    if (getParam(req, "preview") === "1") {
      const url = await saveImageFromUrl(app.id, "variant", task.url);
      return NextResponse.json({ status: "done", url });
    }

    const url = await saveImageFromUrl(app.id, kind, task.url, slot);
    await applyImageToApp(app, kind, url, slot);
    return NextResponse.json({ status: "done", url });
  } catch (e) {
    return jsonError(e);
  }
}
