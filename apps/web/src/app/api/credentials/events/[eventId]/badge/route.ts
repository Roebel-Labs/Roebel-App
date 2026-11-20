// Public: an event's badge for the event page (name, art, claim window, how many collected it).
// No signature, no names; cached 30 s at the edge.
import { NextResponse } from "next/server";
import { publicEventBadge } from "@/lib/credentials/event-badges";
import { credentialDeps } from "@/lib/credentials/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=30" };

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const deps = credentialDeps();
  if (!deps) return NextResponse.json({ badge: null }, { headers: CACHE });
  try {
    return NextResponse.json(await publicEventBadge(deps.store, eventId), { headers: CACHE });
  } catch (e) {
    console.error("[credentials/events/badge]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
