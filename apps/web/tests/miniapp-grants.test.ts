// apps/web/tests/miniapp-grants.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_GRANT, clampGrant } from "../src/lib/miniapp/grants";

const T = "type:0x" + "ab".repeat(32);

test("a grant cannot exceed the manifest", () => {
  const g = clampGrant(
    { profile: false, address: true, credentials: [{ type: "citizen", reason: "x" }] },
    { profile: true, address: true, credentials: ["citizen", "attester"], asked: ["profile", "address", "cred:citizen", "cred:attester"] },
  );
  assert.deepEqual(g, { profile: false, address: true, credentials: ["citizen"], asked: ["address", "cred:citizen"] });
});

test("granted items are always recorded as asked", () => {
  const g = clampGrant(
    { profile: true, address: true, credentials: [{ type: "citizen", reason: "x" }, { type: T, reason: "y" }] },
    { profile: true, credentials: [T], asked: [] },
  );
  assert.deepEqual(g, { profile: true, address: false, credentials: [T], asked: ["profile", `cred:${T}`] });
});

test("a declined item stays asked without being granted", () => {
  const g = clampGrant(
    { profile: true, address: true, credentials: [{ type: "citizen", reason: "x" }] },
    { profile: false, address: false, credentials: [], asked: ["profile", "address", "cred:citizen"] },
  );
  assert.deepEqual(g, { profile: false, address: false, credentials: [], asked: ["profile", "address", "cred:citizen"] });
});

test("garbage input clamps to the empty grant", () => {
  const identity = { profile: true, address: true, credentials: [{ type: "citizen", reason: "x" }] };
  assert.deepEqual(clampGrant(identity, { profile: "yes", address: 1, credentials: "citizen", asked: { a: 1 } }), EMPTY_GRANT);
  assert.deepEqual(clampGrant(identity, { credentials: [1, null, {}], asked: [2, "nonsense"] }), EMPTY_GRANT);
  assert.deepEqual(clampGrant(undefined, { profile: true, address: true, credentials: ["citizen"], asked: ["profile"] }), EMPTY_GRANT);
});

test("duplicates collapse and refs are matched case-insensitively", () => {
  const g = clampGrant(
    { profile: false, address: false, credentials: [{ type: T, reason: "x" }] },
    { credentials: [T.toUpperCase().replace("TYPE:0X", "type:0x"), T] },
  );
  assert.deepEqual(g.credentials, [T]);
  assert.deepEqual(g.asked, [`cred:${T}`]);
});
