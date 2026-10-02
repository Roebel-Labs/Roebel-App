// NSP-13 "Vorhaben" record: the post-vote lifecycle of a proposal on Nostr.
// Spec: docs/superpowers/specs/2026-10-02-nsp13-vorhaben-record-design.md
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
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
  role: ActorRole; actor: string | null; seq: number; prior: string | null; occurredAt: number; content: string; tags: string[][];
}

export function safeParseAction(ev: DecisionEventLike): { ok: true; value: ParsedAction } | { ok: false; error: string } {
  if (ev.kind !== VORHABEN_KINDS.action) return fail(`expected kind ${VORHABEN_KINDS.action}, got ${ev.kind}`);
  const objects = ev.tags.filter((t) => t[0] === "a" && t[3] === "object");
  if (objects.length !== 1 || !ADDRESS.test(objects[0][1] ?? "")) return fail("expected exactly one well-formed object a-tag");
  const heads = ev.tags.filter((t) => t[0] === "a" && t[3] === "proposal");
  if (heads.length !== 1 || !HEAD.test(heads[0][1] ?? "")) return fail("expected exactly one proposal head a-tag");
  const action = tag(ev, "action");
  if (!action || !(ACTION_NAMES as readonly string[]).includes(action)) return fail(`unknown action ${action}`);
  const wantKind = action.startsWith("task_") || action === "proof_added" || action === "changes_requested" ? VORHABEN_KINDS.task : action.startsWith("payout_") ? VORHABEN_KINDS.payoutLine
    : action === "tally_confirmed" || action === "meinungsbild_published" ? DECISION_KINDS.meinungsbild
    : action === "stage_changed" ? DECISION_KINDS.head : null;
  if (wantKind !== null && !objects[0][1].startsWith(`${wantKind}:`)) return fail(`object kind must be ${wantKind} for ${action}`);
  const role = tag(ev, "role");
  if (!role || !(ACTOR_ROLES as readonly string[]).includes(role)) return fail("role tag missing or unknown");
  const to = tag(ev, "to");
  if (!to) return fail("to tag missing");
  const occurredRaw = tag(ev, "occurred_at") ?? "";
  if (!/^\d+$/.test(occurredRaw)) return fail("occurred_at must be unix seconds");
  const occurred = Number(occurredRaw);
  const seqRaw = tag(ev, "seq") ?? "";
  if (!/^[1-9]\d*$/.test(seqRaw)) return fail("seq must be a positive integer");
  const seq = Number(seqRaw);
  if (!Number.isSafeInteger(seq)) return fail("seq out of range");
  const prior = tag(ev, "prior") ?? null;
  if (prior !== null && !HEX64.test(prior)) return fail("prior must be a 64-hex event id");
  const pTags = ev.tags.filter((t) => t[0] === "p");
  for (const p of pTags) if (!HEX64.test(p[1] ?? "")) return fail("p tag must be a 64-hex pubkey");
  const actor = pTags[0]?.[1] ?? null;
  if (action === "tally_confirmed") {
    for (const name of ["signed_text", "signature", "signer_account", "result_hash", "chain"]) {
      if (!tag(ev, name)) return fail(`tally_confirmed requires ${name}`);
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(tag(ev, "signer_account")!)) return fail("signer_account must be an address");
    if (!/^0x[0-9a-fA-F]+$/.test(tag(ev, "signature")!)) return fail("signature must be hex");
    if (!/^0x[0-9a-fA-F]{64}$/.test(tag(ev, "result_hash")!)) return fail("result_hash must be 32-byte hex");
    if (!/^\d+$/.test(tag(ev, "chain")!)) return fail("chain must be numeric");
  }
  return { ok: true, value: {
    object: objects[0][1], proposal: heads[0][1], action: action as ActionName, from: tag(ev, "from") ?? null, to,
    role: role as ActorRole, actor, seq, prior, occurredAt: occurred, content: ev.content, tags: ev.tags,
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

/**
 * Per object, `seq` values must form 1..n without gaps or duplicates; where `prior` is present it must name the event
 * with seq-1 (the first action may not carry a prior).
 */
export function validateActionChain(events: Array<DecisionEventLike & { id: string }>): { ok: true } | { ok: false; object: string; error: string } {
  const byObject = new Map<string, Array<{ id: string; seq: number; prior: string | null }>>();
  for (const ev of events) {
    if (!HEX64.test(ev.id)) return { ok: false, object: "?", error: "event id must be 64-hex" };
    const parsed = safeParseAction(ev);
    if (!parsed.ok) return { ok: false, object: "?", error: parsed.error };
    const list = byObject.get(parsed.value.object) ?? [];
    list.push({ id: ev.id, seq: parsed.value.seq, prior: parsed.value.prior });
    byObject.set(parsed.value.object, list);
  }
  for (const [object, list] of byObject) {
    const sorted = [...list].sort((x, y) => x.seq - y.seq);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].seq !== i + 1) return { ok: false, object, error: `seq must run 1..${sorted.length} without gaps or duplicates` };
      const { prior } = sorted[i];
      if (prior === null) continue;
      if (i === 0) return { ok: false, object, error: "first action must not have a prior" };
      if (prior !== sorted[i - 1].id) return { ok: false, object, error: `prior of seq ${sorted[i].seq} must reference seq ${sorted[i].seq - 1}` };
    }
  }
  return { ok: true };
}

