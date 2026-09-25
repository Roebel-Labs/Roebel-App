import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/chat/messages/:id/reactions — toggles the owner's reaction.
 * Threads have a single human, so a count of 1 means "reacted".
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji || emoji.length > 16 || /[\s<>]/.test(emoji)) return badRequest("Ungültige Reaktion.");
  try {
    const row = await store.getMessageRow(wallet, id);
    if (!row) return notFound("Die Nachricht");
    const current = (row.reactions && typeof row.reactions === "object" ? row.reactions : {}) as Record<string, number>;
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(current)) if (typeof v === "number" && v > 0) next[k] = v;
    if (next[emoji]) delete next[emoji];
    else next[emoji] = 1;
    if (Object.keys(next).length > 12) return badRequest("Zu viele Reaktionen.");
    await store.setMessageReactions(row.id, next);
    return NextResponse.json({ reactions: next });
  } catch (err) {
    return handleError(err, "messages/:id/reactions");
  }
}
