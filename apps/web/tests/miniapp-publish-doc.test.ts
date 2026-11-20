import assert from "node:assert/strict";
import { test } from "node:test";
import { validateManifest } from "../src/lib/miniapp/manifest";
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

test("publish.md mentions the user token", () => {
  const md = buildPublishMd("https://www.roebel.app");
  assert.match(md, /## User token/);
  assert.match(md, /sdk\.auth\.getToken\(\)/);
  assert.match(md, /Authorization: Bearer/);
  assert.ok(md.length < 8000, "keep the recipe short");
});

test("publish.md carries a version 2 manifest that validates", () => {
  const json = buildPublishMd("https://x").match(/```json\n((?:(?!```)[\s\S])*?"version": "2"(?:(?!```)[\s\S])*)```/)![1];
  const file = JSON.parse(json.replaceAll("<your-app-domain>", "beispiel.example"));
  assert.doesNotThrow(() => validateManifest({ ...file.miniapp, slug: "beispiel" }));
});
