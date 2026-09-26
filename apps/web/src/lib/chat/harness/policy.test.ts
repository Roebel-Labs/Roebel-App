import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_GATED_CAP, decide, gatedToolsOffered, isGrantable, parseEnabledSetting } from "./policy";

const open = { actionsEnabled: true, paused: false, usedToday: 0 };

test("decide: read/private always run, even with kill switch, pause or cap", () => {
  for (const risk of ["read", "private"] as const) {
    assert.deepEqual(decide(risk, { granted: false, ...open }), { kind: "run" });
    assert.deepEqual(decide(risk, { granted: false, actionsEnabled: false, paused: true, usedToday: 99 }), { kind: "run" });
  }
});

test("decide: public/external ask for approval unless granted", () => {
  for (const risk of ["public", "external"] as const) {
    assert.deepEqual(decide(risk, { granted: false, ...open }), { kind: "approval" });
    assert.deepEqual(decide(risk, { granted: true, ...open }), { kind: "run" });
  }
});

test("decide: money always needs approval, a grant never skips it", () => {
  assert.deepEqual(decide("money", { granted: true, ...open }), { kind: "approval" });
  assert.equal(isGrantable("money"), false);
  assert.equal(isGrantable("public"), true);
  assert.equal(isGrantable("read"), false);
});

test("decide: kill switch, pause and daily cap block gated tools", () => {
  const off = decide("public", { granted: true, ...open, actionsEnabled: false });
  assert.equal(off.kind, "blocked");
  assert.equal(off.kind === "blocked" && off.reason, "disabled");
  const paused = decide("external", { granted: false, ...open, paused: true });
  assert.equal(paused.kind === "blocked" && paused.reason, "paused");
  const cap = decide("public", { granted: true, ...open, usedToday: DAILY_GATED_CAP });
  assert.equal(cap.kind === "blocked" && cap.reason, "cap");
  assert.equal(decide("money", { granted: false, ...open, usedToday: DAILY_GATED_CAP }).kind, "blocked");
  assert.deepEqual(decide("public", { granted: true, ...open, usedToday: DAILY_GATED_CAP - 1 }), { kind: "run" });
  assert.equal(DAILY_GATED_CAP, 20);
});

test("parseEnabledSetting: missing = enabled, only explicit false disables", () => {
  assert.equal(parseEnabledSetting(null), true);
  assert.equal(parseEnabledSetting(undefined), true);
  assert.equal(parseEnabledSetting("true"), true);
  assert.equal(parseEnabledSetting(" FALSE "), false);
  assert.equal(parseEnabledSetting("0"), false);
  assert.equal(gatedToolsOffered({ actionsEnabled: true, paused: false }), true);
  assert.equal(gatedToolsOffered({ actionsEnabled: false, paused: false }), false);
  assert.equal(gatedToolsOffered({ actionsEnabled: true, paused: true }), false);
});
