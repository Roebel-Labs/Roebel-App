import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { applyPartStatus } from "@/lib/chat/calendar";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PATCH /api/chat/messages/:id/parts/:index  body `{status}` — updates the status of
 * one part: calendar_event (proposed|added|dismissed) or integration (pending|connected).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id, index } = await params;
  const idx = Number(index);
  if (!/^\d{1,3}$/.test(index) || !Number.isInteger(idx)) return badRequest("Ungültiger Index.");
  const body = await readJson(request);
  if (!body) return badRequest("Ungültige Anfrage.");
  try {
    const row = await store.getMessageRow(wallet, id);
    if (!row) return notFound("Die Nachricht");
    const next = applyPartStatus(store.partsOf(row.parts), idx, body.status);
    if (!Array.isArray(next)) return badRequest(next.error);
    const updated = await store.updateMessageParts(row.id, next);
    return NextResponse.json({ message: await store.toMessage(updated) });
  } catch (err) {
    return handleError(err, "messages/:id/parts/:index");
  }
}
