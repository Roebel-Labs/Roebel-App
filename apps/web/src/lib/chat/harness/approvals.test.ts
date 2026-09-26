import { test } from "node:test";
import assert from "node:assert/strict";
import { applyApprovalUpdate, buildApprovalPart, canTransition, describeApproval } from "./approvals";
import { compactResult } from "./audit";
import { isExpired, resultNoteFor } from "./actions";
import type { ChatPart } from "../types";

const card = buildApprovalPart({ actionId: "a1", tool: "note_to_team", risk: "public", summary: "Notiz senden" });

test("buildApprovalPart: pending, generic preview, grantable except money", () => {
  assert.equal(card.status, "pending");
  assert.equal(card.canAlwaysAllow, true);
  assert.deepEqual(card.preview, { kind: "generic", fields: [], body: "Notiz senden" });
  const money = buildApprovalPart({
    actionId: "a2", tool: "transfer_muenzen", risk: "money", summary: "5 Röbel Münzen an Anna",
    signRequest: { kind: "muenzen_transfer", toName: "Anna", amount: "5", toWallet: "0xabc" },
  });
  assert.equal(money.canAlwaysAllow, false);
  assert.equal(money.signRequest?.toName, "Anna");
});

test("canTransition: pending → any decision, approved → result, terminal stays", () => {
  assert.ok(canTransition("pending", "approved"));
  assert.ok(canTransition("pending", "rejected"));
  assert.ok(canTransition("pending", "expired"));
  assert.ok(canTransition("approved", "executed"));
  assert.ok(canTransition("approved", "failed"));
  assert.ok(!canTransition("rejected", "approved"));
  assert.ok(!canTransition("executed", "failed"));
  assert.ok(!canTransition("approved", "rejected"));
});

test("applyApprovalUpdate: updates only the matching card, keeps other parts", () => {
  const parts: ChatPart[] = [{ type: "text", text: "Ich frag kurz." }, card];
  const next = applyApprovalUpdate(parts, "a1", { status: "approved" });
  assert.ok(Array.isArray(next));
  const done = applyApprovalUpdate(next as ChatPart[], "a1", { status: "executed", resultNote: "Erledigt." });
  assert.ok(Array.isArray(done));
  const updated = (done as ChatPart[])[1];
  assert.equal(updated.type === "approval" && updated.status, "executed");
  assert.equal(updated.type === "approval" && updated.resultNote, "Erledigt.");
  assert.equal(parts[1].type === "approval" && parts[1].status, "pending", "input not mutated");
  assert.deepEqual((done as ChatPart[])[0], parts[0]);
  assert.ok("error" in (applyApprovalUpdate(done as ChatPart[], "a1", { status: "rejected" }) as object));
  assert.ok("error" in (applyApprovalUpdate(parts, "zzz", { status: "approved" }) as object));
  assert.ok(Array.isArray(applyApprovalUpdate(parts, "a1", { status: "pending" })), "same status is a no-op");
});

test("describeApproval / resultNoteFor / isExpired / compactResult", () => {
  assert.match(describeApproval(card), /Notiz senden — wartet auf Freigabe/);
  assert.equal(resultNoteFor({ ok: true, info: "Gespeichert." }), "Gespeichert.");
  assert.equal(resultNoteFor({ ok: true }), "Erledigt.");
  assert.equal(isExpired({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }), true);
  assert.equal(isExpired({ created_at: new Date().toISOString() }), false);
  assert.deepEqual(compactResult({ a: 1 }), { a: 1 });
  assert.equal((compactResult({ big: "x".repeat(10_000) }) as { truncated: boolean }).truncated, true);
  assert.equal(compactResult(undefined), null);
});
