import { test } from "node:test";
import assert from "node:assert/strict";
import { hashMessage } from "viem";
import { verifyAccountSignature, encodeSafeAdminSignature } from "../src/index.ts";

const ACCOUNT = "0x" + "11".repeat(20);
const SAFE = "0x" + "22".repeat(20);
const SIG = "0x" + "ab".repeat(65);

function fakeClient(o: { valid?: (address: string) => boolean; isAdmin?: boolean } = {}) {
  const calls = { verifyHash: [] as { address: string; hash: string; signature: string }[], readContract: [] as any[] };
  const client = {
    async verifyHash(a: { address: string; hash: string; signature: string }) {
      calls.verifyHash.push(a);
      return o.valid ? o.valid(a.address.toLowerCase()) : false;
    },
    async readContract(a: any) {
      calls.readContract.push(a);
      if (a.functionName === "isAdmin") return o.isAdmin === true;
      throw new Error("unexpected read " + a.functionName);
    },
  };
  return { client: client as any, calls };
}

test("a plain contract signature verifies through the client", async () => {
  const { client, calls } = fakeClient({ valid: (a) => a === ACCOUNT });
  assert.equal(await verifyAccountSignature({ address: ACCOUNT, signature: SIG, message: "hi" }, { client }), true);
  assert.equal(calls.verifyHash[0].hash, hashMessage("hi"));
  assert.equal(calls.verifyHash[0].address, ACCOUNT);
});

test("a Safe-admin envelope verifies when the Safe is an admin of the account", async () => {
  const { client, calls } = fakeClient({ valid: (a) => a === SAFE, isAdmin: true });
  const env = encodeSafeAdminSignature(SAFE, SIG);
  assert.equal(await verifyAccountSignature({ address: ACCOUNT, signature: env, message: "hi" }, { client }), true);
  assert.equal(calls.verifyHash.length, 1);
  assert.equal(calls.verifyHash[0].address.toLowerCase(), SAFE);
  assert.equal(calls.readContract[0].functionName, "isAdmin");
});

test("the envelope is refused when the Safe is not an admin", async () => {
  const { client, calls } = fakeClient({ valid: () => true, isAdmin: false });
  const env = encodeSafeAdminSignature(SAFE, SIG);
  assert.equal(await verifyAccountSignature({ address: ACCOUNT, signature: env, message: "hi" }, { client }), false);
  assert.equal(calls.verifyHash.length, 0);
});

test("a malformed address or signature is false, not a throw", async () => {
  const { client } = fakeClient({ valid: () => true });
  assert.equal(await verifyAccountSignature({ address: "0x1234", signature: SIG, message: "hi" }, { client }), false);
  assert.equal(await verifyAccountSignature({ address: ACCOUNT, signature: "nothex", message: "hi" }, { client }), false);
  assert.equal(await verifyAccountSignature({ address: ACCOUNT, signature: "0x", message: "hi" }, { client }), false);
});
