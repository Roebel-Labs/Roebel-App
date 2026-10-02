import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrustedAction, PERSON_ACTION_ROLES } from "@netizen-labs/protocol";
import { actionToSpec, payoutLineToSpec, taskToSpec, type OutboxRow } from "@netizen-labs/publisher";
import { actionTrustLevel, getActions, getContractLines, listTasks } from "../src/vorhaben";
import { asRecordEvent, filteringClient } from "./helpers";

const town = "a".repeat(64);
const proposalKey = "b".repeat(64);
// Addresses per NSP-13 (protocol is not a record-client dependency).
const headAddress = (pk: string, key: string) => `32100:${pk}:proposal:${key}`;
const taskAddress = (pk: string, id: string) => `32108:${pk}:task:${id}`;
const contractAddress = (pk: string, id: string) => `32110:${pk}:contract:${id}`;
const uuid = "11111111-1111-1111-1111-111111111111";

test("listTasks: criteria in order, assignee pubkey, only this proposal", async () => {
  const mk = (id: string, key: string, assignee: string | null) =>
    asRecordEvent(taskToSpec({
      id, title: `T ${id}`, status: "offen", reward_amount: "5.000000000000000000", reward_asset: "EURe",
      description: "Beschreibung", updated_at: "2026-10-01T10:00:00Z",
      acceptance_criteria: [{ id: "c1", text: "Eins" }, { id: "c2", text: "Zwei" }],
    }, key, town, assignee, null)!, town);
  // A foreign author copying the town's tags must be ignored (trusted signer = town key).
  const forged = { ...mk("t9", proposalKey, null), pubkey: "9".repeat(64) };
  const events = [mk("t1", proposalKey, "c".repeat(64)), mk("t2", "d".repeat(64), null), forged];
  const tasks = await listTasks(filteringClient(events), headAddress(town, proposalKey), town);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "t1");
  assert.equal(tasks[0].reward_amount, "5");
  assert.equal(tasks[0].reward_asset, "EURe");
  assert.equal(tasks[0].description, "Beschreibung");
  assert.deepEqual(tasks[0].criteria, [{ id: "c1", text: "Eins" }, { id: "c2", text: "Zwei" }]);
  assert.equal(tasks[0].assignee_pubkey, "c".repeat(64));
});

test("getContractLines: wahlhelfer without label, empfaenger with label", async () => {
  const base = { proposal_id: uuid, asset: "EURe", rail: "safe", status: "geplant", updated_at: "2026-10-01T10:00:00Z" };
  const w = payoutLineToSpec({ ...base, id: "l1", role: "wahlhelfer", amount: "2", reference_type: "wahlhelfer", reference_id: "x" }, proposalKey, town, "e".repeat(64))!;
  const e = payoutLineToSpec({ ...base, id: "l2", role: "empfaenger", amount: "3", reference_type: "task", reference_id: "t1", recipient_label: "Verein X" }, proposalKey, town, null)!;
  const forged = asRecordEvent(payoutLineToSpec({ ...base, id: "l9", role: "empfaenger", amount: "999", reference_type: "task", reference_id: "t1" }, proposalKey, town, null)!, "9".repeat(64));
  const lines = await getContractLines(filteringClient([asRecordEvent(w, town), asRecordEvent(e, town), forged]), contractAddress(town, uuid), town);
  assert.equal(lines.length, 2);
  const lw = lines.find((l) => l.id === "l1")!;
  assert.equal(lw.recipient_label, null);
  assert.equal(lw.recipient_pubkey, "e".repeat(64));
  assert.equal(lw.for_address.startsWith("32104:"), true);
  const le = lines.find((l) => l.id === "l2")!;
  assert.equal(le.recipient_label, "Verein X");
  assert.equal(le.for_address, taskAddress(town, "t1"));
});

test("getActions: prior chain order for shuffled input, d-less 2101s survive", async () => {
  const row = (action: string, from: string | null, to: string, at: string): OutboxRow => ({
    id: 1, object_type: "task", object_id: "t1", proposal_id: proposalKey, action, from_status: from, to_status: to,
    actor_wallet: null, actor_role: "creator", body: null, extra: {}, occurred_at: at, signed_event: null,
    event_id: null, published_at: null, attempts: 0, seq: SEQ[action],
  });
  const SEQ: Record<string, number> = { task_created: 1, task_assigned: 2, task_started: 3 };
  const ctx = (prior: string | null) => ({ townPubkey: town, proposalKey, actorPubkey: "c".repeat(64), prior, now: 1_800_000_000 });
  const ids = ["1", "2", "3"].map((n) => n.repeat(64));
  // occurred_at deliberately disagrees with the chain order for #2 vs #3.
  const specs = [
    actionToSpec(row("task_created", null, "offen", "2026-10-01T10:00:00Z"), ctx(null))!,
    actionToSpec(row("task_assigned", "offen", "zugewiesen", "2026-10-01T12:00:00Z"), ctx(ids[0]))!,
    actionToSpec(row("task_started", "zugewiesen", "in_arbeit", "2026-10-01T11:00:00Z"), ctx(ids[1]))!,
  ];
  const events = specs.map((s, i) => ({ ...asRecordEvent(s, town), id: ids[i] }));
  const shuffled = [events[2], events[0], events[1]];
  const out = await getActions(filteringClient(shuffled), taskAddress(town, "t1"), town);
  assert.deepEqual(out.map((a) => a.id), ids);
  assert.equal(out[0].prior, null);
  assert.equal(out[1].prior, ids[0]);
  assert.equal(out[0].actor_pubkey, "c".repeat(64));
  assert.equal(out[0].to, "offen");
});

