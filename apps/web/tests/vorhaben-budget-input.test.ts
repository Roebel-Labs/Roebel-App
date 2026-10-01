import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBudgetInput } from "../src/lib/vorhaben/budget-input";

test("empty input is ok and null", () => {
  assert.deepEqual(parseBudgetInput(), { ok: true, amount: null, beneficiary: null });
  assert.deepEqual(parseBudgetInput("  ", " "), { ok: true, amount: null, beneficiary: null });
});

test("comma and dot accepted", () => {
  assert.deepEqual(parseBudgetInput("150,5", " Verein "), { ok: true, amount: "150.5", beneficiary: "Verein" });
  assert.deepEqual(parseBudgetInput("9999999.99"), { ok: true, amount: "9999999.99", beneficiary: null });
});

test("rejects bad amounts", () => {
  for (const a of ["1.234", "10000000", "abc", "-5", "0", "0,00", "1,2,3"]) {
    assert.equal(parseBudgetInput(a).ok, false, a);
  }
});

test("rejects long beneficiary", () => {
  assert.equal(parseBudgetInput("5", "x".repeat(141)).ok, false);
  assert.equal(parseBudgetInput("5", "x".repeat(140)).ok, true);
});
