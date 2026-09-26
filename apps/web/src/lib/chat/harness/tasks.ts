// Durable autonomous tasks (spec §3.2 tasks rows, §3.3 agent_tasks, §4 tasks pack).
// Pure state logic (status transitions, step patching, claim rules, the
// task-mode note for the model) + the agent_tasks store. The worker that runs
// a tick lives in task-worker.ts; the tools in packs/tasks.ts.
import { db } from "../store";
import * as store from "../store";
import type { ChatPart } from "../types";

// ---- types ----------------------------------------------------------------------

export type TaskStatus = "queued" | "running" | "waiting_approval" | "done" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "done" | "failed";
export interface TaskStep { label: string; status: StepStatus }
export type TaskPart = Extract<ChatPart, { type: "task" }>;

export interface TaskFileRef { fileId: string; name: string; ext: string; size: number }

export interface TaskCheckpoint {
  /** Short results per finished step ("Schritt 2: …"), newest last. */
  notes?: string[];
  /** Files the task wrote (attached to the final message). */
  files?: TaskFileRef[];
  /** Last model text of the previous tick (fallback result). */
  lastText?: string;
}

export interface TaskRow {
  id: string;
  wallet: string;
  thread_id: string;
  message_id: string | null;
  bot_id: string | null;
  title: string;
  goal: string;
  status: TaskStatus;
  steps: unknown;
  checkpoint: unknown;
  result: string | null;
  error: string | null;
  attempts: number;
  next_tick_at: string;
  created_at: string;
  updated_at: string;
}

/** GET /api/chat/tasks/:id shape. */
export interface TaskSnapshot {
  id: string;
  title: string;
  status: TaskStatus;
  steps: TaskStep[];
  error: string | null;
  updatedAt: string;
}

// ---- limits -----------------------------------------------------------------------

/** Running tasks per wallet at the same time. */
export const MAX_RUNNING_PER_WALLET = 3;
/** Not-yet-finished tasks per wallet (queued + running + waiting). */
export const MAX_ACTIVE_PER_WALLET = 10;
/** Ticks (claims) per task before it fails. */
export const MAX_ATTEMPTS = 5;
/** A running tick holds its claim this long (next_tick_at = lease end); expired → reclaimable. */
export const LEASE_MS = 5 * 60_000;
export const MAX_STEPS = 12;
const MAX_NOTES = 30;
const MAX_NOTE_CHARS = 600;

export const TERMINAL: readonly TaskStatus[] = ["done", "failed", "cancelled"];
export const isTerminal = (s: TaskStatus): boolean => TERMINAL.includes(s);

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  // running → running = reclaim after an expired lease.
  running: ["running", "queued", "waiting_approval", "done", "failed", "cancelled"],
  waiting_approval: ["queued", "cancelled", "failed"],
  done: [],
  failed: [],
  cancelled: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ---- pure helpers ---------------------------------------------------------------------

export function normalizeSteps(raw: unknown): TaskStep[] {
  if (!Array.isArray(raw)) return [];
  const ok: StepStatus[] = ["pending", "running", "done", "failed"];
  return raw.slice(0, MAX_STEPS).flatMap((s): TaskStep[] => {
    if (typeof s === "string") return s.trim() ? [{ label: s.trim().slice(0, 140), status: "pending" }] : [];
    if (s && typeof s === "object" && typeof (s as TaskStep).label === "string" && (s as TaskStep).label.trim()) {
      const status = ok.includes((s as TaskStep).status) ? (s as TaskStep).status : "pending";
      return [{ label: (s as TaskStep).label.trim().slice(0, 140), status }];
    }
    return [];
  });
}

export function normalizeCheckpoint(raw: unknown): TaskCheckpoint {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const c = raw as TaskCheckpoint;
  return {
    notes: Array.isArray(c.notes) ? c.notes.filter((n) => typeof n === "string") : [],
    files: Array.isArray(c.files) ? c.files.filter((f) => f && typeof f.fileId === "string") : [],
    ...(typeof c.lastText === "string" ? { lastText: c.lastText } : {}),
  };
}

/**
 * Sets a step's status. `index` is 1-based (how the model sees the list); with
 * only a label the step is matched by label (case-insensitive) or appended.
 * Returns the new steps and the 0-based index touched, or an error.
 */
