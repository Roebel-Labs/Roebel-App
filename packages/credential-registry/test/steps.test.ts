import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData, encodeEventTopics, encodeAbiParameters, type Address, type Hex } from "viem";
import { CREDENTIAL_REGISTRY_ABI } from "../src/abi";
import { credentialTypeId } from "../src/ids";
import type { Leaf } from "../src/leaf";
import {
  claimCall,
  encodeSteps,
  parseSteps,
  renounceCall,
  selfClaimCall,
  stepsConfirmedBy,
  type ChainLog,
  type RegisterStep,
  type TypeConfigInput,
} from "../src/steps";

const REG = ("0x" + "ab".repeat(20)) as Address;
const OTHER = ("0x" + "cd".repeat(20)) as Address;
const ORG = ("0x" + "bb".repeat(32)) as Hex;
const LOCAL = ("0x" + "cc".repeat(32)) as Hex;
const TYPE = ("0x" + "aa".repeat(32)) as Hex;
const ROOT = ("0x" + "dd".repeat(32)) as Hex;
const ROOT2 = ("0x" + "de".repeat(32)) as Hex;
const L1 = ("0x" + "01".repeat(32)) as Hex;
const L2 = ("0x" + "02".repeat(32)) as Hex;
const L3 = ("0x" + "03".repeat(32)) as Hex;
const DELEGATE = ("0x" + "11".repeat(20)) as Address;
const ISSUER = ("0x" + "33".repeat(20)) as Address;
const cfg: TypeConfigInput = { metadataURI: "https://x/y", defaultValidity: 60, claimStart: 0, claimEnd: 0, supplyCap: 5, publicClaim: true };

const ev = (name: string, args: Record<string, unknown>, address: Address = REG): ChainLog => {
  const abiItem = CREDENTIAL_REGISTRY_ABI.find((i) => i.type === "event" && i.name === name)!;
  const topics = encodeEventTopics({ abi: [abiItem], eventName: name, args } as never) as Hex[];
  const nonIndexed = (abiItem.inputs as readonly { name: string; type: string; indexed?: boolean }[]).filter((i) => !i.indexed);
  const data = nonIndexed.length
    ? encodeAbiParameters(nonIndexed as never, nonIndexed.map((i) => args[i.name]) as never)
    : "0x";
  return { address, topics, data };
};

const ALL: RegisterStep[] = [
  { fn: "createType", orgId: ORG, localId: LOCAL, kind: "membership", policy: "selfClaim", config: cfg },
  { fn: "updateType", typeId: TYPE, config: cfg },
  { fn: "retireType", typeId: TYPE },
  { fn: "setDelegate", typeId: TYPE, delegate: DELEGATE, allowed: true },
  { fn: "setOrgPrivateOnly", orgId: ORG, privateOnly: true },
  { fn: "addBatch", typeId: TYPE, root: ROOT, count: 3 },
  { fn: "revokeLeaves", batchId: "7", leaves: [L1, L2] },
  { fn: "revokeBatch", batchId: "7" },
];

test("encodeSteps round-trips through decodeFunctionData for every step kind", () => {
  const calls = encodeSteps(ALL, REG);
  assert.equal(calls.length, ALL.length);
  const dec = calls.map((c) => {
    assert.equal(c.to, REG);
    return decodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, data: c.data });
  });
  assert.deepEqual(dec.map((d) => d.functionName), ["createType", "updateType", "retireType", "setDelegate", "setOrgPrivateOnly", "addBatch", "revokeLeaves", "revokeBatch"]);
  const a0 = dec[0].args as unknown as [Hex, Hex, number, number, Record<string, unknown>];
  assert.deepEqual(a0.slice(0, 4), [ORG, LOCAL, 1, 1]);
  assert.equal(a0[4].defaultValidity, 60n);
  assert.equal(a0[4].supplyCap, 5);
  assert.deepEqual(dec[3].args, [TYPE, DELEGATE, true]);
  assert.deepEqual(dec[4].args, [ORG, true]);
  assert.deepEqual(dec[5].args, [TYPE, ROOT, 3]);
  assert.deepEqual(dec[6].args, [7n, [L1, L2]]);
  assert.deepEqual(dec[7].args, [7n]);
});

