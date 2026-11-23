import { test } from "node:test";
import assert from "node:assert/strict";
import { credentialRefsInHtml, identityForHtml } from "./credentialUse";

const ORG = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

test("finds refs in has() and request([...]) calls, canonical and unique", () => {
  const html = `await sdk.credentials.has("citizen"); sdk.credentials.request(['org:${ORG.toUpperCase()}', "citizen"]); credentials.has('nope')`;
  assert.deepEqual(credentialRefsInHtml(html), ["citizen", `org:${ORG}`]);
});

test("no use → no identity; use → identity with reasons", () => {
  assert.equal(identityForHtml("<html>sdk.data.get('x')</html>"), null);
  const id = identityForHtml(`sdk.credentials.has("org:${ORG}")`);
  assert.equal(id?.credentials.length, 1);
  assert.ok(id!.credentials[0].reason.length > 10);
});
