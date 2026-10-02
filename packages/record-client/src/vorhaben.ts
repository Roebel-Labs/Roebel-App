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
  actor_pubkey: string | null;
  prior: string | null;
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

function toAction(ev: RecordEvent): VorhabenActionRow | null {
  const action = tagValue(ev, "action");
  const to = tagValue(ev, "to");
  const role = tagValue(ev, "role");
  if (!action || !to || !role) return null;
  return {
    id: ev.id,
    action,
    from: tagValue(ev, "from"),
    to,
    role,
    actor_pubkey: ev.tags.find((t) => t[0] === "p" && t[3] === role)?.[1] ?? null,
    prior: tagValue(ev, "prior"),
    occurred_at: unixToIso(tagValue(ev, "occurred_at")) ?? new Date(ev.created_at * 1000).toISOString(),
    content: ev.content,
    tags: ev.tags,
  };
}

/**
 * Order a hash-linked chain: an action follows the action named by its `prior`.
 * Rows whose prior is absent from the set (chain start, or a gap) are roots; roots
 * and siblings are ordered by (occurred_at, id) so the result is deterministic.
 */
function chainOrder(rows: VorhabenActionRow[]): VorhabenActionRow[] {
  const byTime = (a: VorhabenActionRow, b: VorhabenActionRow) =>
    a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<string, VorhabenActionRow[]>();
  const roots: VorhabenActionRow[] = [];
  for (const r of rows) {
    if (r.prior && ids.has(r.prior) && r.prior !== r.id) {
      const list = children.get(r.prior) ?? [];
      list.push(r);
      children.set(r.prior, list);
    } else roots.push(r);
  }
  const out: VorhabenActionRow[] = [];
  const seen = new Set<string>();
  const visit = (r: VorhabenActionRow) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
    for (const c of (children.get(r.id) ?? []).sort(byTime)) visit(c);
  };
  for (const r of roots.sort(byTime)) visit(r);
  // Pure cycles have no root; append whatever is left deterministically.
  for (const r of [...rows].sort(byTime)) visit(r);
  return out;
}

const nonNull = <T>(v: T | null): v is T => v !== null;

/** Tasks of a proposal, by the head address. */
export async function listTasks(client: RecordClient, proposalAddress: string): Promise<VorhabenTaskRow[]> {
  const events = await client.events({ kinds: [KIND_TASK], a: [proposalAddress], limit: FETCH_LIMIT });
  return events.map(toTask).filter(nonNull);
}

/** Payout lines of a contract, by the contract address. */
export async function getContractLines(client: RecordClient, contractAddress: string): Promise<VorhabenLineRow[]> {
  const events = await client.events({ kinds: [KIND_PAYOUT_LINE], a: [contractAddress], limit: FETCH_LIMIT });
  return events.map(toLine).filter(nonNull);
}

/** The action log of one object (task, line, head, poll), in `prior` chain order. */
export async function getActions(client: RecordClient, objectAddress: string): Promise<VorhabenActionRow[]> {
  const events = await client.events({ kinds: [KIND_ACTION], a: [objectAddress], limit: FETCH_LIMIT });
  return chainOrder(events.map(toAction).filter(nonNull));
}
