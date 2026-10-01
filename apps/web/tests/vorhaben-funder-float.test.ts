import assert from "node:assert/strict";
import { test } from "node:test";
import { assetMatchesRail, floatDecision, XDAI_GAS_RESERVE_ATTO } from "../../expo/supabase/functions/_shared/funder-float";

const E = 10n ** 18n;

test("Münzen: needs the amount in Münzen and a gas reserve in xDAI", () => {
  assert.equal(floatDecision("funder_muenzen", 10n * E, 139n * E, 2n * E), "ok");
  assert.equal(floatDecision("funder_muenzen", 10n * E, 9n * E, 2n * E), "float_low");
  assert.equal(floatDecision("funder_muenzen", 10n * E, 139n * E, XDAI_GAS_RESERVE_ATTO - 1n), "float_low");
});

test("xDAI: keeps the gas reserve back", () => {
  assert.equal(floatDecision("funder_xdai", 75n * E / 10n, 0n, 8n * E), "ok");
  assert.equal(floatDecision("funder_xdai", 75n * E / 10n, 0n, 2n * E), "float_low");
  assert.equal(floatDecision("funder_xdai", 75n * E / 10n, 0n, 75n * E / 10n + XDAI_GAS_RESERVE_ATTO - 1n), "float_low");
});

test("asset must match the rail", () => {
  assert.equal(assetMatchesRail("funder_muenzen", "MUENZEN"), true);
  assert.equal(assetMatchesRail("funder_xdai", "XDAI"), true);
  assert.equal(assetMatchesRail("funder_muenzen", "XDAI"), false);
  assert.equal(assetMatchesRail("funder_xdai", "EURe"), false);
});
