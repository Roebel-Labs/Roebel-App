import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS as ROEBEL } from "./roebel-read";
import { TOOLS as USER } from "./user-private";
import { TOOLS as WEB } from "./web";

test("read packs expose the spec's tools with the right pack + risk", () => {
  assert.deepEqual(ROEBEL.map((t) => t.name), [
    "search_roebel", "list_events", "get_event", "list_news", "get_news_article", "list_orgs", "get_org",
    "list_deals", "list_marketplace", "list_proposals", "list_feed_posts", "get_menu", "abfallkalender", "get_treasury",
  ]);
  assert.ok(ROEBEL.every((t) => t.pack === "roebel" && t.risk === "read"));
  assert.deepEqual(USER.map((t) => t.name), ["my_profile", "my_orgs", "my_tickets", "my_events", "my_muenzen_balance", "my_notifications"]);
  assert.ok(USER.every((t) => t.pack === "user" && t.risk === "private"));
  assert.deepEqual(WEB.map((t) => [t.name, t.pack, t.risk]), [["fetch_url", "web", "read"]]);
});

test("user tools take no wallet input (scoped to ctx.wallet only)", () => {
  for (const t of USER) {
    const shape = (t.inputSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
    assert.ok(!Object.keys(shape).some((k) => /wallet|address/i.test(k)), t.name);
  }
});

test("input schemas apply defaults", () => {
  const ev = ROEBEL.find((t) => t.name === "list_events")!;
  assert.deepEqual(ev.inputSchema.parse({}), { limit: 10, upcoming: true });
  const waste = ROEBEL.find((t) => t.name === "abfallkalender")!;
  assert.throws(() => waste.inputSchema.parse({ fraction: "sondermuell" }));
});

test("fetch_url tool reports guard errors instead of throwing", async () => {
  const r = (await WEB[0].execute({ url: "http://example.com" }, {} as never)) as { error: string };
  assert.match(r.error, /https/);
});
