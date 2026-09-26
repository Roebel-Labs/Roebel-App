import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { ChatInputError, runUserTurn } from "@/lib/chat/runtime";
import { createSSEStream, SSE_HEADERS } from "@/lib/chat/sse";
import { sanitizeCalendarContext } from "@/lib/chat/calendar";
import type { SendMessageInput } from "@/lib/chat/types";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** GET /api/chat/threads/:id/messages?before=<iso>&limit=50 — ascending page + the thread. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const thread = await store.getThread(wallet, id);
    if (!thread) return notFound("Der Chat");
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    if (before && Number.isNaN(Date.parse(before))) return badRequest("Ungültiger Zeitpunkt.");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const page = await store.listMessages(thread.id, { before, limit: Number.isFinite(limit) ? limit : 50 });
    // The thread rides along so a chat opened from a push has fresh lastReadAt / routine state.
    return NextResponse.json({ ...page, thread });
  } catch (err) {
    return handleError(err, "threads/:id/messages");
  }
}

function parseSendBody(body: Record<string, unknown>): SendMessageInput | string {
  const input: SendMessageInput = { text: typeof body.text === "string" ? body.text : "" };
  if (body.imageUrls !== undefined) {
    if (!Array.isArray(body.imageUrls) || !body.imageUrls.every((u) => typeof u === "string")) return "Ungültige Bilder.";
    input.imageUrls = body.imageUrls as string[];
  }
  if (body.replyToId !== undefined && body.replyToId !== null) {
    if (!store.isUuid(body.replyToId)) return "Ungültige Antwort-Referenz.";
    input.replyToId = body.replyToId;
  }
  if (body.mentionBotIds !== undefined) {
    if (!Array.isArray(body.mentionBotIds) || !body.mentionBotIds.every(store.isUuid)) return "Ungültige Erwähnung.";
    input.mentionBotIds = body.mentionBotIds as string[];
  }
  if (body.optionAnswer !== undefined && body.optionAnswer !== null) {
    const oa = body.optionAnswer as Record<string, unknown>;
    if (!oa || !store.isUuid(oa.messageId) || typeof oa.key !== "string") return "Ungültige Auswahl.";
    input.optionAnswer = { messageId: oa.messageId, key: oa.key };
  }
  const calendar = sanitizeCalendarContext(body.calendarContext);
  if (calendar === "invalid") return "Ungültiger Kalender.";
  if (calendar) input.calendarContext = calendar;
  return input;
}

/** POST /api/chat/threads/:id/messages — send; answers stream back as SSE. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest("Ungültige Anfrage.");
  const input = parseSendBody(body);
  if (typeof input === "string") return badRequest(input);
  if (!input.text.trim() && !input.imageUrls?.length && !input.optionAnswer) return badRequest("Die Nachricht ist leer.");

  let thread;
  try {
    thread = await store.getThread(wallet, id);
  } catch (err) {
    return handleError(err, "threads/:id/messages");
  }
  if (!thread) return notFound("Der Chat");

  const stream = createSSEStream(async (emit) => {
    try {
      await runUserTurn({ wallet, thread, input, emit });
    } catch (err) {
      if (err instanceof ChatInputError) {
        emit({ event: "error", data: { code: err.code, message: err.message } });
        return;
      }
      throw err;
    }
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

