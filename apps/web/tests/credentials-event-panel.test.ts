import { test } from "node:test";
import assert from "node:assert/strict";
import { eventPanelState, type EventBadgeGetResult } from "../src/lib/credentials/event-panel";

const NOW = Date.parse("2026-12-05T20:00:00Z");
const badge: EventBadgeGetResult["badge"] = {
  typeId: `0x${"ab".repeat(32)}`,
  name: "Dabei: Sommerfest",
  imageUrl: null,
  supplyCap: 0,
  chain: "onchain",
  auto: false,
};

test("no badge yet: set it up for attendees", () => {
  const s = eventPanelState({ attendees: 12, notYetIssued: 12, issued: 0, accepted: 0, badge: null }, NOW);
  assert.deepEqual(s.primary, { label: "Abzeichen für Teilnehmende einrichten", enabled: true });
  assert.deepEqual(s.lines, ["12 Teilnehmende · 0 eingeladen · 0 angenommen"]);
});

test("attendees not yet issued: issue them with the count", () => {
  const s = eventPanelState({ attendees: 15, notYetIssued: 3, issued: 12, accepted: 7, badge }, NOW);
  assert.deepEqual(s.primary, { label: "Abzeichen vergeben (3)", enabled: true });
  assert.deepEqual(s.lines, ["15 Teilnehmende · 12 eingeladen · 7 angenommen"]);
  // A badge still being set up (draft) with attendees is issued the same way.
  const draft = eventPanelState({ attendees: 2, notYetIssued: 2, issued: 0, accepted: 0, badge: { ...badge, chain: "draft" } }, NOW);
  assert.deepEqual(draft.primary, { label: "Abzeichen vergeben (2)", enabled: true });
});

test("all issued: the button is disabled", () => {
  const s = eventPanelState({ attendees: 15, notYetIssued: 0, issued: 15, accepted: 15, badge }, NOW);
  assert.deepEqual(s.primary, { label: "Alle haben ihr Abzeichen", enabled: false });
  assert.deepEqual(s.lines, ["15 Teilnehmende · 15 eingeladen · 15 angenommen"]);
});
