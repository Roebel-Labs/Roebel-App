// Approval decisions (spec §3.2): approve / reject / complete. Framework-
// agnostic; the /api/chat/actions/:id/* routes validate with precheckAction()
// and then stream the returned producer as SSE (same events as messages send:
// bot_done {updated approval message} → bot_start/delta/part/bot_done → done).
import { runContinuationTurn } from "../runtime";
import type { Emit } from "../runtime";
import * as store from "../store";
import type { ApprovalStatus, ChatMessage, ChatPart, ChatThread } from "../types";
import { applyApprovalUpdate } from "./approvals";
import { APPROVAL_TTL_MS, getAction, transitionAction } from "./audit";
import type { ActionRow } from "./audit";
import { buildHarnessContext } from "./context";
import { BLOCKED_MESSAGES, addGrant, decide, isGated, isGrantable, loadPolicyState } from "./policy";
import { executeApproved, findTool } from "./registry";
import { resumeTaskAfterDecision } from "./tasks";

export class ActionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export type Decision = "approve" | "reject" | "complete";

/** Validates before the stream opens: the action exists, is the wallet's and fits the decision. */
export async function precheckAction(wallet: string, id: string, decision: Decision): Promise<{ row: ActionRow; thread: ChatThread }> {
  if (!store.isUuid(id)) throw new ActionError("not_found", "Diese Aktion wurde nicht gefunden.", 404);
  const row = await getAction(wallet, id);
  if (!row || !isGated(row.risk)) throw new ActionError("not_found", "Diese Aktion wurde nicht gefunden.", 404);
  const thread = row.thread_id ? await store.getThread(wallet, row.thread_id) : null;
  if (!thread) throw new ActionError("not_found", "Der Chat zu dieser Aktion wurde nicht gefunden.", 404);
  if (decision === "complete") {
    if (row.risk !== "money") throw new ActionError("bad_request", "Diese Aktion wird nicht auf dem Gerät ausgeführt.");
    if (row.status !== "approved") throw new ActionError("conflict", "Diese Aktion ist nicht zur Ausführung freigegeben.", 409);
  } else if (row.status !== "pending") {
    throw new ActionError("conflict", "Über diese Aktion wurde schon entschieden.", 409);
  }
  return { row, thread };
}

export function isExpired(row: Pick<ActionRow, "created_at">, now = Date.now()): boolean {
  return now - new Date(row.created_at).getTime() > APPROVAL_TTL_MS;
}

/** German result note for the card from a tool result. */
export function resultNoteFor(result: unknown): string {
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    for (const k of ["info", "note", "message"]) if (typeof r[k] === "string" && (r[k] as string).trim()) return (r[k] as string).trim().slice(0, 300);
    if (typeof r.error === "string") return `Fehlgeschlagen: ${r.error}`.slice(0, 300);
  }
  return "Erledigt.";
}

