import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTESTER_SAFE } from "../src/lib/vorhaben/constants";
import { hasSafeTransfer } from "../src/lib/vorhaben/rails/manual";

const ASSIGNEE = "0x" + "2".repeat(40);
const PLATFORM = "0xbcabbaa26420e0a4771808f9639d4176355e5d4b";
const E = 10n ** 18n;
// One Safe batch tx: reward to the assignee + 5 % platform fee.
const batch = [
  { from: ATTESTER_SAFE, to: ASSIGNEE, value: 5n * E },
  { from: ATTESTER_SAFE, to: PLATFORM, value: E / 4n },
];

test("matches the exact amount from the Safe; without `to` any recipient counts (budget lines)", () => {
  assert.equal(hasSafeTransfer(batch, "5"), true);
  assert.equal(hasSafeTransfer(batch, "5", null), true);
  assert.equal(hasSafeTransfer(batch, "5.01"), false);
});

test("with `to`, the matching transfer must go to that recipient (case-insensitive)", () => {
  assert.equal(hasSafeTransfer(batch, "5", ASSIGNEE.toUpperCase().replace("0X", "0x")), true);
  assert.equal(hasSafeTransfer(batch, "0.25", PLATFORM), true);
  assert.equal(hasSafeTransfer(batch, "5", PLATFORM), false);
  assert.equal(hasSafeTransfer(batch, "0.25", ASSIGNEE), false);
});

test("a transfer from anyone but the Safe never matches", () => {
  assert.equal(hasSafeTransfer([{ from: ASSIGNEE, to: PLATFORM, value: 5n * E }], "5", PLATFORM), false);
});
