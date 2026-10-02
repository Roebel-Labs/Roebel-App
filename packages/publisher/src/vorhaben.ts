/**
 * NSP-13 "Vorhaben" mappers: outbox rows and lifecycle tables → Nostr event specs.
 * Pure functions; what a mapper does not copy cannot leak. A person never appears
 * by name or wallet address — only as a pubkey the identity bridge resolved.
 * Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md §2.
 */
import {
  ACTION_NAMES, DECISION_KINDS, LIFECYCLE_STAGES, PUBLISHED_LINE_STATUSES, TASK_STATUSES, VORHABEN_KINDS,
  contractAddress, headAddress, kasseNoticeD, nsp12StageFor, payoutLineAddress, pollAddress, taskAddress,
  type KasseNotice, type LifecycleStage,
} from "@netizen-labs/protocol";
import { KIND_CIVIC_NOTICE, MAPPER_VERSION, TOWN_SCOPE, str, unixFromUpdatedAt, type PublishSpec } from "./mappers.js";

type Row = Record<string, unknown>;

export interface OutboxRow {
  id: number;
  object_type: "proposal" | "task" | "tally" | "payout";
  object_id: string;
  proposal_id: string;
  action: string;
  from_status: string | null;
  to_status: string;
  actor_wallet: string | null;
  actor_role: string;
  body: string | null;
  extra: Record<string, unknown>;
  occurred_at: string;
  signed_event: unknown | null;
  event_id: string | null;
  published_at: string | null;
  attempts: number;
}

