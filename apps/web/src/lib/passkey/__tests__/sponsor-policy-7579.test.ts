/**
 * Sponsor policy for passkey Safes migrated to the Safe7579 adapter (device sessions, Task 7):
 * every existing mode accepts the 7579 root callData (Safe7579.execute single / batch) with the
 * same { mode, budgetKey } as the Safe4337Module layout, and every widening is fenced by a deny.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-7579.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { concatHex, encodeAbiParameters, encodeFunctionData, encodePacked, pad, parseAbiParameters, type Hex } from "viem";
import { rulesFor } from "../../miniapp/contracts";
import {
  ADDRESSES,
  ChainReadError,
  MINIAPP_FORBIDDEN_TARGETS,
  evaluateSponsorPolicy,
  type ChainReader,
  type PolicyResult,
  type SponsorContext,
  type SponsorUserOp,
} from "../sponsor-policy";
import { EVERYDAY_CONTRACTS as C, citizenNftAbi, hubAbi } from "../everyday-allowlist";
import { FALLBACK_HANDLER_SLOT, PASSKEY_SAFE, predictSafeAddress } from "../safe-address";
import {
  EXEC_BATCH,
  EXEC_SINGLE,
  SAFE7579,
  SMART_SESSIONS,
  decodeSafe7579Execute,
  nonceKeyOf,
} from "../safe7579";
import {
  SESSION_NONCE_KEY,
  encode7579Execute,
  safe7579Abi,
  smartSessionAbi,
} from "../session-keys-builders";
import {
  EOA,
  GUARDIAN,
  KEY,
  LEGACY,
  RECOVERED_SIGNER,
  SAFE,
  brokenChain,
  fakeChain,
  makeEcdsaSafe,
  migrateTo7579,
  signerKey,
  type FakeWorld,
} from "./fake-chain";
import {
  NOW,
  account,
  deployOp,
  execLegacy,
  handover,
  op,
  outer,
  permRequest,
  srm,
  viaMultiSend,
  type Inner,
} from "./policy-helpers";

const lc = (a: string) => a.toLowerCase();
const SRM = ADDRESSES.socialRecoveryModule;
const G2 = "0x4545454545454545454545454545454545454545" as Hex;
const TARGET = "0x9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a" as Hex;
const APP_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3399";
const RULES = rulesFor([{ address: TARGET, label: "Trainingsbuch", functions: ["checkIn(uint256)"] }]);

const LEGACY_CTX: SponsorContext = { ...KEY, legacy: LEGACY, nowSeconds: NOW };
const SAFE_CTX: SponsorContext = { ...KEY, nowSeconds: NOW };
const MINI: SponsorContext = { ...SAFE_CTX, miniApp: { id: APP_ID, rules: RULES } };

// ---- calldata ----
const personalMint = encodeFunctionData({ abi: hubAbi, functionName: "personalMint" });
const groupMint = encodeFunctionData({ abi: hubAbi, functionName: "groupMint", args: [C.roebelGroup, [LEGACY], [5n], "0x"] });
const askCitizen = encodeFunctionData({ abi: citizenNftAbi, functionName: "createAttestationRequest", args: ["Max, Röbel"] });
const checkIn = encodeFunctionData({
  abi: [{ type: "function", name: "checkIn", inputs: [{ type: "uint256" }], outputs: [], stateMutability: "nonpayable" }],
  functionName: "checkIn",
  args: [1n],
});
const addGuardian = encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] });
const changeThreshold = encodeFunctionData({ abi: srm, functionName: "changeThreshold", args: [1n] });
const confirmRecovery = encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [LEGACY, [GUARDIAN], 1n, false] });
const executeRecovery = (owner: Hex) =>
  encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [LEGACY, [owner], 1n] });
const detach = encodeFunctionData({ abi: account, functionName: "setPermissionsForSigner", args: [permRequest(EOA, 2), `0x${"ab".repeat(65)}`] });
const claimBatch = encodeFunctionData({
  abi: account,
  functionName: "executeBatch",
  args: [[C.circlesHub, C.circlesHub], [0n, 0n], [personalMint, groupMint]],
});

// ---- worlds ----
const citizenSafe = (w: FakeWorld) => w.citizens.add(lc(SAFE));
/** LEGACY (a citizen) has SAFE as guardian: SAFE may help recover it. */
const safeGuardsLegacy = (w: FakeWorld) => w.guardians.set(lc(LEGACY), new Set([lc(SAFE)]));
/** SAFE's own passkey signer contract (for recovery owner binding). */
const ownSigner = (w: FakeWorld) => {
  safeGuardsLegacy(w);
  w.webauthnSigners.set(signerKey(KEY), RECOVERED_SIGNER);
};
const guarded = (w: FakeWorld) => {
  w.guardians.set(lc(SAFE), new Set([lc(GUARDIAN), lc(G2)]));
  w.thresholds.set(lc(SAFE), 2n);
};
const migrated = (mutate?: (w: FakeWorld) => void) =>
  fakeChain((w) => {
    migrateTo7579(w, SAFE);
    mutate?.(w);
  });

