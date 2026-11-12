import { NextResponse } from "next/server";
import { createRoutineWithThread, createTaskThread } from "@/lib/chat/persona/catalog";
import * as persona from "@/lib/chat/persona/store";
import { MAX_ROUTINES } from "@/lib/chat/routine-tools";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat/persona/suggestions/:id — {action: 'dismiss' | 'start'}.
 * start → {threadId, prompt, routine}: a task gets a fresh thread (the client sends the prompt),
 * a routine is created in its own thread.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const input = await readJson(request);
  const action = input?.action;
  if (action !== "dismiss" && action !== "start") return badRequest("Unbekannte Aktion.");
  try {
    const row = await persona.getSuggestionRow(wallet, id);
    if (!row) return notFound("Der Vorschlag");
    if (action === "dismiss") {
      await persona.setSuggestionStatus(wallet, id, "dismissed");
      await persona.addTombstone(wallet, `suggestion:${row.title}`);
      return NextResponse.json({ ok: true });
    }
    if (row.kind === "routine" && row.schedule) {
      if ((await store.listRoutines(wallet)).length >= MAX_ROUTINES) return badRequest(`Du kannst höchstens ${MAX_ROUTINES} Routinen anlegen.`);
      const { routine, threadId } = await createRoutineWithThread(wallet, { title: row.title, prompt: row.prompt, schedule: row.schedule });
      await persona.setSuggestionStatus(wallet, id, "started");
      return NextResponse.json({ threadId, prompt: row.prompt, routine });
    }
    const threadId = await createTaskThread(wallet, row.title);
    await persona.setSuggestionStatus(wallet, id, "started");
    return NextResponse.json({ threadId, prompt: row.prompt, routine: null });
  } catch (err) {
    return handleError(err, "persona/suggestions");
  }
}
