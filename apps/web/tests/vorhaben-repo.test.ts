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