/** The same calls in the 4337 layout (one call = executeUserOp, n = MultiSendCallOnly). */
const as4337 = (calls: Inner[]) => (calls.length === 1 ? outer(calls[0].to, calls[0].data) : viaMultiSend(calls));
const as7579 = (calls: Inner[]) => encode7579Execute(calls.map((c) => ({ to: c.to, value: c.value, data: c.data })));
/** EXEC_BATCH even for a single call. */
const as7579Batch = (calls: Inner[]) =>
  encodeFunctionData({
    abi: safe7579Abi,
    functionName: "execute",
    args: [EXEC_BATCH, executionsPayload(calls)],
  });
const EXECUTIONS = parseAbiParameters("(address target, uint256 value, bytes callData)[]");
const executionsPayload = (calls: Inner[]) =>
  encodeAbiParameters(EXECUTIONS, [calls.map((c) => ({ target: c.to, value: c.value ?? 0n, callData: c.data }))]);
const rawExecute = (mode: Hex, payload: Hex) =>
  encodeFunctionData({ abi: safe7579Abi, functionName: "execute", args: [mode, payload] });
const singlePayload = (to: Hex, value: bigint, data: Hex) => encodePacked(["address", "uint256", "bytes"], [to, value, data]);

async function denied(o: SponsorUserOp, chain: ChainReader, ctx: SponsorContext, match: RegExp) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, false, `expected a denial, got ${JSON.stringify(r)}`);
  if (!r.ok) assert.match(r.reason, match);
}

// =====================================================================
// every existing mode, both layouts, same result
// =====================================================================

type Case = { name: string; calls: Inner[]; ctx: SponsorContext; world?: (w: FakeWorld) => void; expect: Partial<Extract<PolicyResult, { ok: true }>> };

