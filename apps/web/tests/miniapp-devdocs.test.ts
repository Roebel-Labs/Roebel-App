import assert from "node:assert/strict";
import { test } from "node:test";
import { getDocsSection } from "../src/lib/miniapp/devdocs";

test("docs explain the user token and the deprecation", () => {
  const sdk = getDocsSection("sdk");
  assert.match(sdk, /## User token/);
  assert.match(sdk, /Authorization: Bearer/);
  assert.match(sdk, /sdk\.auth\.getToken\(\)/);
  assert.match(sdk, /10 minutes/);
  assert.match(sdk, /SDK 0\.4\.0/);
  assert.match(sdk, /null/);
  assert.doesNotMatch(getDocsSection("all"), /Wallet-Adresse als Token/);
});

test("the MCP section says only nz_ API keys are accepted", () => {
  const all = getDocsSection("all");
  assert.match(all, /only `nz_` API keys/i);
  assert.doesNotMatch(all, /Fallback during rollout/);
});
