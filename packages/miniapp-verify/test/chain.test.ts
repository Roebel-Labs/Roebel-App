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
