import assert from "node:assert/strict";
import { test } from "node:test";
import { planBudgetFeeLine, planBudgetLines, planTaskLines, planWahlhelferLines, railForAsset, type FeeConfig } from "../src/lib/vorhaben/payout-plan";

const fee: FeeConfig = { bps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", budgetFeeRail: "funder_xdai" };

test("wahlhelfer: 10 Münzen + 0.5 Münzen fee on the funder rail", () => {
  const lines = planWahlhelferLines({ wahlhelferId: "w1", wallet: "0xAA", label: "Anna", amount: "10", asset: "MUENZEN" }, fee);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.asset, l.rail, l.reference_type, l.reference_id]), [
    ["wahlhelfer", "10", "MUENZEN", "funder_muenzen", "wahlhelfer", "w1"],
    ["plattform", "0.5", "MUENZEN", "funder_muenzen", "wahlhelfer", "w1"],
  ]);
  assert.equal(lines[0].recipient_wallet, "0xaa");
  assert.equal(lines[1].recipient_wallet, fee.platformSafe);
  assert.equal(lines[1].recipient_label, "Plattform");
});

test("task: 5 EURe + 0.25 EURe fee, both on the Safe rail", () => {
  const lines = planTaskLines({ taskId: "t1", wallet: "0xbb", label: "Ben", amount: "5", asset: "EURe" }, fee, "safe_eure");
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.rail]), [["aufgabe", "5", "safe_eure"], ["plattform", "0.25", "safe_eure"]]);
});

test("task: task_payout_rail manual_safe puts the reward AND its fee on manual_safe (EURe)", () => {
  const lines = planTaskLines({ taskId: "t1", wallet: "0xbb", label: "Ben", amount: "5", asset: "EURe" }, fee, "manual_safe");
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.asset, l.rail, l.recipient_wallet, l.reference_type, l.reference_id]), [
    ["aufgabe", "5", "EURe", "manual_safe", "0xbb", "task", "t1"],
    ["plattform", "0.25", "EURe", "manual_safe", fee.platformSafe, "task", "t1"],
  ]);
});

test("task: a non-EURe reward keeps its own rail (manual payouts are verified as EURe only)", () => {
  const lines = planTaskLines({ taskId: "t1", wallet: "0xbb", label: "Ben", amount: "5", asset: "EURC" }, fee, "manual_safe");
  assert.deepEqual(lines.map((l) => l.rail), ["safe_eurc_base", "safe_eurc_base"]);
});

test("budget: only the manual Safe line in EURe; no fee before the transfer is confirmed", () => {
  const lines = planBudgetLines({ proposalId: "p1", beneficiary: "Seglerverein", amount: "150", asset: "EURe" });
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.asset, l.rail, l.recipient_wallet]), [
    ["empfaenger", "150", "EURe", "manual_safe", null],
  ]);
});

test("budget fee: 7.5 xDAI on the funder rail, referencing the proposal", () => {
  const lines = planBudgetFeeLine({ proposalId: "p1", amount: "150", asset: "EURe" }, fee);
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.asset, l.rail, l.recipient_wallet, l.recipient_label, l.reference_type, l.reference_id]), [
    ["plattform", "7.5", "XDAI", "funder_xdai", fee.platformSafe, "Plattform", "proposal", "p1"],
  ]);
});

test("budget fee: zero bps produces no line", () => {
  assert.deepEqual(planBudgetFeeLine({ proposalId: "p1", amount: "150", asset: "EURe" }, { ...fee, bps: 0 }), []);
});

test("zero fee produces no platform line", () => {
  const lines = planTaskLines({ taskId: "t1", wallet: "0xbb", label: "Ben", amount: "5", asset: "EURe" }, { ...fee, bps: 0 }, "manual_safe");
  assert.equal(lines.length, 1);
});

test("rail per asset", () => {
  assert.equal(railForAsset("MUENZEN"), "funder_muenzen");
  assert.equal(railForAsset("XDAI"), "funder_xdai");
  assert.equal(railForAsset("EURe"), "safe_eure");
  assert.equal(railForAsset("EURC"), "safe_eurc_base");
});
