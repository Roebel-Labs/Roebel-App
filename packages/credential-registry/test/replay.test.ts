import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import { CREDENTIAL_REGISTRY_ABI, REGISTER_EVENTS } from "../src/abi";
import { isHoldingLive, replayRegisterEvents, type RegisterLog } from "../src/replay";

const TYPE = ("0x" + "aa".repeat(32)) as Hex;
const ORG = ("0x" + "bb".repeat(32)) as Hex;
const LEAF_A = ("0x" + "01".repeat(32)) as Hex;
const LEAF_B = ("0x" + "02".repeat(32)) as Hex;
const ALICE = ("0x" + "11".repeat(20)) as Address;
const BOB = ("0x" + "22".repeat(20)) as Address;
const ISSUER = ("0x" + "33".repeat(20)) as Address;

let n = 0;
const log = (eventName: RegisterLog["eventName"], args: Record<string, unknown>, blockNumber = 1n): RegisterLog => ({
  eventName,
  args,
  blockNumber,
  logIndex: n++,
});
const cfg = (over: Record<string, unknown> = {}) => ({
  metadataURI: "ipfs://x",
  defaultValidity: 0n,
  claimStart: 0n,
  claimEnd: 0n,
  supplyCap: 0,
  publicClaim: true,
  ...over,
});
const created = () => [
  log("TypeCreated", { typeId: TYPE, orgId: ORG, localId: TYPE, kind: 1, policy: 0, orgGeneration: 2n }),
  log("TypeConfigured", { typeId: TYPE, config: cfg() }),
];
const batch = (id = 1n) => log("BatchAdded", { batchId: id, typeId: TYPE, issuer: ISSUER, root: LEAF_A, count: 2 });
const claimed = (account: Address, leaf: Hex, validUntil = 0n, batchId = 1n) =>
  log("Claimed", { typeId: TYPE, account, batchId, leaf, validUntil });
const key = (a: Address) => `${TYPE}:${a.toLowerCase()}`;
const ctx = { nowSec: 100n, orgAlive: () => true };

test("replay rebuilds types, config updates, delegates, recognition and retirement", () => {
  const s = replayRegisterEvents([
    ...created(),
    log("TypeConfigured", { typeId: TYPE, config: cfg({ supplyCap: 5, metadataURI: "ipfs://y" }) }),
    log("DelegateSet", { typeId: TYPE, delegate: ISSUER, allowed: true }),
    log("DelegateSet", { typeId: TYPE, delegate: BOB, allowed: true }),
    log("DelegateSet", { typeId: TYPE, delegate: BOB, allowed: false }),
    log("TypeRecognised", { typeId: TYPE, recognised: true }),
    log("TypeRetired", { typeId: TYPE }),
    log("OrgPrivateOnlySet", { orgId: ORG, privateOnly: true, by: ISSUER }),
  ]);
  const t = s.types.get(TYPE)!;
  assert.equal(t.kind, "membership");
  assert.equal(t.policy, "issuerBatch");
  assert.equal(t.orgGeneration, 2n);
  assert.equal(t.config.supplyCap, 5);
  assert.equal(t.config.metadataURI, "ipfs://y");
  assert.deepEqual([...t.delegates], [ISSUER.toLowerCase()]);
  assert.equal(t.recognised, true);
  assert.equal(t.retired, true);
  assert.ok(s.privateOnlyOrgs.has(ORG));
  replayRegisterEvents([log("OrgPrivateOnlySet", { orgId: ORG, privateOnly: false, by: ISSUER })]);
});

test("replay rebuilds holdings: claim, renewal, renounce, prune, leaf revocation", () => {
  const s = replayRegisterEvents([
    ...created(),
    batch(),
    claimed(ALICE, LEAF_A),
    claimed(ALICE, LEAF_B, 50n), // renewal replaces
    claimed(BOB, LEAF_A),
    log("SelfClaimed", { typeId: TYPE, account: ISSUER, validUntil: 9n }),
  ]);
  assert.equal(s.holdings.get(key(ALICE))!.leaf, LEAF_B);
  assert.equal(s.holdings.get(key(ALICE))!.validUntil, 50n);
  assert.equal(s.holdings.get(key(ISSUER))!.leaf, null);
  assert.equal(s.holdings.get(key(ISSUER))!.batchId, 0n);
  assert.equal(s.batches.get(1n)!.count, 2);

  const after = replayRegisterEvents([
    ...created(),
    batch(),
    claimed(ALICE, LEAF_A),
    claimed(BOB, LEAF_B),
    log("Renounced", { typeId: TYPE, account: ALICE }),
    claimed(ALICE, LEAF_A),
    log("Pruned", { typeId: TYPE, account: ALICE }),
    claimed(ALICE, LEAF_A),
    log("LeafRevoked", { batchId: 1n, leaf: LEAF_B }),
    log("LeafRevoked", { batchId: 1n, leaf: LEAF_A }), // alice
  ]);
  assert.equal(after.holdings.has(key(ALICE)), false);
  assert.equal(after.holdings.has(key(BOB)), false);
  assert.deepEqual([...after.batches.get(1n)!.revokedLeaves].sort(), [LEAF_A, LEAF_B]);

  // revoking a leaf the account no longer holds (renewed) deletes nothing
  const renewed = replayRegisterEvents([
    ...created(),
    batch(),
    claimed(ALICE, LEAF_A),
    claimed(ALICE, LEAF_B),
    log("LeafRevoked", { batchId: 1n, leaf: LEAF_A }),
  ]);
  assert.equal(renewed.holdings.get(key(ALICE))!.leaf, LEAF_B);
});