test("parseSteps accepts valid steps and rejects bad input", () => {
  assert.deepEqual(parseSteps(JSON.parse(JSON.stringify(ALL))), ALL);
  const one = { fn: "retireType", typeId: TYPE };
  assert.throws(() => parseSteps([{ fn: "selfDestruct" }]));
  assert.throws(() => parseSteps(Array.from({ length: 21 }, () => one)));
  assert.equal(parseSteps(Array.from({ length: 20 }, () => one)).length, 20);
  assert.throws(() => parseSteps([{ fn: "addBatch", typeId: TYPE, root: "0x1234", count: 1 }]));
  assert.throws(() => parseSteps([{ fn: "setDelegate", typeId: TYPE, delegate: DELEGATE, allowed: "yes" }]));
  assert.throws(() => parseSteps([{ fn: "retireType" }]));
  assert.throws(() => parseSteps("nope"));
  assert.throws(() => parseSteps([{ fn: "revokeBatch", batchId: "-1" }]));
  assert.throws(() => parseSteps([{ fn: "revokeLeaves", batchId: "1", leaves: ["0x12"] }]));
  assert.throws(() => parseSteps([{ fn: "createType", orgId: ORG, localId: LOCAL, kind: "king", policy: "selfClaim", config: cfg }]));
});

test("stepsConfirmedBy returns the chain batch id per root", () => {
  const steps: RegisterStep[] = [{ fn: "addBatch", typeId: TYPE, root: ROOT, count: 3 }, { fn: "addBatch", typeId: TYPE, root: ROOT2, count: 1 }];
  const logs = [
    ev("BatchAdded", { batchId: 7n, typeId: TYPE, issuer: ISSUER, root: ROOT, count: 3 }),
    ev("BatchAdded", { batchId: 8n, typeId: TYPE, issuer: ISSUER, root: ROOT2, count: 1 }),
  ];
  assert.deepEqual(stepsConfirmedBy(steps, REG, logs), { ok: true, batchIds: { [ROOT]: 7n, [ROOT2]: 8n } });
});

test("stepsConfirmedBy confirms every step kind in order", () => {
  const typeId = credentialTypeId(ORG, LOCAL);
  const logs = [
    ev("TypeCreated", { typeId, orgId: ORG, localId: LOCAL, kind: 1, policy: 1, orgGeneration: 1n }),
    ev("TypeConfigured", { typeId: TYPE, config: { ...cfg, defaultValidity: 60n } }),
    ev("TypeRetired", { typeId: TYPE }),
    ev("DelegateSet", { typeId: TYPE, delegate: DELEGATE, allowed: true }),
    ev("OrgPrivateOnlySet", { orgId: ORG, privateOnly: true, by: ISSUER }),
    ev("BatchAdded", { batchId: 7n, typeId: TYPE, issuer: ISSUER, root: ROOT, count: 3 }),
    ev("LeafRevoked", { batchId: 7n, leaf: L1 }),
    ev("LeafRevoked", { batchId: 7n, leaf: L2 }),
    ev("BatchRevoked", { batchId: 7n }),
  ];
  assert.deepEqual(stepsConfirmedBy(ALL, REG, logs), { ok: true, batchIds: { [ROOT]: 7n } });
});

test("stepsConfirmedBy ignores a matching event from another contract address", () => {
  const steps: RegisterStep[] = [{ fn: "retireType", typeId: TYPE }];
  assert.deepEqual(stepsConfirmedBy(steps, REG, [ev("TypeRetired", { typeId: TYPE }, OTHER)]), { ok: false, missing: 0 });
});

