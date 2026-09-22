import assert from "node:assert/strict";
import { test } from "node:test";
import { pickDirections, PLAKATIV } from "../src/lib/poster/directions";
import { decideMode } from "../src/lib/poster/decide";
import { evaluateCaps } from "../src/lib/poster/caps";
import type { PosterAnalysis } from "../src/lib/poster/types";

const poster: PosterAnalysis = {
  kind: "poster", hasEventInfo: true, visibleText: ["Saisonabschluss"], hasUiChrome: false,
  brandColors: ["#1a73e8"], styleNotes: "", quality: "ok",
};

test("design mode always leads with Plakativ, second is category specific", () => {
  const [a, b] = pickDirections("design", "Sport");
  assert.equal(a.id, PLAKATIV.id);
  assert.equal(b.id, "editorial");
  assert.equal(pickDirections("design", "Kirchliches")[1].id, "ruhig");
  assert.equal(pickDirections("design", null)[1].id, "festlich");
  assert.equal(pickDirections("design", "Unbekannt")[1].id, "festlich");
});

test("reformat mode is originaltreu then aufgefrischt", () => {
  assert.deepEqual(pickDirections("reformat", "Musik").map((d) => d.id), ["originaltreu", "aufgefrischt"]);
});

test("decideMode: fine A-format poster is skipped", () => {
  assert.equal(decideMode("ok", poster), "skip");
});

test("decideMode: posters with info in the wrong ratio or with chrome are reformatted", () => {
  assert.equal(decideMode("landscape", poster), "reformat");
  assert.equal(decideMode("ok", { ...poster, hasUiChrome: true }), "reformat");
  assert.equal(decideMode("too_tall", { ...poster, kind: "screenshot" }), "reformat");
  assert.equal(decideMode("ok", { ...poster, quality: "low_res" }), "reformat");
});

test("decideMode: logos, photos and posters without info are designed", () => {
  assert.equal(decideMode("square", { ...poster, kind: "logo", hasEventInfo: false }), "design");
  assert.equal(decideMode("ok", { ...poster, kind: "photo", hasEventInfo: false }), "design");
  assert.equal(decideMode("landscape", { ...poster, hasEventInfo: false }), "design");
  assert.equal(decideMode(null, null), "design");
});

test("caps: kill switch and budget apply to everyone, per-draft and per-account only to non-admins", () => {
  const base = { enabled: true, budgetLimitUsd: 20, budgetSpentTodayUsd: 1, batchesForDraft: 0, batchesForAccountToday: 0 };
  assert.deepEqual(evaluateCaps({ ...base, requestedBy: "admin" }), { ok: true });
  assert.equal(evaluateCaps({ ...base, requestedBy: "admin", enabled: false }).ok, false);
  assert.equal(evaluateCaps({ ...base, requestedBy: "admin", budgetSpentTodayUsd: 20 }).ok, false);
  assert.deepEqual(evaluateCaps({ ...base, requestedBy: "admin", batchesForDraft: 5, batchesForAccountToday: 50 }), { ok: true });
  const draftLimit = evaluateCaps({ ...base, requestedBy: "submitter", batchesForDraft: 2 });
  assert.equal(draftLimit.ok, false);
  assert.equal(!draftLimit.ok && draftLimit.reason, "draft_limit");
  const accountLimit = evaluateCaps({ ...base, requestedBy: "org", batchesForAccountToday: 10 });
  assert.equal(!accountLimit.ok && accountLimit.reason, "account_limit");
  assert.deepEqual(evaluateCaps({ ...base, requestedBy: "org", batchesForDraft: 1, batchesForAccountToday: 9 }), { ok: true });
});
