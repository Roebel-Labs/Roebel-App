import { NextResponse } from "next/server";
import { createRoutineWithThread } from "@/lib/chat/persona/catalog";
import { MAX_ROUTINES } from "@/lib/chat/routine-tools";
import { validateSchedule } from "@/lib/chat/schedule";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/chat/routines/quick — {title, prompt, schedule} → {routine, threadId}: a routine in its own thread. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  if (!input) return badRequest("Ungültige Anfrage.");
  const { title, prompt } = input;
  const schedule = validateSchedule(input.schedule);
  if (typeof title !== "string" || !title.trim() || title.length > 60) return badRequest("Bitte gib einen Titel mit höchstens 60 Zeichen an.");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000) return badRequest("Bitte beschreibe die Aufgabe (höchstens 1000 Zeichen).");
  if (!schedule) return badRequest("Ungültiger Zeitplan.");
  try {
    if ((await store.listRoutines(wallet)).length >= MAX_ROUTINES) return badRequest(`Du kannst höchstens ${MAX_ROUTINES} Routinen anlegen.`);
    return NextResponse.json(await createRoutineWithThread(wallet, { title, prompt, schedule }));
  } catch (err) {
    return handleError(err, "routines/quick");
  }
}
