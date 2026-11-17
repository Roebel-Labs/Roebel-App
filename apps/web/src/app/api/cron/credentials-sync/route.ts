// Cron: mirrors the credential register's chain events into the credential_* tables (every 5 min).
import { NextRequest, NextResponse } from "next/server";
import { credentialSyncDeps } from "@/lib/credentials/runtime";
import { syncRegister } from "@/lib/credentials/sync";

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
    const r = await syncRegister(deps);
    if ("skipped" in r) {
      if (r.skipped === "registry_mismatch") console.error("[cron/credentials-sync] stored cursor belongs to another registry");
      return NextResponse.json(r, { status: r.skipped === "registry_mismatch" ? 409 : 200 });
    }
    return NextResponse.json({ from: r.from.toString(), to: r.to.toString(), applied: r.applied });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/credentials-sync] failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