const CASES: Case[] = [
  { name: "A legacy: handover", calls: [{ to: LEGACY, data: handover() }], ctx: LEGACY_CTX, expect: { mode: "legacy", budgetKey: LEGACY } },
  { name: "A legacy: guardian management (recovery helper)", calls: [{ to: SRM, data: addGuardian }], ctx: LEGACY_CTX, expect: { mode: "legacy", budgetKey: LEGACY } },
  {
    name: "A legacy: handover + guardian setup + execute",
    calls: [{ to: LEGACY, data: handover() }, { to: SRM, data: addGuardian }, { to: LEGACY, data: execLegacy(C.circlesHub, 0n, personalMint) }],
    ctx: LEGACY_CTX,
    expect: { mode: "legacy", budgetKey: LEGACY },
  },
  { name: "D everyday via legacy.execute", calls: [{ to: LEGACY, data: execLegacy(C.circlesHub, 0n, personalMint) }], ctx: LEGACY_CTX, expect: { mode: "everyday", budgetKey: LEGACY, tier: "citizen" } },
  { name: "D everyday: Expo one-tap claim (executeBatch)", calls: [{ to: LEGACY, data: claimBatch }], ctx: LEGACY_CTX, expect: { mode: "everyday", budgetKey: LEGACY, tier: "citizen" } },
  {
    name: "D everyday: two legacy.execute in one batch",
    calls: [{ to: LEGACY, data: execLegacy(C.circlesHub, 0n, personalMint) }, { to: LEGACY, data: execLegacy(C.circlesHub, 0n, groupMint) }],
    ctx: LEGACY_CTX,
    expect: { mode: "everyday", budgetKey: LEGACY, tier: "citizen" },
  },
  { name: "D everyday: citizen Safe direct", calls: [{ to: C.circlesHub, data: personalMint }], ctx: SAFE_CTX, world: citizenSafe, expect: { mode: "everyday", budgetKey: SAFE, tier: "citizen" } },
  { name: "D everyday: guest onboarding", calls: [{ to: C.citizenNft, data: askCitizen }], ctx: SAFE_CTX, expect: { mode: "everyday", budgetKey: SAFE, tier: "onboarding", guest: true } },
  {
    name: "D everyday: guest onboarding batch",
    calls: [{ to: C.citizenNft, data: askCitizen }, { to: C.circlesHub, data: personalMint }],
    ctx: SAFE_CTX,
    expect: { mode: "everyday", budgetKey: SAFE, tier: "onboarding", guest: true },
  },
  { name: "B safe: citizen Safe guardian management", calls: [{ to: SRM, data: changeThreshold }], ctx: SAFE_CTX, world: citizenSafe, expect: { mode: "safe", budgetKey: SAFE } },
  { name: "B safe: guest guardian management", calls: [{ to: SRM, data: addGuardian }], ctx: SAFE_CTX, expect: { mode: "safe", budgetKey: SAFE, guest: true } },
  { name: "C recovery: guardian confirms", calls: [{ to: SRM, data: confirmRecovery }], ctx: SAFE_CTX, world: safeGuardsLegacy, expect: { mode: "recovery", budgetKey: LEGACY } },
  {
    name: "C recovery: executeRecovery to the submitter's own signer",
    calls: [{ to: SRM, data: executeRecovery(RECOVERED_SIGNER) }],
    ctx: SAFE_CTX,
    world: ownSigner,
    expect: { mode: "recovery", budgetKey: LEGACY },
  },
  { name: "E detach", calls: [{ to: LEGACY, data: detach }], ctx: LEGACY_CTX, world: guarded, expect: { mode: "detach", budgetKey: LEGACY } },
  { name: "F miniapp direct", calls: [{ to: TARGET, data: checkIn }], ctx: MINI, expect: { mode: "miniapp", budgetKey: SAFE, miniAppId: APP_ID } },
  {
    name: "F miniapp batch",
    calls: [{ to: TARGET, data: checkIn }, { to: TARGET, data: checkIn }],
    ctx: MINI,
    expect: { mode: "miniapp", budgetKey: SAFE, miniAppId: APP_ID },
  },
  {
    name: "F miniapp via legacy",
    calls: [{ to: LEGACY, data: execLegacy(TARGET, 0n, checkIn) }],
    ctx: { ...MINI, legacy: LEGACY },
    expect: { mode: "miniapp", budgetKey: LEGACY, miniAppId: APP_ID },
  },
];

test("every existing mode passes in 7579 layout", async () => {
  for (const c of CASES) {
    const r4337 = await evaluateSponsorPolicy(op(as4337(c.calls)), c.ctx, fakeChain(c.world));
    assert.equal(r4337.ok, true, `${c.name} (4337): ${r4337.ok ? "" : r4337.reason}`);
    for (const [label, callData] of [
      ["7579", as7579(c.calls)],
      ["7579 batch", as7579Batch(c.calls)],
    ] as const) {
      const r = await evaluateSponsorPolicy(op(callData), c.ctx, migrated(c.world));
      assert.deepEqual(r, r4337, `${c.name} (${label}) differs from 4337`);
      assert.equal(r.ok, true);
      if (r.ok) {
        for (const [k, v] of Object.entries(c.expect)) {
          const got = (r as Record<string, unknown>)[k];
          assert.equal(typeof got === "string" ? lc(got) : got, typeof v === "string" ? lc(v) : v, `${c.name}: ${k}`);
        }
      }
    }
  }
});

