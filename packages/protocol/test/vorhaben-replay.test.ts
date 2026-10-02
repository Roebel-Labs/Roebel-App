import assert from "node:assert/strict";
import { test } from "node:test";
import { hashMessage, pollAddress, replayVorhaben, safeParseAction, taskAddress, verifyPayoutTx, verifyTallyConfirmation } from "../src/vorhaben.js";

const PK = "a".repeat(64);
const HEAD = `32100:${PK}:proposal:0xabc`;
let n = 0;
function act(object: string, action: string, from: string | null, to: string, prior?: string, extra: string[][] = []) {
  const id = (++n).toString(16).padStart(64, "0");
  const tags = [["a", object, "", "object"], ["a", HEAD, "", "proposal"], ["action", action], ["to", to], ["role", "system"],
    ["occurred_at", String(1000 + n)], ...(from ? [["from", from]] : []), ...(prior ? [["prior", prior]] : []), ...extra];
  return { id, kind: 2101, content: "", created_at: 2000 + n, tags };
}

test("replay rebuilds task status in chain order even when events arrive shuffled", () => {
  const T = taskAddress(PK, "t1");
  const a = act(T, "task_created", null, "offen");
  const b = act(T, "task_assigned", "offen", "vergeben", a.id, [["p", "b".repeat(64), "", "assignee"]]);
  const c = act(T, "task_started", "vergeben", "in_arbeit", b.id);
  const state = replayVorhaben([c, a, b]);
  assert.equal(state.tasks.get(T)?.status, "in_arbeit");
  assert.equal(state.tasks.get(T)?.assignee, "b".repeat(64));
  assert.deepEqual(state.tasks.get(T)?.history, ["task_created", "task_assigned", "task_started"]);
});

test("replay records tally confirmations and payout confirmations", () => {
  const P = pollAddress(PK, "0xabc");
  const conf = act(P, "tally_confirmed", null, "bestaetigt", undefined, [["signed_text", "x"], ["signature", "0x" + "1".repeat(130)],
    ["signer_account", "0x" + "2".repeat(40)], ["result_hash", "0x" + "3".repeat(64)], ["chain", "100"]]);
  const L = `32111:${PK}:payout:l1`;
  const planned = act(L, "payout_planned", null, "geplant");
  const done = act(L, "payout_confirmed", "geplant", "bestaetigt", planned.id, [["tx", "0x" + "4".repeat(64)]]);
  const s = replayVorhaben([conf, done, planned]);
  assert.equal(s.tallyConfirmations.get(P)?.length, 1);
  assert.deepEqual(s.lines.get(L), { status: "bestaetigt", tx: "0x" + "4".repeat(64) });
});

test("replay tracks stage_changed per head", () => {
  const a = act(HEAD, "stage_changed", "abstimmung", "auszaehlung");
  const b = act(HEAD, "stage_changed", "auszaehlung", "angenommen", a.id);
  assert.equal(replayVorhaben([b, a]).stages.get(HEAD), "angenommen");
});

test("replay falls back to occurred_at when prior is absent", () => {
  const T = taskAddress(PK, "t2");
  const a = act(T, "task_created", null, "offen");
  const b = act(T, "task_assigned", "offen", "vergeben");
  assert.equal(replayVorhaben([b, a]).tasks.get(T)?.status, "vergeben");
});

test("invalid events are skipped, not thrown", () => {
  const s = replayVorhaben([{ id: "f".repeat(64), kind: 2101, content: "", created_at: 1, tags: [["action", "nope"]] }]);
  assert.equal(s.tasks.size, 0);
});

test("proof_added and changes_requested require a task object", () => {
  const P = pollAddress(PK, "0xabc");
  assert.equal(safeParseAction(act(P, "proof_added", "in_arbeit", "in_arbeit")).ok, false);
  assert.equal(safeParseAction(act(P, "changes_requested", "eingereicht", "in_arbeit")).ok, false);
  const T = taskAddress(PK, "t3");
  assert.equal(safeParseAction(act(T, "proof_added", "in_arbeit", "in_arbeit")).ok, true);
  assert.equal(safeParseAction(act(T, "changes_requested", "eingereicht", "in_arbeit")).ok, true);
});

test("hashMessage matches the known EIP-191 vector", () => {
  assert.equal(hashMessage("hello"), "0x50b2c43fd39106bafbba0da34fc430e1f91e3c96ea2acee2bc34119f92b37750");
});

test("verifyTallyConfirmation accepts the ERC-1271 magic value and rejects anything else", async () => {
  const P = pollAddress(PK, "0xabc");
  const ev = act(P, "tally_confirmed", null, "bestaetigt", undefined, [["signed_text", "Ich bestätige"], ["signature", "0x" + "1".repeat(130)],
    ["signer_account", "0x" + "2".repeat(40)], ["result_hash", "0x" + "3".repeat(64)], ["chain", "100"]]);
  const parsed = safeParseAction(ev);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const good = { readContract: async () => "0x1626ba7e", getTransactionReceipt: async () => null };
  const bad = { readContract: async () => "0xffffffff", getTransactionReceipt: async () => null };
  const throws = { readContract: async () => { throw new Error("revert"); }, getTransactionReceipt: async () => null };
  assert.equal(await verifyTallyConfirmation(parsed.value, good), true);
  assert.equal(await verifyTallyConfirmation(parsed.value, bad), false);
  assert.equal(await verifyTallyConfirmation(parsed.value, throws), false);
});

test("verifyPayoutTx matches token + amount in a Transfer log", async () => {
  const token = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430";
  const amount = 5n * 10n ** 18n;
  const log = { address: token, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "0x0", "0x0"],
    data: "0x" + amount.toString(16).padStart(64, "0") };
  const client = { readContract: async () => null, getTransactionReceipt: async () => ({ status: "success" as const, logs: [log] }) };
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token, amount, client), true);
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token, amount + 1n, client), false);
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token.toLowerCase(), amount, client), true);
});

test("verifyPayoutTx matches an ERC-1155 TransferSingle value and rejects reverted tx", async () => {
  const token = "0x" + "9".repeat(40);
  const data = "0x" + (7n).toString(16).padStart(64, "0") + (12n).toString(16).padStart(64, "0");
  const log = { address: token, topics: ["0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62"], data };
  const ok = { readContract: async () => null, getTransactionReceipt: async () => ({ status: "success" as const, logs: [log] }) };
  const rev = { readContract: async () => null, getTransactionReceipt: async () => ({ status: "reverted" as const, logs: [log] }) };
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token, 12n, ok), true);
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token, 7n, ok), false);
  assert.equal(await verifyPayoutTx("0x" + "5".repeat(64), token, 12n, rev), false);
});
