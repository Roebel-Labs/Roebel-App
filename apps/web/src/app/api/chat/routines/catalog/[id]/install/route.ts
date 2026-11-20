import { NextResponse } from "next/server";
import { createRoutineWithThread, installedTemplateIds, templateById } from "@/lib/chat/persona/catalog";
import { MAX_ROUTINES } from "@/lib/chat/routine-tools";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, jsonError, notFound, requireWallet, unauthorized } from "../../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/chat/routines/catalog/:id/install → {routine, threadId}. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const template = templateById(id);
  if (!template) return notFound("Die Routine");
  try {
    if ((await installedTemplateIds(wallet)).has(id)) return jsonError(409, "installed", "Diese Routine ist schon installiert.");
    if ((await store.listRoutines(wallet)).length >= MAX_ROUTINES) return badRequest(`Du kannst höchstens ${MAX_ROUTINES} Routinen anlegen.`);
    return NextResponse.json(await createRoutineWithThread(wallet, {
      title: template.title, prompt: template.prompt, schedule: template.schedule, templateId: template.id,
    }));
  } catch (err) {
    return handleError(err, "routines/catalog/install");
  }
}