test("4337-layout Safes keep working unchanged (no Safe7579 reads)", async () => {
  const chain = fakeChain();
  const r = await evaluateSponsorPolicy(op(as4337([{ to: LEGACY, data: claimBatch }])), LEGACY_CTX, chain);
  assert.equal(r.ok, true);
  assert.ok(!chain.reads.includes("getModulesPaginated"));
});

// =====================================================================
// attacks: mode word
// =====================================================================

const MINT_CALL: Inner = { to: LEGACY, data: execLegacy(C.circlesHub, 0n, personalMint) };
const mintPayload = singlePayload(MINT_CALL.to, 0n, MINT_CALL.data);

test("7579 callType delegatecall (0xff) is denied", async () => {
  const delegate = pad("0xff", { size: 32, dir: "right" });
  assert.equal(decodeSafe7579Execute(rawExecute(delegate, mintPayload)), null);
  await denied(op(rawExecute(delegate, mintPayload)), migrated(), LEGACY_CTX, /callData/);
  // delegatecall payload shape (target ++ data, no value) is refused too
  const dcPayload = concatHex([C.circlesHub, personalMint]);
  await denied(op(rawExecute(delegate, dcPayload)), migrated(), LEGACY_CTX, /callData/);
  // static call type 0xfe as well
  await denied(op(rawExecute(pad("0xfe", { size: 32, dir: "right" }), mintPayload)), migrated(), LEGACY_CTX, /callData/);
});

test("7579 try execType is denied", async () => {
  const trySingle = pad("0x0001", { size: 32, dir: "right" });
  const tryBatch = pad("0x0101", { size: 32, dir: "right" });
  await denied(op(rawExecute(trySingle, mintPayload)), migrated(), LEGACY_CTX, /callData/);
  await denied(op(rawExecute(tryBatch, executionsPayload([MINT_CALL]))), migrated(), LEGACY_CTX, /callData/);
});

test("7579 non-zero mode payload is denied", async () => {
  for (const mode of [
    `0x${"00".repeat(31)}01`, // payload byte
    `0x0000${"00".repeat(4)}deadbeef${"00".repeat(22)}`, // selector bytes
    `0x000000000001${"00".repeat(26)}`, // unused bytes
    `0x01${"00".repeat(30)}01`, // batch with payload
  ] as Hex[]) {
    assert.equal(decodeSafe7579Execute(rawExecute(mode, mintPayload)), null, mode);
    await denied(op(rawExecute(mode, mintPayload)), migrated(), LEGACY_CTX, /callData/);
  }
});

test("7579 non-canonical encodings are denied (trailing bytes, odd batch offset, empty batch, short single)", async () => {
  const good = as7579([MINT_CALL]);
  await denied(op(concatHex([good, "0x00"])), migrated(), LEGACY_CTX, /callData/);
  // batch payload whose array offset is 0x40 instead of 0x20 (padding word inserted)
  const canonical = executionsPayload([MINT_CALL]);
  const shifted = concatHex([pad("0x40", { size: 32 }), pad("0x00", { size: 32 }), `0x${canonical.slice(2 + 64)}`]);
  assert.ok(decodeSafe7579Execute(rawExecute(EXEC_BATCH, canonical)));
  assert.equal(decodeSafe7579Execute(rawExecute(EXEC_BATCH, shifted)), null);
  await denied(op(rawExecute(EXEC_BATCH, shifted)), migrated(), LEGACY_CTX, /callData/);
  await denied(op(rawExecute(EXEC_BATCH, executionsPayload([]))), migrated(), LEGACY_CTX, /callData/);
  await denied(op(rawExecute(EXEC_SINGLE, `0x${"11".repeat(51)}`)), migrated(), LEGACY_CTX, /callData/);
});

