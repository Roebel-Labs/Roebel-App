import { NextResponse } from "next/server";
import { getDeveloperByWallet, listApps } from "@/lib/miniapp";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/mini-apps — the signed-in user's own mini apps (all statuses), for Ortis Studio.
 * Auth: chat session (Bearer). Same data as /dashboard/mini-apps, but keyed to the session wallet,
 * so the desktop never sends or sees a wallet address.
 */
export async function GET(request: Request) {
  try {
    const wallet = await requireWallet(request);
    if (!wallet) return unauthorized();
    const dev = await getDeveloperByWallet(wallet);
    if (!dev) return NextResponse.json({ apps: [] });
    const apps = await listApps({ developerId: dev.id });
    return NextResponse.json({
      apps: apps.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        description: a.description,
        iconUrl: a.icon_url,
        homeUrl: a.home_url,
        status: a.status,
        category: a.category,
        primaryColor: a.primary_color,
        pendingUpdate: !!a.pending_update,
        updatedAt: a.updated_at,
      })),
    });
  } catch (err) {
    return handleError(err, "mini-apps");
  }
}
