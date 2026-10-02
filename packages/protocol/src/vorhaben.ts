// NSP-13 "Vorhaben" record: the post-vote lifecycle of a proposal on Nostr.
// Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md
import { DECISION_KINDS, isLegalTransition, type DecisionEventLike, type Stage } from "./decisions.js";

export const VORHABEN_KINDS = { action: 2101, task: 32108, contract: 32110, payoutLine: 32111 } as const;

export const LIFECYCLE_STAGES = ["abstimmung", "auszaehlung", "angenommen", "abgelehnt", "in_umsetzung", "umgesetzt"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export const TASK_STATUSES = ["offen", "vergeben", "in_arbeit", "eingereicht", "abgenommen", "ausgezahlt", "abgebrochen"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PUBLISHED_LINE_STATUSES = ["geplant", "vorgeschlagen", "bestaetigt", "fehlgeschlagen", "unklar"] as const;
export const LINE_ROLES = ["empfaenger", "aufgabe", "wahlhelfer", "plattform"] as const;
export const ACTOR_ROLES = ["proposer", "applicant", "assignee", "attester", "wahlhelfer", "system"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];
export const ACTION_NAMES = [
  "stage_changed",
  "task_created", "task_assigned", "task_started", "proof_added", "task_submitted", "task_approved",
  "changes_requested", "task_cancelled", "task_paid",
  "meinungsbild_published", "tally_confirmed",
  "payout_planned", "payout_proposed", "payout_confirmed", "payout_failed", "payout_unclear",
] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export type KasseNotice = "beschluss" | "ablehnung" | "ausgefuehrt";
export const taskAddress = (pk: string, taskId: string) => `${VORHABEN_KINDS.task}:${pk}:task:${taskId}`;
export const contractAddress = (pk: string, proposalUuid: string) => `${VORHABEN_KINDS.contract}:${pk}:contract:${proposalUuid}`;
export const payoutLineAddress = (pk: string, lineId: string) => `${VORHABEN_KINDS.payoutLine}:${pk}:payout:${lineId}`;
export const pollAddress = (pk: string, proposalId: string) => `${DECISION_KINDS.meinungsbild}:${pk}:poll:${proposalId}`;
export const kasseNoticeD = (proposalId: string, kind: KasseNotice) => `gemeinschaftskasse:${proposalId}:${kind}`;
export const kasseNoticeAddress = (pk: string, proposalId: string, kind: KasseNotice) => `32102:${pk}:${kasseNoticeD(proposalId, kind)}`;

/** The NSP-12 stage a Vorhaben lifecycle stage corresponds to (spec §2.1). */
export function nsp12StageFor(stage: LifecycleStage): Stage {
  switch (stage) {
    case "abstimmung": case "auszaehlung": return "meinungsbild";
    case "angenommen": case "in_umsetzung": return "beschlossen";
    case "abgelehnt": return "abgelehnt";
    case "umgesetzt": return "umgesetzt";
  }
}

const PATH: Stage[] = ["meinungsbild", "beschlussvorlage", "beschlossen", "umgesetzt"];
/** Legal NSP-12 hops from `from` to `to` along the Gemeinschaftskasse path; [] when equal; throws when backwards. */
export function nsp12TransitionsBetween(from: Stage, to: Stage): Array<{ from: Stage; to: Stage; notice?: "beschluss" | "ablehnung" }> {
  if (from === to) return [];
  if (to === "abgelehnt") {
    const hops: Array<{ from: Stage; to: Stage; notice?: "beschluss" | "ablehnung" }> = [];
    if (from === "meinungsbild") hops.push({ from: "meinungsbild", to: "beschlussvorlage" });
    else if (from !== "beschlussvorlage") throw new Error(`no NSP-12 path ${from} → abgelehnt`);
    hops.push({ from: "beschlussvorlage", to: "abgelehnt", notice: "ablehnung" });
    return hops;
  }
  const i = PATH.indexOf(from), j = PATH.indexOf(to);
  if (i < 0 || j < 0 || j < i) throw new Error(`no NSP-12 path ${from} → ${to}`);
  const hops = [];
  for (let k = i; k < j; k++) {
    const hop: { from: Stage; to: Stage; notice?: "beschluss" | "ablehnung" } = { from: PATH[k], to: PATH[k + 1] };
    if (hop.to === "beschlossen") hop.notice = "beschluss";
    if (!isLegalTransition(hop.from, hop.to)) throw new Error(`illegal hop ${hop.from} → ${hop.to}`);
    hops.push(hop);
  }
  return hops;
}

const tag = (ev: DecisionEventLike, name: string) => ev.tags.find((t) => t[0] === name)?.[1];
const dTag = (ev: DecisionEventLike) => tag(ev, "d") ?? "";
type ShapeResult = { ok: true } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

const ADDRESS = /^\d+:[0-9a-f]{64}:.+$/;
const HEAD = new RegExp(`^${DECISION_KINDS.head}:[0-9a-f]{64}:proposal:.+$`);
const HEX64 = /^[0-9a-f]{64}$/;

export interface ParsedAction {
  object: string; proposal: string; action: ActionName; from: string | null; to: string;
  role: ActorRole; actor: string | null; prior: string | null; occurredAt: number; content: string; tags: string[][];
}

export function safeParseAction(ev: DecisionEventLike): { ok: true; value: ParsedAction } | { ok: false; error: string } {
  if (ev.kind !== VORHABEN_KINDS.action) return fail(`expected kind ${VORHABEN_KINDS.action}, got ${ev.kind}`);
  const objects = ev.tags.filter((t) => t[0] === "a" && t[3] === "object");
  if (objects.length !== 1 || !ADDRESS.test(objects[0][1] ?? "")) return fail("expected exactly one well-formed object a-tag");
  const heads = ev.tags.filter((t) => t[0] === "a" && t[3] === "proposal");
  if (heads.length !== 1 || !HEAD.test(heads[0][1] ?? "")) return fail("expected exactly one proposal head a-tag");
  const action = tag(ev, "action");
  if (!action || !(ACTION_NAMES as readonly string[]).includes(action)) return fail(`unknown action ${action}`);
  const role = tag(ev, "role");
  if (!role || !(ACTOR_ROLES as readonly string[]).includes(role)) return fail("role tag missing or unknown");
  const to = tag(ev, "to");
  if (!to) return fail("to tag missing");
  const occurred = Number(tag(ev, "occurred_at"));
  if (!Number.isInteger(occurred) || occurred < 0) return fail("occurred_at must be unix seconds");
  const prior = tag(ev, "prior") ?? null;
  if (prior !== null && !HEX64.test(prior)) return fail("prior must be a 64-hex event id");
  const pTag = ev.tags.find((t) => t[0] === "p");
  const actor = pTag?.[1] ?? null;
  if (actor !== null && !HEX64.test(actor)) return fail("p tag must be a 64-hex pubkey");
  if (action === "tally_confirmed") {
    for (const name of ["signed_text", "signature", "signer_account", "result_hash", "chain"]) {
      if (!tag(ev, name)) return fail(`tally_confirmed requires ${name}`);
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(tag(ev, "signer_account")!)) return fail("signer_account must be an address");
  }
  return { ok: true, value: {
    object: objects[0][1], proposal: heads[0][1], action: action as ActionName, from: tag(ev, "from") ?? null, to,
    role: role as ActorRole, actor, prior, occurredAt: occurred, content: ev.content, tags: ev.tags,
  } };
}

export function safeParseTask(ev: DecisionEventLike): ShapeResult {
  if (ev.kind !== VORHABEN_KINDS.task) return fail("wrong kind");
  if (!/^task:.+$/.test(dTag(ev))) return fail("d must be task:<id>");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "proposal" && HEAD.test(t[1] ?? ""))) return fail("proposal a-tag missing");
  if (!tag(ev, "title")) return fail("title missing");
  if (!(TASK_STATUSES as readonly string[]).includes(tag(ev, "status") ?? "")) return fail("status invalid");
  const reward = ev.tags.find((t) => t[0] === "reward");
  if (!reward || !/^\d+(\.\d+)?$/.test(reward[1] ?? "") || !["EURe", "EURC"].includes(reward[2] ?? "")) return fail("reward invalid");
  return { ok: true };
}

