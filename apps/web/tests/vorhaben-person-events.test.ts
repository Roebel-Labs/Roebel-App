import assert from "node:assert/strict";
import { test } from "node:test";
import { getPublicKeyHex, signEvent, type NostrEvent } from "@netizen-labs/nostr";
import { headAddress, payloadHash, pollAddress, taskAddress } from "@netizen-labs/protocol";
import {
  handlePersonEvent, parseObjectAddress, type OutboxMatch, type PersonEventDeps, type PersonTaskInfo,
} from "../src/lib/vorhaben/person-events";

const NOW = 2_000_000_000;
const TOWN = "f".repeat(64);
const sk = (b: number) => new Uint8Array(32).fill(b);
const ASSIGNEE_SK = sk(1), ATTESTER_SK = sk(2), PROPOSER_SK = sk(3), STRANGER_SK = sk(4);
const ASSIGNEE = "0x" + "1".repeat(40), ATTESTER = "0x" + "2".repeat(40), PROPOSER = "0x" + "3".repeat(40);
const T_ID = "22222222-2222-4222-8222-222222222222";
const NEW_T_ID = "44444444-4444-4444-8444-444444444444";
const P_ID = "11111111-1111-4111-8111-111111111111";
const P_KEY = "0xkey";
const SIG = "0x" + "ab".repeat(65);

const pk = (s: Uint8Array) => getPublicKeyHex(s);
const BOUND = new Map<string, string>([[pk(ASSIGNEE_SK), ASSIGNEE], [pk(ATTESTER_SK), ATTESTER], [pk(PROPOSER_SK), PROPOSER]]);

interface EvOpts {
  action: string; role: string; from?: string | null; to: string; seq?: number; content: string;
  payload: Record<string, unknown>; object?: string; extraTags?: string[][]; roleMarker?: string;
}
function makeEvent(s: Uint8Array, o: EvOpts): NostrEvent {
  const tags: string[][] = [
    ["a", o.object ?? taskAddress(TOWN, T_ID), "", "object"],
    ["a", headAddress(TOWN, P_KEY), "", "proposal"],
    ["action", o.action],
  ];
  if (o.from) tags.push(["from", o.from]);
  tags.push(["to", o.to], ["p", pk(s), "", o.roleMarker ?? o.role], ["role", o.role], ["seq", String(o.seq ?? 3)],
    ["occurred_at", String(NOW)], ["payload_hash", payloadHash(o.payload)], ...(o.extraTags ?? []));
  return signEvent({ pubkey: pk(s), created_at: NOW, kind: 2101, tags, content: o.content }, s);
}

function harness(over: Partial<PersonEventDeps> & { task?: Partial<PersonTaskInfo>; next?: number; row?: Partial<OutboxMatch> | null } = {}) {
  const calls = { actions: [] as Array<[string, string, Record<string, unknown>]>, attached: [] as Array<[number, number, string]>, logs: [] as string[], tally: 0 };
  const task: PersonTaskInfo = { proposalUuid: P_ID, proposalKey: P_KEY, proposer: PROPOSER, status: "eingereicht", assignee: ASSIGNEE, ...over.task };
  const deps: PersonEventDeps = {
    townPubkey: TOWN,
    nowSec: () => NOW,
    walletForPubkey: async (p) => BOUND.get(p) ?? null,
    pubkeyForWallet: async (w) => [...BOUND].find(([, x]) => x === w)?.[0] ?? null,
    getTask: async (id) => (id === T_ID ? task : null),
    getProposal: async (id) => (id === P_ID ? { proposalKey: P_KEY, proposer: PROPOSER } : null),
    isAttester: async (w) => w === ATTESTER,
    nextSeq: async () => over.next ?? 3,
    runTaskAction: async (w, a, p) => { calls.actions.push([w, a, p]); return { ok: true, data: { status: "abgenommen" } }; },
    runTallyConfirm: async () => { calls.tally++; return { ok: true, lineIds: ["l1"] }; },
    findOutboxRow: async () => (over.row === null ? null : {
      id: 77, seq: 3, actorWallet: ATTESTER, actorRole: "attester", fromStatus: "eingereicht", toStatus: "abgenommen", extra: {}, ...over.row,
    }),
    attachEvent: async (id, seq, ev) => { calls.attached.push([id, seq, ev.id]); return true; },
    log: (m) => calls.logs.push(m),
    ...over,
  };
  return { deps, calls };
}

const approvePayload = { taskId: T_ID };
const approveEvent = (over: Partial<EvOpts> = {}, s = ATTESTER_SK) => makeEvent(s, {
  action: "task_approved", role: "attester", from: "eingereicht", to: "abgenommen", content: "Aufgabe abgenommen.", payload: approvePayload, ...over,
});

