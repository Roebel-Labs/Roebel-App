import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeParseAction, safeParseContract, safeParseMeinungsbild, safeParsePayoutLine, safeParseTask, taskAddress, payoutLineAddress, pollAddress, contractAddress } from "@netizen-labs/protocol";
import { proposalToSpec } from "../src/mappers.js";
import { actionToSpec, buergervotumToSpec, contractToSpec, kasseNoticeToSpec, payoutLineToSpec, taskToSpec, type OutboxRow, type VorhabenContext } from "../src/vorhaben.js";

const PK = "a".repeat(64);
const ACTOR = "b".repeat(64);
const PRIOR = "c".repeat(64);
const KEY = "0xabc";
const HEAD = `32100:${PK}:proposal:${KEY}`;
const NOW = 1_790_000_000;
const OCC = "2026-10-01T10:00:00+00:00";
const OCC_UNIX = String(Math.floor(Date.parse(OCC) / 1000));
const CTX: VorhabenContext = { townPubkey: PK, proposalKey: KEY, actorPubkey: ACTOR, prior: null, now: NOW };
const sig = (s: { kind: number; tags: string[][]; content: string; createdAt: number }) => ({ kind: s.kind, tags: s.tags, content: s.content, created_at: s.createdAt });

function row(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 1, object_type: "task", object_id: "t1", proposal_id: "uuid-1", action: "task_assigned", from_status: "offen", to_status: "vergeben",
    actor_wallet: "0x" + "1".repeat(40), actor_role: "proposer", body: null, extra: {}, occurred_at: OCC,
    signed_event: null, event_id: null, published_at: null, attempts: 0, ...over,
  };
}

const PROPOSAL = {
  id: "f4a87bbe-9deb-4f5e-9807-3b8534135c15", proposal_id: KEY, proposal_number: 3, title: "Vereinsbus", updated_at: "2026-10-01T10:00:00+00:00",
  vorhaben_enabled: true, lifecycle_stage: "in_umsetzung", budget_amount: "150.000000000000000000", budget_asset: "EURe", beneficiary_name: "Seglerverein",
  for_votes: "12", against_votes: "2", abstain_votes: "1", tally_address: "0x" + "9".repeat(40), tally_confirm_opened_at: "2026-09-28T08:00:00+00:00",
};

describe("actionToSpec", () => {
  it("builds the exact tag list for task_assigned and passes safeParseAction", () => {
    const s = actionToSpec(row(), CTX)!;
    assert.equal(s.kind, 2101);
    assert.equal(s.d, "");
    assert.equal(s.scope, "town");
    assert.equal(s.createdAt, NOW);
    assert.equal(s.content, "");
    assert.deepEqual(s.tags, [
      ["a", taskAddress(PK, "t1"), "", "object"], ["a", HEAD, "", "proposal"], ["action", "task_assigned"], ["from", "offen"], ["to", "vergeben"],
      ["p", ACTOR, "", "proposer"], ["role", "proposer"], ["occurred_at", OCC_UNIX],
    ]);
    assert.ok(!s.tags.some((t) => t[0] === "d"));
    assert.deepEqual(safeParseAction(sig(s)).ok, true);
  });
  it("omits p without an actor pubkey and never leaks a wallet address; adds prior when given", () => {
    const s = actionToSpec(row(), { ...CTX, actorPubkey: null })!;
    assert.ok(!s.tags.some((t) => t[0] === "p"));
    assert.ok(s.tags.some((t) => t[0] === "role" && t[1] === "proposer"));
    assert.ok(!s.tags.flat().some((v) => /^0x[0-9a-fA-F]{40}$/.test(v)));
    const withPrior = actionToSpec(row(), { ...CTX, prior: PRIOR })!;
    assert.deepEqual(withPrior.tags.find((t) => t[0] === "prior"), ["prior", PRIOR]);
    assert.equal(safeParseAction(sig(withPrior)).ok, true);
  });
  it("proof_added carries url and tx tags from attachments", () => {
    const tx = "0x" + "d".repeat(64);
    const s = actionToSpec(row({ action: "proof_added", from_status: null, to_status: "in_arbeit", body: "Quittung", actor_role: "assignee",
      extra: { attachments: [{ type: "image", url: "https://cdn.example/a.jpg" }, { type: "tx", hash: tx }, { type: "pdf", url: "https://cdn.example/q.pdf" }] } }), CTX)!;
    assert.ok(s.tags.some((t) => t[0] === "url" && t[1] === "https://cdn.example/a.jpg" && t[2] === "image"));
    assert.ok(s.tags.some((t) => t[0] === "url" && t[2] === "pdf"));
    assert.deepEqual(s.tags.find((t) => t[0] === "tx"), ["tx", tx]);
    assert.equal(s.content, "Quittung");
    assert.ok(!s.tags.some((t) => t[0] === "from"));
    assert.equal(safeParseAction(sig(s)).ok, true);
  });
  it("tally_confirmed carries the signature material", () => {
    const hash = "0x" + "e".repeat(64);
    const wallet = "0x" + "2".repeat(40);
    const s = actionToSpec(row({ object_type: "tally", object_id: "uuid-1", action: "tally_confirmed", from_status: null, to_status: "bestaetigt", actor_role: "wahlhelfer",
      extra: { message: "Ich bestätige", signature: "0xabcdef", result_hash: hash, attester_wallet: wallet } }), CTX)!;
    assert.deepEqual(s.tags.find((t) => t[0] === "signed_text"), ["signed_text", "Ich bestätige"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "signature"), ["signature", "0xabcdef"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "signer_account"), ["signer_account", wallet]);
    assert.deepEqual(s.tags.find((t) => t[0] === "result_hash"), ["result_hash", hash]);
    assert.deepEqual(s.tags.find((t) => t[0] === "chain"), ["chain", "100"]);
    assert.equal(s.content, "Wahlhelfer:in bestätigt das Bürgervotum.");
    assert.deepEqual(s.tags[0], ["a", pollAddress(PK, KEY), "", "object"]);
    assert.equal(safeParseAction(sig(s)).ok, true);
  });
  it("returns null when a required field is missing", () => {
    assert.equal(actionToSpec(row({ object_type: "tally", action: "tally_confirmed", extra: {} }), CTX), null);
    assert.equal(actionToSpec(row({ occurred_at: "nonsense" }), CTX), null);
  });
  it("payout and stage actions target the right object kinds", () => {
    const p = actionToSpec(row({ object_type: "payout", object_id: "l1", action: "payout_confirmed", from_status: "vorgeschlagen", to_status: "bestaetigt", actor_role: "system", extra: { tx: "0x" + "f".repeat(64), safe_tx: "0x" + "1".repeat(64) } }), { ...CTX, actorPubkey: null })!;
    assert.equal(p.tags[0][1], payoutLineAddress(PK, "l1"));
    assert.ok(p.tags.some((t) => t[0] === "tx") && p.tags.some((t) => t[0] === "safe_tx"));
    assert.equal(safeParseAction(sig(p)).ok, true);
    const st = actionToSpec(row({ object_type: "proposal", object_id: "uuid-1", action: "stage_changed", from_status: "abstimmung", to_status: "auszaehlung", actor_role: "system" }), { ...CTX, actorPubkey: null })!;
    assert.equal(st.tags[0][1], HEAD);
    assert.equal(safeParseAction(sig(st)).ok, true);
  });
});

