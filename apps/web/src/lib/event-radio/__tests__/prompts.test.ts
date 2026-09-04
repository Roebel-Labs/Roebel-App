// apps/web/src/lib/event-radio/__tests__/prompts.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicEvent } from "../hash";
import { buildEventSegmentsPrompt, buildIntroPrompt, buildOutroPrompt, eventForPrompt, HOST } from "../prompts";

const ev: PublicEvent = {
  id: "e1", title: "Hafenfest", description: "Musik am Wasser", date: "2026-09-05",
  time: "14:00:00", end_time: "18:30:00", location: "Hafen Röbel", organizer_name: "Stadt Röbel",
  category: "Fest", ticket_price: 5, website_url: "https://example.org", is_cancelled: false,
};

test("eventForPrompt exposes spoken-date hints and trims seconds", () => {
  const p = eventForPrompt(ev);
  assert.equal(p.event_id, "e1");
  assert.equal(p.weekday, "Samstag");
  assert.equal(p.date_spoken_hint, "Samstag, 5. September");
  assert.equal(p.time, "14:00");
  assert.equal(p.end_time, "18:30");
  assert.equal(p.ticket_price_eur, 5);
});

test("segment prompt carries persona, rules, and every event id", () => {
  const prompt = buildEventSegmentsPrompt([ev, { ...ev, id: "e2", title: "Lesung" }]);
  assert.ok(prompt.includes(HOST.persona));
  assert.ok(prompt.includes("HARTE REGELN"));
  assert.ok(prompt.includes('"event_id": "e1"'));
  assert.ok(prompt.includes('"event_id": "e2"'));
  assert.ok(prompt.includes("45 bis 70 Wörter"));
  assert.ok(prompt.includes("als Nächstes"));
});

test("intro prompt names the day and the count as context", () => {
  const prompt = buildIntroPrompt([ev], "2026-09-04");
  assert.ok(prompt.includes("Freitag, 4. September"));
  assert.ok(prompt.includes("Wochen-Radio"));
  assert.ok(prompt.includes("40 bis 60 Wörter"));
});

test("outro prompt asks for the sign-off and the create-event nudge", () => {
  const prompt = buildOutroPrompt();
  assert.ok(prompt.includes("Veranstaltung erstellen"));
  assert.ok(prompt.includes("20 bis 35 Wörter"));
});

test("prompts never contain private contact data or em-dashes", () => {
  const all = [buildEventSegmentsPrompt([ev]), buildIntroPrompt([ev], "2026-09-04"), buildOutroPrompt()].join("\n");
  assert.equal(all.includes("organizer_email"), false);
  assert.equal(all.includes("—"), false);
});
