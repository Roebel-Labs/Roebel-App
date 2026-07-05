import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/dev-tickets/api";
import { triageNewFeedback } from "@/lib/dev-tickets/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel cron (GET + Bearer CRON_SECRET). */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await triageNewFeedback());
  } catch (e) {
    return jsonError(e);
  }
}

/** Board "Import & Triage" button (admin session). */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json(await triageNewFeedback());
  } catch (e) {
    return jsonError(e);
  }
}
