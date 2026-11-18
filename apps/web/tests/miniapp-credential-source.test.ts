// apps/web/tests/miniapp-credential-source.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IDENTITY_NFT_ADDRESSES,
  builtinCredentialSource,
} from "../src/lib/miniapp/credentialSource";
import { CONTRACTS } from "../../../packages/blockchain/src/index";

const W = "0xc49de63ccfee46c6c5c3e393293f66779799fb28";
const ORG = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const T = "type:0x" + "ab".repeat(32);
const src = (c: boolean, a: boolean) =>
  builtinCredentialSource({ isCitizen: async () => c, isAttester: async () => a });
const types = (xs: { type: string }[]) => xs.map((x) => x.type);

test("a citizen holds citizen, not guest", async () => {
  assert.deepEqual(types(await src(true, false).held(W, ["citizen", "guest", "attester"])), ["citizen"]);
});

test("a non-citizen holds guest", async () => {
  assert.deepEqual(types(await src(false, false).held(W, ["citizen", "guest", "attester"])), ["guest"]);
});

test("only asked refs are answered", async () => {
  assert.deepEqual(types(await src(true, true).held(W, ["attester"])), ["attester"]);
  assert.deepEqual(await src(true, true).held(W, []), []);
});

test("held answers carry the built-in shape", async () => {
  const [c] = await src(true, false).held(W, ["citizen"]);
  assert.deepEqual(c, {
    type: "citizen",
    kind: "builtin",
    name: "Bürger:in",
    validUntil: null,
    recognised: true,
    private: false,
  });
});

test("duplicate refs answer once", async () => {
  assert.deepEqual(types(await src(true, true).held(W, ["citizen", "citizen", "attester"])), ["citizen", "attester"]);
});

test("org and type refs contribute nothing before the register", async () => {
  assert.deepEqual(await src(true, true).held(W, ["org:" + ORG, T]), []);
  assert.deepEqual(await src(true, true).held(W, ["nonsense"]), []);
});

test("describe knows the three built-ins and nothing else", async () => {
  const s = src(true, false);
  assert.equal((await s.describe("citizen"))?.name, "Bürger:in");
  assert.equal((await s.describe("attester"))?.name, "Bescheiniger:in");
  assert.deepEqual(await s.describe("guest"), { type: "guest", kind: "builtin", name: "Gast", recognised: true });
  assert.equal(await s.describe(T), null);
  assert.equal(await s.describe("org:" + ORG), null);
  assert.equal(await s.describe("x"), null);
});

test("a chain read failure rejects (never answers 'not held')", async () => {
  const boom = builtinCredentialSource({
    isCitizen: async () => {
      throw new Error("rpc down");
    },
    isAttester: async () => false,
  });
  await assert.rejects(boom.held(W, ["guest"]), /rpc down/);
  await assert.rejects(boom.held(W, ["citizen"]), /rpc down/);
});

test("no chain read for refs that were not asked", async () => {
  let reads = 0;
  const s = builtinCredentialSource({
    isCitizen: async () => (reads++, true),
    isAttester: async () => (reads++, true),
  });
  await s.held(W, ["org:" + ORG]);
  assert.equal(reads, 0);
});

test("identity NFT addresses match packages/blockchain (source of truth)", () => {
  assert.equal(IDENTITY_NFT_ADDRESSES.citizenNFT.toLowerCase(), CONTRACTS.citizenNFT.toLowerCase());
  assert.equal(IDENTITY_NFT_ADDRESSES.attesterNFT.toLowerCase(), CONTRACTS.attesterNFT.toLowerCase());
});
