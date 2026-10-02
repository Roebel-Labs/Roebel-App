// Task actions for the proposal lifecycle ("Vorhaben"). decideTaskAction is the single authority
// for who may do what; this service validates payloads, builds the TaskCtx, and performs the writes
// with conditional updates so a concurrent change loses cleanly (CONFLICT).
import type { VorhabenAction } from "../signed-request/message";
import type { Stage } from "./constants";
import { toAtto } from "./money";
import { notify, type VorhabenNotice } from "./notify";
import { planTaskLines } from "./payout-plan";
import { displayNames, ensureContract, getProposal, insertLines, toLineRow, type LineRow, type ProposalRow } from "./repo";
import type { Db, VorhabenSettings } from "./settings";
import { decideTaskAction, type TaskAction, type TaskCtx, type TaskStatus } from "./task-machine";

export interface TaskDeps {
  db: Db;
  isAttester: (wallet: string) => Promise<boolean>;
  nowMs: () => number;
  settings: VorhabenSettings;
  /** EURe transfer from the Attester Safe for `amount`, mined at or after `notBeforeSec`. */
  verifyManualTx: (txHash: string, amount: string, notBeforeSec: number) => Promise<boolean>;
  dispatch: (lineIds: string[]) => Promise<void>;
  /** Current Attester wallets (lowercase); only used for the "wartet auf Abnahme" notice. */
  listAttesters: () => Promise<string[]>;
  /** The single settle path (settleIfMined) for a line that just received its tx hash. */
  settle: (line: LineRow) => Promise<string>;
  /** `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/` — image/pdf proofs must live here. */
  storagePublicPrefix: string;
}

type Fail = { ok: false; status: number; code: string; message: string };
export type TaskResult = { ok: true; data: unknown } | Fail;

type TaskRow = {
  id: string; proposal_id: string; title: string; status: TaskStatus; assignee_wallet: string | null;
  created_by_wallet: string; reward_amount: string | number; reward_asset: "EURe" | "EURC";
};
const TASK_COLS = "id, proposal_id, title, status, assignee_wallet, created_by_wallet, reward_amount, reward_asset";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALLET_RE = /^0x[0-9a-f]{40}$/;
const TX_RE = /^0x[0-9a-f]{64}$/i;
const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/; // max 9.999.999,99 €
const ACCEPTED_STAGES: Stage[] = ["angenommen", "in_umsetzung"];

const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const bad = (message: string): Fail => fail(400, "BAD_REQUEST", message);
const conflict = (): Fail => fail(409, "CONFLICT", "Die Aufgabe wurde gerade geändert. Bitte lade neu.");

const DENY_STATUS: Record<string, number> = {
  FORBIDDEN: 403, BAD_STATUS: 409, ALREADY_APPLIED: 409, PROPOSAL_CLOSED: 409, CONFLICT: 409,
};
const denyStatus = (code: string) => DENY_STATUS[code] ?? (code.startsWith("SELF_") ? 403 : 400);

function check(r: { error: { message: string } | null }, what: string): void {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
}
function rows<T>(r: { data: unknown; error: { message: string } | null }, what: string): T[] {
  check(r, what);
  return (r.data ?? []) as T[];
}

/** Trimmed string within bounds, or null. `undefined` counts as "" when min is 0. */
function text(v: unknown, max: number, min = 0): string | null {
  if (v === undefined || v === null) return min === 0 ? "" : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

type Attachment = { type: "image" | "pdf"; url: string } | { type: "tx"; hash: string };
function parseAttachments(v: unknown, prefix: string): Attachment[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 5) return null;
  const out: Attachment[] = [];
  for (const a of v) {
    if (!a || typeof a !== "object") return null;
    const { type, url, hash } = a as Record<string, unknown>;
    if (type === "image" || type === "pdf") {
      if (typeof url !== "string" || url.length > 1000 || !prefix || !url.startsWith(prefix) || url.length === prefix.length) return null;
      out.push({ type, url });
    } else if (type === "tx") {
      if (typeof hash !== "string" || !TX_RE.test(hash)) return null;
      out.push({ type, hash: hash.toLowerCase() });
    } else return null;
  }
  return out;
}

const TASK_ACTION: Record<Exclude<VorhabenAction, "task_create" | "payout_record_manual">, TaskAction> = {
  task_apply: "apply", task_withdraw: "withdraw", task_assign: "assign", task_start: "start", task_comment: "comment",
  task_proof: "proof", task_submit: "submit", task_approve: "approve", task_request_changes: "request_changes", task_cancel: "cancel",
};
const NEEDS_ATTESTER: TaskAction[] = ["assign", "approve", "request_changes", "cancel"];

