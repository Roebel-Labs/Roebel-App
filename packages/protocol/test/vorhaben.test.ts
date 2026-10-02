import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTION_NAMES, VORHABEN_KINDS, contractAddress, kasseNoticeAddress, nsp12StageFor, nsp12TransitionsBetween,
  payoutLineAddress, pollAddress, safeParseAction, safeParseContract, safeParsePayoutLine, safeParseTask,
  taskAddress, validateActionChain,
} from "../src/vorhaben.js";
import { isLegalTransition, safeParseMeinungsbild } from "../src/decisions.js";
import { NetizenManifestSchema } from "../src/manifest.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const roebel = JSON.parse(readFileSync(fileURLToPath(new URL("../examples/roebel.netizen.json", import.meta.url)), "utf8"));

const PK = "a".repeat(64);
const HEAD = `32100:${PK}:proposal:0xabc`;

test("kinds and addresses", () => {
  assert.deepEqual(VORHABEN_KINDS, { action: 2101, task: 32108, contract: 32110, payoutLine: 32111 });
  assert.equal(taskAddress(PK, "t1"), `32108:${PK}:task:t1`);
  assert.equal(contractAddress(PK, "p1"), `32110:${PK}:contract:p1`);
  assert.equal(payoutLineAddress(PK, "l1"), `32111:${PK}:payout:l1`);
  assert.equal(pollAddress(PK, "0xabc"), `32104:${PK}:poll:0xabc`);
  assert.equal(kasseNoticeAddress(PK, "0xabc", "beschluss"), `32102:${PK}:gemeinschaftskasse:0xabc:beschluss`);
  assert.equal(ACTION_NAMES.length, 17);
});

test("lifecycle → NSP-12 stage", () => {
  assert.equal(nsp12StageFor("abstimmung"), "meinungsbild");
  assert.equal(nsp12StageFor("auszaehlung"), "meinungsbild");
  assert.equal(nsp12StageFor("angenommen"), "beschlossen");
  assert.equal(nsp12StageFor("in_umsetzung"), "beschlossen");
  assert.equal(nsp12StageFor("abgelehnt"), "abgelehnt");
  assert.equal(nsp12StageFor("umgesetzt"), "umgesetzt");
});

test("transition paths are legal NSP-12 hops with notices where required", () => {
  const won = nsp12TransitionsBetween("meinungsbild", "beschlossen");
  assert.deepEqual(won, [
    { from: "meinungsbild", to: "beschlussvorlage" },
    { from: "beschlussvorlage", to: "beschlossen", notice: "beschluss" },
  ]);
  assert.deepEqual(nsp12TransitionsBetween("meinungsbild", "abgelehnt").at(-1), { from: "beschlussvorlage", to: "abgelehnt", notice: "ablehnung" });
  assert.deepEqual(nsp12TransitionsBetween("meinungsbild", "umgesetzt").map((t) => t.to), ["beschlussvorlage", "beschlossen", "umgesetzt"]);
  assert.deepEqual(nsp12TransitionsBetween("beschlossen", "umgesetzt"), [{ from: "beschlossen", to: "umgesetzt" }]);
  assert.deepEqual(nsp12TransitionsBetween("beschlossen", "beschlossen"), []);
  for (const t of nsp12TransitionsBetween("meinungsbild", "umgesetzt")) assert.ok(isLegalTransition(t.from, t.to));
  assert.throws(() => nsp12TransitionsBetween("umgesetzt", "meinungsbild"));
});

const action = (over: Partial<{ tags: string[][]; content: string; kind: number }> = {}) => ({
  kind: over.kind ?? 2101, content: over.content ?? "", created_at: 1790000000,
  tags: over.tags ?? [
    ["a", taskAddress(PK, "t1"), "", "object"], ["a", HEAD, "", "proposal"],
    ["action", "task_assigned"], ["from", "offen"], ["to", "vergeben"],
    ["p", "b".repeat(64), "", "assignee"], ["role", "proposer"], ["occurred_at", "1789999990"], ["seq", "1"],
  ],
});

