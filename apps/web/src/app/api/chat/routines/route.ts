import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { nextRunAt, validateSchedule } from "@/lib/chat/schedule";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ROUTINES = 20;

/** GET /api/chat/routines — own routines. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    return NextResponse.json({ routines: await store.listRoutines(wallet) });
  } catch (err) {
    return handleError(err, "routines");
  }
}

/** POST /api/chat/routines — {threadId, botId, title, schedule, prompt} → {routine}. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const body = await readJson(request);
  if (!body) return badRequest("Ungültige Anfrage.");
  const { threadId, botId, title, prompt } = body;
  const schedule = validateSchedule(body.schedule);
  if (!store.isUuid(threadId) || !store.isUuid(botId)) return badRequest("Chat oder Bot fehlt.");
  if (typeof title !== "string" || !title.trim() || title.length > 60) return badRequest("Bitte gib einen Titel mit höchstens 60 Zeichen an.");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000) return badRequest("Bitte beschreibe die Aufgabe (höchstens 1000 Zeichen).");
  if (!schedule) return badRequest("Ungültiger Zeitplan.");
  try {
    const thread = await store.getThread(wallet, threadId);
    if (!thread) return notFound("Der Chat");
    if (!thread.bots.some((b) => b.id === botId)) return badRequest("Dieser Bot ist nicht in diesem Chat.");
    const existing = await store.listRoutines(wallet);
    if (existing.length >= MAX_ROUTINES) return badRequest(`Du kannst höchstens ${MAX_ROUTINES} Routinen anlegen.`);
    const routine = await store.createRoutine(wallet, {
      threadId, botId, title: title.trim(), prompt: prompt.trim(), schedule,
      nextRunAt: nextRunAt(schedule).toISOString(),
    });
    return NextResponse.json({ routine });
  } catch (err) {
    return handleError(err, "routines");
  }
}

/** DELETE /api/chat/routines?id=<uuid> (or body {id}) → {ok}. */
export async function DELETE(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const url = new URL(request.url);
  let id: unknown = url.searchParams.get("id");
  if (!id) id = (await readJson(request))?.id;
  if (!store.isUuid(id)) return badRequest("Routine fehlt.");
  try {
    const ok = await store.deleteRoutine(wallet, id);
    if (!ok) return notFound("Die Routine");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "routines");
  }
}