test("happy path: rules run with the bound wallet, event attached to the trigger's outbox row", async () => {
  const { deps, calls } = harness();
  const event = approveEvent();
  const r = await handlePersonEvent(deps, { event, action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data, { status: "abgenommen", eventId: event.id, personSigned: true });
  assert.deepEqual(calls.actions, [[ATTESTER, "task_approve", approvePayload]]);
  assert.deepEqual(calls.attached, [[77, 3, event.id]]);
});

test("wrong payload hash → 400, rules never run", async () => {
  const { deps, calls } = harness();
  const event = approveEvent({ payload: { taskId: T_ID, extra: 1 } });
  const r = await handlePersonEvent(deps, { event, action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 400); assert.equal(r.code, "PAYLOAD_MISMATCH"); }
  assert.equal(calls.actions.length, 0);
});

test("unbound pubkey → 401", async () => {
  const { deps, calls } = harness();
  const r = await handlePersonEvent(deps, { event: approveEvent({}, STRANGER_SK), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 401); assert.equal(r.code, "NOT_BOUND"); }
  assert.equal(calls.actions.length, 0);
});

test("revoked binding → 401 (walletForPubkey only returns live bindings)", async () => {
  const { deps } = harness({ walletForPubkey: async () => null });
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
});

test("bad schnorr signature → 401", async () => {
  const { deps } = harness();
  const event = { ...approveEvent(), sig: "00".repeat(64) };
  const r = await handlePersonEvent(deps, { event, action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 401); assert.equal(r.code, "BAD_EVENT_SIGNATURE"); }
});

test("seq mismatch → 409 SEQ_CONFLICT with the current next seq", async () => {
  const { deps, calls } = harness({ next: 4 });
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 409); assert.equal(r.code, "SEQ_CONFLICT"); assert.equal(r.next, 4); }
  assert.equal(calls.actions.length, 0);
});

test("assignee approving (role assignee) → 403", async () => {
  const { deps, calls } = harness();
  const event = approveEvent({ role: "assignee" }, ASSIGNEE_SK);
  const r = await handlePersonEvent(deps, { event, action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
  assert.equal(calls.actions.length, 0);
});

test("assignee claiming the attester role → 403 (real role check)", async () => {
  const { deps, calls } = harness();
  const r = await handlePersonEvent(deps, { event: approveEvent({}, ASSIGNEE_SK), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 403); assert.equal(r.code, "FORBIDDEN"); }
  assert.equal(calls.actions.length, 0);
});

test("self-p marker role inconsistent with the role tag → 403", async () => {
  const { deps, calls } = harness();
  const event = approveEvent({ roleMarker: "proposer" });
  const r = await handlePersonEvent(deps, { event, action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
  assert.equal(calls.actions.length, 0);
});

test("cancel by the proposer must carry role proposer, not attester", async () => {
  const { deps } = harness();
  const payload = { taskId: T_ID, body: "Nicht mehr nötig" };
  const event = makeEvent(PROPOSER_SK, { action: "task_cancelled", role: "attester", from: "eingereicht", to: "abgebrochen", content: "Nicht mehr nötig", payload });
  const r = await handlePersonEvent(deps, { event, action: "task_cancel", payload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 403); assert.equal(r.code, "ROLE_MISMATCH"); }
});

test("rules reject → their error is returned and nothing is attached", async () => {
  const { deps, calls } = harness({
    runTaskAction: async () => ({ ok: false, status: 409, code: "BAD_STATUS", message: "Die Aufgabe wartet nicht auf Abnahme." }),
  });
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 409); assert.equal(r.code, "BAD_STATUS"); }
  assert.equal(calls.attached.length, 0);
});

test("seq race: the trigger's row got another seq → action ok, personSigned false, row stays town-signed", async () => {
  const { deps, calls } = harness({ row: { seq: 4 } });
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.personSigned, false);
  assert.equal(calls.actions.length, 1);
  assert.equal(calls.attached.length, 0);
  assert.ok(calls.logs.some((l) => l.includes("ALARM")));
});

test("conditional attach lost (publisher signed first) → ok with personSigned false", async () => {
  const { deps } = harness({ attachEvent: async () => false });
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.personSigned, false);
});

test("applications are not person-signable → 400", async () => {
  const { deps } = harness();
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_apply", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 400); assert.equal(r.code, "NOT_PERSON_SIGNABLE"); }
});

test("missing VORHABEN_TOWN_PUBKEY → 503", async () => {
  const { deps } = harness({ townPubkey: undefined });
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 503); assert.equal(r.code, "FEATURE_OFF"); }
});

test("object of another task → 400", async () => {
  const { deps } = harness();
  const event = approveEvent({ object: taskAddress(TOWN, NEW_T_ID) });
  const r = await handlePersonEvent(deps, { event, action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "OBJECT_MISMATCH");
});

test("free text in a non-reason action → 400", async () => {
  const { deps } = harness();
  const r = await handlePersonEvent(deps, { event: approveEvent({ content: "Super gemacht, Erika!" }), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "CONTENT_NOT_ALLOWED");
});

test("stale from (task moved on) → 409 STATE_MISMATCH", async () => {
  const { deps } = harness({ task: { status: "in_arbeit" } });
  const r = await handlePersonEvent(deps, { event: approveEvent(), action: "task_approve", payload: approvePayload });
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 409); assert.equal(r.code, "STATE_MISMATCH"); }
});

