import { RecordClient } from "../src/index";
import type { PublishSpec } from "@netizen-labs/publisher";

/**
 * A `PublishSpec` becomes the `RecordEvent` the index would serve (crypto
 * stubbed — parity is about content+tags, not signatures). Shared by every
 * `*.test.ts` in this package that pins a dataset reader to the publisher's
 * mappers, so the fixture shape lives in exactly one place.
 */
export function asRecordEvent(spec: PublishSpec, pubkey = "f".repeat(64)) {
  return {
    id: "0".repeat(64), pubkey, kind: spec.kind, created_at: spec.createdAt,
    content: spec.content, tags: [["d", spec.d], ...spec.tags.filter((t) => t[0] !== "d")].filter((t) => t[1] !== ""),
    sig: "0".repeat(128), node_id: "roebel", source: "test",
  };
}

/**
 * A fake client over fixed events that honours `kinds` and `a` like the index:
 * an `a` filter matches any tag with t[0]==="a" && t[1]===value (extra
 * marker/role elements are ignored, as jsonb containment does).
 */
export function filteringClient(events: ReturnType<typeof asRecordEvent>[]) {
  return new RecordClient("https://i", (async (url: string) => {
    const u = new URL(url);
    const kinds = u.searchParams.get("kinds")?.split(",").map(Number);
    const a = u.searchParams.get("a")?.split(",");
    const out = events.filter(
      (e) => (!kinds || kinds.includes(e.kind)) && (!a || e.tags.some((t) => t[0] === "a" && a.includes(t[1]))),
    );
    return new Response(JSON.stringify({ events: out }));
  }) as unknown as typeof fetch);
}
