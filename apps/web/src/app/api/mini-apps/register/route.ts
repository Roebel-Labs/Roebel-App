// POST /api/mini-apps/register { url, expectedOwner? } — index a self-hosted
// manifest (spec 2026-10-10 §4). No auth: the manifest's `owner` field on the
// builder's own domain is the ownership proof.
import { NextResponse } from "next/server";
import { indexOrigin } from "@/lib/miniapp/indexing";
import { jsonError } from "@/lib/miniapp/http";
import { MiniAppError } from "@/lib/miniapp/types";
import { wellKnownUrlFor } from "@/lib/miniapp/safeFetch";
import { DOCS_BASE_URL } from "@/lib/miniapp/devdocs";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ipLimiters = sharedLimiters([{ name: "miniapp-register-ip", limit: 10, windowMs: HOUR_MS }]);
const originLimiters = sharedLimiters([{ name: "miniapp-register-origin", limit: 1, windowMs: MINUTE_MS }]);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string; expectedOwner?: string };
    if (!body.url) throw new MiniAppError("invalid_params", "Feld url fehlt.");
    const { origin } = wellKnownUrlFor(body.url);
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (!(await takeAll(ipLimiters, ip)) || !(await takeAll(originLimiters, origin))) {
      throw new MiniAppError("rate_limited", "Zu viele Registrierungen — bitte kurz warten.", 429);
    }

    const { app, outcome } = await indexOrigin(body.url, { expectedOwner: body.expectedOwner });
    return NextResponse.json(
      {
        app: { id: app.id, slug: app.slug, status: app.status, pending_update: app.pending_update ?? false },
        outcome,
        dashboardUrl: `${DOCS_BASE_URL}/dashboard/mini-apps/${app.id}`,
        statusUrl: `${DOCS_BASE_URL}/api/mini-apps/${app.id}`,
        previewUrl: app.home_url,
      },
      { status: outcome === "create" ? 201 : 200 },
    );
  } catch (e) {
    return jsonError(e);
  }
}
