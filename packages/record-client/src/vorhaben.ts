/**
 * NSP-13 Vorhaben readers: tasks (32108), payout lines (32111) and the action
 * log (2101), each looked up by the `a` address they hang off. Pure readers
 * over `RecordClient`, pinned to `packages/publisher/src/vorhaben.ts`.
 */

import type { RecordClient, RecordEvent } from "./client";
import { dSuffix, tagValue } from "./tags";

const KIND_ACTION = 2101;
const KIND_TASK = 32108;
const KIND_PAYOUT_LINE = 32111;
const FETCH_LIMIT = 200;

export interface VorhabenTaskRow {
  id: string;
  proposal_address: string;
  title: string;
  description: string;
  status: string;
  reward_amount: string;
  reward_asset: string;
  deadline: string | null;
  criteria: { id: string; text: string }[];
  assignee_pubkey: string | null;
}

export interface VorhabenLineRow {
  id: string;
  role: string;
  amount: string;
  asset: string;
  rail: string;
  status: string;
  recipient_pubkey: string | null;
  recipient_label: string | null;
  tx: string | null;
  for_address: string;
}

export interface VorhabenActionRow {
  id: string;
  action: string;
  from: string | null;
  to: string;
  role: string;
  /** Who signed the event: the town key, or the person themself. */
  pubkey: string;
  /** "person-claimed" is a marker check, not authorization (see actionTrustLevel). */
  trust: "town" | "person-claimed";
  /** Town-signed: the p tag marked with the role. Person-signed: the signer (never a p tag the signer chose). */
  actor_pubkey: string | null;
  prior: string | null;
  seq: number;
  occurred_at: string;
  content: string;
  tags: string[][];
}

const tagWithMarker = (ev: RecordEvent, name: string, marker: string): string[] | undefined =>
  ev.tags.find((t) => t[0] === name && t[3] === marker);

const unixToIso = (v: string | null): string | null => {
  if (v === null || !/^\d+$/.test(v)) return null;
  return new Date(Number(v) * 1000).toISOString();
};

function toTask(ev: RecordEvent): VorhabenTaskRow | null {
  const id = dSuffix(ev, "task");
  const title = tagValue(ev, "title");
  const status = tagValue(ev, "status");
  const reward = ev.tags.find((t) => t[0] === "reward");
  const proposal = tagWithMarker(ev, "a", "proposal")?.[1];
  if (!id || !title || !status || !reward?.[1] || !reward[2] || !proposal) return null;
  return {
    id,
    proposal_address: proposal,
    title,
    description: ev.content,
    status,
    reward_amount: reward[1],
    reward_asset: reward[2],
    deadline: unixToIso(tagValue(ev, "deadline")),
    criteria: ev.tags.filter((t) => t[0] === "criterion" && t[1] && t[2]).map((t) => ({ id: t[1], text: t[2] })),
    assignee_pubkey: tagWithMarker(ev, "p", "assignee")?.[1] ?? null,
  };
}

function toLine(ev: RecordEvent): VorhabenLineRow | null {
  const id = dSuffix(ev, "payout");
  const role = tagValue(ev, "role");
  const amount = ev.tags.find((t) => t[0] === "amount");
  const rail = tagValue(ev, "rail");
  const status = tagValue(ev, "status");
  const forAddress = tagWithMarker(ev, "a", "for")?.[1];
  if (!id || !role || !amount?.[1] || !amount[2] || !rail || !status || !forAddress) return null;
  return {
    id,
    role,
    amount: amount[1],
    asset: amount[2],
    rail,
    status,
    recipient_pubkey: tagWithMarker(ev, "p", "recipient")?.[1] ?? null,
    recipient_label: tagValue(ev, "recipient_label"),
    tx: tagValue(ev, "tx"),
    for_address: forAddress,
  };
}

function toAction(ev: RecordEvent, townPubkey: string): VorhabenActionRow | null {
  const action = tagValue(ev, "action");
  const to = tagValue(ev, "to");
  const role = tagValue(ev, "role");
  if (!action || !to || !role) return null;
  const level = actionTrustLevel(ev, townPubkey);
  if (level === "untrusted") return null;
  return {
    id: ev.id,
    action,
    from: tagValue(ev, "from"),
    to,
    role,
    pubkey: ev.pubkey,
    trust: level,
    actor_pubkey: level === "town" ? ev.tags.find((t) => t[0] === "p" && t[3] === role)?.[1] ?? null : ev.pubkey,
    prior: tagValue(ev, "prior"),
    seq: /^[1-9]\d*$/.test(tagValue(ev, "seq") ?? "") ? Number(tagValue(ev, "seq")) : 0,
    occurred_at: unixToIso(tagValue(ev, "occurred_at")) ?? new Date(ev.created_at * 1000).toISOString(),
    content: ev.content,
    tags: ev.tags,
  };
}

/**
 * Order one object's actions by `seq`; ties fall back to `prior` chain depth, then occurred_at, then id
 * (same rule as the protocol's replay). A missing/invalid `seq` sorts first.
 */
