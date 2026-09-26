// agent_actions writes (spec §3.1 / §3.3): one row per harness tool call.
// read/private → 'executed' immediately; gated → 'pending' until the human
// approves/rejects via /api/chat/actions/:id/*.
import { db } from "../store";
import type { Risk } from "./types";

export type ActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed" | "expired";

export interface ActionRow {
  id: string;
  wallet: string;
  thread_id: string | null;
  message_id: string | null;
  bot_id: string | null;
  task_id: string | null;
  tool: string;
  risk: Risk;
  input: unknown;
  summary: string;
  status: ActionStatus;
  result: unknown;
  error: string | null;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
}

/** Audit list item (GET /api/chat/actions). Inputs stay server-side. */
export interface ActionListItem {
  id: string;
  tool: string;
  risk: Risk;
  summary: string;
  status: ActionStatus;
  botId: string | null;
  threadId: string | null;
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
}

/** Pending approvals older than this expire instead of executing. */
export const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RESULT_CHARS = 4000;

/** Keeps audit rows small: large tool outputs are stored as a clipped preview. */
export function compactResult(result: unknown): unknown {
  if (result === undefined) return null;
  let json: string;
  try { json = JSON.stringify(result); } catch { return { note: "nicht serialisierbar" }; }
  if (json === undefined) return null;
  if (json.length <= MAX_RESULT_CHARS) return JSON.parse(json);
  return { truncated: true, preview: json.slice(0, MAX_RESULT_CHARS) };
}

export function toListItem(r: ActionRow): ActionListItem {
  return {
    id: r.id, tool: r.tool, risk: r.risk, summary: r.summary, status: r.status,
    botId: r.bot_id, threadId: r.thread_id, error: r.error,
    createdAt: r.created_at, decidedAt: r.decided_at, executedAt: r.executed_at,
  };
}

export async function insertAction(input: {
  wallet: string; threadId: string | null; botId: string | null; taskId?: string | null;
  tool: string; risk: Risk; input: unknown; summary: string; status: ActionStatus;
  result?: unknown; error?: string | null; executed?: boolean;
}): Promise<ActionRow> {
  const now = new Date().toISOString();
  const res = await db().from("agent_actions").insert({
    wallet: input.wallet,
    thread_id: input.threadId,
    bot_id: input.botId,
    task_id: input.taskId ?? null,
    tool: input.tool,
    risk: input.risk,
    input: compactResult(input.input) ?? {},
    summary: input.summary.slice(0, 300),
    status: input.status,
    result: input.result === undefined ? null : compactResult(input.result),
    error: input.error?.slice(0, 1000) ?? null,
    executed_at: input.executed ? now : null,
    decided_at: input.executed && input.status !== "pending" ? now : null,
  }).select("*").single();
  if (res.error) throw new Error(`[harness/audit] insert: ${res.error.message}`);
  return res.data as ActionRow;
}

/** Best-effort audit for read/private calls: never fails the tool call. */
export async function auditExecuted(input: Parameters<typeof insertAction>[0]): Promise<void> {
  try { await insertAction(input); } catch (err) { console.error("[harness/audit]", err); }
}

export async function getAction(wallet: string, id: string): Promise<ActionRow | null> {
  const res = await db().from("agent_actions").select("*").eq("id", id).eq("wallet", wallet).maybeSingle();
  if (res.error) throw new Error(`[harness/audit] get: ${res.error.message}`);
  return res.data as ActionRow | null;
}

/**
 * Moves an action from `from` to a new status (optimistic lock on the old
 * status, so a double tap never executes twice). Returns the updated row or null.
 */
export async function transitionAction(
  wallet: string, id: string, from: ActionStatus, patch: {
    status: ActionStatus; result?: unknown; error?: string | null; decided?: boolean; executed?: boolean;
  },
): Promise<ActionRow | null> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: patch.status };
  if (patch.result !== undefined) update.result = compactResult(patch.result);
  if (patch.error !== undefined) update.error = patch.error?.slice(0, 1000) ?? null;
  if (patch.decided) update.decided_at = now;
  if (patch.executed) update.executed_at = now;
  const res = await db().from("agent_actions").update(update)
    .eq("id", id).eq("wallet", wallet).eq("status", from).select("*").maybeSingle();
  if (res.error) throw new Error(`[harness/audit] transition: ${res.error.message}`);
  return res.data as ActionRow | null;
}

/** Links pending approvals to the bot message that carries their card. */
export async function attachMessage(actionIds: string[], messageId: string): Promise<void> {
  if (!actionIds.length) return;
  const res = await db().from("agent_actions").update({ message_id: messageId }).in("id", actionIds);
  if (res.error) console.error("[harness/audit] attach message", res.error.message);
}

export async function listActions(wallet: string, limit = 50): Promise<ActionListItem[]> {
  const n = Math.min(Math.max(Math.floor(limit) || 50, 1), 200);
  const res = await db().from("agent_actions").select("*").eq("wallet", wallet)
    .order("created_at", { ascending: false }).limit(n);
  if (res.error) throw new Error(`[harness/audit] list: ${res.error.message}`);
  return (res.data as ActionRow[]).map(toListItem);
}
