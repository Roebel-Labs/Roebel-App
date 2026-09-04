// apps/web/src/lib/event-radio/__tests__/select.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickLatestPerScope, scopeId } from "../select";

test("scopeId joins kind and scope key", () => {
  assert.equal(scopeId("event", "abc"), "event:abc");
});

test("pickLatestPerScope keeps the newest row per scope", () => {
  const rows = [
    { id: "old", kind: "event" as const, scope_key: "e1", created_at: "2026-09-01T05:00:00+00:00" },
    { id: "new", kind: "event" as const, scope_key: "e1", created_at: "2026-09-03T05:00:00+00:00" },
    { id: "intro", kind: "intro" as const, scope_key: "2026-09-04", created_at: "2026-09-04T04:00:00.123456+00:00" },
  ];
  const latest = pickLatestPerScope(rows);
  assert.equal(latest.size, 2);
  assert.equal(latest.get("event:e1")?.id, "new");
  assert.equal(latest.get("intro:2026-09-04")?.id, "intro");
});

test("pickLatestPerScope is order independent", () => {
  const a = { id: "a", kind: "outro" as const, scope_key: "2026-W36", created_at: "2026-09-02T00:00:00Z" };
  const b = { id: "b", kind: "outro" as const, scope_key: "2026-W36", created_at: "2026-09-01T00:00:00Z" };
  assert.equal(pickLatestPerScope([a, b]).get("outro:2026-W36")?.id, "a");
  assert.equal(pickLatestPerScope([b, a]).get("outro:2026-W36")?.id, "a");
});
