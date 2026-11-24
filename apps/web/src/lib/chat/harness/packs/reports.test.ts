import { test } from "node:test";
import assert from "node:assert/strict";
import { accountReport, changePct, reportRange } from "./reports";

test("changePct: percent vs previous, null without base", () => {
  assert.equal(changePct(150, 100), 50);
  assert.equal(changePct(50, 100), -50);
  assert.equal(changePct(10, 0), null);
});

test("reportRange: inclusive Berlin days ending today", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  assert.deepEqual(reportRange(1, now), { from: "2026-11-24", to: "2026-11-24" });
  assert.deepEqual(reportRange(30, now), { from: "2026-10-26", to: "2026-11-24" });
  // 23:30 UTC on Nov 24 is already Nov 25 in Berlin.
  assert.equal(reportRange(7, new Date("2026-11-24T23:30:00Z")).to, "2026-11-25");
});

test("account_report: private read tool in the user pack", () => {
  assert.equal(accountReport.risk, "private");
  assert.equal(accountReport.pack, "user");
  const parsed = accountReport.inputSchema.parse({});
  assert.equal(parsed.days, 30);
  assert.equal(parsed.account, "organisation");
});