export function applyStepUpdate(
  steps: TaskStep[], update: { index?: number; label?: string; status: StepStatus },
): { steps: TaskStep[]; index: number } | { error: string } {
  const next = steps.map((s) => ({ ...s }));
  let idx = -1;
  if (typeof update.index === "number") {
    idx = Math.floor(update.index) - 1;
    if (idx < 0 || idx >= next.length) {
      if (!update.label?.trim()) return { error: `Schritt ${update.index} gibt es nicht (1–${next.length}).` };
      idx = -1;
    }
  }
  if (idx < 0 && update.label?.trim()) {
    const want = update.label.trim().toLowerCase();
    idx = next.findIndex((s) => s.label.toLowerCase() === want);
    if (idx < 0) {
      if (next.length >= MAX_STEPS) return { error: `Mehr als ${MAX_STEPS} Schritte sind nicht möglich.` };
      next.push({ label: update.label.trim().slice(0, 140), status: "pending" });
      idx = next.length - 1;
    }
  }
  if (idx < 0) return { error: "Gib die Nummer oder den Namen des Schritts an." };
  if (update.label?.trim() && typeof update.index === "number") next[idx].label = update.label.trim().slice(0, 140);
  next[idx].status = update.status;
  // Only one step runs at a time.
  if (update.status === "running") {
    next.forEach((s, i) => { if (i !== idx && s.status === "running") s.status = "pending"; });
  }
  return { steps: next, index: idx };
}

/** Steps as the terminal card shows them: running steps settle to done/failed. */
export function settleSteps(steps: TaskStep[], outcome: "done" | "failed" | "cancelled"): TaskStep[] {
  return steps.map((s) => {
    if (s.status !== "running" && !(outcome === "done" && s.status === "pending")) return s;
    if (outcome === "done") return { ...s, status: "done" };
    if (outcome === "failed") return { ...s, status: "failed" };
    return { ...s, status: "pending" };
  });
}

export function taskPartOf(row: Pick<TaskRow, "id" | "title" | "status" | "steps">): TaskPart {
  return { type: "task", taskId: row.id, title: row.title, status: row.status, steps: normalizeSteps(row.steps) };
}

export function toSnapshot(row: TaskRow): TaskSnapshot {
  return {
    id: row.id, title: row.title, status: row.status, steps: normalizeSteps(row.steps),
    error: row.error, updatedAt: row.updated_at,
  };
}

/** Replaces the task part with the same taskId; null when the message has none. */
export function applyTaskPart(parts: ChatPart[], part: TaskPart): ChatPart[] | null {
  const idx = parts.findIndex((p) => p.type === "task" && p.taskId === part.taskId);
  if (idx < 0) return null;
  const next = parts.slice();
  next[idx] = part;
  return next;
}

export type ClaimVerdict =
  | { ok: true }
  | { ok: false; reason: "terminal" | "waiting" | "not_due" | "concurrency" | "attempts" };

/**
 * Whether a worker may claim this task now. Queued tasks when due; running
 * tasks only once their lease (next_tick_at) expired (the previous worker died).
 */
export function claimVerdict(
  row: Pick<TaskRow, "status" | "next_tick_at" | "attempts">, now: Date, runningForWallet: number,
): ClaimVerdict {
  if (isTerminal(row.status)) return { ok: false, reason: "terminal" };
  if (row.status === "waiting_approval") return { ok: false, reason: "waiting" };
  if (new Date(row.next_tick_at).getTime() > now.getTime()) return { ok: false, reason: "not_due" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "attempts" };
  // A stale running row is itself counted in runningForWallet only if its lease is live, so no -1.
  if (row.status === "queued" && runningForWallet >= MAX_RUNNING_PER_WALLET) return { ok: false, reason: "concurrency" };
  return { ok: true };
}

export function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function appendNote(cp: TaskCheckpoint, note: string): TaskCheckpoint {
  const notes = [...(cp.notes ?? []), clip(note, MAX_NOTE_CHARS)].slice(-MAX_NOTES);
  return { ...cp, notes };
}

export const TASK_MODE_RULES =
  "Arbeitsweise im Hintergrund-Modus:\n" +
  "- Der Mensch schaut gerade nicht zu. Arbeite die Aufgabe selbstständig Schritt für Schritt ab, ohne Rückfragen.\n" +
  "- Setz vor jedem Schritt update_task_step mit status „running“ und danach mit „done“ (oder „failed“) und einem kurzen Ergebnis.\n" +
  "- Fehlt ein Schritt in der Liste, leg ihn mit update_task_step (label, ohne Nummer) an.\n" +
  "- Längere Ergebnisse schreibst du mit write_file in eine Datei.\n" +
  "- Öffentliche Aktionen, Geld und externe Dienste brauchen weiterhin eine Freigabe; nach „awaiting_approval“ hörst du auf, " +
  "die Aufgabe geht nach der Entscheidung weiter.\n" +
  "- Wenn alles erledigt ist, ruf complete_task mit einer kurzen Zusammenfassung (2–5 Sätze) auf. Kannst du das Ziel nicht erreichen, " +
  "ruf complete_task mit failed=true und dem Grund auf.";