// =====================================================================
// attacks: layout binding
// =====================================================================

test("7579 callData on a 4337 Safe is denied", async () => {
  await denied(op(as7579([MINT_CALL])), fakeChain(), LEGACY_CTX, /layout/);
  await denied(op(as7579([{ to: SRM, data: addGuardian }])), fakeChain(), SAFE_CTX, /layout/);
});

test("4337 callData on a 7579 Safe is denied", async () => {
  await denied(op(as4337([MINT_CALL])), migrated(), LEGACY_CTX, /layout/);
  await denied(op(as4337([{ to: SRM, data: addGuardian }])), migrated(), SAFE_CTX, /layout/);
  await denied(op(as4337([{ to: C.circlesHub, data: personalMint }])), migrated(citizenSafe), SAFE_CTX, /layout/);
});

test("7579 Safe with Safe4337Module still enabled is denied", async () => {
  const chain = migrated((w) => w.modules.add(`${lc(SAFE)}:${lc(PASSKEY_SAFE.safe4337Module)}`));
  await denied(op(as7579([MINT_CALL])), chain, LEGACY_CTX, /Safe4337Module/);
  // ... and its 4337 callData does not pass either (handler is Safe7579)
  await denied(op(as4337([MINT_CALL])), chain, LEGACY_CTX, /Safe4337Module/);
});

test("7579 Safe with an extra Safe module is denied", async () => {
  const EXTRA = "0x00000000000000000000000000000000000e7e7a" as Hex;
  await denied(op(as7579([MINT_CALL])), migrated((w) => w.modules.add(`${lc(SAFE)}:${lc(EXTRA)}`)), LEGACY_CTX, /exactly the modules/);
  // a second page exists (more than 10 modules)
  await denied(op(as7579([MINT_CALL])), migrated((w) => w.modulesNext.set(lc(SAFE), EXTRA)), LEGACY_CTX, /exactly the modules/);
  // SRM removed
  await denied(op(as7579([MINT_CALL])), migrated((w) => w.modules.delete(`${lc(SAFE)}:${lc(SRM)}`)), LEGACY_CTX, /exactly the modules|SocialRecoveryModule/);
});

test("7579 handler without the Safe7579 module enabled is denied; unknown handlers too", async () => {
  await denied(op(as7579([MINT_CALL])), migrated((w) => w.modules.delete(`${lc(SAFE)}:${lc(SAFE7579)}`)), LEGACY_CTX, /Safe7579 is not an enabled module/);
  const other = migrated((w) =>
    w.storage.set(`${lc(SAFE)}:${lc(FALLBACK_HANDLER_SLOT)}`, pad(SMART_SESSIONS, { size: 32 })),
  );
  await denied(op(as7579([MINT_CALL])), other, LEGACY_CTX, /fallback handler/);
});

test("7579 Safe: owner binding is unchanged (wrong passkey denied)", async () => {
  const otherKey = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  await denied(op(as7579([MINT_CALL])), migrated(), { ...LEGACY_CTX, ...otherKey }, /not configured with \(x, y\)/);
  await denied(op(as7579([MINT_CALL])), migrated((w) => w.owners.set(lc(SAFE), [PASSKEY_SAFE.sharedSigner, EOA])), LEGACY_CTX, /exactly one owner/);
});

test("7579 callData in a deploy op is denied", async () => {
  const fresh = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  const freshSafe = predictSafeAddress(fresh);
  const deploy4337 = await evaluateSponsorPolicy(deployOp(fresh, freshSafe, as4337([{ to: C.citizenNft, data: askCitizen }])), { ...fresh, nowSeconds: NOW }, fakeChain());
  assert.equal(deploy4337.ok, true);
  await denied(deployOp(fresh, freshSafe, as7579([{ to: C.citizenNft, data: askCitizen }])), fakeChain(), { ...fresh, nowSeconds: NOW }, /layout/);
});

