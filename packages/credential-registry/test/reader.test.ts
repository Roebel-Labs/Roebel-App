import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex, PublicClient } from "viem";
import { createCredentialRegistryReader } from "../src/reader";
import type { Leaf } from "../src/leaf";

const ADDR = ("0x" + "cc".repeat(20)) as Address;
const ACCOUNT = ("0x" + "11".repeat(20)) as Address;
const T1 = ("0x" + "01".repeat(32)) as Hex;
const T2 = ("0x" + "02".repeat(32)) as Hex;

function fake(handlers: { multicall?: (a: any) => unknown; readContract?: (a: any) => unknown }) {
  const calls: Array<{ method: string; arg: any }> = [];
  const client = {
    multicall: async (arg: any) => (calls.push({ method: "multicall", arg }), handlers.multicall!(arg)),
    readContract: async (arg: any) => (calls.push({ method: "readContract", arg }), handlers.readContract!(arg)),
  } as unknown as PublicClient;
  return { client, calls };
}

test("reader.holdsMany issues one multicall and maps results in order", async () => {
  const { client, calls } = fake({
    multicall: () => [
      { status: "success", result: true },
      { status: "success", result: false },
    ],
  });
  const r = createCredentialRegistryReader({ client, address: ADDR });
  assert.deepEqual(await r.holdsMany([T1, T2], ACCOUNT), [true, false]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "multicall");
  assert.equal(calls[0].arg.contracts.length, 2);
  assert.deepEqual(calls[0].arg.contracts.map((c: any) => c.args[0]), [T1, T2]);
  assert.equal(calls[0].arg.contracts[0].functionName, "holds");
  assert.deepEqual(await r.holdsMany([], ACCOUNT), []);
});

test("reader.checkLeaf maps the status enum by index", async () => {
  const names = ["invalid", "valid", "expired", "revoked", "inactive"];
  const leaf: Leaf = { kind: "claimKey", typeId: T1, subject: ACCOUNT, validUntil: 5n, salt: T2 };
  for (let i = 0; i < names.length; i++) {
    const { client, calls } = fake({ readContract: () => [i, i === 1 ? ACCOUNT : "0x" + "00".repeat(20)] });
    const r = createCredentialRegistryReader({ client, address: ADDR });
    const out = await r.checkLeaf(7n, leaf, [T2]);
    assert.equal(out.status, names[i]);
    assert.equal(out.boundTo, i === 1 ? ACCOUNT : null);
    assert.equal(calls[0].arg.args[0], 7n);
    assert.equal(calls[0].arg.args[1].kind, 1);
  }
});

test("reader.getType maps the struct and returns null for an unknown type", async () => {
  const struct = {
    orgId: T1, localId: T2, orgGeneration: 3n, createdAt: 1n, kind: 2, policy: 1, recognised: true, retired: false, supply: 4,
    config: { metadataURI: "u", defaultValidity: 9n, claimStart: 0n, claimEnd: 0n, supplyCap: 0, publicClaim: true },
  };
  const REG = ("0x" + "Ab".repeat(20)) as Address;
  const ok = createCredentialRegistryReader({
    client: fake({ readContract: (a) => (a.functionName === "typeRegistryOf" ? REG : struct) }).client,
    address: ADDR,
  });
  const t = (await ok.getType(T1))!;
  assert.equal(t.orgRegistry, REG.toLowerCase());
  assert.equal(t.kind, "badge");
  assert.equal(t.policy, "selfClaim");
  assert.equal(t.orgGeneration, 3n);
  assert.equal(t.config.defaultValidity, 9n);
  assert.equal(t.delegates.size, 0);
  const community = createCredentialRegistryReader({
    client: fake({ readContract: (a) => (a.functionName === "typeRegistryOf" ? "0x" + "00".repeat(20) : struct) }).client,
    address: ADDR,
  });
  assert.equal((await community.getType(T1))!.orgRegistry, null);
  const missing = createCredentialRegistryReader({
    client: fake({ readContract: () => { throw new Error("UnknownType"); } }).client,
    address: ADDR,
  });
  assert.equal(await missing.getType(T1), null);
});

test("reader.loadRegister rejects a non-positive chunk", async () => {
  const { client } = fake({});
  const r = createCredentialRegistryReader({ client, address: ADDR });
  await assert.rejects(() => r.loadRegister(0n, { chunk: 0n, toBlock: 10n }), /chunk/);
  await assert.rejects(() => r.loadRegister(0n, { chunk: -5n, toBlock: 10n }), /chunk/);
});