/** Model-facing hidden note for one tick: goal, steps and what earlier ticks achieved. */
export function taskNote(row: Pick<TaskRow, "title" | "goal" | "steps" | "checkpoint" | "attempts">): string {
  const steps = normalizeSteps(row.steps);
  const cp = normalizeCheckpoint(row.checkpoint);
  const state: Record<StepStatus, string> = { pending: "offen", running: "läuft", done: "erledigt", failed: "fehlgeschlagen" };
  const lines = [
    `Systemhinweis, nicht vom Menschen geschrieben: Du arbeitest an der Hintergrund-Aufgabe „${row.title}“.`,
    `Ziel: ${row.goal}`,
  ];
  if (steps.length) {
    lines.push("Schritte:");
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s.label} — ${state[s.status]}`));
  } else {
    lines.push("Es gibt noch keine Schritte. Leg zuerst 2–6 Schritte mit update_task_step an.");
  }
  if (cp.notes?.length) {
    lines.push("Bisherige Ergebnisse (aus früheren Durchgängen):");
    for (const n of cp.notes.slice(-12)) lines.push(`- ${n}`);
  }
  if (cp.files?.length) lines.push(`Bereits angelegte Dateien: ${cp.files.map((f) => `${f.name}.${f.ext} (id ${f.fileId})`).join(", ")}`);
  if (row.attempts > 1) lines.push(`Das ist Durchgang ${row.attempts}. Mach dort weiter, wo du aufgehört hast, und wiederhole erledigte Schritte nicht.`);
  lines.push("Beginne jetzt mit dem nächsten offenen Schritt.");
  return lines.join("\n");
}

// ---- store (service role) --------------------------------------------------------------

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`[harness/tasks] ${what}: ${res.error.message}`);
  return res.data as T;
}

export async function createTask(input: {
  wallet: string; threadId: string; botId: string | null; title: string; goal: string; steps: string[];
}): Promise<TaskRow> {
  const res = await db().from("agent_tasks").insert({
    wallet: input.wallet,
    thread_id: input.threadId,
    bot_id: input.botId && store.isUuid(input.botId) ? input.botId : null,
    title: clip(input.title, 120) || "Aufgabe",
    goal: clip(input.goal, 4000),
    steps: normalizeSteps(input.steps),
    checkpoint: {},
    status: "queued",
  }).select("*").single();
  return must(res, "create") as TaskRow;
}

export async function getTask(wallet: string, id: string): Promise<TaskRow | null> {
  if (!store.isUuid(id)) return null;
  const res = await db().from("agent_tasks").select("*").eq("id", id).eq("wallet", wallet).maybeSingle();
  return must(res, "get") as TaskRow | null;
}

/** Worker-side read (no wallet scope; ids come from our own queue). */
export async function getTaskById(id: string): Promise<TaskRow | null> {
  if (!store.isUuid(id)) return null;
  const res = await db().from("agent_tasks").select("*").eq("id", id).maybeSingle();
  return must(res, "get by id") as TaskRow | null;
}

export async function activeTaskCount(wallet: string): Promise<number> {
  const res = await db().from("agent_tasks").select("id", { count: "exact", head: true })
    .eq("wallet", wallet).in("status", ["queued", "running", "waiting_approval"]);
  if (res.error) throw new Error(`[harness/tasks] active count: ${res.error.message}`);
  return res.count ?? 0;
}

/** Running tasks with a live lease (expired leases belong to dead workers). */
export async function runningTaskCount(wallet: string, now: Date = new Date()): Promise<number> {
  const res = await db().from("agent_tasks").select("id", { count: "exact", head: true })
    .eq("wallet", wallet).eq("status", "running").gt("next_tick_at", now.toISOString());
  if (res.error) throw new Error(`[harness/tasks] running count: ${res.error.message}`);
  return res.count ?? 0;
}

/** Ids of tasks a worker should look at: due queued + running with an expired lease. */
export async function dueTaskIds(now: Date, limit = 10): Promise<string[]> {
  const res = await db().from("agent_tasks").select("id")
    .in("status", ["queued", "running"]).lte("next_tick_at", now.toISOString())
    .order("next_tick_at").limit(limit);
  return (must(res, "due") as { id: string }[]).map((r) => r.id);
}

/**
 * Claims the task for one tick: status → running, attempts + 1, lease in
 * next_tick_at. Guarded on (status, attempts) so two workers never both win.
 */
export async function claimTask(row: TaskRow, now: Date): Promise<TaskRow | null> {
  const res = await db().from("agent_tasks").update({
    status: "running",
    attempts: row.attempts + 1,
    next_tick_at: new Date(now.getTime() + LEASE_MS).toISOString(),
    updated_at: now.toISOString(),
  }).eq("id", row.id).eq("status", row.status).eq("attempts", row.attempts).select("*").maybeSingle();
  return must(res, "claim") as TaskRow | null;
}

export interface TaskPatch {
  status?: TaskStatus;
  steps?: TaskStep[];
  checkpoint?: TaskCheckpoint;
  result?: string | null;
  error?: string | null;
  attempts?: number;
  nextTickAt?: Date;
  messageId?: string;
}

/**
 * Updates a task, guarded on its current status (`from`, one or several).
 * Returns the fresh row, or null when the status moved meanwhile (cancelled).
 */
export async function updateTask(id: string, from: TaskStatus | TaskStatus[], patch: TaskPatch): Promise<TaskRow | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) update.status = patch.status;
  if (patch.steps) update.steps = patch.steps;
  if (patch.checkpoint) update.checkpoint = patch.checkpoint;
  if (patch.result !== undefined) update.result = patch.result === null ? null : clip(patch.result, 4000);
  if (patch.error !== undefined) update.error = patch.error === null ? null : clip(patch.error, 1000);
  if (patch.attempts !== undefined) update.attempts = patch.attempts;
  if (patch.nextTickAt) update.next_tick_at = patch.nextTickAt.toISOString();
  if (patch.messageId) update.message_id = patch.messageId;
  const froms = Array.isArray(from) ? from : [from];
  const res = await db().from("agent_tasks").update(update).eq("id", id).in("status", froms).select("*").maybeSingle();
  return must(res, "update") as TaskRow | null;
}

/**
 * Patches the `task` part in the message that carries it (cached message_id,
 * else a scan of the thread's recent messages). Returns the message id or null.
 */
export async function patchTaskPart(row: TaskRow): Promise<string | null> {
  const part = taskPartOf(row);
  try {
    let msg = row.message_id ? await store.getMessageRow(row.wallet, row.message_id) : null;
    if (!msg) {
      const recent = await store.recentMessageRows(row.thread_id, 80);
      msg = [...recent].reverse().find((r) => store.partsOf(r.parts).some((p) => p.type === "task" && p.taskId === row.id)) ?? null;
      if (msg) {
        await db().from("agent_tasks").update({ message_id: msg.id }).eq("id", row.id);
      }
    }
    if (!msg) return null;
    const next = applyTaskPart(store.partsOf(msg.parts), part);
    if (!next) return null;
    await store.updateMessageParts(msg.id, next);
    return msg.id;
  } catch (err) {
    console.error("[harness/tasks] patch part failed", row.id, err);
    return null;
  }
}

/** User cancel: any non-terminal status → cancelled; the running worker notices on its next step. */
export async function cancelTask(wallet: string, id: string): Promise<TaskRow | null> {
  const row = await getTask(wallet, id);
  if (!row) return null;
  if (isTerminal(row.status)) return row;
  const next = await updateTask(row.id, ["queued", "running", "waiting_approval"], {
    status: "cancelled", steps: settleSteps(normalizeSteps(row.steps), "cancelled"),
  });
  const fresh = next ?? (await getTask(wallet, id));
  if (fresh) await patchTaskPart(fresh);
  return fresh;
}

/**
 * After a human decided on an approval that a task asked for: the task goes
 * back to the queue with the outcome in its checkpoint. Returns true when requeued.
 */
export async function resumeTaskAfterDecision(taskId: string, note: string): Promise<boolean> {
  const row = await getTaskById(taskId);
  if (!row || row.status !== "waiting_approval") return false;
  const cp = appendNote(normalizeCheckpoint(row.checkpoint), note);
  const next = await updateTask(row.id, "waiting_approval", {
    status: "queued", checkpoint: cp, nextTickAt: new Date(),
  });
  if (!next) return false;
  await patchTaskPart(next);
  return true;
}
