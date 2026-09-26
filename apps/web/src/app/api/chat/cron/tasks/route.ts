import { NextResponse } from "next/server";
import { runDueTasks } from "@/lib/chat/harness/task-worker";
import { handleError, jsonError } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** GET /api/chat/cron/tasks — Vercel cron every minute (Bearer CRON_SECRET); runs due agent task ticks. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized", "Nicht autorisiert.");
  }
  try {
    const report = await runDueTasks(new Date());
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return handleError(err, "cron/tasks");
  }
}