function clipJson(v: unknown, max = 1500): string {
  let s: string;
  try { s = JSON.stringify(v) ?? "null"; } catch { s = String(v); }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Updates the approval card in its stored message; returns the fresh message (or null if not found). */
async function updateCard(wallet: string, row: ActionRow, status: ApprovalStatus, resultNote?: string): Promise<ChatMessage | null> {
  let msgRow = row.message_id ? await store.getMessageRow(wallet, row.message_id) : null;
  if (!msgRow && row.thread_id) {
    const recent = await store.recentMessageRows(row.thread_id, 60);
    msgRow = [...recent].reverse().find((r) => store.partsOf(r.parts).some((p) => p.type === "approval" && p.actionId === row.id)) ?? null;
  }
  if (!msgRow) return null;
  const next = applyApprovalUpdate(store.partsOf(msgRow.parts), row.id, { status, resultNote });
  if ("error" in next) return null;
  return store.toMessage(await store.updateMessageParts(msgRow.id, next));
}

/** Re-emits the updated approval card as a `part` event (the app treats the same actionId as an update). */
async function emitCard(emit: Emit, msg: ChatMessage | null, actionId: string) {
  const part = msg?.parts.find((p) => p.type === "approval" && p.actionId === actionId);
  if (msg && part) emit({ event: "part", data: { messageId: msg.id, part } });
}

async function finishWithoutTurn(wallet: string, thread: ChatThread, emit: Emit) {
  const fresh = await store.getThread(wallet, thread.id);
  if (fresh) emit({ event: "done", data: { thread: fresh } });
}

/**
 * The decision's follow-up: an action a background task asked for re-queues
 * that task (the worker continues with the outcome in its checkpoint);
 * otherwise the bot continues the chat turn.
 */
async function continueAfterDecision(opts: {
  wallet: string; row: ActionRow; thread: ChatThread; note: string; emit: Emit; initialParts?: ChatPart[];
}): Promise<void> {
  const { wallet, row, thread, emit } = opts;
  if (row.task_id) {
    const resumed = await resumeTaskAfterDecision(row.task_id, `Freigabe „${row.summary}“: ${opts.note}`)
      .catch((err) => { console.error("[harness/actions] resume task", err); return false; });
    if (resumed) {
      const { kickTask } = await import("./task-worker");
      await kickTask(row.task_id);
      await finishWithoutTurn(wallet, thread, emit);
      return;
    }
  }
  await runContinuationTurn({ wallet, thread, botId: row.bot_id, note: opts.note, emit, initialParts: opts.initialParts });
}

export async function approveAction(opts: {
  wallet: string; row: ActionRow; thread: ChatThread; alwaysAllow: boolean; emit: Emit;
}): Promise<void> {
  const { wallet, row, thread, emit } = opts;
  if (isExpired(row)) {
    const expired = await transitionAction(wallet, row.id, "pending", { status: "expired", decided: true });
    if (expired) await emitCard(emit, await updateCard(wallet, row, "expired", "Abgelaufen."), row.id);
    emit({ event: "error", data: { code: "expired", message: "Diese Freigabe ist abgelaufen. Bitte frag den Bot erneut." } });
    return;
  }
  const policy = await loadPolicyState(wallet);
  // Approval = the human's yes; kill switch, pause and the daily cap still apply.
  const verdict = decide(row.risk, { granted: true, ...policy });
  if (verdict.kind === "blocked") {
    emit({ event: "error", data: { code: verdict.reason, message: BLOCKED_MESSAGES[verdict.reason] } });
    return;
  }
  const approved = await transitionAction(wallet, row.id, "pending", { status: "approved", decided: true });
  if (!approved) {
    emit({ event: "error", data: { code: "conflict", message: "Über diese Aktion wurde schon entschieden." } });
    return;
  }
  if (opts.alwaysAllow && isGrantable(row.risk) && row.bot_id) {
    await addGrant(wallet, row.bot_id, row.tool).catch((err) => console.error("[harness/actions] grant", err));
  }

  // The card flips to "approved" right away; the result follows.
  const isMoney = row.risk === "money";
  await emitCard(emit, await updateCard(wallet, row, "approved", isMoney ? "Wird auf deinem Gerät bestätigt …" : "Wird ausgeführt …"), row.id);
  // Money: the device signs and reports via /complete.
  if (isMoney) {
    await finishWithoutTurn(wallet, thread, emit);
    return;
  }

  const tool = await findTool(row.tool, wallet);
  const emitted: ChatPart[] = [];
  let status: ApprovalStatus;
  let note: string;
  let resultNote: string;
  if (!tool) {
    await transitionAction(wallet, row.id, "approved", { status: "failed", error: "Werkzeug nicht mehr verfügbar", executed: true });
    status = "failed";
    resultNote = "Dieses Werkzeug gibt es nicht mehr.";
    note = `Der Mensch hat „${row.summary}“ freigegeben, aber das Werkzeug ist nicht mehr verfügbar. Sag das kurz.`;
  } else {
    const ctx = await buildHarnessContext({
      wallet, threadId: thread.id, botId: row.bot_id ?? "", taskId: row.task_id,
      emitPart: (p) => { emitted.push(p); },
    });
    const out = await executeApproved(tool, row.input, ctx);
    if (out.ok) {
      await transitionAction(wallet, row.id, "approved", { status: "executed", result: out.result, executed: true });
      status = "executed";
      resultNote = resultNoteFor(out.result);
      note = `Der Mensch hat die Aktion „${row.summary}“ freigegeben und sie wurde ausgeführt. Ergebnis: ${clipJson(out.result)}. ` +
        "Teile das Ergebnis in 1–2 kurzen Sätzen mit.";
    } else {
      await transitionAction(wallet, row.id, "approved", { status: "failed", error: out.error, executed: true });
      status = "failed";
      resultNote = "Fehlgeschlagen.";
      note = `Der Mensch hat „${row.summary}“ freigegeben, aber die Ausführung ist fehlgeschlagen (${out.error.slice(0, 200)}). ` +
        "Sag das kurz und biete eine Alternative an.";
    }
  }
  await emitCard(emit, await updateCard(wallet, row, status, resultNote), row.id);
  await continueAfterDecision({ wallet, row, thread, note, emit, initialParts: emitted });
}

export async function rejectAction(opts: {
  wallet: string; row: ActionRow; thread: ChatThread; reason: string | null; emit: Emit;
}): Promise<void> {
  const { wallet, row, thread, emit } = opts;
  const reason = opts.reason?.trim().slice(0, 300) || null;
  const rejected = await transitionAction(wallet, row.id, "pending", {
    status: "rejected", decided: true, result: reason ? { reason } : undefined,
  });
  if (!rejected) {
    emit({ event: "error", data: { code: "conflict", message: "Über diese Aktion wurde schon entschieden." } });
    return;
  }
  await emitCard(emit, await updateCard(wallet, row, "rejected", reason ? `Abgelehnt: ${reason}` : "Abgelehnt."), row.id);
  const note = `Der Mensch hat die Aktion „${row.summary}“ abgelehnt${reason ? ` (Begründung: ${reason})` : ""}. ` +
    "Bestätige das in einem kurzen Satz, führe die Aktion nicht aus und biete höchstens eine Alternative an.";
  await continueAfterDecision({ wallet, row, thread, note, emit });
}

export async function completeAction(opts: {
  wallet: string; row: ActionRow; thread: ChatThread; txHash: string | null; error: string | null; emit: Emit;
}): Promise<void> {
  const { wallet, row, thread, emit } = opts;
  const ok = Boolean(opts.txHash) && !opts.error;
  const done = await transitionAction(wallet, row.id, "approved", ok
    ? { status: "executed", result: { txHash: opts.txHash }, executed: true }
    : { status: "failed", error: opts.error?.slice(0, 500) || "Auf dem Gerät abgebrochen", executed: true });
  if (!done) {
    emit({ event: "error", data: { code: "conflict", message: "Diese Aktion ist schon abgeschlossen." } });
    return;
  }
  await emitCard(emit, await updateCard(wallet, row, ok ? "executed" : "failed", ok ? "Gesendet." : "Nicht gesendet."), row.id);
  const note = ok
    ? `Die Aktion „${row.summary}“ wurde auf dem Gerät des Menschen bestätigt und ausgeführt. Bestätige das kurz.`
    : `Die Aktion „${row.summary}“ wurde auf dem Gerät nicht ausgeführt (${(opts.error ?? "abgebrochen").slice(0, 200)}). Sag das kurz.`;
  await continueAfterDecision({ wallet, row, thread, note, emit });
}