test("a batch revocation keeps the holding entry but isHoldingLive is false", () => {
  const s = replayRegisterEvents([...created(), batch(), claimed(ALICE, LEAF_A), log("BatchRevoked", { batchId: 1n })]);
  const h = s.holdings.get(key(ALICE))!;
  assert.ok(h);
  assert.equal(s.batches.get(1n)!.revoked, true);
  assert.equal(isHoldingLive(s, h, ctx), false);
});

test("isHoldingLive: expiry, dead org generation, retired type, revoked leaf", () => {
  const base = [...created(), batch(), claimed(ALICE, LEAF_A, 100n), log("SelfClaimed", { typeId: TYPE, account: BOB, validUntil: 0n })];
  const s = replayRegisterEvents(base);
  const a = s.holdings.get(key(ALICE))!;
  assert.equal(isHoldingLive(s, a, ctx), true); // last valid second
  assert.equal(isHoldingLive(s, a, { ...ctx, nowSec: 101n }), false);
  assert.equal(isHoldingLive(s, s.holdings.get(key(BOB))!, { ...ctx, nowSec: 10n ** 12n }), true);
  const seen: Array<[Hex, bigint]> = [];
  assert.equal(
    isHoldingLive(s, a, { nowSec: 1n, orgAlive: (o, g) => (seen.push([o, g]), false) }),
    false,
  );
  assert.deepEqual(seen, [[ORG, 2n]]);
  const retired = replayRegisterEvents([...base, log("TypeRetired", { typeId: TYPE })]);
  assert.equal(isHoldingLive(retired, retired.holdings.get(key(ALICE))!, ctx), false);
  const revoked = replayRegisterEvents([...base, log("LeafRevoked", { batchId: 1n, leaf: LEAF_A })]);
  assert.equal(revoked.holdings.has(key(ALICE)), false);
  // privateOnly does not feed into holds
  const priv = replayRegisterEvents([...base, log("OrgPrivateOnlySet", { orgId: ORG, privateOnly: true, by: ISSUER })]);
  assert.equal(isHoldingLive(priv, priv.holdings.get(key(ALICE))!, ctx), true);
  // community types have no org to check
  const comm = replayRegisterEvents([
    log("TypeCreated", { typeId: TYPE, orgId: "0x" + "00".repeat(32), localId: TYPE, kind: 1, policy: 1, orgGeneration: 0n }),
    log("TypeConfigured", { typeId: TYPE, config: cfg() }),
    log("SelfClaimed", { typeId: TYPE, account: ALICE, validUntil: 0n }),
  ]);
  assert.equal(
    isHoldingLive(comm, comm.holdings.get(key(ALICE))!, { nowSec: 1n, orgAlive: () => false }),
    true,
  );
});

test("logs are ordered by block and log index, not by input order", () => {
  const logs = [
    { ...claimed(ALICE, LEAF_A), blockNumber: 3n, logIndex: 0 },
    { ...batch(), blockNumber: 2n, logIndex: 1 },
    { ...created()[1], blockNumber: 1n, logIndex: 1 },
    { ...created()[0], blockNumber: 1n, logIndex: 0 },
  ];
  const s = replayRegisterEvents(logs);
  assert.ok(s.holdings.has(key(ALICE)));
  assert.equal(s.batches.get(1n)!.blockNumber, 2n);
});

test("TransferSingle is ignored for state", () => {
  const s = replayRegisterEvents([
    ...created(),
    log("TransferSingle", { operator: ALICE, from: "0x" + "00".repeat(20), to: ALICE, id: 1n, value: 1n }),
  ]);
  assert.equal(s.holdings.size, 0);
});

test("generated ABI matches the compiled artifact", (t) => {
  const path = new URL(
    "../../../contracts/governor-contract/artifacts/contracts/verification-system/CredentialRegistry.sol/CredentialRegistry.json",
    import.meta.url,
  );
  if (!existsSync(path)) return t.skip("artifact not compiled");
  const compiled = JSON.parse(readFileSync(path, "utf8")).abi;
  const norm = (v: unknown): unknown =>
    JSON.parse(
      JSON.stringify(v, (k, x) => {
        if (k === "internalType") return undefined;
        if (x && typeof x === "object" && !Array.isArray(x)) {
          return Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]]));
        }
        return x;
      }),
    );
  assert.deepEqual(norm(CREDENTIAL_REGISTRY_ABI), norm(compiled));
  const events = (compiled as Array<{ type: string; name: string }>).filter((e) => e.type === "event").map((e) => e.name);
  for (const name of REGISTER_EVENTS) assert.ok(events.includes(name), `missing event ${name}`);
  assert.equal(REGISTER_EVENTS.length, 17);
});