test("task_create needs a client-chosen task id and seq 1", async () => {
  const payload = { proposalId: P_ID, taskId: NEW_T_ID, title: "Plakate", criteria: ["hängt"], rewardAmount: "5", rewardAsset: "EURe" };
  const { deps, calls } = harness({
    next: 1,
    row: { seq: 1, actorWallet: PROPOSER, actorRole: "proposer", fromStatus: null, toStatus: "offen" },
    runTaskAction: async (w, a, p) => { calls.actions.push([w, a, p]); return { ok: true, data: { id: NEW_T_ID, status: "offen" } }; },
  });
  const event = makeEvent(PROPOSER_SK, {
    action: "task_created", role: "proposer", to: "offen", seq: 1, content: "Aufgabe angelegt.", payload, object: taskAddress(TOWN, NEW_T_ID),
  });
  const r = await handlePersonEvent(deps, { event, action: "task_create", payload });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.personSigned, true);
  assert.equal(calls.actions[0][0], PROPOSER);

  const noId = { ...payload, taskId: undefined };
  const r2 = await handlePersonEvent(deps, { event, action: "task_create", payload: noId });
  assert.equal(r2.ok, false);
});

test("proof tags must mirror the attachments", async () => {
  const attachments = [{ type: "tx", hash: "0x" + "cd".repeat(32) }];
  const payload = { taskId: T_ID, attachments };
  const { deps } = harness({ task: { status: "in_arbeit" }, row: { actorWallet: ASSIGNEE, actorRole: "assignee", fromStatus: null, toStatus: "in_arbeit" } });
  const good = makeEvent(ASSIGNEE_SK, { action: "proof_added", role: "assignee", to: "in_arbeit", content: "Nachweis hinzugefügt.", payload, extraTags: [["tx", "0x" + "cd".repeat(32)]] });
  const r = await handlePersonEvent(deps, { event: good, action: "task_proof", payload });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.personSigned, true);
  const wrong = makeEvent(ASSIGNEE_SK, { action: "proof_added", role: "assignee", to: "in_arbeit", content: "Nachweis hinzugefügt.", payload, extraTags: [["tx", "0x" + "ef".repeat(32)]] });
  const r2 = await handlePersonEvent(deps, { event: wrong, action: "task_proof", payload });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.code, "PAYLOAD_MISMATCH");
});

test("tally_confirm: poll object, wahlhelfer role, attaches when signed text matches", async () => {
  const text = "Ich bestätige …";
  const hash = "0x" + "12".repeat(32);
  const payload = { proposalId: P_ID, signature: SIG };
  const { deps, calls } = harness({
    row: { actorWallet: ATTESTER, actorRole: "wahlhelfer", fromStatus: null, toStatus: "bestaetigt", extra: { message: text, result_hash: hash, signature: SIG } },
  });
  const event = makeEvent(ATTESTER_SK, {
    action: "tally_confirmed", role: "wahlhelfer", to: "bestaetigt", content: "Wahlhelfer:in bestätigt das Bürgervotum.", payload,
    object: pollAddress(TOWN, P_KEY),
    extraTags: [["signed_text", text], ["signature", SIG], ["signer_account", ATTESTER], ["result_hash", hash], ["chain", "100"]],
  });
  const r = await handlePersonEvent(deps, { event, kind: "tally_confirm", proposalId: P_ID, signature: SIG });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data, { lineIds: ["l1"], eventId: event.id, personSigned: true });
  assert.equal(calls.tally, 1);

  // A signed text that differs from what the tally service stored → confirmed, but not person-signed.
  const { deps: d2 } = harness({
    row: { actorWallet: ATTESTER, actorRole: "wahlhelfer", fromStatus: null, toStatus: "bestaetigt", extra: { message: "anders", result_hash: hash, signature: SIG } },
  });
  const r2 = await handlePersonEvent(d2, { event, kind: "tally_confirm", proposalId: P_ID, signature: SIG });
  assert.equal(r2.ok, true);
  if (r2.ok) assert.equal(r2.data.personSigned, false);
});

test("parseObjectAddress accepts this town's task and poll addresses only", () => {
  assert.deepEqual(parseObjectAddress(taskAddress(TOWN, T_ID), TOWN), { type: "task", taskId: T_ID });
  assert.deepEqual(parseObjectAddress(pollAddress(TOWN, P_KEY), TOWN), { type: "poll", proposalKey: P_KEY });
  assert.equal(parseObjectAddress(taskAddress("e".repeat(64), T_ID), TOWN), null);
  assert.equal(parseObjectAddress("32108:" + TOWN + ":task:nope", TOWN), null);
});
