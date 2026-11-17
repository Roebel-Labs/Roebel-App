// apps/web/tests/miniapp-mcp-auth.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMcpDeveloper } from "../src/lib/miniapp/mcpAuth";
import type { DeveloperRow } from "../src/lib/miniapp/types";

const dev = { id: "d1", wallet: "0xaa00000000000000000000000000000000000001" } as DeveloperRow;

test("an nz_ key resolves its developer", async () => {
  const seen: string[] = [];
  const out = await resolveMcpDeveloper("nz_abc", {
    verifyApiKey: async (k) => {
      seen.push(k);
      return dev;
    },
  });
  assert.equal(out, dev);
  assert.deepEqual(seen, ["nz_abc"]);
});

test("an unknown nz_ key resolves to null", async () => {
  assert.equal(await resolveMcpDeveloper("nz_bad", { verifyApiKey: async () => null }), null);
});

test("a bare wallet address is refused and never looked up", async () => {
  let called = 0;
  const out = await resolveMcpDeveloper("0x1111111111111111111111111111111111111111", {
    verifyApiKey: async () => {
      called++;
      return dev;
    },
  });
  assert.equal(out, null);
  assert.equal(called, 0);
});

test("undefined and empty are refused", async () => {
  let called = 0;
  const deps = {
    verifyApiKey: async () => {
      called++;
      return dev;
    },
  };
  assert.equal(await resolveMcpDeveloper(undefined, deps), null);
  assert.equal(await resolveMcpDeveloper("", deps), null);
  assert.equal(called, 0);
});