test("safeParseAction accepts a well-formed action", () => {
  const r = safeParseAction(action());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.action, "task_assigned");
    assert.equal(r.value.role, "proposer");
    assert.equal(r.value.actor, "b".repeat(64));
    assert.equal(r.value.prior, null);
    assert.equal(r.value.seq, 1);
    assert.equal(r.value.occurredAt, 1789999990);
  }
});

test("safeParseAction rejects wrong kind, unknown action, missing role, malformed object", () => {
  assert.equal(safeParseAction(action({ kind: 2100 })).ok, false);
  assert.equal(safeParseAction(action({ tags: action().tags.map((t) => (t[0] === "action" ? ["action", "nope"] : t)) })).ok, false);
  assert.equal(safeParseAction(action({ tags: action().tags.filter((t) => t[0] !== "role") })).ok, false);
  assert.equal(safeParseAction(action({ tags: action().tags.map((t) => (t[3] === "object" ? ["a", "garbage", "", "object"] : t)) })).ok, false);
});

test("tally_confirmed requires signature, signed_text and signer_account", () => {
  const base = [["a", pollAddress(PK, "0xabc"), "", "object"], ["a", HEAD, "", "proposal"], ["action", "tally_confirmed"],
    ["to", "bestaetigt"], ["role", "wahlhelfer"], ["occurred_at", "1"], ["seq", "1"]];
  assert.equal(safeParseAction(action({ tags: base })).ok, false);
  const full = [...base, ["signed_text", "Ich bestätige …"], ["signature", "0x" + "1".repeat(130)],
    ["signer_account", "0x" + "2".repeat(40)], ["result_hash", "0x" + "3".repeat(64)], ["chain", "100"]];
  assert.equal(safeParseAction(action({ tags: full })).ok, true);
});

test("state event validators", () => {
  const task = { kind: 32108, content: "Beschreibung", created_at: 1, tags: [["d", "task:t1"], ["a", HEAD, "", "proposal"],
    ["title", "Spende überweisen"], ["status", "offen"], ["reward", "5", "EURe"], ["criterion", "c1", "Überweisung ausgelöst"]] };
  assert.equal(safeParseTask(task).ok, true);
  assert.equal(safeParseTask({ ...task, tags: task.tags.map((t) => (t[0] === "status" ? ["status", "fertig"] : t)) }).ok, false);
  const contract = { kind: 32110, content: "", created_at: 1, tags: [["d", "contract:p1"], ["a", HEAD, "", "proposal"],
    ["fee_bps", "500"], ["platform_safe", "0x" + "c".repeat(40)]] };
  assert.equal(safeParseContract(contract).ok, true);
  const line = { kind: 32111, content: "", created_at: 1, tags: [["d", "payout:l1"], ["a", contractAddress(PK, "p1"), "", "contract"],
    ["a", taskAddress(PK, "t1"), "", "for"], ["role", "aufgabe"], ["amount", "5", "EURe"], ["rail", "safe_eure"], ["status", "geplant"]] };
  assert.equal(safeParsePayoutLine(line).ok, true);
  assert.equal(safeParsePayoutLine({ ...line, tags: line.tags.map((t) => (t[0] === "status" ? ["status", "sendend"] : t)) }).ok, false);
});

test("validateActionChain detects a broken prior link", () => {
  const a1 = { ...action(), id: "1".repeat(64) };
  const a2 = { ...action({ tags: [...action().tags.filter((t) => !["action", "from", "to", "seq"].includes(t[0])),
    ["action", "task_started"], ["from", "vergeben"], ["to", "in_arbeit"], ["seq", "2"], ["prior", "1".repeat(64)]] }), id: "2".repeat(64) };
  assert.deepEqual(validateActionChain([a2, a1]), { ok: true });
  const orphan = { ...a2, tags: a2.tags.map((t) => (t[0] === "prior" ? ["prior", "9".repeat(64)] : t)) };
  assert.equal(validateActionChain([a1, orphan]).ok, false);
});