export function safeParseContract(ev: DecisionEventLike): ShapeResult {
  if (ev.kind !== VORHABEN_KINDS.contract) return fail("wrong kind");
  if (!/^contract:.+$/.test(dTag(ev))) return fail("d must be contract:<proposal uuid>");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "proposal" && HEAD.test(t[1] ?? ""))) return fail("proposal a-tag missing");
  const bps = Number(tag(ev, "fee_bps"));
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) return fail("fee_bps invalid");
  if (!/^0x[0-9a-fA-F]{40}$/.test(tag(ev, "platform_safe") ?? "")) return fail("platform_safe invalid");
  return { ok: true };
}

export function safeParsePayoutLine(ev: DecisionEventLike): ShapeResult {
  if (ev.kind !== VORHABEN_KINDS.payoutLine) return fail("wrong kind");
  if (!/^payout:.+$/.test(dTag(ev))) return fail("d must be payout:<line id>");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "contract" && ADDRESS.test(t[1] ?? ""))) return fail("contract a-tag missing");
  if (!ev.tags.some((t) => t[0] === "a" && t[3] === "for" && ADDRESS.test(t[1] ?? ""))) return fail("for a-tag missing");
  if (!(LINE_ROLES as readonly string[]).includes(tag(ev, "role") ?? "")) return fail("role invalid");
  const amount = ev.tags.find((t) => t[0] === "amount");
  if (!amount || !/^\d+(\.\d+)?$/.test(amount[1] ?? "") || !["EURe", "EURC", "MUENZEN", "XDAI"].includes(amount[2] ?? "")) return fail("amount invalid");
  if (!(PUBLISHED_LINE_STATUSES as readonly string[]).includes(tag(ev, "status") ?? "")) return fail("status invalid");
  return { ok: true };
}

/** Every action's `prior` must name an earlier action on the same object; the first per object has none. */
export function validateActionChain(events: Array<DecisionEventLike & { id: string }>): { ok: true } | { ok: false; object: string; error: string } {
  const byObject = new Map<string, Array<{ id: string; prior: string | null }>>();
  for (const ev of events) {
    const parsed = safeParseAction(ev);
    if (!parsed.ok) return { ok: false, object: "?", error: parsed.error };
    const list = byObject.get(parsed.value.object) ?? [];
    list.push({ id: ev.id, prior: parsed.value.prior });
    byObject.set(parsed.value.object, list);
  }
  for (const [object, list] of byObject) {
    const ids = new Set(list.map((e) => e.id));
    const roots = list.filter((e) => e.prior === null);
    if (roots.length !== 1) return { ok: false, object, error: `expected one first action, found ${roots.length}` };
    for (const e of list) if (e.prior !== null && !ids.has(e.prior)) return { ok: false, object, error: `prior ${e.prior} missing` };
    const children = new Map<string, number>();
    for (const e of list) if (e.prior) children.set(e.prior, (children.get(e.prior) ?? 0) + 1);
    if ([...children.values()].some((n) => n > 1)) return { ok: false, object, error: "chain forks" };
  }
  return { ok: true };
}
