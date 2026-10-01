import assert from "node:assert/strict";
import { test } from "node:test";
import { decideTaskAction, PROPOSER_INACTIVE_SEC, type TaskCtx } from "../src/lib/vorhaben/task-machine";

const base: TaskCtx = {
  status: "offen", actor: "0xcitizen", proposer: "0xproposer", assignee: null, actorIsAttester: false,
  applicants: [], firstApplicationAt: null, nowSec: 1_000_000, hasProof: false, comment: null, target: null,
  proposalStage: "abstimmung",
};
const ok = (d: ReturnType<typeof decideTaskAction>, next: string) => { assert.equal(d.ok, true, JSON.stringify(d)); if (d.ok) assert.equal(d.next, next); };
const no = (d: ReturnType<typeof decideTaskAction>, code: string) => { assert.equal(d.ok, false); if (!d.ok) assert.equal(d.code, code); };

test("anyone may apply to an open task, once", () => {
  ok(decideTaskAction("apply", base), "offen");
  no(decideTaskAction("apply", { ...base, applicants: ["0xcitizen"] }), "ALREADY_APPLIED");
  no(decideTaskAction("apply", { ...base, status: "vergeben" }), "BAD_STATUS");
});

test("no applications once the proposal is rejected", () => {
  no(decideTaskAction("apply", { ...base, proposalStage: "abgelehnt" }), "PROPOSAL_CLOSED");
});

test("proposer assigns an applicant", () => {
  ok(decideTaskAction("assign", { ...base, actor: "0xproposer", applicants: ["0xa"], target: "0xa" }), "vergeben");
  no(decideTaskAction("assign", { ...base, actor: "0xproposer", applicants: ["0xa"], target: "0xb" }), "NOT_AN_APPLICANT");
  no(decideTaskAction("assign", { ...base, actor: "0xother", applicants: ["0xa"], target: "0xa" }), "FORBIDDEN");
});

test("proposer who applied cannot assign themselves; an other Attester must", () => {
  const c = { ...base, applicants: ["0xproposer", "0xa"], target: "0xproposer" };
  no(decideTaskAction("assign", { ...c, actor: "0xproposer", actorIsAttester: true }), "SELF_ASSIGN");
  ok(decideTaskAction("assign", { ...c, actor: "0xattester", actorIsAttester: true }), "vergeben");
  // Even assigning someone else: once the proposer applied, only an Attester picks.
  no(decideTaskAction("assign", { ...c, actor: "0xproposer", target: "0xa" }), "FORBIDDEN");
});

test("an Attester may assign after the proposer has been inactive 7 days", () => {
  const c = { ...base, actor: "0xattester", actorIsAttester: true, applicants: ["0xa"], target: "0xa" };
  no(decideTaskAction("assign", { ...c, firstApplicationAt: base.nowSec - 100 }), "FORBIDDEN");
  ok(decideTaskAction("assign", { ...c, firstApplicationAt: base.nowSec - PROPOSER_INACTIVE_SEC - 1 }), "vergeben");
});

test("assignee works the task", () => {
  const c = { ...base, status: "vergeben" as const, assignee: "0xa", actor: "0xa" };
  ok(decideTaskAction("start", c), "in_arbeit");
  ok(decideTaskAction("proof", c), "in_arbeit");
  no(decideTaskAction("start", { ...c, actor: "0xb" }), "FORBIDDEN");
  no(decideTaskAction("submit", { ...c, status: "in_arbeit" }), "PROOF_REQUIRED");
  ok(decideTaskAction("submit", { ...c, status: "in_arbeit", hasProof: true }), "eingereicht");
});

test("approval: Attester who is not the assignee", () => {
  const c = { ...base, status: "eingereicht" as const, assignee: "0xa" };
  ok(decideTaskAction("approve", { ...c, actor: "0xatt", actorIsAttester: true }), "abgenommen");
  no(decideTaskAction("approve", { ...c, actor: "0xa", actorIsAttester: true }), "SELF_APPROVE");
  no(decideTaskAction("approve", { ...c, actor: "0xproposer" }), "FORBIDDEN");
  no(decideTaskAction("request_changes", { ...c, actor: "0xatt", actorIsAttester: true }), "COMMENT_REQUIRED");
  ok(decideTaskAction("request_changes", { ...c, actor: "0xatt", actorIsAttester: true, comment: "Quittung fehlt" }), "in_arbeit");
});

test("cancel needs proposer or Attester and a comment; final states stay final", () => {
  no(decideTaskAction("cancel", { ...base, actor: "0xproposer" }), "COMMENT_REQUIRED");
  ok(decideTaskAction("cancel", { ...base, actor: "0xproposer", comment: "Nicht mehr nötig" }), "abgebrochen");
  no(decideTaskAction("cancel", { ...base, actor: "0xx", comment: "x" }), "FORBIDDEN");
  no(decideTaskAction("cancel", { ...base, status: "abgenommen", actor: "0xproposer", comment: "x" }), "BAD_STATUS");
});

test("comments: anyone, but not empty", () => {
  ok(decideTaskAction("comment", { ...base, comment: "Frage" }), "offen");
  no(decideTaskAction("comment", base), "COMMENT_REQUIRED");
});

test("withdraw: applicant removes themselves, others and non-offen status fail", () => {
  ok(decideTaskAction("withdraw", { ...base, applicants: ["0xcitizen"], actor: "0xcitizen" }), "offen");
  no(decideTaskAction("withdraw", { ...base, actor: "0xcitizen" }), "NOT_AN_APPLICANT");
  no(decideTaskAction("withdraw", { ...base, status: "vergeben" }), "BAD_STATUS");
});

test("assign gated when proposal is rejected", () => {
  no(decideTaskAction("assign", { ...base, actor: "0xproposer", applicants: ["0xa"], target: "0xa", proposalStage: "abgelehnt" }), "PROPOSAL_CLOSED");
});

test("proof: non-assignee forbidden, eingereicht state rejected", () => {
  const c = { ...base, status: "vergeben" as const, assignee: "0xa" };
  no(decideTaskAction("proof", { ...c, actor: "0xb" }), "FORBIDDEN");
  no(decideTaskAction("proof", { ...c, status: "eingereicht", actor: "0xa" }), "BAD_STATUS");
});

test("cancel by Attester (not proposer) with comment", () => {
  ok(decideTaskAction("cancel", { ...base, actor: "0xattester", actorIsAttester: true, comment: "Widerspruch" }), "abgebrochen");
});
