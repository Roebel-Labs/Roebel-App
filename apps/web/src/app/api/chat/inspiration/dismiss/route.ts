import { NextResponse } from "next/server";
import { dismissTask, isKnownTaskId } from "@/lib/chat/inspiration/load";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";

/** POST /api/chat/inspiration/dismiss { taskId } — "Nicht relevant": hide a card for good. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const body = await readJson(request);
  const taskId = body?.taskId;
  if (!isKnownTaskId(taskId)) return badRequest("Unbekannte Idee.");
  try {
    await dismissTask(wallet, taskId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "inspiration/dismiss");
  }
}
