import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMenuImage, walletCanEditMenuItem, type MenuImageDeps, type OwnershipDb } from "./menu-image";
import { MemoryLimiter } from "../rate-limit/index";

const WALLET = "0x00000000000000000000000000000000000000ab";
const ITEM = "11111111-2222-3333-4444-555555555555";

function req(body: unknown, token: string | null = "good") {
  return new Request("https://x.test/api/ai/menu-image", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

function deps(over: Partial<MenuImageDeps> = {}): MenuImageDeps & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    authenticate: async (r) => (r.headers.get("authorization") === "Bearer good" ? WALLET : null),
    limiters: [new MemoryLimiter(100, 60_000)],
    canEditMenuItem: async (w, id) => w === WALLET && id === ITEM,
    supabaseUrl: "https://proj.supabase.co/",
    seedToken: "seed-test",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true, image_url: "https://img/x.jpg", prompt: "p" }), { status: 200 });
    },
    ...over,
  };
}

test("requires a chat session", async () => {
  const d = deps();
  const res = await handleMenuImage(req({ menu_item_id: ITEM }, null), d);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, code: "UNAUTHORIZED" });
  assert.equal(d.calls.length, 0);
});

test("refuses a wallet that does not belong to the menu item's org", async () => {
  const d = deps({ canEditMenuItem: async () => false });
  const res = await handleMenuImage(req({ menu_item_id: ITEM }), d);
  assert.equal(res.status, 403);
  assert.equal(d.calls.length, 0);
});

test("rate-limits per wallet", async () => {
  const d = deps({ limiters: [new MemoryLimiter(1, 60_000)] });
  assert.equal((await handleMenuImage(req({ menu_item_id: ITEM }), d)).status, 200);
  const res = await handleMenuImage(req({ menu_item_id: ITEM }), d);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { ok: false, code: "RATE_LIMITED" });
});

test("forwards the same payload with the server-side seed token and returns the edge answer unchanged", async () => {
  const d = deps();
  const input = { menu_item_id: ITEM, prompt_hint: "mit Petersilie", quality: "high", dry_run: false, extra: "dropped" };
  const res = await handleMenuImage(req(input), d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, image_url: "https://img/x.jpg", prompt: "p" });
  assert.equal(d.calls[0].url, "https://proj.supabase.co/functions/v1/generate-menu-image");
  assert.equal((d.calls[0].init.headers as Record<string, string>)["x-seed-token"], "seed-test");
  assert.deepEqual(JSON.parse(String(d.calls[0].init.body)), {
    menu_item_id: ITEM, prompt_hint: "mit Petersilie", quality: "high", dry_run: false,
  });
});

test("edge errors keep status and body; missing config is 503; bad input is 400", async () => {
  const d = deps({ fetchImpl: async () => new Response(JSON.stringify({ ok: false, code: "KIE_TIMEOUT" }), { status: 504 }) });
  const res = await handleMenuImage(req({ menu_item_id: ITEM }), d);
  assert.equal(res.status, 504);
  assert.deepEqual(await res.json(), { ok: false, code: "KIE_TIMEOUT" });
  assert.equal((await handleMenuImage(req({ menu_item_id: ITEM }), deps({ seedToken: undefined }))).status, 503);
  assert.equal((await handleMenuImage(req({ menu_item_id: "x" }), deps())).status, 400);
  assert.equal((await handleMenuImage(req({ menu_item_id: ITEM, quality: "ultra" }), deps())).status, 400);
});

function fakeDb(tables: Record<string, Record<string, unknown>[]>): OwnershipDb {
  return {
    from(table) {
      return {
        select() {
          return {
            eq(col, val) {
              const rows = (tables[table] ?? []).filter((r) => r[col] === val);
              return {
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                ilike(c2, v2) {
                  const matched = rows.filter((r) => String(r[c2]).toLowerCase() === v2.toLowerCase());
                  return { limit: async (n) => ({ data: matched.slice(0, n), error: null }) };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("ownership check walks menu item → restaurant → account_owners (case-insensitive wallet)", async () => {
  const db = fakeDb({
    menu_items: [{ id: ITEM, restaurant_id: "r1" }],
    restaurants: [{ id: "r1", account_id: "acc1" }],
    account_owners: [{ account_id: "acc1", wallet_address: "0x00000000000000000000000000000000000000AB", role: "admin" }],
  });
  assert.equal(await walletCanEditMenuItem(db, WALLET, ITEM), true);
  assert.equal(await walletCanEditMenuItem(db, "0x00000000000000000000000000000000000000cd", ITEM), false);
  assert.equal(await walletCanEditMenuItem(db, WALLET, "99999999-2222-3333-4444-555555555555"), false);
});
