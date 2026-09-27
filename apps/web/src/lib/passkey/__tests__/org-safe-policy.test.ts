/**
 * Sponsor policy × NSP-14 org Safes: the EXACT calldata the Expo "Onchain-Organisation"
 * section builds (apps/expo/lib/org-safe/ops.ts), sent through legacy.execute /
 * executeBatch, must be sponsored — and nothing wider.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/org-safe-policy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, getAddress, type Hex } from "viem";
import { evaluateSponsorPolicy, type ChainReader, type SponsorContext, type SponsorUserOp } from "../sponsor-policy";
import { EVERYDAY_CONTRACTS as C, classifyEverydayCall, orgRegistryAttesterAbi } from "../everyday-allowlist";
import { PASSKEY_SAFE, SAFE_PROXY_RUNTIME_CODE } from "../safe-address";
import { CONTRACTS } from "../../../../../../packages/blockchain/src/index";
import {
  planBulkDeploy,
  createAndRequestCalls,
  leaveSafeCall,
  planSync,
  safeExecCall,
  syncCall,
  type Call,
} from "../../../../../expo/lib/org-safe/ops";
import { KEY, LEGACY, RECIPIENT, fakeChain } from "./fake-chain";
import { NOW, account, execLegacy, op, outer, viaMultiSend } from "./policy-helpers";

const CTX: SponsorContext = { ...KEY, legacy: LEGACY, nowSeconds: NOW };
const ORG_UUID = "6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10";
const OWNER2 = getAddress("0x" + "2".repeat(40)) as Hex;
const word = (a: Hex) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}` as Hex;

/** A deployed org Safe (Safe L2 1.4.1 proxy) in the fake world. */
const withOrgSafe = (safe: Hex) =>
  fakeChain((w) => {
    w.codes.set(safe.toLowerCase(), SAFE_PROXY_RUNTIME_CODE);
    w.storage.set(`${safe.toLowerCase()}:${word("0x00")}`, word(PASSKEY_SAFE.singletonL2));
  });

const batchOf = (calls: Call[]) =>
  encodeFunctionData({
    abi: account,
    functionName: "executeBatch",
    args: [calls.map((c) => c.to), calls.map(() => 0n), calls.map((c) => c.data)],
  });

async function ok(o: SponsorUserOp, chain: ChainReader) {
  const r = await evaluateSponsorPolicy(o, CTX, chain);
  assert.equal(r.ok, true, r.ok ? "" : `expected ok, got: ${r.reason}`);
  if (r.ok) assert.equal(r.budgetKey.toLowerCase(), LEGACY.toLowerCase());
}
async function rejected(o: SponsorUserOp, re: RegExp, chain: ChainReader) {
  const r = await evaluateSponsorPolicy(o, CTX, chain);
  assert.equal(r.ok, false, "expected rejection");
  if (!r.ok) assert.match(r.reason, re);
}

test("registry address matches packages/blockchain", () => {
  assert.equal(C.orgRegistry.toLowerCase(), CONTRACTS.orgRegistry.toLowerCase());
});

test("Safe erstellen: deploy + request in ONE executeBatch is sponsored (Safe created in the same batch)", async () => {
  const { calls } = createAndRequestCalls({ orgUuid: ORG_UUID, owners: [LEGACY, OWNER2], executor: LEGACY, registry: C.orgRegistry });
  assert.equal(calls.length, 2);
  await ok(op(outer(LEGACY, batchOf(calls))), fakeChain());
});

test("re-request on an existing org Safe (single execute) is sponsored once the Safe is verified on chain", async () => {
  const { safe, calls } = createAndRequestCalls({
    orgUuid: ORG_UUID,
    owners: [LEGACY, OWNER2],
    executor: LEGACY,
    registry: C.orgRegistry,
    alreadyDeployed: true,
  });
  await ok(op(outer(LEGACY, execLegacy(calls[0].to, 0n, calls[0].data))), withOrgSafe(safe));
  // Not a Safe on chain → refused.
  await rejected(op(outer(LEGACY, execLegacy(calls[0].to, 0n, calls[0].data))), /not a SafeProxy/, fakeChain());
});

