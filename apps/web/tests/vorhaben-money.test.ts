import assert from "node:assert/strict";
import { test } from "node:test";
import { toAtto, fromAtto, feeAtto } from "../src/lib/vorhaben/money";
import * as edge from "../../expo/supabase/functions/_shared/payout-amount";
import * as consts from "../src/lib/vorhaben/constants";
import { CONTRACTS } from "../../../packages/blockchain/src/index";

test("toAtto handles integers, decimals and postgres numeric strings", () => {
  assert.equal(toAtto("5"), 5n * 10n ** 18n);
  assert.equal(toAtto("0.25"), 25n * 10n ** 16n);
  assert.equal(toAtto("150.000000000000000000"), 150n * 10n ** 18n);
  assert.equal(toAtto(10), 10n * 10n ** 18n);
});

test("toAtto rejects junk and negatives", () => {
  assert.throws(() => toAtto("-1"));
  assert.throws(() => toAtto("1e3"));
  assert.throws(() => toAtto(""));
});

test("fromAtto trims trailing zeros", () => {
  assert.equal(fromAtto(25n * 10n ** 16n), "0.25");
  assert.equal(fromAtto(150n * 10n ** 18n), "150");
});

test("fee is floor(amount * bps / 10000)", () => {
  assert.equal(fromAtto(feeAtto(toAtto("150"), 500)), "7.5");
  assert.equal(fromAtto(feeAtto(toAtto("5"), 500)), "0.25");
  assert.equal(fromAtto(feeAtto(toAtto("10"), 500)), "0.5");
  assert.equal(feeAtto(1n, 500), 0n);
  assert.throws(() => feeAtto(1n, 10001));
});

test("edge copy matches the web implementation", () => {
  for (const v of ["0", "5", "0.25", "150.000000000000000000", "123.456789"]) {
    assert.equal(edge.toAtto(v), toAtto(v));
    assert.equal(edge.fromAtto(toAtto(v)), fromAtto(toAtto(v)));
  }
});

test("constants mirror packages/blockchain", () => {
  assert.equal(consts.GOVERNOR.toLowerCase(), CONTRACTS.maciAttesterGovernor.toLowerCase());
  assert.equal(consts.ATTESTER_NFT.toLowerCase(), CONTRACTS.attesterNFT.toLowerCase());
});