export async function handleVorhabenAction(
  deps: TaskDeps, walletIn: string, action: VorhabenAction, payload: Record<string, unknown>,
): Promise<TaskResult> {
  const wallet = walletIn.toLowerCase();
  if (action === "task_create") return createTask(deps, wallet, payload);
  if (action === "payout_record_manual") return recordManualPayout(deps, wallet, payload);
  const taskAction = TASK_ACTION[action];
  if (!taskAction) return bad("Unbekannte Aktion.");
  return runTaskAction(deps, wallet, taskAction, payload);
}

// ---- task_create -------------------------------------------------------------------------------

async function createTask(deps: TaskDeps, wallet: string, p: Record<string, unknown>): Promise<TaskResult> {
  const proposalId = uuid(p.proposalId);
  // Optional client-chosen id: a person-signed task_created event must name its task address before the row exists.
  const presetId = p.taskId === undefined || p.taskId === null ? null : uuid(p.taskId);
  if ((p.taskId !== undefined && p.taskId !== null) && !presetId) return bad("Die Aufgaben-ID ist ungültig.");
  const title = text(p.title, 140, 3);
  const description = text(p.description, 4000);
  if (!proposalId) return bad("Vorschlag fehlt.");
  if (title === null) return bad("Der Titel muss 3 bis 140 Zeichen lang sein.");
  if (description === null) return bad("Die Beschreibung darf höchstens 4000 Zeichen lang sein.");
  if (!Array.isArray(p.criteria) || p.criteria.length < 1 || p.criteria.length > 10) return bad("Bitte gib 1 bis 10 Abnahmekriterien an.");
  const criteria: string[] = [];
  for (const c of p.criteria) {
    const t = text(c, 200, 1);
    if (t === null) return bad("Jedes Abnahmekriterium braucht 1 bis 200 Zeichen.");
    criteria.push(t);
  }
  const amount = typeof p.rewardAmount === "string" ? p.rewardAmount.trim() : "";
  if (!AMOUNT_RE.test(amount) || toAtto(amount) <= 0n) return bad("Die Vergütung muss zwischen 0,01 und 9.999.999,99 € liegen, mit höchstens 2 Nachkommastellen.");
  if (p.rewardAsset !== "EURe") return bad("Als Währung ist nur EURe möglich.");
  let deadline: string | null = null;
  if (p.deadline !== undefined && p.deadline !== null && p.deadline !== "") {
    const ms = typeof p.deadline === "string" ? Date.parse(p.deadline) : NaN;
    if (!Number.isFinite(ms)) return bad("Die Frist ist kein gültiges Datum.");
    deadline = new Date(ms).toISOString();
  }

  const proposal = await getProposal(deps.db, proposalId);
  if (!proposal || !proposal.vorhaben_enabled) return fail(404, "NOT_FOUND", "Vorschlag nicht gefunden.");
  if (proposal.lifecycle_stage === "abgelehnt" || proposal.lifecycle_stage === "umgesetzt") {
    return fail(409, "PROPOSAL_CLOSED", "Für diesen Vorschlag können keine Aufgaben mehr angelegt werden.");
  }
  const isProposer = proposal.proposer_address.toLowerCase() === wallet;
  if (!isProposer && !(await deps.isAttester(wallet))) {
    return fail(403, "FORBIDDEN", "Nur Antragsteller:in oder Attester:innen können Aufgaben anlegen.");
  }

  const ins = await deps.db.from("proposal_tasks").insert({
    ...(presetId ? { id: presetId } : {}),
    proposal_id: proposalId, title, description,
    acceptance_criteria: criteria.map((t, i) => ({ id: `k${i + 1}`, text: t, done: false })),
    reward_amount: amount, reward_asset: "EURe", deadline, status: "offen", created_by_wallet: wallet,
  }).select("id").single();
  if (presetId && (ins.error as { code?: string } | null)?.code === "23505") return fail(409, "CONFLICT", "Diese Aufgabe gibt es schon.");
  check(ins, "task insert");
  const id = (ins.data as { id: string } | null)?.id;
  if (!id) throw new Error("task insert returned no id");
  check(await deps.db.from("task_activity").insert({
    task_id: id, actor_wallet: wallet, kind: "status_change", from_status: null, to_status: "offen",
  }), "task activity");
  return { ok: true, data: { id, status: "offen" } };
}

// ---- task lifecycle ----------------------------------------------------------------------------

