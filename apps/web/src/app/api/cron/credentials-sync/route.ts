// Cron: mirrors the credential register's chain events into the credential_* tables (every 5 min),
// then delivers invitations of on-chain batches that a failed or interrupted delivery left behind,
// and purges presentation codes whose time ran out (unresolved codes are otherwise never deleted).
import { NextRequest, NextResponse } from "next/server";
import { credentialSyncDeps } from "@/lib/credentials/runtime";
import { sweepUndelivered, syncRegister } from "@/lib/credentials/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deps = credentialSyncDeps();
  if (!deps) return NextResponse.json({ skipped: "not_configured" });
  try {
    const purged = await deps.store.purgeExpiredPresentations();
    const r = await syncRegister(deps);
    if ("skipped" in r) {
      if (r.skipped === "registry_mismatch") console.error("[cron/credentials-sync] stored cursor belongs to another registry");
      return NextResponse.json(r, { status: r.skipped === "registry_mismatch" ? 409 : 200 });
    }
    const swept = await sweepUndelivered(deps);
    return NextResponse.json({ from: r.from.toString(), to: r.to.toString(), applied: r.applied, redelivered: swept.batches, recoveredMails: swept.recovered, purgedPresentations: purged });
  } catch (e) {
    // Never the message: a viem error can carry the keyed RPC URL.
    console.error("[cron/credentials-sync] failed", e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