test("getActions: only the town's events about THIS object (foreign author and same-head siblings excluded)", async () => {
  const row = (objectId: string): OutboxRow => ({
    id: 1, object_type: "task", object_id: objectId, proposal_id: proposalKey, action: "task_created", from_status: null, to_status: "offen",
    actor_wallet: null, actor_role: "creator", body: null, extra: {}, occurred_at: "2026-10-01T10:00:00Z", signed_event: null,
    event_id: null, published_at: null, attempts: 0, seq: 1,
  });
  const ctx = { townPubkey: town, proposalKey, actorPubkey: null, prior: null, now: 1_800_000_000 };
  const mine = { ...asRecordEvent(actionToSpec(row("t1"), ctx)!, town), id: "1".repeat(64) };
  // Another task under the same head: a query on the head-address would match it too.
  const sibling = { ...asRecordEvent(actionToSpec(row("t2"), ctx)!, town), id: "2".repeat(64) };
  const forged = { ...asRecordEvent(actionToSpec(row("t1"), ctx)!, "9".repeat(64)), id: "3".repeat(64) };
  const out = await getActions(filteringClient([mine, sibling, forged]), taskAddress(town, "t1"), town);
  assert.deepEqual(out.map((a) => a.id), [mine.id]);
  // Asking by the head address returns nothing: the head is the proposal marker, not the object.
  assert.deepEqual(await getActions(filteringClient([mine, sibling]), headAddress(town, proposalKey), town), []);
});

test("getActions: person-signed actions by trust rule; forged role claims dropped; ordered by seq", async () => {
  const person = "c".repeat(64);
  const obj = taskAddress(town, "t1");
  const head = headAddress(town, proposalKey);
  const mk = (id: string, pubkey: string, action: string, role: string, pRole: string | null, seq: number, prior: string | null = null) => ({
    id: id.repeat(64), pubkey, kind: 2101, created_at: 1_800_000_000, content: "", sig: "0".repeat(128), node_id: "roebel", source: "test",
    tags: [
      ["a", obj, "", "object"], ["a", head, "", "proposal"], ["action", action], ["to", "x"], ["role", role], ["seq", String(seq)],
      ...(prior ? [["prior", prior]] : []),
      ...(pRole ? [["p", pubkey, "", pRole]] : []),
    ],
  });
  const t = mk("1", town, "task_created", "creator", null, 1);
  const ok = mk("2", person, "task_started", "assignee", "assignee", 3);
  const earlier = mk("3", person, "task_assigned", "attester", "attester", 2);
  const wrongRole = mk("4", person, "task_approved", "assignee", "assignee", 4);
  const townOnly = mk("5", person, "payout_confirmed", "attester", "attester", 5);
  const noP = mk("6", person, "task_started", "assignee", null, 6);
  const out = await getActions(filteringClient([ok, wrongRole, townOnly, noP, earlier, t]), obj, town);
  assert.deepEqual(out.map((a) => a.id[0]), ["1", "3", "2"]);
  assert.equal(actionTrustLevel(t, town), "town");
  assert.equal(actionTrustLevel(ok, town), "person-claimed");
  for (const bad of [wrongRole, townOnly, noP]) assert.equal(actionTrustLevel(bad, town), "untrusted");
});

test("actionTrustLevel: parity with protocol isTrustedAction over every action/role combination", () => {
  const person = "c".repeat(64);
  const actions = [...Object.keys(PERSON_ACTION_ROLES), "payout_confirmed", "stage_changed", "bogus", "toString", "__proto__"];
  const roles = ["assignee", "proposer", "attester", "wahlhelfer", "creator", "town"];
  for (const action of actions) for (const role of roles) for (const pRole of [...roles, null]) for (const signer of [person, town]) for (const kind of [2101, 1]) {
    const tags = [["action", action], ["role", role], ...(pRole ? [["p", person, "", pRole]] : [])];
    const ev = { id: "0".repeat(64), pubkey: signer, kind, created_at: 1, content: "", tags, sig: "", node_id: "n", source: "t" };
    assert.equal(actionTrustLevel(ev, town) !== "untrusted", isTrustedAction(ev, town), `${action}/${role}/${pRole}/${kind}`);
  }
});
