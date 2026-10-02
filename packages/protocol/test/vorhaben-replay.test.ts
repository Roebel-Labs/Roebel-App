import assert from "node:assert/strict";
import { test } from "node:test";
import { PERSON_ACTION_ROLES, hashMessage, isTrustedAction, payloadHash, validateActionChain, pollAddress, replayVorhaben, safeParseAction, taskAddress, verifyPayoutTx, verifyTallyConfirmation } from "../src/vorhaben.js";

const PK = "a".repeat(64);
const HEAD = `32100:${PK}:proposal:0xabc`;
let n = 0;
const seqs = new Map<string, number>();
function act(object: string, action: string, from: string | null, to: string, prior?: string, extra: string[][] = []) {
  const id = (++n).toString(16).padStart(64, "0");
  const seq = (seqs.get(object) ?? 0) + 1;
  seqs.set(object, seq);
  const tags = [["a", object, "", "object"], ["a", HEAD, "", "proposal"], ["action", action], ["to", to], ["role", "system"], ["seq", String(seq)],
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

test("replay orders by seq when prior is absent", () => {
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

test("replay uses seq order even when occurred_at contradicts it", () => {
  const T = taskAddress(PK, "t4");
  const a = act(T, "task_created", null, "offen");
  const b = act(T, "task_assigned", "offen", "vergeben", a.id);
  const bt = b.tags.find((x) => x[0] === "occurred_at")!; bt[1] = "1"; // later in chain, earlier in time
  assert.equal(replayVorhaben([b, a]).tasks.get(T)?.status, "vergeben");
});

test("replay dedupes events by id", () => {
  const T = taskAddress(PK, "t5");
  const a = act(T, "task_created", null, "offen");
  assert.deepEqual(replayVorhaben([a, a]).tasks.get(T)?.history, ["task_created"]);
});

test("hashMessage handles multi-byte text like viem", () => {
  assert.equal(hashMessage("Ich bestätige"), "0x0f599aeb9fb8e4af2094d74051e24ab15232f1248baa75028af03b31dec2158f");
});

test("verifyPayoutTx binds recipient and token id when asked", async () => {
  const token = "0x" + "9".repeat(40);
  const to = "0x" + "ab".repeat(20);
  const pad = (a: string) => "0x" + a.slice(2).padStart(64, "0");
  const w = (v: bigint) => v.toString(16).padStart(64, "0");
  const erc20 = { address: token, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad("0x1"), pad(to)], data: "0x" + w(5n) };
  const single = { address: token, topics: ["0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62", pad("0x1"), pad("0x2"), pad(to)], data: "0x" + w(7n) + w(12n) };
  const mk = (log: typeof erc20) => ({ readContract: async () => null, getTransactionReceipt: async () => ({ status: "success" as const, logs: [log] }) });
  const h = "0x" + "5".repeat(64);
  assert.equal(await verifyPayoutTx(h, token, 5n, mk(erc20), { to: to.toUpperCase().replace("0X", "0x") }), true);
  assert.equal(await verifyPayoutTx(h, token, 5n, mk(erc20), { to: "0x" + "cd".repeat(20) }), false);
  assert.equal(await verifyPayoutTx(h, token, 12n, mk(single), { to, tokenId: 7n }), true);
  assert.equal(await verifyPayoutTx(h, token, 12n, mk(single), { to, tokenId: 8n }), false);
  assert.equal(await verifyPayoutTx(h, token, 12n, mk(single), { to: "0x" + "cd".repeat(20) }), false);
  const boom = { readContract: async () => null, getTransactionReceipt: async () => { throw new Error("rpc"); } };
  assert.equal(await verifyPayoutTx(h, token, 5n, boom), false);
});

test("replay orders by seq even when prior is missing and occurred_at contradicts", () => {
  const T = taskAddress(PK, "t6");
  const a = act(T, "task_created", null, "offen");
  const b = act(T, "task_assigned", "offen", "vergeben");
  a.tags.find((x) => x[0] === "occurred_at")![1] = "9999";
  assert.equal(replayVorhaben([b, a]).tasks.get(T)?.status, "vergeben");
});

test("payloadHash matches the apps/web hashPayload vector and ignores key order", () => {
  const v = "768ca668c0f84dd39bf269e25c9a3f0af4812e41026b6fead9a2666078ef16f6";
  assert.equal(payloadHash({ b: 2, a: "x" }), v);
  assert.equal(payloadHash({ a: "x", b: 2 }), v);
});

const TOWN = "c".repeat(64);
const PERSON = "d".repeat(64);
const signed = (pubkey: string, action: string, p: string[][]) => ({ pubkey, kind: 2101, content: "", created_at: 1, tags: [["action", action], ...p] });

test("isTrustedAction: town always; person only with own role-marked p tag for a person-signable action", () => {
  assert.equal(isTrustedAction(signed(TOWN, "payout_confirmed", []), TOWN), true);
  assert.equal(isTrustedAction(signed(PERSON, "task_started", [["p", PERSON, "", "assignee"]]), TOWN), true);
  assert.equal(isTrustedAction(signed(PERSON, "task_started", [["p", PERSON, "", "attester"]]), TOWN), false); // wrong role
  assert.equal(isTrustedAction(signed(PERSON, "task_started", [["p", TOWN, "", "assignee"]]), TOWN), false); // p is someone else
  assert.equal(isTrustedAction(signed(PERSON, "task_started", []), TOWN), false);
  assert.equal(isTrustedAction(signed(PERSON, "payout_confirmed", [["p", PERSON, "", "assignee"]]), TOWN), false); // town-only
  assert.equal(isTrustedAction(signed(PERSON, "task_approved", [["p", PERSON, "", "attester"]]), TOWN), true);
  assert.equal(isTrustedAction(signed(PERSON, "task_created", [["p", PERSON, "", "proposer"]]), TOWN), true);
  assert.equal(isTrustedAction(signed(PERSON, "toString", [["p", PERSON, "", "assignee"]]), TOWN), false);
  assert.deepEqual(PERSON_ACTION_ROLES.tally_confirmed, ["wahlhelfer"]);
});

test("validateActionChain requires seq 1..n and prior = seq-1", () => {
  const T = taskAddress(PK, "t7");
  const a = act(T, "task_created", null, "offen");
  const b = act(T, "task_assigned", "offen", "vergeben", a.id);
  const c = act(T, "task_started", "vergeben", "in_arbeit"); // prior optional
  assert.deepEqual(validateActionChain([c, a, b]), { ok: true });
  const gap = { ...c, tags: c.tags.map((t) => (t[0] === "seq" ? ["seq", "4"] : t)) };
  assert.equal(validateActionChain([a, b, gap]).ok, false);
  const dup = { ...c, tags: c.tags.map((t) => (t[0] === "seq" ? ["seq", "2"] : t)) };
  assert.equal(validateActionChain([a, b, dup]).ok, false);
  const wrongPrior = { ...c, tags: [...c.tags, ["prior", a.id]] };
  assert.equal(validateActionChain([a, b, wrongPrior]).ok, false);
  assert.equal(safeParseAction({ ...a, tags: a.tags.map((t) => (t[0] === "seq" ? ["seq", "0"] : t)) }).ok, false);
  assert.equal(safeParseAction({ ...a, tags: a.tags.filter((t) => t[0] !== "seq") }).ok, false);
});