export interface VorhabenContext {
  townPubkey: string;
  /** proposals.proposal_id (the hex key the head is published under). */
  proposalKey: string;
  actorPubkey: string | null;
  /** Event id of the previous 2101 on the same object. */
  prior: string | null;
  now: number;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** numeric(38,18) arrives as "5.000000000000000000"; the record uses "5". */
function decimal(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

const unix = (iso: unknown): number | null => {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

function objectAddress(row: OutboxRow, ctx: VorhabenContext): string {
  switch (row.object_type) {
    case "task": return taskAddress(ctx.townPubkey, row.object_id);
    case "payout": return payoutLineAddress(ctx.townPubkey, row.object_id);
    case "tally": return pollAddress(ctx.townPubkey, ctx.proposalKey);
    case "proposal": return headAddress(ctx.townPubkey, ctx.proposalKey);
  }
}

/**
 * Free-text policy (spec §2.2): the record carries a fixed German line per action,
 * never the actor's own text (proof notes, comments may name people or places).
 * Only the reasons given in a public role — changes_requested (attester) and
 * task_cancelled (proposer) — keep row.body. Proof attachment URLs stay published.
 */
const DEFAULT_CONTENT: Record<string, string> = {
  task_created: "Aufgabe angelegt.",
  task_assigned: "Aufgabe vergeben.",
  task_started: "Aufgabe gestartet.",
  proof_added: "Nachweis hinzugefügt.",
  task_submitted: "Zur Abnahme eingereicht.",
  task_approved: "Aufgabe abgenommen.",
  task_paid: "Aufgabe ausgezahlt.",
  stage_changed: "Stand geändert.",
  changes_requested: "Änderungen angefordert.",
  task_cancelled: "Aufgabe abgebrochen.",
  payout_planned: "Auszahlung geplant.",
  payout_proposed: "Auszahlung zur Freigabe vorgeschlagen.",
  payout_confirmed: "Auszahlung bestätigt.",
  payout_failed: "Auszahlung fehlgeschlagen.",
  payout_unclear: "Auszahlung wird geprüft.",
  meinungsbild_published: "Das Bürgervotum ist ausgezählt und veröffentlicht.",
  tally_confirmed: "Wahlhelfer:in bestätigt das Bürgervotum.",
};
const PUBLIC_REASON_ACTIONS = new Set(["changes_requested", "task_cancelled"]);

function actionContent(row: OutboxRow): string {
  const body = typeof row.body === "string" ? row.body.trim() : "";
  if (PUBLIC_REASON_ACTIONS.has(row.action) && body) return body;
  return DEFAULT_CONTENT[row.action] ?? "";
}

const freshest = (row: Row, minCreatedAt?: number) => Math.max(unixFromUpdatedAt(row), minCreatedAt ?? 0);

/** One 2101 action event. Null when a required field is missing (caller logs). */
export function actionToSpec(row: OutboxRow, ctx: VorhabenContext): PublishSpec | null {
  if (!(ACTION_NAMES as readonly string[]).includes(row.action)) return null;
  if (!HEX64.test(ctx.townPubkey) || !ctx.proposalKey || !row.to_status || !row.actor_role) return null;
  const occurred = unix(row.occurred_at);
  if (occurred === null) return null;
  const extra = row.extra ?? {};
  const s = (k: string) => (typeof extra[k] === "string" && (extra[k] as string).trim() !== "" ? (extra[k] as string) : null);

  const tags: string[][] = [
    ["a", objectAddress(row, ctx), "", "object"],
    ["a", headAddress(ctx.townPubkey, ctx.proposalKey), "", "proposal"],
    ["action", row.action],
  ];
  if (row.from_status) tags.push(["from", row.from_status]);
  tags.push(["to", row.to_status]);
  if (ctx.actorPubkey && HEX64.test(ctx.actorPubkey)) tags.push(["p", ctx.actorPubkey, "", row.actor_role]);
  tags.push(["role", row.actor_role]);
  if (ctx.prior) {
    if (!HEX64.test(ctx.prior)) return null;
    tags.push(["prior", ctx.prior]);
  }
  tags.push(["occurred_at", String(occurred)]);

  if (row.action === "proof_added") {
    const attachments = Array.isArray(extra["attachments"]) ? (extra["attachments"] as Row[]) : [];
    for (const a of attachments) {
      const type = a?.["type"];
      if ((type === "image" || type === "pdf") && typeof a["url"] === "string" && /^https?:\/\//.test(a["url"])) tags.push(["url", a["url"], type]);
      else if (type === "tx" && typeof a["hash"] === "string" && /^0x[0-9a-fA-F]{64}$/.test(a["hash"])) tags.push(["tx", a["hash"]]);
    }
  } else if (row.action === "tally_confirmed") {
    const message = s("message"), signature = s("signature"), account = s("attester_wallet"), hash = s("result_hash");
    if (!message || !signature || !account || !hash) return null;
    tags.push(["signed_text", message], ["signature", signature], ["signer_account", account], ["result_hash", hash], ["chain", "100"]);
  } else if (row.action.startsWith("payout_")) {
    const tx = s("tx"), safeTx = s("safe_tx");
    if (tx) tags.push(["tx", tx]);
    if (safeTx) tags.push(["safe_tx", safeTx]);
  }

  return {
    scope: TOWN_SCOPE, kind: VORHABEN_KINDS.action, d: "", content: actionContent(row), tags, createdAt: ctx.now,
  };
}

/** 32108 task. */
export function taskToSpec(task: Row, proposalKey: string, townPubkey: string, assigneePubkey: string | null, creatorPubkey: string | null, minCreatedAt?: number): PublishSpec | null {
  const id = str(task, "id"), title = str(task, "title"), status = str(task, "status");
  const reward = decimal(task["reward_amount"]), asset = str(task, "reward_asset");
  if (!id || !title || !status || !proposalKey || reward === null || !asset) return null;
  if (!(TASK_STATUSES as readonly string[]).includes(status)) return null;
  const d = `task:${id}`;
  const tags: string[][] = [
    ["d", d], ["a", headAddress(townPubkey, proposalKey), "", "proposal"], ["title", title], ["status", status], ["reward", reward, asset],
  ];
  const deadline = unix(task["deadline"]);
  if (deadline !== null) tags.push(["deadline", String(deadline)]);
  const criteria = Array.isArray(task["acceptance_criteria"]) ? (task["acceptance_criteria"] as Row[]) : [];
  for (const c of criteria) {
    const cid = str(c ?? {}, "id"), text = str(c ?? {}, "text");
    if (cid && text) tags.push(["criterion", cid, text]);
  }
  if (assigneePubkey) tags.push(["p", assigneePubkey, "", "assignee"]);
  else if (str(task, "assignee_wallet")) tags.push(["assignee_role", "non_citizen"]);
  if (creatorPubkey) tags.push(["p", creatorPubkey, "", "creator"]);
  const src = unix(task["created_at"]);
  if (src !== null) tags.push(["created_at_src", String(src)]);
  return { scope: TOWN_SCOPE, kind: VORHABEN_KINDS.task, d, content: str(task, "description") ?? "", tags, createdAt: freshest(task, minCreatedAt) };
}

/** 32110 payout contract; `totals` is one [asset, amount] per asset. */
export function contractToSpec(contract: Row, proposalKey: string, townPubkey: string, lineIds: string[], totals: Array<[string, string]>, minCreatedAt?: number): PublishSpec | null {
  const proposalUuid = str(contract, "proposal_id"), safe = str(contract, "platform_safe_address");
  const bps = Number(contract["platform_fee_bps"]);
  if (!proposalUuid || !safe || !proposalKey || !Number.isInteger(bps)) return null;
  const d = `contract:${proposalUuid}`;
  const tags: string[][] = [
    ["d", d], ["a", headAddress(townPubkey, proposalKey), "", "proposal"], ["fee_bps", String(bps)], ["platform_safe", safe],
  ];
  for (const [asset, amount] of totals) {
    const total = decimal(amount);
    if (total !== null) tags.push(["total", total, asset]);
  }
  for (const lineId of lineIds) tags.push(["a", payoutLineAddress(townPubkey, lineId), "", "line"]);
  return { scope: TOWN_SCOPE, kind: VORHABEN_KINDS.contract, d, content: "", tags, createdAt: freshest(contract, minCreatedAt) };
}

/** 32111 payout line. Null for unpublished states (sendend, gesendet). */
export function payoutLineToSpec(line: Row, proposalKey: string, townPubkey: string, recipientPubkey: string | null): PublishSpec | null {
  const id = str(line, "id"), proposalUuid = str(line, "proposal_id"), role = str(line, "role"), status = str(line, "status");
  const asset = str(line, "asset"), rail = str(line, "rail"), refType = str(line, "reference_type"), refId = str(line, "reference_id");
  const amount = decimal(line["amount"]);
  if (!id || !proposalUuid || !role || !status || !asset || !rail || !refType || !refId || amount === null || !proposalKey) return null;
  if (!(PUBLISHED_LINE_STATUSES as readonly string[]).includes(status)) return null;
  const forAddress = refType === "task" ? taskAddress(townPubkey, refId)
    : refType === "wahlhelfer" ? pollAddress(townPubkey, proposalKey)
    : headAddress(townPubkey, proposalKey);
  const d = `payout:${id}`;
  const tags: string[][] = [
    ["d", d], ["a", contractAddress(townPubkey, proposalUuid), "", "contract"], ["a", forAddress, "", "for"],
    ["role", role], ["amount", amount, asset], ["rail", rail], ["status", status],
  ];
  if (recipientPubkey) tags.push(["p", recipientPubkey, "", "recipient"]);
  if (role === "empfaenger") {
    const label = str(line, "recipient_label");
    if (label) tags.push(["recipient_label", label]);
  } else if (role === "plattform") tags.push(["recipient_label", "Plattform"]);
  const tx = str(line, "tx_hash");
  if (tx && status === "bestaetigt") tags.push(["tx", tx]);
  return { scope: TOWN_SCOPE, kind: VORHABEN_KINDS.payoutLine, d, content: "", tags, createdAt: unixFromUpdatedAt(line) };
}

const count = (v: unknown) => (typeof v === "string" || typeof v === "number") && /^\d+$/.test(String(v)) ? String(v) : "0";
const numberLabel = (p: Row) => (typeof p["proposal_number"] === "number" ? ` #${p["proposal_number"]}` : "");

/**
 * 32104 Bürgervotum (NSP-12 Meinungsbild). Null until the tally window opened.
 * created_at = max(window opened, latest Wahlhelfer confirmation, proposals.updated_at)
 * + MAPPER_VERSION, so a later version (counts, result_hash) always supersedes.
 */
export function buergervotumToSpec(proposal: Row, townPubkey: string, lastConfirmedAt?: string | null): PublishSpec | null {
  const key = str(proposal, "proposal_id");
  const opened = unix(proposal["tally_confirm_opened_at"]);
  if (!key || opened === null) return null;
  const d = `poll:${key}`;
  const f = count(proposal["for_votes"]), a = count(proposal["against_votes"]), ab = count(proposal["abstain_votes"]);
  const tags: string[][] = [
    ["d", d], ["advisory", "true"], ["a", headAddress(townPubkey, key), "", "proposal"], ["for", f], ["against", a], ["abstain", ab],
  ];
  const contract = str(proposal, "tally_address");
  if (contract) tags.push(["tally_contract", contract]);
  const hash = str(proposal, "result_hash");
  if (hash) tags.push(["result_hash", hash]);
  tags.push(["chain", "100"]);
  return {
    scope: TOWN_SCOPE, kind: DECISION_KINDS.meinungsbild, d,
    content: `Bürgervotum zu Vorschlag${numberLabel(proposal)}: ${f} Ja, ${a} Nein, ${ab} Enthaltung. Das Bürgervotum ist eine Abstimmung der Bürger:innen in der Röbel-App.`,
    tags, createdAt: Math.max(opened, unix(lastConfirmedAt) ?? 0, unix(proposal["updated_at"]) ?? 0) + MAPPER_VERSION,
  };
}

/** 32102 Gemeinschaftskasse notice: the treasury deciding about its own funds, never the Stadt. */
export function kasseNoticeToSpec(proposal: Row, kind: KasseNotice, txs: string[], now: number, townPubkey: string): PublishSpec {
  const key = str(proposal, "proposal_id") ?? "";
  const title = str(proposal, "title") ?? "";
  const ref = `Vorschlag${numberLabel(proposal)}${title ? ` „${title}“` : ""}`;
  const content = kind === "beschluss"
    ? `Bürgervotum positiv: Die Gemeinschaftskasse setzt ${ref} aus ihren eigenen Mitteln um. Dies ist keine Entscheidung der Stadt Röbel/Müritz.`
    : kind === "ablehnung"
      ? `Bürgervotum negativ: Die Gemeinschaftskasse setzt ${ref} nicht um. Dies ist keine Entscheidung der Stadt Röbel/Müritz.`
      : `Die Gemeinschaftskasse hat ${ref} umgesetzt. Alle Auszahlungen sind auf der Blockchain belegt.`;
  const d = kasseNoticeD(key, kind);
  const tags: string[][] = [["d", d], ["t", "gemeinschaftskasse"], ["a", headAddress(townPubkey, key), "", "proposal"]];
  for (const tx of txs) tags.push(["tx", tx]);
  return { scope: TOWN_SCOPE, kind: KIND_CIVIC_NOTICE, d, content, tags, createdAt: now };
}

/** Tags appended to the 32100 head for a Vorhaben-enabled proposal (spec §2.1). */
export function proposalVorhabenTags(proposal: Row, townPubkey: string, taskIds: string[]): string[][] {
  const stageRaw = str(proposal, "lifecycle_stage") ?? "abstimmung";
  const stage = (LIFECYCLE_STAGES as readonly string[]).includes(stageRaw) ? (stageRaw as LifecycleStage) : "abstimmung";
  const tags: string[][] = [["stage", nsp12StageFor(stage)], ["vorhaben", stage]];
  const uuid = str(proposal, "id");
  if (uuid) tags.push(["proposal_uuid", uuid]);
  const budget = decimal(proposal["budget_amount"]), asset = str(proposal, "budget_asset");
  if (budget !== null && asset) tags.push(["budget", budget, asset]);
  const beneficiary = str(proposal, "beneficiary_name");
  if (beneficiary) tags.push(["beneficiary", beneficiary]);
  if (uuid) tags.push(["a", contractAddress(townPubkey, uuid), "", "contract"]);
  for (const id of taskIds) tags.push(["a", taskAddress(townPubkey, id), "", "task"]);
  return tags;
}
