import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSettings } from "../src/lib/vorhaben/settings";

const rows = [
  { key: "platform_fee_bps", value: "500" },
  { key: "platform_safe_address", value: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b" },
  { key: "wahlhelfer_reward_asset", value: "MUENZEN" },
  { key: "wahlhelfer_reward_amount", value: "10" },
  { key: "budget_fee_rail", value: "funder_xdai" },
  { key: "tally_confirm_window_days", value: "7" },
  { key: "dispatch_enabled", value: "false" },
];

test("parses the seeded settings", () => {
  assert.deepEqual(parseSettings(rows), {
    platformFeeBps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", wahlhelferAsset: "MUENZEN",
    wahlhelferAmount: "10", budgetFeeRail: "funder_xdai", taskPayoutRail: "manual_safe", windowDays: 7, dispatchEnabled: false,
  });
});

test("task_payout_rail defaults to manual_safe when missing; safe_eure is accepted; anything else throws", () => {
  assert.equal(parseSettings(rows).taskPayoutRail, "manual_safe");
  assert.equal(parseSettings([...rows, { key: "task_payout_rail", value: "" }]).taskPayoutRail, "manual_safe");
  assert.equal(parseSettings([...rows, { key: "task_payout_rail", value: "safe_eure" }]).taskPayoutRail, "safe_eure");
  assert.equal(parseSettings([...rows, { key: "task_payout_rail", value: "manual_safe" }]).taskPayoutRail, "manual_safe");
  assert.throws(() => parseSettings([...rows, { key: "task_payout_rail", value: "funder_xdai" }]));
});

test("rejects a missing or malformed key instead of defaulting", () => {
  assert.throws(() => parseSettings(rows.filter((r) => r.key !== "platform_safe_address")));
  assert.throws(() => parseSettings(rows.map((r) => (r.key === "platform_fee_bps" ? { ...r, value: "abc" } : r))));
  assert.throws(() => parseSettings(rows.map((r) => (r.key === "platform_safe_address" ? { ...r, value: "0x123" } : r))));
});
