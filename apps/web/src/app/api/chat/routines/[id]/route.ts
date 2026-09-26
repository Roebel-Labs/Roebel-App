import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { nextRunAt, validateSchedule } from "@/lib/chat/schedule";
import type { RoutineSchedule } from "@/lib/chat/types";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PATCH /api/chat/routines/:id — {enabled?, title?, prompt?, schedule?} → {routine}.
 * Re-enabling or rescheduling recomputes next_run_at from now, so a paused
 * routine never fires for the runs it missed.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  if (!store.isUuid(id)) return notFound("Die Routine");
  const body = await readJson(request);
  if (!body) return badRequest("Ungültige Anfrage.");

  const patch: { enabled?: boolean; title?: string; prompt?: string; schedule?: RoutineSchedule; nextRunAt?: string | null } = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return badRequest("Ungültiger Status.");
    patch.enabled = body.enabled;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 60) return badRequest("Bitte gib einen Titel mit höchstens 60 Zeichen an.");
    patch.title = body.title.trim();
  }
  if (body.prompt !== undefined) {
    if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 1000) return badRequest("Bitte beschreibe die Aufgabe (höchstens 1000 Zeichen).");
    patch.prompt = body.prompt.trim();
  }
  if (body.schedule !== undefined) {
    const schedule = validateSchedule(body.schedule);
    if (!schedule) return badRequest("Ungültiger Zeitplan.");
    patch.schedule = schedule;
  }
  if (!Object.keys(patch).length) return badRequest("Nichts zu ändern.");

  try {
    const current = await store.getRoutine(wallet, id);
    if (!current) return notFound("Die Routine");
    if (patch.schedule || (patch.enabled === true && !current.enabled)) {
      const schedule = patch.schedule ?? validateSchedule(current.schedule);
      patch.nextRunAt = schedule ? nextRunAt(schedule).toISOString() : null;
    }
    const routine = await store.updateRoutine(wallet, id, patch);
    if (!routine) return notFound("Die Routine");
    return NextResponse.json({ routine });
  } catch (err) {
    return handleError(err, "routines/:id");
  }
}

/** DELETE /api/chat/routines/:id → {ok}. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  if (!store.isUuid(id)) return notFound("Die Routine");
  try {
    const ok = await store.deleteRoutine(wallet, id);
    if (!ok) return notFound("Die Routine");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "routines/:id");
  }
}