test("an expert-path (ECDSA) Safe is 4337-only", async () => {
  const ESAFE = "0xe5afe5afe5afe5afe5afe5afe5afe5afe5afe5af" as Hex;
  const OWNER = "0x2222222222222222222222222222222222222222" as Hex;
  const ctx: SponsorContext = { ecdsaOwner: OWNER, nowSeconds: NOW };
  const call = [{ to: SRM, data: addGuardian }];
  const ok4337 = await evaluateSponsorPolicy(op(as4337(call), { sender: ESAFE }), ctx, fakeChain((w) => makeEcdsaSafe(w, ESAFE, OWNER)));
  assert.equal(ok4337.ok, true, ok4337.ok ? "" : ok4337.reason);
  await denied(op(as7579(call), { sender: ESAFE }), fakeChain((w) => makeEcdsaSafe(w, ESAFE, OWNER)), ctx, /layout/);
  const migratedExpert = fakeChain((w) => {
    makeEcdsaSafe(w, ESAFE, OWNER);
    migrateTo7579(w, ESAFE);
  });
  await denied(op(as7579(call), { sender: ESAFE }), migratedExpert, ctx, /layout/);
  await denied(op(as4337(call), { sender: ESAFE }), migratedExpert, ctx, /layout/);
});

// =====================================================================
// attacks: executions
// =====================================================================

test("execution with value 1 is denied", async () => {
  await denied(op(as7579([{ ...MINT_CALL, value: 1n }])), migrated(), LEGACY_CTX, /value must be 0/);
  await denied(op(as7579([MINT_CALL, { ...MINT_CALL, value: 1n }])), migrated(), LEGACY_CTX, /value must be 0/);
});

test("execution targeting the Safe itself (installModule) is denied", async () => {
  const install = encodeFunctionData({ abi: safe7579Abi, functionName: "installModule", args: [1n, SMART_SESSIONS, "0x"] });
  await denied(op(as7579([{ to: SAFE, data: install }])), migrated(), LEGACY_CTX, /sender Safe itself/);
  await denied(op(as7579([MINT_CALL, { to: SAFE, data: install }])), migrated(), LEGACY_CTX, /sender Safe itself/);
  // a Safe self-call such as enableModule / addOwner, in a mini-app op as well
  const enable = encodeFunctionData({ abi: [{ type: "function", name: "enableModule", inputs: [{ type: "address" }], outputs: [], stateMutability: "nonpayable" }], functionName: "enableModule", args: [EOA] });
  await denied(op(as7579([{ to: SAFE, data: enable }])), migrated(), MINI, /sender Safe itself/);
});

