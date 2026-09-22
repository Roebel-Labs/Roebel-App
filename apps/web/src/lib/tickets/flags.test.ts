import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertTicketsEnabled } from "./flags";

/** Minimal stub of admin.from("app_settings").select("value").eq("key", k).maybeSingle(). */
function stubAdmin(rows: Record<string, string>, opts?: { error?: string }): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "app_settings");
      let key = "";
      const builder = {
        select: () => builder,
        eq: (_col: string, value: string) => {
          key = value;
          return builder;
        },
        maybeSingle: async () =>
          opts?.error
            ? { data: null, error: { message: opts.error } }
            : { data: key in rows ? { value: rows[key] } : null, error: null },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

test("a missing key is OFF", async () => {
  assert.equal(await assertTicketsEnabled(stubAdmin({}), "stripe_tickets_enabled"), false);
});

test("'true' opens the flag to everyone", async () => {
  assert.equal(await assertTicketsEnabled(stubAdmin({ stripe_tickets_enabled: "true" }), "stripe_tickets_enabled"), true);
  assert.equal(await assertTicketsEnabled(stubAdmin({ stripe_tickets_enabled: " true " }), "stripe_tickets_enabled"), true);
});

test("'false' is OFF", async () => {
  assert.equal(await assertTicketsEnabled(stubAdmin({ stripe_tickets_enabled: "false" }), "stripe_tickets_enabled"), false);
});

test("any other value is a comma-separated wallet allowlist", async () => {
  const admin = stubAdmin({ stripe_connect_enabled: "0xAAAa0000000000000000000000000000000000aa, 0xbb...bb" });
  // hit — compared lowercase, whitespace around entries ignored
  assert.equal(await assertTicketsEnabled(admin, "stripe_connect_enabled", "0xaaaa0000000000000000000000000000000000AA"), true);
  assert.equal(await assertTicketsEnabled(admin, "stripe_connect_enabled", "0xBB...BB"), true);
  // miss
  assert.equal(await assertTicketsEnabled(admin, "stripe_connect_enabled", "0xcccc0000000000000000000000000000000000cc"), false);
  // an allowlist with no wallet to compare is a miss, never an open door
  assert.equal(await assertTicketsEnabled(admin, "stripe_connect_enabled"), false);
});

test("a read failure is OFF", async () => {
  const admin = stubAdmin({ stripe_tickets_enabled: "true" }, { error: "relation does not exist" });
  assert.equal(await assertTicketsEnabled(admin, "stripe_tickets_enabled"), false);
});