/** Which `p`-tag marker roles may sign each person-signable action; every other action is town-only. */
export const PERSON_ACTION_ROLES: Readonly<Record<string, readonly string[]>> = {
  task_started: ["assignee"], proof_added: ["assignee"], task_submitted: ["assignee"],
  task_assigned: ["proposer", "attester"], task_cancelled: ["proposer", "attester"],
  task_approved: ["attester"], changes_requested: ["attester"],
  tally_confirmed: ["wahlhelfer"],
  task_created: ["proposer", "attester"],
};

/**
 * Shape/marker filter for kind-2101 actions. NOT an authorization check: callers (API, indexer, ingester) MUST verify
 * the signer actually holds that role for this object. Town-signed 2101s pass; a person-signed one passes only for a
 * person-signable action that carries exactly ONE p tag marked with a role allowed for that action, that tag names
 * the event's own pubkey, its marker equals the `role` tag, and the signer's p tag is the first p tag. A second
 * role-marked p tag (a forged co-claim) makes the event untrusted. task_assigned may still name the new assignee
 * (marker "assignee", not a signing role for that action) after the signer.
 */
export function isTrustedAction(ev: DecisionEventLike & { pubkey: string }, townPubkey: string): boolean {
  if (ev.kind !== VORHABEN_KINDS.action) return false;
  if (ev.pubkey === townPubkey) return true;
  const action = tag(ev, "action");
  if (!action || !Object.prototype.hasOwnProperty.call(PERSON_ACTION_ROLES, action)) return false;
  const allowed = PERSON_ACTION_ROLES[action];
  const role = tag(ev, "role");
  const pTags = ev.tags.filter((t) => t[0] === "p");
  const marked = pTags.filter((t) => allowed.includes(t[3] ?? ""));
  return marked.length === 1 && marked[0][1] === ev.pubkey && marked[0][3] === role && pTags[0][1] === ev.pubkey;
}

/** sha256 hex of the payload JSON with sorted top-level keys (parity with apps/web org-membership `hashPayload`). */
export function payloadHash(payload: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return Array.from(sha256(new TextEncoder().encode(JSON.stringify(sorted))), (x) => x.toString(16).padStart(2, "0")).join("");
}

export interface ReplayState {
  tasks: Map<string, { status: string; assignee: string | null; history: ActionName[] }>;
  lines: Map<string, { status: string; tx: string | null }>;
  tallyConfirmations: Map<string, { signerAccount: string; signature: string }[]>;
  stages: Map<string, string>;
}

