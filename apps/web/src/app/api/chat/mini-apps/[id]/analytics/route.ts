import { NextResponse } from "next/server";
import { getApp, getDeveloperByWallet, queryAnalytics, type AnalyticsRange } from "@/lib/miniapp";
import { handleError, jsonError, notFound, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const RANGES: AnalyticsRange[] = ["24h", "7d", "30d", "90d", "all"];

/** GET /api/chat/mini-apps/:id/analytics?range= — same numbers as the web dashboard, keyed to the session wallet. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const wallet = await requireWallet(request);
    if (!wallet) return unauthorized();
    const { id } = await params;
    const r = new URL(request.url).searchParams.get("range") ?? "30d";
    const range = (RANGES.includes(r as AnalyticsRange) ? r : "30d") as AnalyticsRange;
    const [dev, app] = await Promise.all([getDeveloperByWallet(wallet), getApp(id)]);
    if (!app) return notFound("Mini-App");
    if (!dev || dev.id !== app.developer_id) return jsonError(403, "forbidden", "Kein Zugriff auf diese Mini-App.");
    return NextResponse.json(await queryAnalytics(app.id, range));
  } catch (err) {
    return handleError(err, "mini-apps/analytics");
  }
}