async function runTaskAction(deps: TaskDeps, wallet: string, action: TaskAction, p: Record<string, unknown>): Promise<TaskResult> {
  const { db } = deps;
  const taskId = uuid(p.taskId);
  if (!taskId) return bad("Aufgabe fehlt.");

  // Payload validation before any read.
  let note = "";
  let body: string | null = null;
  let target: string | null = null;
  let attachments: Attachment[] = [];
  switch (action) {
    case "apply": {
      const n = text(p.note, 1000);
      if (n === null) return bad("Die Nachricht darf höchstens 1000 Zeichen lang sein.");
      note = n;
      break;
    }
    case "assign":
      target = typeof p.applicant === "string" ? p.applicant.trim().toLowerCase() : "";
      if (!WALLET_RE.test(target)) return bad("Bewerber:in fehlt.");
      break;
    case "comment":
    case "request_changes":
    case "cancel":
      body = text(p.body, 4000);
      if (body === null) return bad("Der Text darf höchstens 4000 Zeichen lang sein.");
      break;
    case "proof": {
      body = text(p.body, 4000);
      if (body === null) return bad("Der Text darf höchstens 4000 Zeichen lang sein.");
      const a = parseAttachments(p.attachments, deps.storagePublicPrefix);
      if (!a) return bad("Bitte hänge 1 bis 5 gültige Nachweise an (Bild, PDF oder Transaktion).");
      attachments = a;
      break;
    }
  }

  const taskRes = await db.from("proposal_tasks").select(TASK_COLS).eq("id", taskId).maybeSingle();
  check(taskRes, "task read");
  const task = taskRes.data as TaskRow | null;
  if (!task) return fail(404, "NOT_FOUND", "Aufgabe nicht gefunden.");
  const proposal = await getProposal(db, task.proposal_id);
  if (!proposal) return fail(404, "NOT_FOUND", "Vorschlag nicht gefunden.");

  const apps = rows<{ applicant_wallet: string; created_at: string }>(
    await db.from("task_applications").select("applicant_wallet, created_at").eq("task_id", taskId).eq("status", "offen"),
    "applications read");
  const firstMs = apps.reduce<number | null>((min, a) => {
    const t = new Date(a.created_at).getTime();
    return Number.isFinite(t) && (min === null || t < min) ? t : min;
  }, null);
  let hasProof = false;
  if (action === "submit") {
    hasProof = rows(await db.from("task_activity").select("id").eq("task_id", taskId).eq("kind", "proof").limit(1), "proof read").length > 0;
  }

  const ctx: TaskCtx = {
    status: task.status,
    actor: wallet,
    proposer: proposal.proposer_address.toLowerCase(),
    assignee: task.assignee_wallet ? task.assignee_wallet.toLowerCase() : null,
    actorIsAttester: NEEDS_ATTESTER.includes(action) ? await deps.isAttester(wallet) : false,
    applicants: apps.map((a) => a.applicant_wallet.toLowerCase()),
    firstApplicationAt: firstMs === null ? null : Math.floor(firstMs / 1000),
    nowSec: Math.floor(deps.nowMs() / 1000),
    hasProof,
    comment: body,
    target,
    proposalStage: proposal.lifecycle_stage,
  };
  const d = decideTaskAction(action, ctx);
  if (!d.ok) return fail(denyStatus(d.code), d.code, d.message);

  const nowIso = new Date(deps.nowMs()).toISOString();
  const from = task.status;
  const cas = async (patch: Record<string, unknown> = {}): Promise<boolean> => {
    const r = await db.from("proposal_tasks").update({ ...patch, status: d.next, updated_at: nowIso })
      .eq("id", taskId).eq("status", from).select("id");
    check(r, "task status update");
    return Array.isArray(r.data) && r.data.length > 0;
  };
  const touch = async () => check(await db.from("proposal_tasks").update({ updated_at: nowIso }).eq("id", taskId), "task touch");
  const log = async (row: Record<string, unknown>) =>
    check(await db.from("task_activity").insert({ task_id: taskId, actor_wallet: wallet, ...row }), "task activity");
  const statusLog = (extra: Record<string, unknown> = {}) =>
    log({ kind: "status_change", from_status: from, to_status: d.next, body: body || null, ...extra });
  const notice = (to: string, title: string, text: string): VorhabenNotice => ({
    wallet: to, kind: "vorhaben_task", screen: "aufgabe", proposalKey: proposal.proposal_id, taskId, title, body: text,
  });

  switch (action) {
    case "apply": {
      const ins = await db.from("task_applications").insert({ task_id: taskId, applicant_wallet: wallet, note });
      if (ins.error) {
        if ((ins.error as { code?: string }).code !== "23505") throw new Error(`application insert: ${ins.error.message}`);
        // A withdrawn application may be reopened; anything else is a duplicate.
        const re = await db.from("task_applications").update({ status: "offen", note })
          .eq("task_id", taskId).eq("applicant_wallet", wallet).eq("status", "zurueckgezogen").select("id");
        check(re, "application reopen");
        if (!Array.isArray(re.data) || re.data.length === 0) return fail(409, "ALREADY_APPLIED", "Du hast dich schon beworben.");
      }
      await touch();
      if (ctx.proposer !== wallet) {
        await notify(db, [notice(ctx.proposer, "Neue Bewerbung", `Für die Aufgabe „${task.title}" gibt es eine neue Bewerbung.`)]);
      }
      return { ok: true, data: { status: d.next } };
    }

    case "withdraw": {
      const r = await db.from("task_applications").update({ status: "zurueckgezogen" })
        .eq("task_id", taskId).eq("applicant_wallet", wallet).eq("status", "offen").select("id");
      check(r, "application withdraw");
      if (!Array.isArray(r.data) || r.data.length === 0) return conflict();
      await touch();
      return { ok: true, data: { status: d.next } };
    }

    case "assign": {
      if (!(await cas({ assignee_wallet: target, assigned_by_wallet: wallet }))) return conflict();
      check(await db.from("task_applications").update({ status: "angenommen" })
        .eq("task_id", taskId).eq("applicant_wallet", target!), "application accept");
      check(await db.from("task_applications").update({ status: "abgelehnt" })
        .eq("task_id", taskId).eq("status", "offen").neq("applicant_wallet", target!), "applications decline");
      await statusLog();
      await notify(db, [notice(target!, "Aufgabe an dich vergeben", `Du übernimmst die Aufgabe „${task.title}".`)]);
      return { ok: true, data: { status: d.next } };
    }

    case "start":
    case "submit":
    case "request_changes":
    case "cancel": {
      if (!(await cas())) return conflict();
      await statusLog();
      if (action === "submit") await notifyAttesters(deps, ctx.assignee, notice, task.title);
      if (action === "request_changes" && ctx.assignee) {
        await notify(db, [notice(ctx.assignee, "Nachbesserung angefordert", `Bei der Aufgabe „${task.title}" wird eine Nachbesserung gewünscht.`)]);
      }
      return { ok: true, data: { status: d.next } };
    }

    case "comment": {
      await log({ kind: "comment", body });
      await touch();
      return { ok: true, data: { status: d.next } };
    }

    case "proof": {
      const changes = d.next !== from;
      if (changes) {
        if (!(await cas())) return conflict();
      }
      await log({ kind: "proof", body: body || null, attachments, ...(changes ? { from_status: from, to_status: d.next } : {}) });
      if (!changes) await touch();
      return { ok: true, data: { status: d.next } };
    }

    case "approve": {
      if (!(await cas({ approved_by_wallet: wallet }))) return conflict();
      await statusLog();
      let lineIds: string[] = [];
      const accepted = ACCEPTED_STAGES.includes(proposal.lifecycle_stage);
      if (accepted && ctx.assignee) {
        try {
          lineIds = await createTaskLines(deps, proposal, task, ctx.assignee);
        } catch (e) {
          // The approval is stored; the cron creates missing lines for every abgenommen task of an accepted proposal.
          console.error(`[vorhaben/tasks] payout lines for task ${taskId} failed; cron will retry`, e);
        }
      }
      if (ctx.assignee) {
        // One wording for every case: payouts may be paused (dispatch_enabled) or waiting for the vote.
        await notify(db, [notice(ctx.assignee, "Aufgabe abgenommen", "Deine Aufgabe wurde abgenommen. Die Auszahlung wird vorbereitet.")]);
      }
      return { ok: true, data: { status: d.next, lineIds } };
    }
  }
}

