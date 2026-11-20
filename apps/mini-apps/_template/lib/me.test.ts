import assert from "node:assert/strict";
import { test } from "node:test";
import { whoAmI } from "./me";

test("a valid token answers with the pseudonym and the citizen flag", async () => {
  const r = await whoAmI("Bearer t", async () => ({ id: "nz_x", has: (t) => t === "citizen" }));
  assert.deepEqual(r, { status: 200, body: { id: "nz_x", citizen: true } });
});

test("no header is 401", async () =>
  assert.equal(
    (
      await whoAmI(null, async () => {
        throw new Error("x");
      })
    ).status,
    401,
  ));

test("a token the verifier rejects is 401", async () => {
  const r = await whoAmI("Bearer bad", async () => {
    throw new Error("expired");
  });
  assert.equal(r.status, 401);
});
