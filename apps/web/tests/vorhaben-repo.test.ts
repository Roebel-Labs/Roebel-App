import assert from "node:assert/strict";
import { test } from "node:test";
import { isActiveProposal } from "../src/lib/vorhaben/repo";

const now = Date.parse("2026-10-01T12:00:00Z");
const future = "2026-10-05T00:00:00Z";
const past = "2026-09-25T00:00:00Z";

test("in-progress proposal is active", () => {
  assert.equal(isActiveProposal({ lifecycle_stage: "in_umsetzung", tally_confirm_until: null }, false, now), true);
});
test("abgelehnt with no window and no lines is inactive", () => {
  assert.equal(isActiveProposal({ lifecycle_stage: "abgelehnt", tally_confirm_until: null }, false, now), false);
});
test("umgesetzt with open lines is active", () => {
  assert.equal(isActiveProposal({ lifecycle_stage: "umgesetzt", tally_confirm_until: null }, true, now), true);
});
test("abgelehnt with window still open is active", () => {
  assert.equal(isActiveProposal({ lifecycle_stage: "abgelehnt", tally_confirm_until: future }, false, now), true);
});
test("abgelehnt with expired window is inactive", () => {
  assert.equal(isActiveProposal({ lifecycle_stage: "abgelehnt", tally_confirm_until: past }, false, now), false);
});

test("toLineRow normalises PostgREST numeric amounts to decimal strings", async () => {
  const { amountString, toLineRow } = await import("../src/lib/vorhaben/repo");
  assert.equal(amountString(150), "150");
  assert.equal(amountString(0.5), "0.5");
  assert.equal(amountString(1e-7), "0.0000001");
  assert.equal(amountString("7.5"), "7.5");
  assert.throws(() => amountString(null));
  assert.equal(toLineRow({ id: "x", amount: 12.25 }).amount, "12.25");
});
