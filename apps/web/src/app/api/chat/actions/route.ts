import { NextResponse } from "next/server";
import { listActions } from "@/lib/chat/harness/audit";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/actions?limit=50 — the user's agent activity (audit), newest first. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  try {
    return NextResponse.json({ actions: await listActions(wallet, Number.isFinite(limit) ? limit : 50) });
  } catch (err) {
    return handleError(err, "actions");
  }
}
