// Public: after a Smart Event QR scan, the app asks which event the code belongs to and whether
// it has a badge (reward_events is not readable with the anon key). No signature, no names.
import { NextResponse } from "next/server";
import { publicScanBadge } from "@/lib/credentials/event-badges";
import { credentialDeps } from "@/lib/credentials/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=30" };

export async function GET(_req: Request, { params }: { params: Promise<{ rewardEventId: string }> }) {
  const { rewardEventId } = await params;
  const deps = credentialDeps();
  if (!deps) return NextResponse.json({ eventId: null, eventTitle: null, eventDate: null, badge: null }, { headers: CACHE });
  try {
    return NextResponse.json(await publicScanBadge(deps.store, rewardEventId), { headers: CACHE });
  } catch (e) {
    console.error("[credentials/scan]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
