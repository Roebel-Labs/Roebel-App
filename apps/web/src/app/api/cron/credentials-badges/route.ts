// Cron (every 5 min): instant event badges through the node delegate key. For every badge type
// whose org appointed the node key, inside the event's window, one small addBatch of new
// attendees (lib/credentials/badge-delegate.ts). Off unless CREDENTIAL_BADGE_DELEGATE_KEY is set
// and app_settings.credentials_badge_delegate_enabled is 'true'.
import { NextRequest, NextResponse } from "next/server";
import { runAutoBadges } from "@/lib/credentials/badge-delegate";
import { badgeAutoDeps } from "@/lib/credentials/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deps = badgeAutoDeps();
  if (!deps) return NextResponse.json({ skipped: "not_configured" });
  try {
    const results = await runAutoBadges(deps);
    return NextResponse.json({ results });
  } catch (e) {
    // Never the message: a viem error can carry the keyed RPC URL.
    console.error("[cron/credentials-badges] failed", e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