describe("object mappers", () => {
  it("taskToSpec", () => {
    const s = taskToSpec({ id: "t1", title: "Quittung holen", description: "Beschreibung", acceptance_criteria: [{ id: "c1", text: "Eins" }, { id: "c2", text: "Zwei" }],
      reward_amount: "5.000000000000000000", reward_asset: "EURe", status: "vergeben", deadline: "2026-11-01T00:00:00+00:00", created_at: "2026-10-01T09:00:00+00:00", updated_at: "2026-10-01T10:00:00+00:00" }, KEY, PK, ACTOR, "d".repeat(64))!;
    assert.equal(s.kind, 32108);
    assert.equal(s.d, "task:t1");
    assert.deepEqual(s.tags[0], ["d", "task:t1"]);
    assert.deepEqual(s.tags.filter((t) => t[0] === "criterion"), [["criterion", "c1", "Eins"], ["criterion", "c2", "Zwei"]]);
    assert.deepEqual(s.tags.find((t) => t[0] === "reward"), ["reward", "5", "EURe"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "status"), ["status", "vergeben"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "p" && t[3] === "assignee"), ["p", ACTOR, "", "assignee"]);
    assert.equal(s.content, "Beschreibung");
    assert.equal(safeParseTask(sig(s)).ok, true);
    const nc = taskToSpec({ id: "t2", title: "Aufgabe", reward_amount: 1, reward_asset: "EURe", status: "vergeben", assignee_wallet: "0x" + "3".repeat(40), updated_at: OCC }, KEY, PK, null, null)!;
    assert.deepEqual(nc.tags.find((t) => t[0] === "assignee_role"), ["assignee_role", "non_citizen"]);
    assert.ok(!nc.tags.flat().some((v) => /^0x[0-9a-fA-F]{40}$/.test(v)));
  });
  it("payoutLineToSpec", () => {
    const base = { id: "l1", proposal_id: PROPOSAL.id, role: "wahlhelfer", recipient_label: "Erika Muster", amount: "10.000000000000000000", asset: "MUENZEN", rail: "funder_muenzen",
      reference_type: "wahlhelfer", reference_id: "w1", status: "bestaetigt", tx_hash: "0x" + "a".repeat(64), updated_at: OCC };
    const w = payoutLineToSpec(base, KEY, PK, ACTOR)!;
    assert.equal(w.kind, 32111);
    assert.equal(w.d, "payout:l1");
    assert.ok(w.tags.some((t) => t[0] === "p" && t[1] === ACTOR && t[3] === "recipient"));
    assert.ok(!w.tags.some((t) => t[0] === "recipient_label"));
    assert.deepEqual(w.tags.find((t) => t[0] === "amount"), ["amount", "10", "MUENZEN"]);
    assert.equal(w.tags.find((t) => t[0] === "a" && t[3] === "for")![1], pollAddress(PK, KEY));
    assert.equal(w.tags.find((t) => t[0] === "a" && t[3] === "contract")![1], contractAddress(PK, PROPOSAL.id));
    assert.ok(w.tags.some((t) => t[0] === "tx"));
    assert.equal(safeParsePayoutLine(sig(w)).ok, true);
    const e = payoutLineToSpec({ ...base, role: "empfaenger", recipient_label: "Seglerverein", reference_type: "proposal", reference_id: PROPOSAL.id, asset: "EURe", rail: "safe_eure" }, KEY, PK, null)!;
    assert.deepEqual(e.tags.find((t) => t[0] === "recipient_label"), ["recipient_label", "Seglerverein"]);
    assert.ok(!e.tags.some((t) => t[0] === "p"));
    assert.equal(e.tags.find((t) => t[0] === "a" && t[3] === "for")![1], `32100:${PK}:proposal:${KEY}`);
    assert.equal(safeParsePayoutLine(sig(e)).ok, true);
    assert.equal(payoutLineToSpec({ ...base, status: "sendend" }, KEY, PK, ACTOR), null);
  });
  it("contractToSpec", () => {
    const s = contractToSpec({ id: "k1", proposal_id: PROPOSAL.id, platform_fee_bps: 500, platform_safe_address: "0x" + "b".repeat(40), created_at: OCC }, KEY, PK, ["l1", "l2"], [["EURe", "150"], ["MUENZEN", "10"]])!;
    assert.equal(s.kind, 32110);
    assert.equal(s.d, `contract:${PROPOSAL.id}`);
    assert.deepEqual(s.tags.filter((t) => t[3] === "line").map((t) => t[1]), [payoutLineAddress(PK, "l1"), payoutLineAddress(PK, "l2")]);
    assert.deepEqual(s.tags.filter((t) => t[0] === "total"), [["total", "150", "EURe"], ["total", "10", "MUENZEN"]]);
    assert.equal(safeParseContract(sig(s)).ok, true);
  });
  it("buergervotumToSpec", () => {
    const s = buergervotumToSpec(PROPOSAL, PK)!;
    assert.equal(s.kind, 32104);
    assert.equal(s.d, "poll:0xabc");
    assert.deepEqual(s.tags.find((t) => t[0] === "advisory"), ["advisory", "true"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "for"), ["for", "12"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "against"), ["against", "2"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "abstain"), ["abstain", "1"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "chain"), ["chain", "100"]);
    assert.equal(safeParseMeinungsbild(sig(s)).ok, true);
    assert.ok(s.content.includes("Bürgervotum"));
    assert.ok(!/Meinungsbild|Bürgerentscheid/.test(s.content));
    assert.equal(buergervotumToSpec({ ...PROPOSAL, tally_confirm_opened_at: null }, PK), null);
  });
  it("kasseNoticeToSpec", () => {
    const s = kasseNoticeToSpec(PROPOSAL, "beschluss", [], NOW);
    assert.equal(s.kind, 32102);
    assert.equal(s.d, "gemeinschaftskasse:0xabc:beschluss");
    assert.deepEqual(s.tags[0], ["d", "gemeinschaftskasse:0xabc:beschluss"]);
    assert.ok(s.content.includes("Gemeinschaftskasse") && s.content.includes("keine Entscheidung der Stadt"));
    assert.equal(s.createdAt, NOW);
    const x = kasseNoticeToSpec(PROPOSAL, "ausgefuehrt", ["0x" + "a".repeat(64)], NOW);
    assert.ok(x.tags.some((t) => t[0] === "tx"));
  });
});