test("executions to the device-session stack, MultiSendCallOnly or unknown targets are denied", async () => {
  const remove = encodeFunctionData({ abi: smartSessionAbi, functionName: "removeSession", args: [`0x${"01".repeat(32)}`] });
  await denied(op(as7579([{ to: SMART_SESSIONS, data: remove }])), migrated(), SAFE_CTX, /not allowlisted/);
  const install = encodeFunctionData({ abi: safe7579Abi, functionName: "installModule", args: [1n, SMART_SESSIONS, "0x"] });
  await denied(op(as7579([{ to: SAFE7579, data: install }])), migrated(), SAFE_CTX, /not allowlisted/);
  await denied(op(as7579([{ to: ADDRESSES.multiSendCallOnly, data: "0x8d80ff0a" }])), migrated(), SAFE_CTX, /not allowlisted/);
  const transfer = encodeFunctionData({
    abi: [{ type: "function", name: "transfer", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" }],
    functionName: "transfer",
    args: [EOA, 1n],
  });
  await denied(op(as7579([{ to: TARGET, data: transfer }])), migrated(citizenSafe), SAFE_CTX, /not allowlisted/);
  // a non-allowlisted call nested in legacy.execute stays refused
  await denied(op(as7579([{ to: LEGACY, data: execLegacy(TARGET, 0n, transfer) }])), migrated(), LEGACY_CTX, /not allowlisted/);
});

test("mini apps may never target the device-session stack", async () => {
  for (const a of [SAFE7579, SMART_SESSIONS]) assert.ok(MINIAPP_FORBIDDEN_TARGETS.includes(lc(a) as Hex), a);
  const rules = [{ address: lc(SAFE7579), label: "x", selectors: { [checkIn.slice(0, 10)]: "checkIn(uint256)" } }];
  await denied(op(as7579([{ to: SAFE7579, data: checkIn }])), migrated(), { ...SAFE_CTX, miniApp: { id: APP_ID, rules } }, /Röbel's own contracts or the account infrastructure/);
});

test("7579 recovery: executeRecovery to a foreign owner is denied (owner binding reads 7579 executions)", async () => {
  await denied(op(as7579([{ to: SRM, data: executeRecovery(EOA) }])), migrated(ownSigner), SAFE_CTX, /own passkey signer/);
  await denied(
    op(as7579([{ to: SRM, data: executeRecovery(RECOVERED_SIGNER) }, { to: SRM, data: executeRecovery(EOA) }])),
    migrated(ownSigner),
    SAFE_CTX,
    /own passkey signer/,
  );
});

// =====================================================================
// attacks: nonce key
// =====================================================================

test("nonce key 1 is denied", async () => {
  const o = op(as7579([MINT_CALL]), { nonce: (1n << 64n) + 5n });
  assert.equal(nonceKeyOf(o.nonce), 1n);
  await denied(o, migrated(), LEGACY_CTX, /nonce key/);
  // 4337 layout too
  await denied(op(as4337([MINT_CALL]), { nonce: 1n << 64n }), fakeChain(), LEGACY_CTX, /nonce key/);
});

test("nonce key = SmartSession is denied (no session modes yet)", async () => {
  const sessionNonce = SESSION_NONCE_KEY << 64n;
  assert.equal(nonceKeyOf(sessionNonce), SESSION_NONCE_KEY);
  const chain = migrated();
  await denied(op(as7579([MINT_CALL]), { nonce: sessionNonce }), chain, LEGACY_CTX, /nonce key/);
  await denied(op(as7579([MINT_CALL]), { nonce: sessionNonce + 7n }), chain, LEGACY_CTX, /nonce key/);
  assert.equal(chain.reads.length, 0, "the nonce key is refused before any chain read");
});

test("nonce key 0 with a sequence number passes", async () => {
  const r = await evaluateSponsorPolicy(op(as7579([MINT_CALL]), { nonce: 42n }), LEGACY_CTX, migrated());
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

// =====================================================================
// decoder + reader
// =====================================================================

test("decodeSafe7579Execute: single and batch round-trip the builders' encoding", () => {
  const one = decodeSafe7579Execute(as7579([MINT_CALL]));
  assert.deepEqual(one, { batch: false, executions: [{ target: MINT_CALL.to, value: 0n, data: MINT_CALL.data }] });
  const two = decodeSafe7579Execute(as7579([MINT_CALL, { to: SRM, data: addGuardian }]));
  assert.equal(two?.batch, true);
  assert.equal(two?.executions.length, 2);
  assert.equal(lc(two?.executions[1].target ?? ""), lc(SRM));
  // a Safe4337Module op is not a 7579 op
  assert.equal(decodeSafe7579Execute(as4337([MINT_CALL])), null);
  assert.equal(decodeSafe7579Execute("0x"), null);
});

test("a chain read failure on a 7579 op fails closed", async () => {
  await assert.rejects(evaluateSponsorPolicy(op(as7579([MINT_CALL])), LEGACY_CTX, brokenChain()), ChainReadError);
  const pageDown = { ...migrated(), getModulesPaginated: async () => { throw new Error("rpc down"); } };
  await assert.rejects(evaluateSponsorPolicy(op(as7579([MINT_CALL])), LEGACY_CTX, pageDown), ChainReadError);
});
