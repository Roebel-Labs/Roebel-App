import { NextResponse } from "next/server";
import { cancelTask, toSnapshot } from "@/lib/chat/harness/tasks";
import { handleError, notFound, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** POST /api/chat/tasks/:id/cancel → { task } (already finished tasks are returned unchanged). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const row = await cancelTask(wallet, id);
    if (!row) return notFound("Die Aufgabe");
    return NextResponse.json({ task: toSnapshot(row) });
  } catch (err) {
    return handleError(err, "tasks/:id/cancel");
  }
}
