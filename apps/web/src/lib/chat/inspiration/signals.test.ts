import { test } from "node:test";
import assert from "node:assert/strict";
import { INSPIRATION_TASKS, SIGNALS, rankInspiration } from "./catalog";
import {
  EXTRA_SIGNALS,
  computeSignals,
  fillOrgName,
  grantWindowOpen,
  isTaskLocked,
  orgAudience,
  orgSignals,
  parseAudienceQuery,
  profileCompleteness,
  timeSignals,
  userSignals,
  withoutDismissed,
  type OrgFacts,
  type UserFacts,
} from "./signals";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-26T10:00:00+02:00");

const user = (over: Partial<UserFacts> = {}): UserFacts => ({
  isCitizen: false, createdAt: "2025-01-01T00:00:00Z", ownsOrg: false, lastChatAt: null, ...over,
});

const org = (over: Partial<OrgFacts> = {}): OrgFacts => ({
  subType: "restaurant", businessCategory: null, text: "Zum Hafen", hasRestaurant: true, menuItemCount: 12,
  menuUpdatedAt: "2026-09-01T00:00:00Z", upcomingEvents: 1, postsLast30d: 3, activeDeals: 1, hasBusiness: false,
  activeTicketTypes: 0, ratingCount: 0, ratingAvg: null, profileCompleteness: 1, ...over,
});

test("timeSignals maps Berlin months to seasons and December", () => {
  assert.deepEqual(timeSignals(at("2026-04-10T12:00:00Z")), [SIGNALS.preSeason]);
  assert.deepEqual(timeSignals(at("2026-07-10T12:00:00Z")), [SIGNALS.summer]);
  assert.deepEqual(timeSignals(NOW), [SIGNALS.autumn]);
  assert.deepEqual(timeSignals(at("2026-12-05T12:00:00Z")), [SIGNALS.winter, SIGNALS.yearEnd]);
  assert.deepEqual(timeSignals(at("2027-02-05T12:00:00Z")), [SIGNALS.winter]);
  // 23:30 UTC on 30 Nov is already 1 Dec in Berlin.
  assert.deepEqual(timeSignals(at("2026-11-30T23:30:00Z")), [SIGNALS.winter, SIGNALS.yearEnd]);
});

test("grantWindowOpen uses inclusive Berlin dates", () => {
  const w = [{ name: "x", from: "2026-01-01", to: "2026-09-30" }];
  assert.equal(grantWindowOpen(at("2026-09-30T21:00:00Z"), w), true); // 23:00 Berlin, still 30.9.
  assert.equal(grantWindowOpen(at("2026-09-30T22:30:00Z"), w), false); // 1.10. in Berlin
  assert.equal(grantWindowOpen(NOW, []), false);
});

test("userSignals: citizen, owner, new account, chat activity", () => {
  assert.deepEqual(userSignals(user(), NOW), []);
  const s = userSignals(
    user({ isCitizen: true, ownsOrg: true, createdAt: "2026-09-01T00:00:00Z", lastChatAt: "2026-09-25T00:00:00Z" }),
    NOW,
  );
  assert.deepEqual(s, [SIGNALS.citizen, SIGNALS.orgOwner, SIGNALS.newInTown, EXTRA_SIGNALS.chatActive]);
  assert.ok(!userSignals(user({ lastChatAt: "2026-09-01T00:00:00Z" }), NOW).includes(EXTRA_SIGNALS.chatActive));
});

test("orgAudience maps sub types, business categories and tourism words", () => {
  assert.equal(orgAudience({ subType: "restaurant", businessCategory: null, text: "" }), "restaurant");
  assert.equal(orgAudience({ subType: "fraktion", businessCategory: null, text: "" }), "verein");
  assert.equal(orgAudience({ subType: "stadt", businessCategory: null, text: "" }), "kommune");
  assert.equal(orgAudience({ subType: "unternehmen", businessCategory: "handwerk", text: "Tischlerei" }), "business");
  assert.equal(orgAudience({ subType: "unternehmen", businessCategory: "gastronomie", text: "Imbiss" }), "restaurant");
  assert.equal(orgAudience({ subType: "unternehmen", businessCategory: null, text: "Ferienwohnung am See" }), "tourism");
});

test("orgSignals: a fresh restaurant with no menu, events, posts or deals", () => {
  const s = orgSignals(
    org({ text: "Eiscafé Müritz", hasRestaurant: false, menuItemCount: 0, upcomingEvents: 0, postsLast30d: 0, activeDeals: 0, ratingCount: 4, ratingAvg: 3.5, profileCompleteness: 0.4 }),
    NOW,
  );
  for (const sig of [SIGNALS.restaurant, SIGNALS.cafe, SIGNALS.noMenu, SIGNALS.noEvents, SIGNALS.quietFeed, SIGNALS.noDeals, SIGNALS.lowRating, EXTRA_SIGNALS.profileIncomplete]) {
    assert.ok(s.includes(sig), `missing ${sig}`);
  }
  assert.ok(!s.includes(SIGNALS.menuStale));
});

