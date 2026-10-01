import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveStage, type StageInput } from "../src/lib/vorhaben/stage";

const base: StageInput = { chainState: 1, nowSec: 100, deadlineSec: 200, tallyPublished: false,
  taskStatuses: [], lineStatuses: [], hasBudget: false, budgetLineConfirmed: false };

test("voting and counting", () => {
  assert.equal(deriveStage(base), "abstimmung");
  assert.equal(deriveStage({ ...base, nowSec: 300 }), "auszaehlung");
  // Governor reports Active until the tally lands; still counting.
  assert.equal(deriveStage({ ...base, nowSec: 300, chainState: 1, tallyPublished: false }), "auszaehlung");
});

test("rejected outcomes", () => {
  for (const s of [2, 3, 6]) assert.equal(deriveStage({ ...base, nowSec: 300, tallyPublished: true, chainState: s }), "abgelehnt");
});

test("accepted, in progress, done", () => {
  const won = { ...base, nowSec: 300, tallyPublished: true, chainState: 4 };
  assert.equal(deriveStage(won), "angenommen");
  assert.equal(deriveStage({ ...won, taskStatuses: ["offen"] }), "in_umsetzung");
  assert.equal(deriveStage({ ...won, lineStatuses: ["gesendet"] }), "in_umsetzung");
  assert.equal(deriveStage({ ...won, hasBudget: true }), "in_umsetzung");
  assert.equal(deriveStage({ ...won, chainState: 7, hasBudget: true, budgetLineConfirmed: true,
    taskStatuses: ["ausgezahlt", "abgebrochen"], lineStatuses: ["bestaetigt", "bestaetigt"] }), "umgesetzt");
  // All tasks cancelled and nothing paid except Wahlhelfer: still done once lines are confirmed.
  assert.equal(deriveStage({ ...won, taskStatuses: ["abgebrochen"], lineStatuses: ["bestaetigt"] }), "umgesetzt");
});

test("a failed line keeps the proposal in progress", () => {
  const won = { ...base, nowSec: 300, tallyPublished: true, chainState: 4 };
  assert.equal(deriveStage({ ...won, taskStatuses: ["ausgezahlt"], lineStatuses: ["fehlgeschlagen"] }), "in_umsetzung");
});
