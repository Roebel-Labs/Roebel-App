import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEASE_MS, MAX_ATTEMPTS, MAX_RUNNING_PER_WALLET, appendNote, applyStepUpdate, applyTaskPart, canTransitionTask,
  claimVerdict, normalizeCheckpoint, normalizeSteps, settleSteps, taskNote, taskPartOf,
} from "./tasks";
import type { TaskStep } from "./tasks";
import { finalMessageParts, matchBot } from "./task-worker";
import type { ChatPart } from "../types";

const now = new Date("2026-09-26T10:00:00Z");
const past = new Date(now.getTime() - 1000).toISOString();
const future = new Date(now.getTime() + LEASE_MS).toISOString();
const steps = (...s: [string, TaskStep["status"]][]): TaskStep[] => s.map(([label, status]) => ({ label, status }));

test("canTransitionTask: queue → run → wait/done, terminal stays terminal", () => {
  assert.ok(canTransitionTask("queued", "running"));
  assert.ok(canTransitionTask("running", "running")); // reclaim after expired lease
  assert.ok(canTransitionTask("running", "waiting_approval"));
  assert.ok(canTransitionTask("waiting_approval", "queued"));
  assert.ok(canTransitionTask("running", "cancelled"));
  assert.ok(!canTransitionTask("waiting_approval", "running"));
  assert.ok(!canTransitionTask("done", "queued"));
  assert.ok(!canTransitionTask("cancelled", "running"));
});

test("claimVerdict: due queued claims; waiting/terminal/not due never", () => {
  assert.deepEqual(claimVerdict({ status: "queued", next_tick_at: past, attempts: 0 }, now, 0), { ok: true });
  assert.equal(claimVerdict({ status: "queued", next_tick_at: future, attempts: 0 }, now, 0).ok, false);
  assert.deepEqual(claimVerdict({ status: "waiting_approval", next_tick_at: past, attempts: 1 }, now, 0), { ok: false, reason: "waiting" });
  assert.deepEqual(claimVerdict({ status: "done", next_tick_at: past, attempts: 1 }, now, 0), { ok: false, reason: "terminal" });
});

test("claimVerdict: running only after its lease expired", () => {
  assert.deepEqual(claimVerdict({ status: "running", next_tick_at: future, attempts: 1 }, now, 1), { ok: false, reason: "not_due" });
  assert.deepEqual(claimVerdict({ status: "running", next_tick_at: past, attempts: 1 }, now, MAX_RUNNING_PER_WALLET), { ok: true });
});

test("claimVerdict: concurrency cap per wallet + attempts cap", () => {
  assert.deepEqual(
    claimVerdict({ status: "queued", next_tick_at: past, attempts: 0 }, now, MAX_RUNNING_PER_WALLET),
    { ok: false, reason: "concurrency" },
  );
  assert.equal(claimVerdict({ status: "queued", next_tick_at: past, attempts: 0 }, now, MAX_RUNNING_PER_WALLET - 1).ok, true);
  assert.deepEqual(
    claimVerdict({ status: "queued", next_tick_at: past, attempts: MAX_ATTEMPTS }, now, 0),
    { ok: false, reason: "attempts" },
  );
});

test("normalizeSteps: strings and objects, junk dropped, capped", () => {
  assert.deepEqual(normalizeSteps(["A", " ", { label: "B", status: "done" }, { label: "C", status: "weird" }, 5]),
    steps(["A", "pending"], ["B", "done"], ["C", "pending"]));
  assert.equal(normalizeSteps(Array.from({ length: 40 }, (_, i) => `s${i}`)).length, 12);
  assert.deepEqual(normalizeSteps(null), []);
});

test("applyStepUpdate: by 1-based index, only one running", () => {
  const s = steps(["A", "running"], ["B", "pending"]);
  const r = applyStepUpdate(s, { index: 2, status: "running" });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.deepEqual(r.steps, steps(["A", "pending"], ["B", "running"]));
  assert.equal(r.index, 1);
  assert.equal(s[0].status, "running"); // input untouched
});