test("Bürgervotum d-tag is NSP-12 compliant", () => {
  assert.equal(safeParseMeinungsbild({ kind: 32104, content: "", created_at: 1, tags: [["d", "poll:0xabc"], ["advisory", "true"]] }).ok, true);
});

test("Röbel manifest: vorhaben dataset, kinds indexed, Gemeinschaftskasse body", () => {
  const m = NetizenManifestSchema.parse(roebel);
  assert.ok(m.services.publisher?.datasets.includes("vorhaben"));
  for (const k of [2101, 32108, 32110, 32111]) assert.ok(m.services.indexer?.kinds.includes(k), `kind ${k} indexed`);
  assert.ok(m.record?.decisions.bodies?.some((b) => b.id === "gemeinschaftskasse" && b.noticeScope === "town"));
});

test("fix round 1: chain walk, strict tags, kind/action fit, transitions", () => {
  const a1 = { ...action(), id: "1".repeat(64) };
  const mk = (id: string, seq: number, prior?: string) => ({ ...action({ tags: [...action().tags.filter((t) => !["action", "from", "to", "seq"].includes(t[0])),
    ["action", "task_started"], ["from", "vergeben"], ["to", "in_arbeit"], ["seq", String(seq)], ...(prior ? [["prior", prior]] : [])] }), id });
  assert.equal(validateActionChain([a1, mk("2".repeat(64), 2, "2".repeat(64))]).ok, false); // self-reference
  assert.equal(validateActionChain([a1, mk("2".repeat(64), 2, "3".repeat(64)), mk("3".repeat(64), 3, "2".repeat(64))]).ok, false); // wrong priors
  assert.equal(validateActionChain([a1, mk("2".repeat(64), 2, "1".repeat(64)), mk("3".repeat(64), 2, "1".repeat(64))]).ok, false); // duplicate seq
  assert.equal(validateActionChain([a1, { ...action(), id: "4".repeat(64) }]).ok, false); // two seq 1
  assert.equal(validateActionChain([a1, mk("2".repeat(64), 2, "1".repeat(64)), mk("3".repeat(64), 3, "2".repeat(64))]).ok, true);
  assert.equal(validateActionChain([{ ...a1, id: "xyz" }]).ok, false);
  for (const bad of ["", "1e3", "0x10"]) {
    assert.equal(safeParseAction(action({ tags: action().tags.map((t) => (t[0] === "occurred_at" ? ["occurred_at", bad] : t)) })).ok, false);
  }
  assert.equal(safeParseAction(action({ tags: [...action().tags, ["p"]] })).ok, false);
  assert.equal(safeParseAction(action({ tags: [...action().tags, ["p", "zz"]] })).ok, false);
  assert.equal(safeParseAction(action({ tags: action().tags.map((t) => (t[3] === "object" ? ["a", payoutLineAddress(PK, "l1"), "", "object"] : t)) })).ok, false);
  const base = [["a", pollAddress(PK, "0xabc"), "", "object"], ["a", HEAD, "", "proposal"], ["action", "tally_confirmed"],
    ["to", "bestaetigt"], ["role", "wahlhelfer"], ["occurred_at", "1"], ["seq", "1"], ["signed_text", "x"], ["signature", "0x" + "1".repeat(130)],
    ["signer_account", "0x" + "2".repeat(40)], ["result_hash", "0x" + "3".repeat(64)], ["chain", "100"]];
  const swap = (n: string, v: string) => base.map((t) => (t[0] === n ? [n, v] : t));
  assert.equal(safeParseAction(action({ tags: swap("signature", "nothex") })).ok, false);
  assert.equal(safeParseAction(action({ tags: swap("result_hash", "0x12") })).ok, false);
  assert.equal(safeParseAction(action({ tags: swap("chain", "gnosis") })).ok, false);
  assert.deepEqual(nsp12TransitionsBetween("beschlussvorlage", "abgelehnt"), [{ from: "beschlussvorlage", to: "abgelehnt", notice: "ablehnung" }]);
  assert.throws(() => nsp12TransitionsBetween("beschlossen", "abgelehnt"));
  assert.throws(() => nsp12TransitionsBetween("beschlussvorlage", "meinungsbild"));
});
