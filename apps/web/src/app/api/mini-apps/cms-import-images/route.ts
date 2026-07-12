// POST /api/mini-apps/cms-import-images — pull images from an external
// website into the app's Mini-CMS.
// Body: { app: <id|slug>, url: string, key?: string (default "bilder"),
//         limit?: number, wallet? }
// The page is fetched server-side, its images are stored as content assets
// (public URLs on our origin — no hotlinking) and written to the CMS key as
// [{ url, alt }]. Auth: app owner (wallet tier) or admin session.
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/miniapp/http";
import { requireAppAccess } from "@/lib/miniapp/images/access";
import { importImagesFromWebsite } from "@/lib/miniapp/images/importFromWebsite";
import { MiniAppError } from "@/lib/miniapp/types";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const app = String(body.app ?? "");
    const url = String(body.url ?? "");
    if (!app || !url) throw new MiniAppError("invalid_params", "app und url erforderlich.");

    const row = await requireAppAccess(req, app);
    const result = await importImagesFromWebsite({
      appId: row.id,
      pageUrl: url,
      key: typeof body.key === "string" && body.key ? body.key : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}