test("applyStepUpdate: by label matches or appends; bad index errors", () => {
  const s = steps(["Recherche", "running"]);
  const done = applyStepUpdate(s, { label: "recherche", status: "done" });
  assert.ok(!("error" in done) && done.steps[0].status === "done");
  const added = applyStepUpdate(s, { label: "Entwurf", status: "running" });
  assert.ok(!("error" in added));
  if (!("error" in added)) {
    assert.equal(added.steps.length, 2);
    assert.equal(added.index, 1);
    assert.equal(added.steps[0].status, "pending");
  }
  assert.ok("error" in applyStepUpdate(s, { index: 5, status: "done" }));
  assert.ok("error" in applyStepUpdate(s, { status: "done" }));
});

test("settleSteps: done finishes open steps, failed marks the running one, cancel resets", () => {
  const s = steps(["A", "done"], ["B", "running"], ["C", "pending"]);
  assert.deepEqual(settleSteps(s, "done").map((x) => x.status), ["done", "done", "done"]);
  assert.deepEqual(settleSteps(s, "failed").map((x) => x.status), ["done", "failed", "pending"]);
  assert.deepEqual(settleSteps(s, "cancelled").map((x) => x.status), ["done", "pending", "pending"]);
});

test("taskPartOf + applyTaskPart: patches the card in place by taskId", () => {
  const part = taskPartOf({ id: "t1", title: "Fest planen", status: "running", steps: [{ label: "A", status: "running" }] });
  const parts: ChatPart[] = [
    { type: "text", text: "Ich lege los." },
    { type: "task", taskId: "t1", title: "Fest planen", status: "queued", steps: [] },
    { type: "task", taskId: "t2", title: "Andere", status: "queued", steps: [] },
  ];
  const next = applyTaskPart(parts, part);
  assert.ok(next);
  assert.deepEqual(next![1], part);
  assert.deepEqual(next![2], parts[2]);
  assert.equal(applyTaskPart([{ type: "text", text: "x" }], part), null);
});

test("checkpoint notes are clipped and capped; note lists steps + results", () => {
  let cp = normalizeCheckpoint({ notes: ["alt"], files: [{ fileId: "f1", name: "Plan", ext: "md", size: 3 }] });
  for (let i = 0; i < 40; i++) cp = appendNote(cp, `n${i} ${"x".repeat(700)}`);
  assert.equal(cp.notes!.length, 30);
  assert.ok(cp.notes!.every((n) => n.length <= 600));
  const note = taskNote({
    title: "Fest", goal: "Plane das Fest", attempts: 2,
    steps: [{ label: "Recherche", status: "done" }, { label: "Entwurf", status: "pending" }],
    checkpoint: { notes: ["Schritt 1: 3 Orte gefunden"], files: [{ fileId: "f1", name: "Plan", ext: "md", size: 3 }] },
  });
  assert.match(note, /1\. Recherche — erledigt/);
  assert.match(note, /2\. Entwurf — offen/);
  assert.match(note, /3 Orte gefunden/);
  assert.match(note, /Plan\.md/);
  assert.match(note, /Durchgang 2/);
  assert.doesNotMatch(note, /0x/);
});

test("finalMessageParts: result text + files; failure text", () => {
  const cp = { files: [{ fileId: "f1", name: "Plan", ext: "md", size: 12 }] };
  const done = finalMessageParts({ title: "Fest", status: "done", result: "Alles steht.", error: null }, cp);
  assert.equal(done[0].type, "text");
  assert.match((done[0] as { text: string }).text, /Aufgabe erledigt: Fest[\s\S]*Alles steht/);
  assert.deepEqual(done[1], { type: "file", fileId: "f1", name: "Plan", ext: "md", size: 12 });
  const failed = finalMessageParts({ title: "Fest", status: "failed", result: null, error: "Kein Zugang." }, {});
  assert.match((failed[0] as { text: string }).text, /nicht abschließen\. Kein Zugang\./);
});

test("matchBot: id, slug, exact name, prefix, @", () => {
  const bots = [
    { id: "b1", slug: "mecky", name: "Mecky" },
    { id: "b2", slug: null, name: "Vereinshelfer" },
  ];
  assert.equal(matchBot(bots, "b2")?.id, "b2");
  assert.equal(matchBot(bots, "MECKY")?.id, "b1");
  assert.equal(matchBot(bots, "@Mecky")?.id, "b1");
  assert.equal(matchBot(bots, "vereins")?.id, "b2");
  assert.equal(matchBot(bots, "niemand"), null);
});
