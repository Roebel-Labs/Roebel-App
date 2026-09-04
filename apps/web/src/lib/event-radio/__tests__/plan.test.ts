// apps/web/src/lib/event-radio/__tests__/plan.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventContentHash, introContentHash, outroContentHash, type PublicEvent } from "../hash";
import { planExpiry, planScopes, staleRowsForScope, type ExistingRow } from "../plan";

const ctx = { voiceId: "v", modelId: "m" };
const ev = (id: string, date: string): PublicEvent => ({
  id, title: `Event ${id}`, description: null, date, time: null, end_time: null,
  location: null, organizer_name: null, category: null, ticket_price: null,
  website_url: null, is_cancelled: false,
});
const row = (p: Partial<ExistingRow> & Pick<ExistingRow, "id" | "kind" | "scope_key">): ExistingRow => ({
  content_hash: "x", audio_url: `https://x/${p.id}.mp3`, script: "s", duration_ms: 20000,
  created_at: "2026-09-01T00:00:00Z", event_date: null, ...p,
});

test("planScopes marks fresh scopes as needed and matching hashes as reused", () => {
  const events = [ev("a", "2026-09-05"), ev("b", "2026-09-06")];
  const existing = [
    row({ id: "ra", kind: "event", scope_key: "a", content_hash: eventContentHash(events[0], ctx) }),
    row({ id: "ro", kind: "outro", scope_key: "2026-W36", content_hash: outroContentHash("2026-W36", ctx) }),
  ];
  const plan = planScopes({ events, todayKey: "2026-09-04", weekKey: "2026-W36", existing, ctx, force: false });
  assert.equal(plan.intro?.needed, true);
  assert.equal(plan.intro?.scopeKey, "2026-09-04");
  assert.equal(plan.outro.needed, false);
  assert.deepEqual(plan.events.map((p) => [p.scopeKey, p.needed]), [["a", false], ["b", true]]);
  assert.equal(plan.events[1].event?.title, "Event b");
});

test("planScopes with force regenerates everything", () => {
  const events = [ev("a", "2026-09-05")];
  const existing = [row({ id: "ra", kind: "event", scope_key: "a", content_hash: eventContentHash(events[0], ctx) })];
  const plan = planScopes({ events, todayKey: "2026-09-04", weekKey: "2026-W36", existing, ctx, force: true });
  assert.equal(plan.events[0].needed, true);
});

test("planScopes without events has no intro but still an outro", () => {
  const plan = planScopes({ events: [], todayKey: "2026-09-04", weekKey: "2026-W36", existing: [], ctx, force: false });
  assert.equal(plan.intro, null);
  assert.equal(plan.outro.needed, true);
  assert.equal(plan.outro.hash, outroContentHash("2026-W36", ctx));
});

test("planScopes intro hash matches introContentHash", () => {
  const events = [ev("a", "2026-09-05")];
  const plan = planScopes({ events, todayKey: "2026-09-04", weekKey: "2026-W36", existing: [], ctx, force: false });
  assert.equal(plan.intro?.hash, introContentHash(events, "2026-09-04", ctx));
});

test("staleRowsForScope returns other rows of the same scope", () => {
  const existing = [
    row({ id: "keep", kind: "event", scope_key: "a" }),
    row({ id: "old1", kind: "event", scope_key: "a" }),
    row({ id: "other", kind: "event", scope_key: "b" }),
  ];
  assert.deepEqual(staleRowsForScope(existing, "event", "a", "keep").map((r) => r.id), ["old1"]);
});

test("planExpiry removes old intros, foreign outros, and past events", () => {
  const existing = [
    row({ id: "i-old", kind: "intro", scope_key: "2026-08-30" }),
    row({ id: "i-new", kind: "intro", scope_key: "2026-09-03" }),
    row({ id: "o-old", kind: "outro", scope_key: "2026-W34" }),
    row({ id: "o-prev", kind: "outro", scope_key: "2026-W35" }),
    row({ id: "o-cur", kind: "outro", scope_key: "2026-W36" }),
    row({ id: "e-past", kind: "event", scope_key: "p", event_date: "2026-08-28" }),
    row({ id: "e-recent", kind: "event", scope_key: "r", event_date: "2026-09-02" }),
    row({ id: "e-nodate", kind: "event", scope_key: "n", event_date: null }),
  ];
  const expired = planExpiry({ existing, todayKey: "2026-09-04", weekKey: "2026-W36", previousWeekKey: "2026-W35" });
  assert.deepEqual(expired.map((r) => r.id).sort(), ["e-past", "i-old", "o-old"]);
});