test("Mitglieder übertragen + Übergeben are sponsored", async () => {
  const { safe } = createAndRequestCalls({ orgUuid: ORG_UUID, owners: [LEGACY, OWNER2], executor: LEGACY, registry: C.orgRegistry });
  const state = { safe, owners: [LEGACY, OWNER2], threshold: 1, roles: {} };
  const members = [
    { wallet_address: LEGACY, role: "owner" },
    { wallet_address: OWNER2, role: "owner" },
    { wallet_address: RECIPIENT, role: "owner" },
    { wallet_address: "0x" + "8".repeat(40), role: "admin" },
  ];
  const sync = syncCall({ safe, executor: LEGACY, registry: C.orgRegistry, orgId: ("0x" + "ab".repeat(32)) as Hex, plan: planSync(state, members) })!;
  await ok(op(outer(LEGACY, execLegacy(sync.to, 0n, sync.data))), withOrgSafe(safe));
  const leave = leaveSafeCall(state, LEGACY);
  await ok(op(outer(LEGACY, execLegacy(leave.to, 0n, leave.data))), withOrgSafe(safe));
});

test("org Safe deploys: plain Safe only, identity must be an owner", () => {
  const good = createAndRequestCalls({ orgUuid: ORG_UUID, owners: [LEGACY], executor: LEGACY, registry: C.orgRegistry }).calls[0];
  assert.equal(classifyEverydayCall(good.to, 0n, good.data, LEGACY).ok, true);
  const foreign = createAndRequestCalls({ orgUuid: ORG_UUID, owners: [OWNER2], executor: OWNER2, registry: C.orgRegistry }).calls[0];
  const r = classifyEverydayCall(foreign.to, 0n, foreign.data, LEGACY);
  assert.ok(!r.ok && /must be an owner/.test(r.reason));
});

test("org Safe transactions: only the identity's own pre-validated tx, only registry/owner calls, no value", () => {
  const safe = getAddress("0x" + "5a".repeat(20)) as Hex;
  const setRole = encodeFunctionData({
    abi: [{ type: "function", name: "setRole", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }, { type: "address" }, { type: "uint8" }], outputs: [] }],
    functionName: "setRole",
    args: [("0x" + "ab".repeat(32)) as Hex, RECIPIENT, 1],
  });
  const good = safeExecCall(safe, LEGACY, C.orgRegistry, setRole);
  assert.equal(classifyEverydayCall(safe, 0n, good.data, LEGACY).ok, true);
  // Signed as someone else.
  const other = safeExecCall(safe, OWNER2, C.orgRegistry, setRole);
  assert.equal(classifyEverydayCall(safe, 0n, other.data, LEGACY).ok, false);
  // Arbitrary inner target (e.g. draining via the Circles Hub).
  const drain = safeExecCall(safe, LEGACY, C.circlesHub, "0x0d873a79");
  assert.equal(classifyEverydayCall(safe, 0n, drain.data, LEGACY).ok, false);
  // Delegatecall anywhere but MultiSendCallOnly.
  const dc = safeExecCall(safe, LEGACY, C.orgRegistry, setRole, 1);
  assert.equal(classifyEverydayCall(safe, 0n, dc.data, LEGACY).ok, false);
});

test("attesters may approve org requests directly; other registry calls are not direct-sponsored", () => {
  const approve = encodeFunctionData({ abi: orgRegistryAttesterAbi, functionName: "approveRequest", args: [4n] });
  assert.equal(classifyEverydayCall(C.orgRegistry, 0n, approve, LEGACY).ok, true);
  assert.equal(classifyEverydayCall(C.orgRegistry, 0n, "0x12345678", LEGACY).ok, false);
});

test("bulk: several org Safes in ONE op (one fingerprint) — executeBatch and a multiSend of executes", async () => {
  const orgs = Array.from({ length: 4 }, (_, i) => ({
    uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    owners: [LEGACY, OWNER2],
  }));
  const [chunk] = planBulkDeploy(orgs, LEGACY);
  assert.equal(chunk.calls.length, 4);
  await ok(op(outer(LEGACY, batchOf(chunk.calls)), { callGasLimit: 1_500_000n }), fakeChain());
  await ok(
    op(viaMultiSend(chunk.calls.map((c) => ({ to: LEGACY, data: execLegacy(c.to, 0n, c.data) }))), { callGasLimit: 1_500_000n }),
    fakeChain(),
  );
});

test("bulk: several orgs' deploy+request pairs in one op are sponsored too", async () => {
  const calls = ["a1", "b2"].flatMap((x) =>
    createAndRequestCalls({
      orgUuid: `00000000-0000-4000-8000-0000000000${x}`,
      owners: [LEGACY, OWNER2],
      executor: LEGACY,
      registry: C.orgRegistry,
    }).calls,
  );
  await ok(op(outer(LEGACY, batchOf(calls)), { callGasLimit: 1_500_000n }), fakeChain());
});
