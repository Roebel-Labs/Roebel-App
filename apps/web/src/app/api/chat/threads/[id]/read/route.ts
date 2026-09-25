import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { handleError, notFound, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/chat/threads/:id/read — mark thread as read. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  if (!store.isUuid(id)) return notFound("Der Chat");
  try {
    const ok = await store.markThreadRead(wallet, id);
    if (!ok) return notFound("Der Chat");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "threads/:id/read");
  }
}
