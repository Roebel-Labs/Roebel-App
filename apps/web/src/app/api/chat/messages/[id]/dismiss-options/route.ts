import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, notFound, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/chat/messages/:id/dismiss-options — mark the options card as dismissed. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const row = await store.getMessageRow(wallet, id);
    if (!row) return notFound("Die Nachricht");
    const parts = store.partsOf(row.parts);
    let changed = false;
    const next = parts.map((p) => {
      if (p.type !== "options" || p.selected) return p;
      changed = true;
      return { ...p, dismissed: true };
    });
    if (!parts.some((p) => p.type === "options")) return badRequest("Diese Nachricht hat keine Auswahlkarte.");
    const updated = changed ? await store.updateMessageParts(row.id, next) : row;
    return NextResponse.json({ message: await store.toMessage(updated) });
  } catch (err) {
    return handleError(err, "messages/:id/dismiss-options");
  }
}
