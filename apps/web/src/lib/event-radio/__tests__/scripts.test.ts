// apps/web/src/lib/event-radio/__tests__/scripts.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanScript } from "../scripts";
import { HARD_RULES, TONE } from "../prompts";

test("cleanScript turns exclamation marks into periods so the voice stays calm", () => {
  assert.equal(cleanScript("Moin Röbel! Kommt vorbei!! Ich freu mich."), "Moin Röbel. Kommt vorbei. Ich freu mich.");
});

test("cleanScript still folds dash asides into commas and collapses whitespace", () => {
  assert.equal(cleanScript("Samstag — am Hafen –  ab vierzehn Uhr"), "Samstag, am Hafen, ab vierzehn Uhr");
});

test("cleanScript never leaves a run of periods behind", () => {
  assert.equal(cleanScript("Bis dann!."), "Bis dann.");
});

test("the prompts ask for a quiet delivery and forbid exclamation marks", () => {
  assert.ok(TONE.includes("ruhig"));
  assert.ok(TONE.includes("Nie laut"));
  assert.ok(HARD_RULES.includes("Keine Ausrufezeichen"));
});
