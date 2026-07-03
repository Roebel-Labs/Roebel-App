// GET /api/mini-apps/analytics?appId=<id|all>&range=24h|7d|30d|90d|all
// Admins may query any app or the whole platform ('all'); a developer may query
// only their own apps (resolved from wallet). Returns AnalyticsSummary.
import { NextResponse } from "next/server";
import { queryAnalytics, getApp, MiniAppError, type AnalyticsRange } from "@/lib/miniapp";
import { isAuthenticated } from "@/lib/auth/session";
import { jsonError, getParam, resolveDeveloperReadonly } from "@/lib/miniapp/http";

export const dynamic = "force-dynamic";

const RANGES: AnalyticsRange[] = ["24h", "7d", "30d", "90d", "all"];

export async function GET(req: Request) {
  try {
    const appId = getParam(req, "appId") || "all";
    const rangeParam = getParam(req, "range") || "30d";
    const range = (RANGES.includes(rangeParam as AnalyticsRange)
      ? rangeParam
      : "30d") as AnalyticsRange;

    const isAdmin = await isAuthenticated();

    if (!isAdmin) {
      // Non-admin: must be a developer querying their own app (never 'all').
      if (appId === "all") throw new MiniAppError("unauthorized", "Admin erforderlich.");
      const [dev, app] = await Promise.all([
        resolveDeveloperReadonly(req),
        getApp(appId),
      ]);
      if (!app) throw new MiniAppError("not_found", "App nicht gefunden.");
      if (!dev || dev.id !== app.developer_id) {
        throw new MiniAppError("unauthorized", "Kein Zugriff auf diese App.");
      }
    }

    const summary = await queryAnalytics(appId, range);
    return NextResponse.json(summary);
  } catch (e) {
    return jsonError(e);
  }
}
