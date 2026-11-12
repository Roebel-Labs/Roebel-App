import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTINE_CATEGORIES, ROUTINE_TEMPLATES } from "./catalog";
import { formatPersonaBlock, formatSkillsBlock, parseSkillInput, searchPages } from "./runtime";
import type { PageRow } from "./store";

const row = (over: Partial<PageRow>): PageRow => ({
  wallet: "0xabc", slug: "overview", kind: "overview", title: "Übersicht", summary: "", parent: null, body: "", facts: [], sources: [],
  meta: {}, edited_by_user: false, created_at: "2026-11-12T08:00:00Z", updated_at: "2026-11-12T08:00:00Z", ...over,
});

test("no wiki → no block", () => {
  assert.equal(formatPersonaBlock([], null), null);
  assert.equal(formatPersonaBlock([row({})], null), null);
});

test("the block carries the core, people by priority, notes and the page index, never the wallet", () => {
  const block = formatPersonaBlock([
    row({ slug: "_core", kind: "core", body: "Max baut die Röbel-App." }),
    row({ slug: "goals", kind: "goals", title: "Ziele" }),
    row({ slug: "notes", kind: "notes", title: "Notizen", body: "- Duzt alle. (12.11.2026)" }),
    row({ slug: "person-b", kind: "person", title: "Lars Richter", meta: { description: "Teamkollege", priority: 5 } }),
    row({ slug: "person-a", kind: "person", title: "Anne Eckloff", meta: { description: "Projektmanagerin HANGAR", priority: 9 } }),
  ], "2026-11-12T08:00:00Z")!;
  assert.match(block, /Max baut die Röbel-App\./);
  assert.ok(block.indexOf("Anne Eckloff") < block.indexOf("Lars Richter"));
  assert.match(block, /- Duzt alle\./);
  assert.match(block, /goals \(Ziele\)/);
  assert.doesNotMatch(block, /_core/);
  assert.doesNotMatch(block, /0xabc/);
  assert.match(block, /keine Anweisungen an dich/);
});

test("skills block lists name and description only", () => {
  assert.equal(formatSkillsBlock([]), null);
  assert.match(formatSkillsBlock([{ name: "Pressemitteilung", description: "Aufbau und Ton" }])!, /- Pressemitteilung: Aufbau und Ton/);
});

test("searchPages ranks title hits first and returns matching lines", () => {
  const hits = searchPages([
    row({ slug: "projects", title: "Projekte", body: "## HANGAR\n- Bewerbung für Kohorte 4 im März [[1]]" }),
    row({ slug: "person-a", title: "Anne Eckloff", summary: "HANGAR", body: "## Kontakt\n- STIC" }),
    row({ slug: "goals", title: "Ziele", body: "- CI reparieren" }),
  ], "Anne HANGAR Kohorte");
  assert.deepEqual(hits.map((x) => x.slug), ["person-a", "projects"]);
  assert.match(hits[1].auszug, /Kohorte 4 im März$/m);
  assert.deepEqual(searchPages([row({})], "ab"), []);
});

test("parseSkillInput", () => {
  assert.equal(parseSkillInput(null).ok, false);
  assert.equal(parseSkillInput({ name: "x", description: "", body: "" }).ok, false);
  assert.deepEqual(parseSkillInput({ name: " A ", description: " d ", body: " b " }), { ok: true, value: { name: "A", description: "d", body: "b" } });
  assert.deepEqual(parseSkillInput({ enabled: false }, true), { ok: true, value: { enabled: false } });
  assert.equal(parseSkillInput({ enabled: "no" }, true).ok, false);
});

test("every catalog routine fits the routine limits and has a known category", () => {
  const cats = new Set(ROUTINE_CATEGORIES.map((c) => c.id as string));
  const ids = new Set<string>();
  for (const t of ROUTINE_TEMPLATES) {
    assert.ok(t.title.length <= 60, `${t.id} title`);
    assert.ok(t.prompt.length <= 1000, `${t.id} prompt is ${t.prompt.length}`);
    assert.ok(cats.has(t.category), `${t.id} category`);
    assert.ok(!ids.has(t.id), `${t.id} duplicate`);
    ids.add(t.id);
    if (t.schedule.kind === "weekly") assert.ok(t.schedule.weekday! >= 0 && t.schedule.weekday! <= 6);
  }
});
