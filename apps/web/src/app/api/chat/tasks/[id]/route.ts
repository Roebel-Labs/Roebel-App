import { NextResponse } from "next/server";
import { getTask, toSnapshot } from "@/lib/chat/harness/tasks";
import { handleError, notFound, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/tasks/:id → { task: { id, title, status, steps, error, updatedAt } } */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const row = await getTask(wallet, id);
    if (!row) return notFound("Die Aufgabe");
    return NextResponse.json({ task: toSnapshot(row) });
  } catch (err) {
    return handleError(err, "tasks/:id");
  }
}
