// Public: an org's offices, public members and badges for its profile in the app. No signature,
// no addresses; cached 5 minutes at the edge.
import { NextResponse } from "next/server";
import { orgPublicCredentials } from "@/lib/credentials/org-public";
import { credentialDeps } from "@/lib/credentials/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=300" };

export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const deps = credentialDeps();
  if (!deps) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const view = await orgPublicCredentials(deps.store, deps.reader, accountId);
    if (!view) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CACHE });
    return NextResponse.json(view, { headers: CACHE });
  } catch (e) {
    console.error("[credentials/orgs/public]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
