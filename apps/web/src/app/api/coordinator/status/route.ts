import { NextResponse } from "next/server";
import { COORDINATOR_BASE_URL } from "@/lib/maci-config";

export const runtime = "nodejs";
// Always hit the coordinator live; never serve a cached status.
export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for the MACI coordinator's /status endpoint.
 *
 * The coordinator (apps/coordinator/scripts/healthcheck.js) serves /status
 * without CORS headers, so a direct browser fetch to the fly.dev host fails
 * with "Failed to fetch". Proxying server-side (Next runtime → coordinator)
 * sidesteps CORS entirely and keeps the fly.dev URL out of the client bundle.
 */
export async function GET() {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${COORDINATOR_BASE_URL}/status`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `coordinator responded ${res.status}` },
        { status: 502 },
      );
    }
    const json = await res.json();
    return NextResponse.json(json, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `coordinator unreachable: ${message}` },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