/** Orders one object's actions by `seq`; ties fall back to the `prior` chain position, then occurred_at, then id. */
function orderObjectActions(list: Array<{ id: string; p: ParsedAction }>): Array<{ id: string; p: ParsedAction }> {
  const byId = new Map(list.map((e) => [e.id, e]));
  const depth = (e: { id: string; p: ParsedAction }): number => {
    let d = 0, cur = e;
    const seen = new Set<string>();
    while (cur.p.prior && byId.has(cur.p.prior) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.p.prior)!; d++; }
    return d;
  };
  const depths = new Map(list.map((e) => [e.id, depth(e)]));
  return [...list].sort((a, b) => a.p.seq - b.p.seq || depths.get(a.id)! - depths.get(b.id)! || a.p.occurredAt - b.p.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Rebuilds Vorhaben state from kind-2101 actions; invalid events are skipped. Callers must pre-filter with
 * isTrustedAction AND a real role check (this function trusts every well-formed action it is given).
 */
export function replayVorhaben(actions: Array<DecisionEventLike & { id: string }>): ReplayState {
  const state: ReplayState = { tasks: new Map(), lines: new Map(), tallyConfirmations: new Map(), stages: new Map() };
  const byObject = new Map<string, Array<{ id: string; p: ParsedAction }>>();
  const seenIds = new Set<string>();
  for (const ev of actions) {
    if (seenIds.has(ev.id)) continue;
    seenIds.add(ev.id);
    const parsed = safeParseAction(ev);
    if (!parsed.ok) continue;
    byObject.set(parsed.value.object, [...(byObject.get(parsed.value.object) ?? []), { id: ev.id, p: parsed.value }]);
  }
  for (const [object, list] of byObject) {
    for (const { p } of orderObjectActions(list)) {
      if (object.startsWith(`${VORHABEN_KINDS.task}:`)) {
        const t = state.tasks.get(object) ?? { status: p.to, assignee: null, history: [] };
        t.status = p.to;
        t.history.push(p.action);
        if (p.action === "task_assigned") t.assignee = p.tags.find((x) => x[0] === "p" && x[3] === "assignee")?.[1] ?? t.assignee;
        state.tasks.set(object, t);
      } else if (object.startsWith(`${VORHABEN_KINDS.payoutLine}:`)) {
        const l = state.lines.get(object) ?? { status: p.to, tx: null };
        l.status = p.to;
        if (p.action === "payout_confirmed") l.tx = p.tags.find((x) => x[0] === "tx")?.[1] ?? l.tx;
        state.lines.set(object, l);
      } else if (p.action === "tally_confirmed") {
        const g = (n: string) => p.tags.find((x) => x[0] === n)?.[1] ?? "";
        state.tallyConfirmations.set(object, [...(state.tallyConfirmations.get(object) ?? []), { signerAccount: g("signer_account"), signature: g("signature") }]);
      } else if (p.action === "stage_changed") {
        state.stages.set(p.proposal, p.to);
      }
    }
  }
  return state;
}

export interface VerifyClient {
  readContract(args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }): Promise<unknown>;
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: "success" | "reverted"; logs: Array<{ address: string; topics: string[]; data: string }> } | null>;
}

const bytesToHex = (b: Uint8Array) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** EIP-191 personal_sign hash of `text`. */
export function hashMessage(text: string): `0x${string}` {
  const body = new TextEncoder().encode(text);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix); all.set(body, prefix.length);
  return bytesToHex(keccak_256(all)) as `0x${string}`;
}

const IS_VALID_SIGNATURE_ABI = [{
  type: "function", name: "isValidSignature", stateMutability: "view",
  inputs: [{ name: "hash", type: "bytes32" }, { name: "signature", type: "bytes" }], outputs: [{ type: "bytes4" }],
}] as const;

/**
 * ERC-1271 check of a tally_confirmed action against its signer account. ERC-6492-wrapped (undeployed account) or EOA
 * signatures make this return false; a caller may fall back to a full verifier in that case.
 */
export async function verifyTallyConfirmation(action: ParsedAction, client: VerifyClient): Promise<boolean> {
  const g = (n: string) => action.tags.find((x) => x[0] === n)?.[1];
  const text = g("signed_text"), signature = g("signature"), account = g("signer_account");
  if (action.action !== "tally_confirmed" || !text || !signature || !account) return false;
  try {
    const res = await client.readContract({
      address: account as `0x${string}`, abi: IS_VALID_SIGNATURE_ABI, functionName: "isValidSignature",
      args: [hashMessage(text), signature as `0x${string}`],
    });
    return typeof res === "string" && res.toLowerCase() === "0x1626ba7e";
  } catch { return false; }
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_SINGLE_TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const word = (hex: string, i: number) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);

const padAddr = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/**
 * True when the tx succeeded and `token` emitted a Transfer (ERC-20) or TransferSingle (ERC-1155) of exactly `amountAtto`.
 * Without `opts.to` this does NOT prove the recipient; pass `to` (and `tokenId` for ERC-1155) to bind those too.
 */
export async function verifyPayoutTx(
  txHash: string, token: string, amountAtto: bigint, client: VerifyClient, opts?: { to?: string; tokenId?: bigint },
): Promise<boolean> {
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt || receipt.status !== "success") return false;
    const wantTo = opts?.to ? padAddr(opts.to) : null;
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== token.toLowerCase()) return false;
      const topic0 = log.topics[0]?.toLowerCase();
      if (!/^0x[0-9a-fA-F]*$/.test(log.data)) return false;
      if (topic0 === TRANSFER_TOPIC) {
        if (wantTo && log.topics[2]?.toLowerCase() !== wantTo) return false;
        return log.data.length === 66 && BigInt(log.data) === amountAtto;
      }
      if (topic0 === TRANSFER_SINGLE_TOPIC) {
        // topics: operator, from, to; data = (uint256 id, uint256 value)
        if (wantTo && log.topics[3]?.toLowerCase() !== wantTo) return false;
        if (log.data.length < 2 + 128) return false;
        if (opts?.tokenId !== undefined && BigInt("0x" + word(log.data, 0)) !== opts.tokenId) return false;
        return BigInt("0x" + word(log.data, 1)) === amountAtto;
      }
      return false;
    });
  } catch { return false; }
}