test("stepsConfirmedBy reports the first missing step", () => {
  const steps: RegisterStep[] = [{ fn: "retireType", typeId: TYPE }, { fn: "revokeBatch", batchId: "7" }, { fn: "revokeBatch", batchId: "9" }];
  const logs = [ev("TypeRetired", { typeId: TYPE }), ev("BatchRevoked", { batchId: 9n })];
  assert.deepEqual(stepsConfirmedBy(steps, REG, logs), { ok: false, missing: 1 });
});

test("stepsConfirmedBy wrong event values do not confirm", () => {
  assert.deepEqual(stepsConfirmedBy([{ fn: "setDelegate", typeId: TYPE, delegate: DELEGATE, allowed: false }], REG, [ev("DelegateSet", { typeId: TYPE, delegate: DELEGATE, allowed: true })]), { ok: false, missing: 0 });
  assert.deepEqual(stepsConfirmedBy([{ fn: "addBatch", typeId: TYPE, root: ROOT, count: 3 }], REG, [ev("BatchAdded", { batchId: 1n, typeId: TYPE, issuer: ISSUER, root: ROOT2, count: 3 })]), { ok: false, missing: 0 });
});

test("revokeLeaves: some leaves already revoked still confirms (at least one, all in step)", () => {
  const step: RegisterStep = { fn: "revokeLeaves", batchId: "7", leaves: [L1, L2, L1] };
  assert.deepEqual(stepsConfirmedBy([step], REG, [ev("LeafRevoked", { batchId: 7n, leaf: L2 })]), { ok: true, batchIds: {} });
});

test("revokeLeaves: no event at all is not confirmed", () => {
  const step: RegisterStep = { fn: "revokeLeaves", batchId: "7", leaves: [L1] };
  assert.deepEqual(stepsConfirmedBy([step], REG, []), { ok: false, missing: 0 });
});

test("revokeLeaves: a LeafRevoked for a leaf outside the step is not consumed", () => {
  const steps: RegisterStep[] = [{ fn: "revokeLeaves", batchId: "7", leaves: [L1] }, { fn: "revokeLeaves", batchId: "7", leaves: [L3] }];
  const logs = [ev("LeafRevoked", { batchId: 7n, leaf: L1 }), ev("LeafRevoked", { batchId: 7n, leaf: L3 })];
  assert.deepEqual(stepsConfirmedBy(steps, REG, logs), { ok: true, batchIds: {} });
  assert.deepEqual(stepsConfirmedBy([steps[0]], REG, [ev("LeafRevoked", { batchId: 7n, leaf: L3 })]), { ok: false, missing: 0 });
  assert.deepEqual(stepsConfirmedBy([steps[0]], REG, [ev("LeafRevoked", { batchId: 8n, leaf: L1 })]), { ok: false, missing: 0 });
});

test("claimCall passes 0x as signature for an account leaf", () => {
  const leaf: Leaf = { kind: "account", typeId: TYPE, subject: DELEGATE, validUntil: 0n, salt: L1 };
  const c = claimCall(REG, { batchId: 7n, leaf, proof: [L2] });
  assert.equal(c.to, REG);
  const d = decodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, data: c.data });
  assert.equal(d.functionName, "claim");
  const [bid, lf, proof, sig] = d.args as unknown as [bigint, Record<string, unknown>, Hex[], Hex];
  assert.equal(bid, 7n);
  assert.equal(lf.kind, 0);
  assert.deepEqual(proof, [L2]);
  assert.equal(sig, "0x");
  const sigd = "0x" + "12".repeat(65);
  const c2 = claimCall(REG, { batchId: 7n, leaf, proof: [], claimSignature: sigd as Hex });
  assert.equal((decodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, data: c2.data }).args as unknown as unknown[])[3], sigd);
});

test("selfClaimCall and renounceCall encode the type id", () => {
  const s = decodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, data: selfClaimCall(REG, TYPE).data });
  const r = decodeFunctionData({ abi: CREDENTIAL_REGISTRY_ABI, data: renounceCall(REG, TYPE).data });
  assert.equal(s.functionName, "selfClaim");
  assert.equal(r.functionName, "renounce");
  assert.deepEqual(s.args, [TYPE]);
  assert.deepEqual(r.args, [TYPE]);
});
