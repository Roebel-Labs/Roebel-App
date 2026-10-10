// GET /api/mini-apps/validate?url=… — dry-run a self-hosted manifest. No auth.
import { NextResponse } from "next/server";
import { validateOrigin } from "@/lib/miniapp/indexing";
import { getParam, jsonError } from "@/lib/miniapp/http";
import { MiniAppError } from "@/lib/miniapp/types";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiters = sharedLimiters([{ name: "miniapp-validate-ip", limit: 30, windowMs: HOUR_MS }]);

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function GET(req: Request) {
  try {
    if (!(await takeAll(limiters, clientIp(req)))) {
      throw new MiniAppError("rate_limited", "Zu viele Prüfungen — versuch es in einer Stunde wieder.", 429);
    }
    const url = getParam(req, "url");
    if (!url) throw new MiniAppError("invalid_params", "Parameter url fehlt.");
    const r = await validateOrigin(url);
    return NextResponse.json({
      ok: true,
      origin: r.origin,
      manifestUrl: r.manifestUrl,
      owner: r.parsed.owner,
      manifest: r.parsed.manifest,
      warnings: r.warnings,
    });
  } catch (e) {
    const res = jsonError(e);
    const body = await res.json();
    return NextResponse.json({ ok: false, ...body }, { status: res.status });
  }
}