test("orgSignals: stale menu, tickets, good rating; Verein gets no deal signal", () => {
  const r = orgSignals(org({ menuUpdatedAt: "2025-10-01T00:00:00Z", activeTicketTypes: 2, ratingCount: 5, ratingAvg: 4.6 }), NOW);
  assert.ok(r.includes(SIGNALS.menuStale));
  assert.ok(r.includes(SIGNALS.hasTickets));
  assert.ok(!r.includes(SIGNALS.lowRating));
  assert.ok(!r.includes(SIGNALS.noMenu));
  const v = orgSignals(org({ subType: "verein", activeDeals: 0 }), NOW);
  assert.ok(v.includes(SIGNALS.verein));
  assert.ok(!v.includes(SIGNALS.noDeals));
  assert.ok(!v.includes(SIGNALS.noMenu));
  const h = orgSignals(org({ subType: "unternehmen", businessCategory: "handwerk", text: "Tischlerei" }), NOW);
  assert.ok(h.includes(SIGNALS.business) && h.includes(SIGNALS.handwerk));
});

test("profileCompleteness counts five fields", () => {
  assert.equal(profileCompleteness({}), 0);
  assert.equal(profileCompleteness({ bio: "Hi", avatar_url: "a", cover_url: null, address: " ", opening_hours: {} }), 0.4);
  assert.equal(profileCompleteness({ bio: "Hi", avatar_url: "a", cover_url: "c", address: "Markt 1", opening_hours: { mo: "9-17" } }), 1);
});

test("computeSignals merges user, org and world", () => {
  const s = computeSignals({
    user: user({ isCitizen: true }),
    org: org({ subType: "verein" }),
    world: { now: NOW, eventsNext14d: 3, openProposals: 1, grantWindows: [{ name: "x", from: "2026-09-01", to: "2026-09-30" }] },
  });
  for (const sig of [SIGNALS.citizen, SIGNALS.verein, SIGNALS.autumn, SIGNALS.grantWindow, SIGNALS.eventSoon, SIGNALS.proposalOpen]) {
    assert.ok(s.has(sig), `missing ${sig}`);
  }
  const quiet = computeSignals({ user: user(), org: null, world: { now: NOW, eventsNext14d: 0, openProposals: 0, grantWindows: [] } });
  assert.deepEqual([...quiet], [SIGNALS.autumn]);
});

test("isTaskLocked: plus/ultra ladder, Betrieb needs Ultra for now", () => {
  assert.equal(isTaskLocked("free", "free"), false);
  assert.equal(isTaskLocked("plus", "free"), true);
  assert.equal(isTaskLocked("plus", "plus"), false);
  assert.equal(isTaskLocked("ultra", "plus"), true);
  assert.equal(isTaskLocked("business", "plus"), true);
  assert.equal(isTaskLocked("business", "ultra"), false);
});

test("fillOrgName and parseAudienceQuery", () => {
  assert.equal(fillOrgName("Hilf {orgName} bei {orgName}.", "Zum Hafen"), "Hilf Zum Hafen bei Zum Hafen.");
  assert.equal(fillOrgName("Hilf {orgName}.", null), "Hilf meinen Betrieb.");
  assert.deepEqual(parseAudienceQuery(null, null), { kind: "me" });
  assert.deepEqual(parseAudienceQuery("me", "abc"), { kind: "me" });
  assert.deepEqual(parseAudienceQuery("org:abc", null), { kind: "org", orgId: "abc" });
  assert.deepEqual(parseAudienceQuery("org", "abc"), { kind: "org", orgId: "abc" });
  assert.deepEqual(parseAudienceQuery("restaurant", "abc"), { kind: "org", orgId: "abc" });
  assert.deepEqual(parseAudienceQuery("org", ""), { kind: "me" });
});

test("end to end: a restaurant without menu in autumn gets the menu task, dismissed tasks vanish", () => {
  const signals = computeSignals({
    user: user({ ownsOrg: true }),
    org: org({ hasRestaurant: false, menuItemCount: 0 }),
    world: { now: NOW, eventsNext14d: 0, openProposals: 0, grantWindows: [] },
  });
  const top = rankInspiration(INSPIRATION_TASKS, signals, "restaurant", 8);
  assert.ok(top.some((t) => t.id === "restaurant-menu-digital"));
  const without = rankInspiration(withoutDismissed(INSPIRATION_TASKS, new Set(["restaurant-menu-digital"])), signals, "restaurant", 8);
  assert.ok(!without.some((t) => t.id === "restaurant-menu-digital"));
  assert.equal(without.length, 8);
});
