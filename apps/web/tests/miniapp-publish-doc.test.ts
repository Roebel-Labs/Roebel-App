import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublishMd } from "../src/lib/miniapp/publishDoc";

test("publish.md contains every step an agent needs", () => {
  const md = buildPublishMd("https://www.roebel.app");
  for (const needle of [
    "/.well-known/roebel-miniapp.json",
    "sdk.actions.ready()",
    "@netizen-labs/miniapp-sdk",
    "https://www.roebel.app/sdk/miniapp-sdk.mjs",
    "https://www.roebel.app/api/mini-apps/validate?url=",
    "https://www.roebel.app/api/mini-apps/register",
    '"owner"',
    "frame-ancestors",
    "public/.well-known/",
    "dashboardUrl",
  ]) {
    assert.ok(md.includes(needle), `missing: ${needle}`);
  }
  assert.ok(md.length < 8000, "keep the recipe short");
});
