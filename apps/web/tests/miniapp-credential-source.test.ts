// apps/web/tests/miniapp-credential-source.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IDENTITY_NFT_ADDRESSES,
  builtinCredentialSource,
  builtinSource,
  getCredentialSource,
  registerCredentialSource,
  type RegisterDirectoryEntry,
  type RegisterHolding,
} from "../src/lib/miniapp/credentialSource";
import { RESERVED_TYPE_IDS } from "@netizen-labs/credential-registry";
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

// --- Task 14: the credential register ---

const X = ("0x" + "11".repeat(32)) as `0x${string}`;
const Y = ("0x" + "22".repeat(32)) as `0x${string}`;
const Z = ("0x" + "33".repeat(32)) as `0x${string}`;
const OTHER_ORG = "9f2504e0-4f89-41d3-9a0c-0305e82c3301";

const entry = (typeId: `0x${string}`, o: Partial<RegisterDirectoryEntry> = {}): RegisterDirectoryEntry => ({
  typeId,
  kind: "membership",
  name: "Mitglied " + typeId.slice(2, 4),
  imageUrl: null,
  orgName: "Sportverein",
  orgAccountId: ORG,
  recognised: false,
  ...o,
});

function reg(o: {
  directory?: RegisterDirectoryEntry[];
  held?: Record<string, Omit<RegisterHolding, "typeId">>;
  citizen?: boolean;
  fail?: boolean;
}) {
  const asked: string[][] = [];
  const source = registerCredentialSource({
    builtin: src(o.citizen ?? false, false),
    async holdings(_wallet, typeIds) {
      asked.push([...typeIds]);
      if (o.fail) throw new Error("store down");
      return typeIds.map((typeId) => ({ typeId, ...(o.held?.[typeId] ?? { held: false, visibility: null, validUntil: null }) }));
    },
    async directory() {
      return o.directory ?? [];
    },
  });
  return { source, asked };
}

test("a public register holding is answered with its org", async () => {
  const { source } = reg({ directory: [entry(X)], held: { [X]: { held: true, visibility: "public", validUntil: null } } });
  const [a, ...rest] = await source.held(W, ["type:" + X]);
  assert.equal(rest.length, 0);
  assert.deepEqual(a, {
    type: "type:" + X,
    kind: "membership",
    org: ORG,
    name: "Mitglied 11",
    validUntil: null,
    recognised: false,
    private: false,
  });
});

test("a private holding is answered and marked private for the node only", async () => {
  const { source } = reg({ directory: [entry(X)], held: { [X]: { held: true, visibility: "private", validUntil: 2000000000 } } });
  const [a] = await source.held(W, ["type:" + X]);
  assert.equal(a.private, true);
  assert.equal(a.validUntil, 2000000000);
});

test("an org ref expands to the held types of that org", async () => {
  const { source, asked } = reg({
    directory: [entry(X), entry(Y), entry(Z, { orgAccountId: OTHER_ORG })],
    held: { [Y]: { held: true, visibility: "public", validUntil: null }, [Z]: { held: true, visibility: "public", validUntil: null } },
  });
  assert.deepEqual(types(await source.held(W, ["org:" + ORG])), ["type:" + Y]);
  assert.deepEqual(asked, [[X, Y]]);
});

test("reserved type ids are left to the built-in source", async () => {
  const { source, asked } = reg({
    citizen: true,
    directory: [entry(RESERVED_TYPE_IDS.citizen.toLowerCase() as `0x${string}`, { name: "Bürger:in" }), entry(X)],
    held: { [X]: { held: true, visibility: "public", validUntil: null } },
  });
  const answers = await source.held(W, ["citizen", "org:" + ORG, "type:" + RESERVED_TYPE_IDS.citizen]);
  assert.deepEqual(answers.map((a) => [a.type, a.kind]), [["citizen", "builtin"], ["type:" + X, "membership"]]);
  assert.deepEqual(asked, [[X]]);
});

test("unknown or no register refs ask nothing", async () => {
  const { source, asked } = reg({ directory: [entry(X)] });
  assert.deepEqual(await source.held(W, ["type:" + Z, "org:" + OTHER_ORG, "citizen"]), []);
  assert.deepEqual(asked, []);
});

test("a holdings failure rejects", async () => {
  const { source } = reg({ directory: [entry(X)], fail: true });
  await assert.rejects(source.held(W, ["type:" + X]), /store down/);
});

test("describe names a register type from the directory", async () => {
  const { source } = reg({ directory: [entry(X, { imageUrl: "https://img/x.png", recognised: true }), entry(Y, { kind: null })] });
  assert.deepEqual(await source.describe("type:" + X), {
    type: "type:" + X,
    kind: "membership",
    org: ORG,
    orgName: "Sportverein",
    name: "Mitglied 11",
    imageUrl: "https://img/x.png",
    recognised: true,
  });
  assert.equal((await source.describe("type:" + Y))?.kind, "badge");
  assert.equal((await source.describe("org:" + ORG))?.name, "Sportverein");
  assert.equal(await source.describe("org:" + OTHER_ORG), null);
  assert.equal(await source.describe("type:" + Z), null);
  assert.equal((await source.describe("guest"))?.name, "Gast");
});

test("with the register off getCredentialSource is the built-in source", () => {
  assert.equal(getCredentialSource({}), builtinSource());
  assert.notEqual(getCredentialSource({ CREDENTIAL_REGISTRY_ADDRESS: "0x" + "44".repeat(20), CREDENTIAL_REGISTRY_DEPLOY_BLOCK: "1" }), builtinSource());
});