async function notifyAttesters(
  deps: TaskDeps, assignee: string | null,
  notice: (to: string, title: string, text: string) => VorhabenNotice, title: string,
): Promise<void> {
  let attesters: string[];
  try {
    attesters = await deps.listAttesters();
  } catch (e) {
    console.error("[vorhaben/tasks] listAttesters failed; submit notice skipped", e);
    return;
  }
  const to = [...new Set(attesters.map((w) => w.toLowerCase()))].filter((w) => w !== assignee);
  await notify(deps.db, to.map((w) => notice(w, "Aufgabe wartet auf Abnahme", `Die Aufgabe „${title}" wurde eingereicht und wartet auf deine Abnahme.`)));
}

async function createTaskLines(deps: TaskDeps, proposal: ProposalRow, task: TaskRow, assignee: string): Promise<string[]> {
  const { db, settings } = deps;
  const contract = await ensureContract(db, proposal.id, settings);
  const names = await displayNames(db, [assignee]);
  await insertLines(db, contract.id, proposal.id, planTaskLines(
    { taskId: task.id, wallet: assignee, label: names.get(assignee) ?? "Unbekannt", amount: String(task.reward_amount), asset: task.reward_asset },
    { bps: contract.platform_fee_bps, platformSafe: contract.platform_safe_address, budgetFeeRail: settings.budgetFeeRail }));
  const ids = rows<{ id: string }>(await db.from("proposal_payout_lines").select("id")
    .eq("reference_type", "task").eq("reference_id", task.id), "task lines read").map((l) => l.id);
  if (settings.dispatchEnabled && ids.length) {
    // Lines are stored; a dispatch failure must not undo that. The cron retries open lines.
    try { await deps.dispatch(ids); } catch (e) { console.error("[vorhaben/tasks] dispatch failed", e); }
  }
  return ids;
}

