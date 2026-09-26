import { NextResponse } from "next/server";
import { deleteMemory } from "@/lib/chat/harness/memory";
import { handleError, notFound, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/** DELETE /api/chat/memory/:id → {ok}. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    if (!(await deleteMemory(wallet, id))) return notFound("Der Eintrag");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "memory/:id");
  }
}