function chainOrder(rows: VorhabenActionRow[]): VorhabenActionRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depth = (r: VorhabenActionRow): number => {
    let d = 0;
    let cur = r;
    const seen = new Set<string>();
    while (cur.prior && byId.has(cur.prior) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.prior)!;
      d++;
    }
    return d;
  };
  const depths = new Map(rows.map((r) => [r.id, depth(r)]));
  return [...rows].sort(
    (a, b) =>
      a.seq - b.seq ||
      depths.get(a.id)! - depths.get(b.id)! ||
      (a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

const nonNull = <T>(v: T | null): v is T => v !== null;

/**
 * The town key is the only trusted signer of the Vorhaben record: anyone can
 * publish an event carrying the town's `a` tags, so every reader asks for
 * `authors: [townPubkey]` and re-checks the pubkey on what comes back.
 */
const byTown = (townPubkey: string) => (ev: RecordEvent) => ev.pubkey === townPubkey;

/** Tasks of a proposal, by the head address, signed by the town key. */
export async function listTasks(client: RecordClient, proposalAddress: string, townPubkey: string): Promise<VorhabenTaskRow[]> {
  const events = await client.events({ kinds: [KIND_TASK], authors: [townPubkey], a: [proposalAddress], limit: FETCH_LIMIT });
  return events.filter(byTown(townPubkey)).map(toTask).filter(nonNull);
}

/** Payout lines of a contract, by the contract address, signed by the town key. */
export async function getContractLines(client: RecordClient, contractAddress: string, townPubkey: string): Promise<VorhabenLineRow[]> {
  const events = await client.events({ kinds: [KIND_PAYOUT_LINE], authors: [townPubkey], a: [contractAddress], limit: FETCH_LIMIT });
  return events.filter(byTown(townPubkey)).map(toLine).filter(nonNull);
}

/** Which `p`-tag marker roles may sign each person-signable action; every other action is town-only. Mirrors @netizen-labs/protocol PERSON_ACTION_ROLES (parity-tested). */
const PERSON_ACTION_ROLES: Readonly<Record<string, readonly string[]>> = {
  task_started: ["assignee"], proof_added: ["assignee"], task_submitted: ["assignee"],
  task_assigned: ["proposer", "attester"], task_cancelled: ["proposer", "attester"],
  task_approved: ["attester"], changes_requested: ["attester"],
  tally_confirmed: ["wahlhelfer"],
  task_created: ["proposer", "attester"],
};

export type ActionTrustLevel = "town" | "person-claimed" | "untrusted";

/**
 * How far a kind-2101 action can be trusted from its shape alone. "town": signed by the town key.
 * "person-claimed": a person-signable action with exactly ONE p tag marked with a role allowed for that action; that
 * tag names the event's own pubkey, its marker equals the `role` tag, and the signer's p tag comes first (a second
 * role-marked p tag is a forged co-claim → untrusted). Mirrors @netizen-labs/protocol isTrustedAction (parity-tested).
 * This is a MARKER check, NOT authorization: anyone can claim a role. UIs should show it as
 * a claim; a third-party client must still verify the signer really holds the role (assignee per the task's
 * state event, attester via AttesterNFT, ...).
 */
export function actionTrustLevel(ev: RecordEvent, townPubkey: string): ActionTrustLevel {
  if (ev.kind !== KIND_ACTION) return "untrusted";
  if (ev.pubkey === townPubkey) return "town";
  const action = tagValue(ev, "action");
  if (!action || !Object.prototype.hasOwnProperty.call(PERSON_ACTION_ROLES, action)) return "untrusted";
  const allowed = PERSON_ACTION_ROLES[action];
  const role = tagValue(ev, "role");
  const pTags = ev.tags.filter((t) => t[0] === "p");
  const marked = pTags.filter((t) => allowed.includes(t[3] ?? ""));
  return marked.length === 1 && marked[0][1] === ev.pubkey && marked[0][3] === role && pTags[0][1] === ev.pubkey
    ? "person-claimed"
    : "untrusted";
}

/**
 * The action log of one object (task, line, head, poll), ordered by `seq` (then prior depth, occurred_at, id).
 * Keeps town-signed actions and person-signed ones that pass the marker rule (see `actionTrustLevel`). That is
 * NOT authorization: a third-party client must additionally verify the person's real role (e.g. the assignee
 * named by the task's state event, an attester via AttesterNFT) before acting on a person-claimed action.
 * The `a` filter also matches actions that merely name this address as their proposal head, so only events
 * whose `object`-marked `a` equals it are kept.
 */
export async function getActions(client: RecordClient, objectAddress: string, townPubkey: string): Promise<VorhabenActionRow[]> {
  const events = await client.events({ kinds: [KIND_ACTION], a: [objectAddress], limit: FETCH_LIMIT });
  const own = events.filter((ev) => tagWithMarker(ev, "a", "object")?.[1] === objectAddress);
  return chainOrder(own.map((ev) => toAction(ev, townPubkey)).filter(nonNull));
}