// ---- payout_record_manual ----------------------------------------------------------------------

async function recordManualPayout(deps: TaskDeps, wallet: string, p: Record<string, unknown>): Promise<TaskResult> {
  const { db } = deps;
  const lineId = uuid(p.lineId);
  const txHash = typeof p.txHash === "string" ? p.txHash.trim() : "";
  if (!lineId) return bad("Auszahlungszeile fehlt.");
  if (!TX_RE.test(txHash)) return bad("Der Transaktions-Hash ist ungültig.");
  const hash = txHash.toLowerCase();
  if (!(await deps.isAttester(wallet))) return fail(403, "FORBIDDEN", "Nur Attester:innen können Auszahlungen eintragen.");

  const lr = await db.from("proposal_payout_lines").select("*").eq("id", lineId).maybeSingle();
  check(lr, "line read");
  const line = lr.data ? (toLineRow(lr.data) as LineRow & { created_at?: string }) : null;
  if (!line) return fail(404, "NOT_FOUND", "Auszahlung nicht gefunden.");
  if (line.role !== "empfaenger" || line.rail !== "manual_safe") return fail(400, "BAD_LINE", "Diese Auszahlung wird nicht manuell eingetragen.");
  if (line.status !== "geplant") return fail(409, "BAD_STATUS", "Für diese Auszahlung ist schon eine Transaktion eingetragen.");

  // Case-insensitive: Safe-service execution hashes (safe_eure lines) are not guaranteed lowercase.
  const used = rows(await db.from("proposal_payout_lines").select("id").ilike("tx_hash", hash).limit(1), "tx reuse read");
  if (used.length > 0) return fail(409, "TX_USED", "Diese Transaktion ist schon einer anderen Auszahlung zugeordnet.");
  const links = rows<{ proposal_id: string | null }>(
    await db.from("treasury_tx_links").select("proposal_id").eq("tx_hash", hash), "tx link read");
  if (links.some((l) => l.proposal_id && l.proposal_id !== line.proposal_id)) {
    return fail(409, "TX_USED", "Diese Transaktion gehört schon zu einem anderen Vorschlag.");
  }

  const createdMs = new Date(line.created_at ?? "").getTime();
  if (!Number.isFinite(createdMs)) throw new Error(`line ${line.id} has no created_at`);
  if (!(await deps.verifyManualTx(hash, line.amount, Math.floor(createdMs / 1000)))) {
    return fail(400, "BAD_TX", "Die Transaktion passt nicht: Es fehlt eine erfolgreiche EURe-Überweisung der Gemeinschaftskasse über diesen Betrag.");
  }
  const up = await db.from("proposal_payout_lines")
    .update({ status: "gesendet", tx_hash: hash, error: null, updated_at: new Date(deps.nowMs()).toISOString() })
    .eq("id", lineId).eq("status", "geplant").select("id");
  // proposal_payout_lines_manual_tx_key: a concurrent request recorded the same tx on another line.
  if ((up.error as { code?: string } | null)?.code === "23505") {
    return fail(409, "TX_USED", "Diese Transaktion ist schon einer anderen Auszahlung zugeordnet.");
  }
  check(up, "line update");
  if (!Array.isArray(up.data) || up.data.length === 0) return conflict();
  // The single settle path moves it to bestaetigt and runs afterLineSettled.
  const settled = await deps.settle({ ...line, status: "gesendet", tx_hash: hash });
  return { ok: true, data: { status: settled === "settled" ? "bestaetigt" : "gesendet" } };
}
