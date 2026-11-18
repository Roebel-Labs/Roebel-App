import { test } from "node:test";
import assert from "node:assert/strict";
import { holdsCredential, ADDRESSES, ABIS, CHAIN_ID } from "../src/index.ts";

const ACCOUNT = "0x" + "11".repeat(20);

function fakeClient(answer: unknown) {
  const calls: any[] = [];
  return {
    calls,
    client: {
      async readContract(a: any) {
        calls.push(a);
        return answer;
      },
    } as any,
  };
}

test("holdsCredential reads the citizen contract", async () => {
  const yes = fakeClient(1n);
  assert.equal(await holdsCredential("citizen", ACCOUNT, { client: yes.client }), true);
  assert.equal(yes.calls[0].address, ADDRESSES.citizenNft);
  assert.equal(yes.calls[0].functionName, "balanceOf");
  assert.deepEqual(yes.calls[0].args, [ACCOUNT]);
  const no = fakeClient(0n);
  assert.equal(await holdsCredential("citizen", ACCOUNT, { client: no.client }), false);
});

test("holdsCredential reads the attester contract", async () => {
  const yes = fakeClient(2n);
  assert.equal(await holdsCredential("attester", ACCOUNT, { client: yes.client }), true);
  assert.equal(yes.calls[0].address, ADDRESSES.attesterNft);
});

test("the constants describe Gnosis", () => {
  assert.equal(CHAIN_ID, 100);
  assert.ok(ABIS.citizenNft.some((f: any) => f.name === "hasCitizenNFT"));
  assert.ok(ABIS.attesterNft.some((f: any) => f.name === "hasAttesterNFT"));
  assert.ok(ABIS.orgRegistry.some((f: any) => f.name === "roleOf"));
  assert.ok(ABIS.orgRegistry.every((f: any) => f.type === "function"));
});

// --- Task 14: the credential register ---

const TYPE_ID = "0x" + "ab".repeat(32);
const REGISTRY = "0x" + "77".repeat(20);

test("holdsCredential reads holds(typeId, account) on the register", async () => {
  const yes = fakeClient(true);
  assert.equal(await holdsCredential(`type:${TYPE_ID}`, ACCOUNT, { client: yes.client, registry: REGISTRY }), true);
  assert.equal(yes.calls[0].address, REGISTRY);
  assert.equal(yes.calls[0].functionName, "holds");
  assert.deepEqual(yes.calls[0].args, [TYPE_ID, ACCOUNT]);
  assert.ok(ABIS.credentialRegistry.some((f: any) => f.name === "holds"));
  const no = fakeClient(false);
  assert.equal(await holdsCredential(`type:${TYPE_ID.toUpperCase().replace("0X", "0x")}`, ACCOUNT, { client: no.client, registry: REGISTRY }), false);
  assert.equal(no.calls[0].args[0], TYPE_ID);
});

test("holdsCredential refuses a type ref while the register address is empty", async () => {
  assert.equal(ADDRESSES.credentialRegistry, "");
  const c = fakeClient(true);
  await assert.rejects(holdsCredential(`type:${TYPE_ID}`, ACCOUNT, { client: c.client }), (e: any) => e.code === "unsupported");
  await assert.rejects(holdsCredential("type:0x12" as any, ACCOUNT, { client: c.client, registry: REGISTRY }), (e: any) => e.code === "malformed");
  assert.equal(c.calls.length, 0);
});