describe("proposalToSpec vorhaben tags", () => {
  it("adds NSP-13 tags when enabled and leaves output untouched otherwise", () => {
    const s = proposalToSpec(PROPOSAL, "0xgov", { townPubkey: PK, taskIds: ["t1", "t2"] })!;
    assert.deepEqual(s.tags.find((t) => t[0] === "stage"), ["stage", "beschlossen"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "vorhaben"), ["vorhaben", "in_umsetzung"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "proposal_uuid"), ["proposal_uuid", PROPOSAL.id]);
    assert.deepEqual(s.tags.find((t) => t[0] === "budget"), ["budget", "150", "EURe"]);
    assert.deepEqual(s.tags.find((t) => t[0] === "beneficiary"), ["beneficiary", "Seglerverein"]);
    assert.ok(s.tags.some((t) => t[3] === "contract" && t[1] === `32110:${PK}:contract:${PROPOSAL.id}`));
    assert.equal(s.tags.filter((t) => t[3] === "task").length, 2);
    const off = { ...PROPOSAL, vorhaben_enabled: false };
    assert.deepEqual(proposalToSpec(off, "0xgov", { townPubkey: PK, taskIds: ["t1"] }), proposalToSpec(off, "0xgov"));
    assert.ok(!proposalToSpec(off, "0xgov", { townPubkey: PK, taskIds: [] })!.tags.some((t) => t[0] === "stage"));
  });
});
