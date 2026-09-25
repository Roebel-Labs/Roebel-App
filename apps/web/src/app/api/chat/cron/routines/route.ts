import { NextResponse } from "next/server";
import { runDueRoutines } from "@/lib/chat/runtime";
import { handleError, jsonError } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** GET /api/chat/cron/routines — Vercel cron (Bearer CRON_SECRET); runs due routines. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized", "Nicht autorisiert.");
  }
  try {
    const report = await runDueRoutines(new Date());
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return handleError(err, "cron/routines");
  }
}
