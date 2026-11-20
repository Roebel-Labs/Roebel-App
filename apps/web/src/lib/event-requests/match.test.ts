import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKey, findDuplicate, matchOrganisation, titlesMatch } from "./match";

const ORGS = [
  { id: "bib", name: "Stadtbibliothek Röbel" },
  { id: "chor", name: "Männerchor Röbel v.1855 e.V." },
  { id: "jh", name: "Jugendhaus Röbel" },
  { id: "news", name: "Röbel.APP News" },
  { id: "sv1", name: "Sportverein Röbel" },
  { id: "sv2", name: "Sportverein Müritz" },
];

test("poster organiser matches the account despite the town suffix", () => {
  assert.equal(matchOrganisation("Stadtbibliothek Röbel-Müritz", ORGS)?.id, "bib");
  assert.equal(matchOrganisation("Stadtbibliothek Röbel/Müritz, Kirchplatz 18", ORGS)?.id, "bib");
  assert.equal(matchOrganisation("Männerchor Röbel", ORGS)?.id, "chor");
});

test("town names alone never match, unknown organisers return null", () => {
  assert.equal(matchOrganisation("Stadt Röbel/Müritz", ORGS), null);
  assert.equal(matchOrganisation("Haus des Gastes", ORGS), null);
  assert.equal(matchOrganisation("", ORGS), null);
  assert.equal(matchOrganisation(null, ORGS), null);
});

test("two equally good organisations are no match", () => {
  assert.equal(matchOrganisation("Sportverein", ORGS), null);
});

test("the same event under a longer title is a duplicate", () => {
  assert.equal(titlesMatch("Wer möchte nicht im Leben bleiben", "Wer möchte nicht im Leben bleiben – Lesung mit Helene Bukowski"), true);
  assert.equal(titlesMatch("Weihnachtsmarkt", "Weihnachtsmarkt am Hafen"), false);
  assert.equal(titlesMatch("Adventskonzert", "Adventskonzert"), true);
  assert.equal(titlesMatch("Lesung mit Helene Bukowski", "Konzert des Männerchors"), false);
});

test("duplicates need the same date", () => {
  const existing = [{ title: "Wer möchte nicht im Leben bleiben", date: "2026-11-20" }];
  assert.ok(findDuplicate({ title: "Wer möchte nicht im Leben bleiben - Lesung", date: "2026-11-20" }, existing));
  assert.equal(findDuplicate({ title: "Wer möchte nicht im Leben bleiben - Lesung", date: "2026-11-21" }, existing), null);
});

test("dedupe key ignores punctuation, case and filler words", () => {
  assert.equal(dedupeKey("2026-11-20", "Lesung mit Helene Bukowski!"), dedupeKey("2026-11-20", "LESUNG – Helene  Bukowski"));
});
