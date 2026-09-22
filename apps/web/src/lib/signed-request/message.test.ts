import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildSignedMessage, SIGNED_SCOPE } from "./message";

test("message matches the org-membership grammar with a ticket scope", () => {
  const payload = { b: 2, a: "x" };
  const expectedHash = createHash("sha256").update(JSON.stringify({ a: "x", b: 2 })).digest("hex");
  assert.equal(
    buildSignedMessage(SIGNED_SCOPE, "checkout", "0xABC", 1700000000, payload),
    `roebel-tickets-v1:checkout:0xabc:1700000000:${expectedHash}`,
  );
});
