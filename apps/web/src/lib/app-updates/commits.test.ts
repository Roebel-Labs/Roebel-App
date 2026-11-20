import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByArea, updateSlug, userFacingChanges } from "./commits";

const commit = (subject: string, date = "2026-11-10T10:00:00Z") => ({ sha: subject + date, subject, date });

test("keeps feat and fix, drops everything else", () => {
  const changes = userFacingChanges([
    commit("feat(expo): Röbel Münzen tips on comments"),
    commit("fix(web): broken map"),
    commit("docs(studio): interface languages"),
    commit("chore(deps): upgrade Expo SDK"),
    commit("Merge branch 'main'"),
  ]);
  assert.deepEqual(changes.map((c) => c.text).sort(), ["Röbel Münzen tips on comments", "broken map"]);
});

test("drops internal scopes and maps known scopes to plain area names", () => {
  const changes = userFacingChanges([
    commit("fix(ci): cache"),
    commit("feat(chat): daily briefing", "2026-11-11T10:00:00Z"),
    commit("feat: something general"),
  ]);
  assert.deepEqual(changes.map((c) => c.area), ["Mecky und Assistenten", "Allgemein"]);
});

test("removes hashes and wallet addresses and deduplicates", () => {
  const changes = userFacingChanges([
    commit("fix(expo): crash after 4da83fd for 0x5e6528D2aa"),
    commit("fix(expo): crash after 4da83fd for 0x5e6528D2aa", "2026-11-09T10:00:00Z"),
  ]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].text, "crash after for");
});

test("sorts newest first", () => {
  const changes = userFacingChanges([
    commit("feat(expo): old", "2026-11-01T00:00:00Z"),
    commit("feat(expo): new", "2026-11-12T00:00:00Z"),
  ]);
  assert.equal(changes[0].text, "new");
});

test("groups put the busiest area first and features before fixes", () => {
  const groups = groupByArea(
    userFacingChanges([commit("fix(expo): a"), commit("feat(expo): b"), commit("feat(web): c")]),
  );
  assert.equal(groups[0].area, "App");
  assert.deepEqual(groups[0].changes.map((c) => c.kind), ["feat", "fix"]);
});

test("slug transliterates and appends the date", () => {
  assert.equal(updateSlug("Neue Münzen für Röbel!", "2026-11-16T08:00:00Z"), "neue-muenzen-fuer-roebel-2026-11-16");
  assert.equal(updateSlug("???", "2026-11-16"), "app-update-2026-11-16");
});
