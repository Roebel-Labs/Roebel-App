import { NextResponse } from "next/server";
import { runPersonaCron } from "@/lib/chat/persona/build";
import { handleError, jsonError } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** GET /api/chat/cron/persona — Vercel cron every minute (Bearer CRON_SECRET): continues wiki builds, starts daily refreshes. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized", "Nicht autorisiert.");
  }
  try {
    return NextResponse.json({ ok: true, ...(await runPersonaCron(new Date())) });
  } catch (err) {
    return handleError(err, "cron/persona");
  }
}
