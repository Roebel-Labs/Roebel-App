/**
 * Device-session sponsor modes (Task 9): session-upgrade, session-grant, session-revoke, session.
 * Every acceptance path has deny tests beside it (an open faucet is the worst outcome).
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-session-keys.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  numberToHex,
  pad,
  parseAbi,
  parseAbiParameters,
  size,
  type Hex,
} from "viem";
import {
  ADDRESSES,
  ChainReadError,
  evaluateSponsorPolicy,
  parseSponsorRequest,
  type PolicyResult,
  type SponsorContext,
  type SponsorUserOp,
} from "../sponsor-policy";
import { PASSKEY_SAFE } from "../safe-address";
import {
  CIRCLES_HUB,
  DEVICE_SESSION_MAX_SEC,
  MULTI_SEND_CALL_ONLY,
  ROEBEL_GROUP,
  SAFE7579,
  SESSION_NONCE_KEY,
  SMART_SESSIONS,
  encode7579Execute,
  grantCallData,
  groupMintData,
  migrationCallData,
  mintSessions,
  permissionIdsOf,
  personalMintData,
  revokeCallData,
  rootClaimCallData,
  safe7579Abi,
  sessionClaimCallData,
} from "../session-keys-builders";
import { SESSION_CAPS, evaluateSessionKeyModes, sessionGroupKey } from "../session-key-policy";
import { privateKeyToAccount } from "viem/accounts";
import { DEVICE_AUTH_MAX_TTL_SEC, deviceSessionAuthHash } from "../session-keys-builders";
import { toPackedUserOperation } from "../sponsor-policy";
import { hashStableFields } from "../voucher";
import { EOA, KEY, LEGACY, OTHER_LEGACY, SAFE, brokenChain, fakeChain, migrateTo7579, type FakeWorld } from "./fake-chain";
import { NOW, op as baseOp, outer } from "./policy-helpers";

// Device session key (test-only, public): its address is the session signer bound on chain.
const DEVICE_PK = "0x0000000000000000000000000000000000000000000000000000000005e5510e" as Hex;
const DEVICE = privateKeyToAccount(DEVICE_PK);
const SIGNER = DEVICE.address as Hex;
const STRANGER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OTHER_GROUP = "0x9999999999999999999999999999999999999999" as Hex;
const VALID_UNTIL = NOW + 30 * 86_400;
const DS = { signer: SIGNER, validUntil: VALID_UNTIL };
const PARAMS = { legacy: LEGACY, signer: SIGNER, validUntil: VALID_UNTIL };
const PIDS = permissionIdsOf(PARAMS);
const SESSION_NONCE = SESSION_NONCE_KEY << 64n;

/** Kill switch ON, root (no deviceSession). */
const ON: SponsorContext = { ...KEY, legacy: LEGACY, nowSeconds: NOW, sessionKeysEnabled: true };
/** Kill switch ON, grant / upgrade. */
const GRANT_CTX: SponsorContext = { ...ON, deviceSession: DS };

const GRANT_GAS: Partial<SponsorUserOp> = {
  callGasLimit: SESSION_CAPS.grantCallGasLimit,
  verificationGasLimit: SESSION_CAPS.grantVerificationGasLimit,
  maxFeePerGas: SESSION_CAPS.grantMaxFeePerGas,
};
const op = baseOp;
const sessionOp = (callData: Hex, over: Partial<SponsorUserOp> = {}) => op(callData, { nonce: SESSION_NONCE, ...over });

/** The migrated Safe with this device's sessions installed. */
const migrated = (mutate?: (w: FakeWorld) => void) =>
  fakeChain((w) => {
    migrateTo7579(w, SAFE);
    w.smartSession.add(SAFE.toLowerCase());
    w.permissionIds.set(SAFE.toLowerCase(), [PIDS.personalMint, PIDS.groupMint]);
    mutate?.(w);
  });

const upgradeData = (over: Partial<Parameters<typeof migrationCallData>[0]> = {}) =>
  migrationCallData({ safe: SAFE, ...PARAMS, prev4337: SAFE7579, ...over });

const PERSONAL = sessionClaimCallData(LEGACY, personalMintData());
const GROUP = sessionClaimCallData(LEGACY, groupMintData(LEGACY, 7n * 10n ** 18n));

const hub = parseAbi([
  "function groupMint(address group, address[] collateralAvatars, uint256[] amounts, bytes data)",
  "function trust(address trustReceiver, uint96 expiry)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
]);
const legacyAbi = parseAbi([
  "function execute(address target, uint256 value, bytes data)",
  "function executeBatch(address[] targets, uint256[] values, bytes[] data)",
]);
const viaLegacy = (inner: Hex, legacy: Hex = LEGACY) =>
  encode7579Execute([{ to: legacy, data: encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [CIRCLES_HUB, 0n, inner] }) }]);

/** ctx + the device key's deviceAuth over this exact op (security review M-1). */
async function authed(o: SponsorUserOp, ctx: SponsorContext = ON, signer = DEVICE, expiresAt = NOW + 120): Promise<SponsorContext> {
  const hash = deviceSessionAuthHash({ chainId: 100, stableFieldsHash: hashStableFields(toPackedUserOperation(o)), expiresAt });
  return { ...ctx, deviceAuth: { expiresAt, signature: await signer.signMessage({ message: { raw: hash } }) } };
}

async function passes(o: SponsorUserOp, ctx: SponsorContext, chain = migrated()): Promise<PolicyResult & { ok: true }> {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
  return r as PolicyResult & { ok: true };
}
async function denied(o: SponsorUserOp, ctx: SponsorContext, chain: ReturnType<typeof fakeChain>, match: RegExp) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, false, `expected a denial, got ${JSON.stringify(r)}`);
  if (!r.ok) assert.match(r.reason, match);
}
const flip = (h: Hex, byteIndex: number): Hex => {
  const i = 2 + byteIndex * 2;
  const b = (parseInt(h.slice(i, i + 2), 16) ^ 0x01).toString(16).padStart(2, "0");
  return `${h.slice(0, i)}${b}${h.slice(i + 2)}` as Hex;
};

// =====================================================================
// session-upgrade
// =====================================================================

test("session-upgrade: byte-equal migration batch is sponsored with budget key grant:<legacy>", async () => {
  const r = await passes(op(upgradeData(), GRANT_GAS), GRANT_CTX, fakeChain());
  assert.equal(r.mode, "session-upgrade");
  assert.equal(r.budgetKey, `grant:${LEGACY.toLowerCase()}`);
});

test("upgrade: prev4337 is read from the chain (4337 second in the module list)", async () => {
  const chain = fakeChain((w) => {
    // re-insert so SRM comes first: prev(4337) after enable = SRM
    w.modules.clear();
    w.modules.add(`${SAFE.toLowerCase()}:${PASSKEY_SAFE.socialRecoveryModule.toLowerCase()}`);
    w.modules.add(`${SAFE.toLowerCase()}:${PASSKEY_SAFE.safe4337Module.toLowerCase()}`);
  });
  await passes(op(upgradeData({ prev4337: PASSKEY_SAFE.socialRecoveryModule }), GRANT_GAS), GRANT_CTX, chain);
  await denied(op(upgradeData(), GRANT_GAS), GRANT_CTX, chain, /migration batch/);
});

test("upgrade with one byte changed in the batch", async () => {
  const good = upgradeData();
  await denied(op(flip(good, size(good) - 1), GRANT_GAS), GRANT_CTX, fakeChain(), /migration batch|callData/);
  await denied(op(flip(good, Math.floor(size(good) / 2)), GRANT_GAS), GRANT_CTX, fakeChain(), /migration batch|callData/);
});

test("upgrade with a 3rd session (send) appended", async () => {
  const sessions = mintSessions(PARAMS);
  const send = { ...sessions[0], salt: pad("0x5e", { size: 32 }) };
  const POLICY = "(address policy, bytes initData)";
  const TUPLE =
    `(address sessionValidator, bytes sessionValidatorInitData, bytes32 salt, ${POLICY}[] userOpPolicies, ` +
    `((bytes32 appDomainSeparator, string[] contentNames)[] allowedERC7739Content, ${POLICY}[] erc1271Policies) erc7739Policies, ` +
    `(bytes4 actionTargetSelector, address actionTarget, ${POLICY}[] actionPolicies)[] actions, bool permitERC4337Paymaster)`;
  const init3 = concatHex(["0x02", encodeAbiParameters(parseAbiParameters(`${TUPLE}[]`), [[...sessions, send]] as never)]);
  const init2 = concatHex(["0x02", encodeAbiParameters(parseAbiParameters(`${TUPLE}[]`), [sessions] as never)]);
  const good = upgradeData();
  // sanity: the 2-session init data really is inside the good batch, then swap in 3 sessions
  assert.ok(good.toLowerCase().includes(init2.slice(2).toLowerCase()));
  const adminAbi = parseAbi([
    "function enableModule(address module)",
    "function setFallbackHandler(address handler)",
    "function disableModule(address prevModule, address module)",
  ]);
  const tx = (data: Hex) => encodePacked(["uint8", "address", "uint256", "uint256", "bytes"], [0, SAFE, 0n, BigInt(size(data)), data]);
  const init = encodeFunctionData({
    abi: safe7579Abi,
    functionName: "initializeAccount",
    args: [[{ module: SMART_SESSIONS, initData: init3 }], [], [], [], { registry: "0x0000000000000000000000000000000000000000", attesters: [], threshold: 0 }],
  });
  const packed = concatHex([
    tx(encodeFunctionData({ abi: adminAbi, functionName: "enableModule", args: [SAFE7579] })),
    tx(encodeFunctionData({ abi: adminAbi, functionName: "setFallbackHandler", args: [SAFE7579] })),
    tx(init),
    tx(encodeFunctionData({ abi: adminAbi, functionName: "disableModule", args: [SAFE7579, PASSKEY_SAFE.safe4337Module] })),
  ]);
  const ms = encodeFunctionData({ abi: parseAbi(["function multiSend(bytes transactions)"]), functionName: "multiSend", args: [packed] });
  await denied(op(outer(MULTI_SEND_CALL_ONLY, ms, 1), GRANT_GAS), GRANT_CTX, fakeChain(), /migration batch/);
});

test("upgrade whose prev4337 is not the chain's", async () => {
  await denied(op(upgradeData({ prev4337: PASSKEY_SAFE.socialRecoveryModule }), GRANT_GAS), GRANT_CTX, fakeChain(), /migration batch/);
});

test("upgrade with validUntil > now+30d+600s, in the past, or now", async () => {
  for (const validUntil of [NOW + DEVICE_SESSION_MAX_SEC + 1, NOW - 1, NOW]) {
    const ctx = { ...GRANT_CTX, deviceSession: { signer: SIGNER, validUntil } };
    await denied(op(upgradeData({ validUntil }), GRANT_GAS), ctx, fakeChain(), /validUntil/);
  }
  // the exact upper bound passes
  const edge = NOW + DEVICE_SESSION_MAX_SEC;
  await passes(op(upgradeData({ validUntil: edge }), GRANT_GAS), { ...GRANT_CTX, deviceSession: { signer: SIGNER, validUntil: edge } }, fakeChain());
});

test("upgrade with a zero signer", async () => {
  const zero = "0x0000000000000000000000000000000000000000" as Hex;
  await denied(op(upgradeData({ signer: zero }), GRANT_GAS), { ...GRANT_CTX, deviceSession: { signer: zero, validUntil: VALID_UNTIL } }, fakeChain(), /signer/);
});

test("upgrade whose deviceSession differs from the batch's signer / validUntil", async () => {
  await denied(op(upgradeData(), GRANT_GAS), { ...GRANT_CTX, deviceSession: { signer: EOA, validUntil: VALID_UNTIL } }, fakeChain(), /migration batch/);
  await denied(op(upgradeData(), GRANT_GAS), { ...GRANT_CTX, deviceSession: { signer: SIGNER, validUntil: VALID_UNTIL - 1 } }, fakeChain(), /migration batch/);
});

test("upgrade without deviceSession", async () => {
  await denied(op(upgradeData(), GRANT_GAS), ON, fakeChain(), /Safe itself or SmartSession/);
  // and at ordinary gas
  await denied(op(upgradeData()), ON, fakeChain(), /Safe itself or SmartSession/);
});

test("upgrade on a Safe with an extra module, or an incomplete module page", async () => {
  const extra = fakeChain((w) => w.modules.add(`${SAFE.toLowerCase()}:${EOA.toLowerCase()}`));
  await denied(op(upgradeData(), GRANT_GAS), GRANT_CTX, extra, /exactly the modules/);
  const paged = fakeChain((w) => w.modulesNext.set(SAFE.toLowerCase(), EOA));
  await denied(op(upgradeData(), GRANT_GAS), GRANT_CTX, paged, /exactly the modules/);
});

test("upgrade on an already migrated Safe (layout mismatch)", async () => {
  await denied(op(upgradeData(), GRANT_GAS), GRANT_CTX, migrated(), /layout/);
});

test("upgrade for another legacy / non-admin / non-citizen legacy", async () => {
  await denied(op(upgradeData({ legacy: OTHER_LEGACY }), GRANT_GAS), { ...GRANT_CTX, legacy: OTHER_LEGACY }, fakeChain(), /not an admin/);
  await denied(op(upgradeData(), GRANT_GAS), { ...GRANT_CTX, legacy: OTHER_LEGACY }, fakeChain(), /migration batch|not an admin/);
  const noCitizen = fakeChain((w) => w.citizens.delete(LEGACY.toLowerCase()));
  await denied(op(upgradeData(), GRANT_GAS), GRANT_CTX, noCitizen, /CitizenNFT/);
});

test("upgrade gas caps: callGasLimit / verificationGasLimit / maxFeePerGas over the grant caps", async () => {
  await denied(op(upgradeData(), { ...GRANT_GAS, callGasLimit: 3_000_001n }), GRANT_CTX, fakeChain(), /callGasLimit over cap/);
  await denied(op(upgradeData(), { ...GRANT_GAS, verificationGasLimit: 600_001n }), GRANT_CTX, fakeChain(), /verificationGasLimit over cap/);
  await denied(op(upgradeData(), { ...GRANT_GAS, maxFeePerGas: 2_000_000_001n }), GRANT_CTX, fakeChain(), /maxFeePerGas over cap/);
});

test("upgrade as a deploy op, with an ECDSA proof, or as a mini-app request", async () => {
  await denied(op(upgradeData(), { ...GRANT_GAS, factory: PASSKEY_SAFE.proxyFactory, factoryData: "0x01" }), GRANT_CTX, fakeChain(), /factory|deployed/);
  await denied(op(upgradeData(), GRANT_GAS), { ecdsaOwner: EOA, nowSeconds: NOW, deviceSession: DS, sessionKeysEnabled: true }, fakeChain(), /passkey Safes/);
  await denied(op(upgradeData(), GRANT_GAS), { ...GRANT_CTX, miniApp: { id: "x", rules: [] } }, fakeChain(), /mini-app/);
});

test("a deviceSession on any other op is denied (no silent fall-through)", async () => {
  await denied(op(rootClaimCallData(LEGACY, 5n)), GRANT_CTX, migrated(), /grant/);
  await denied(op(outer(LEGACY, encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [CIRCLES_HUB, 0n, personalMintData()] }))), GRANT_CTX, fakeChain(), /migration batch/);
});

test("a 4337 root op calling the Safe itself (enableModule) is denied", async () => {
  const enable = encodeFunctionData({ abi: parseAbi(["function enableModule(address module)"]), functionName: "enableModule", args: [EOA] });
  await denied(op(outer(SAFE, enable)), ON, fakeChain(), /Safe itself or SmartSession/);
});

// =====================================================================
// session-grant
// =====================================================================

test("session-grant install and replace", async () => {
  const fresh = migrated((w) => {
    w.smartSession.delete(SAFE.toLowerCase());
    w.permissionIds.delete(SAFE.toLowerCase());
  });
  const install = await passes(op(grantCallData({ safe: SAFE, ...PARAMS, replace: false }), GRANT_GAS), GRANT_CTX, fresh);
  assert.equal(install.mode, "session-grant");
  assert.equal(install.budgetKey, `grant:${LEGACY.toLowerCase()}`);
  const replace = await passes(op(grantCallData({ safe: SAFE, ...PARAMS, replace: true }), GRANT_GAS), GRANT_CTX, migrated());
  assert.equal(replace.mode, "session-grant");
});

test("grant: replace flag must match the chain", async () => {
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: false }), GRANT_GAS), GRANT_CTX, migrated(), /grant/);
  const fresh = migrated((w) => w.smartSession.delete(SAFE.toLowerCase()));
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: true }), GRANT_GAS), GRANT_CTX, fresh, /grant/);
});

test("grant with one byte changed, another signer, or a too-long validUntil", async () => {
  const good = grantCallData({ safe: SAFE, ...PARAMS, replace: true });
  await denied(op(flip(good, size(good) - 40), GRANT_GAS), GRANT_CTX, migrated(), /grant|callData/);
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, signer: EOA, replace: true }), GRANT_GAS), GRANT_CTX, migrated(), /grant/);
  const far = NOW + DEVICE_SESSION_MAX_SEC + 1;
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, validUntil: far, replace: true }), GRANT_GAS), { ...GRANT_CTX, deviceSession: { signer: SIGNER, validUntil: far } }, migrated(), /validUntil/);
});

test("grant callGasLimit 3_000_001", async () => {
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: true }), { ...GRANT_GAS, callGasLimit: 3_000_001n }), GRANT_CTX, migrated(), /callGasLimit over cap/);
});

test("grant maxFeePerGas 2_000_000_001", async () => {
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: true }), { ...GRANT_GAS, maxFeePerGas: 2_000_000_001n }), GRANT_CTX, migrated(), /maxFeePerGas over cap/);
});

test("grant on a 4337 Safe (layout mismatch) and grant without deviceSession", async () => {
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: false }), GRANT_GAS), GRANT_CTX, fakeChain(), /layout/);
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: true }), GRANT_GAS), ON, migrated(), /Safe itself or SmartSession/);
});

// =====================================================================
// session-revoke
// =====================================================================

test("session-revoke of own pids", async () => {
  const both = await passes(op(revokeCallData([PIDS.personalMint, PIDS.groupMint])), ON);
  assert.equal(both.mode, "session-revoke");
  assert.equal(both.budgetKey, LEGACY);
  const one = await passes(op(revokeCallData([PIDS.groupMint])), ON);
  assert.equal(one.mode, "session-revoke");
});

test("revoke of a pid not on chain", async () => {
  await denied(op(revokeCallData([pad("0x01", { size: 32 })])), ON, migrated(), /permission id/);
});

test("revoke mixed with another call", async () => {
  const removeCall = encodeFunctionData({ abi: parseAbi(["function removeSession(bytes32 permissionId)"]), functionName: "removeSession", args: [PIDS.personalMint] });
  const mixed = encode7579Execute([
    { to: SMART_SESSIONS, data: removeCall },
    { to: LEGACY, data: encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [CIRCLES_HUB, 0n, personalMintData()] }) },
  ]);
  await denied(op(mixed), ON, migrated(), /Safe itself or SmartSession|removeSession/);
  const withSelf = encode7579Execute([
    { to: SMART_SESSIONS, data: removeCall },
    { to: SAFE, data: removeCall },
  ]);
  await denied(op(withSelf), ON, migrated(), /Safe itself or SmartSession/);
});

test("revoke: duplicates, another SmartSession function, value, or a 4337 Safe", async () => {
  await denied(op(revokeCallData([PIDS.personalMint, PIDS.personalMint])), ON, migrated(), /twice/);
  const other = encodeFunctionData({ abi: parseAbi(["function enableSessions((address,bytes,bytes32)[] sessions)"]), functionName: "enableSessions", args: [[]] });
  await denied(op(encode7579Execute([{ to: SMART_SESSIONS, data: other }])), ON, migrated(), /removeSession/);
  const removeCall = encodeFunctionData({ abi: parseAbi(["function removeSession(bytes32 permissionId)"]), functionName: "removeSession", args: [PIDS.personalMint] });
  await denied(op(encode7579Execute([{ to: SMART_SESSIONS, value: 1n, data: removeCall }])), ON, migrated(), /value 0/);
  await denied(op(encode7579Execute([{ to: SMART_SESSIONS, data: concatHex([removeCall, "0x00"]) }])), ON, migrated(), /canonical/);
  await denied(op(outer(SMART_SESSIONS, removeCall)), ON, fakeChain(), /Safe itself or SmartSession/);
});

test("revoke needs the sender bound to the legacy", async () => {
  await denied(op(revokeCallData([PIDS.personalMint])), { ...ON, legacy: undefined }, migrated(), /legacy account/);
  await denied(op(revokeCallData([PIDS.personalMint])), { ...ON, legacy: OTHER_LEGACY }, migrated(), /not an admin/);
});

// =====================================================================
// session (device key, SmartSession nonce key)
// =====================================================================

test("session personalMint", async () => {
  const o = sessionOp(PERSONAL);
  const r = await passes(o, await authed(o));
  assert.equal(r.mode, "session");
  assert.equal(r.budgetKey, sessionGroupKey(SAFE));
  // any sequence number on the session key
  const o41 = sessionOp(PERSONAL, { nonce: SESSION_NONCE + 41n });
  await passes(o41, await authed(o41));
});

test("session groupMint into the Röbel group with [legacy] collateral", async () => {
  const r = await passes(sessionOp(GROUP), await authed(sessionOp(GROUP)));
  assert.equal(r.mode, "session");
  const one = sessionOp(sessionClaimCallData(LEGACY, groupMintData(LEGACY, 1n)));
  await passes(one, await authed(one));
});

// ---- device authorization (security review M-1) ----

test("M-1: a session op without deviceAuth is denied before any chain read", async () => {
  const chain = migrated();
  await denied(sessionOp(PERSONAL), ON, chain, /needs deviceAuth/);
  assert.equal(chain.reads.length, 0);
});

test("M-1: deviceAuth by a key that is not a session signer of the sender is denied", async () => {
  const o = sessionOp(PERSONAL);
  await denied(o, await authed(o, ON, STRANGER), migrated(), /no enabled session/);
});

test("M-1: deviceAuth over a different op (any signed field changed) is denied", async () => {
  const o = sessionOp(PERSONAL);
  const ctx = await authed(o);
  for (const over of [
    { nonce: SESSION_NONCE + 1n },
    { callGasLimit: 299_999n },
    { verificationGasLimit: 499_999n },
    { preVerificationGas: 60_001n },
    { maxFeePerGas: 1_999_999_999n },
    { maxPriorityFeePerGas: 999_999_999n },
    { paymasterVerificationGasLimit: 150_001n },
    { paymasterPostOpGasLimit: 50_001n },
  ] as Partial<SponsorUserOp>[]) {
    // recovers to some other address, which holds no permission id
    await denied({ ...o, ...over }, ctx, migrated(), /no enabled session|signature is invalid/);
  }
  await denied(sessionOp(GROUP), ctx, migrated(), /no enabled session|signature is invalid/);
});

test("M-1: the device key's personalMint authorization needs ITS personalMint pid on chain (kind-bound)", async () => {
  const o = sessionOp(PERSONAL);
  await denied(o, await authed(o), migrated((w) => w.permissionIds.set(SAFE.toLowerCase(), [PIDS.groupMint])), /no enabled session/);
  const g = sessionOp(GROUP);
  await denied(g, await authed(g), migrated((w) => w.permissionIds.set(SAFE.toLowerCase(), [PIDS.personalMint])), /no enabled session/);
  // revoked sessions (other device granted): denied
  await denied(o, await authed(o), migrated((w) => w.permissionIds.set(SAFE.toLowerCase(), [])), /no enabled session/);
});

test("M-1: deviceAuth expiry window: expired, now, and beyond now + 300 s are denied; the edges pass", async () => {
  const o = sessionOp(PERSONAL);
  await denied(o, await authed(o, ON, DEVICE, NOW - 1), migrated(), /expired/);
  await denied(o, await authed(o, ON, DEVICE, NOW), migrated(), /expired/);
  await denied(o, await authed(o, ON, DEVICE, NOW + DEVICE_AUTH_MAX_TTL_SEC + 1), migrated(), /too far/);
  await passes(o, await authed(o, ON, DEVICE, NOW + 1));
  await passes(o, await authed(o, ON, DEVICE, NOW + DEVICE_AUTH_MAX_TTL_SEC));
});

test("M-1: a malformed deviceAuth signature is denied; a raw (non EIP-191) signature over the hash is denied", async () => {
  const o = sessionOp(PERSONAL);
  const bad = { ...ON, deviceAuth: { expiresAt: NOW + 60, signature: `0x${"00".repeat(65)}` as Hex } };
  await denied(o, bad, migrated(), /signature is invalid|no enabled session/);
  const hash = deviceSessionAuthHash({ chainId: 100, stableFieldsHash: hashStableFields(toPackedUserOperation(o)), expiresAt: NOW + 60 });
  const raw = await DEVICE.sign({ hash });
  await denied(o, { ...ON, deviceAuth: { expiresAt: NOW + 60, signature: raw } }, migrated(), /no enabled session|signature is invalid/);
});

test("M-1: deviceAuth on anything but a session op is denied", async () => {
  const o = sessionOp(PERSONAL);
  const ctx = await authed(o);
  await denied(op(PERSONAL), ctx, migrated(), /only for session ops/);
  await denied(op(revokeCallData([PIDS.personalMint])), ctx, migrated(), /only for session ops/);
  await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: true }), GRANT_GAS), { ...ctx, deviceSession: DS }, migrated(), /only for session ops/);
});

test("deviceAuth vector (pinned by the Expo copy too)", async () => {
  const h = deviceSessionAuthHash({ chainId: 100, stableFieldsHash: `0x${"ab".repeat(32)}`, expiresAt: 1_800_000_000 });
  assert.equal(h, DEVICE_AUTH_VECTOR_HASH);
  assert.equal(await DEVICE.signMessage({ message: { raw: h } }), DEVICE_AUTH_VECTOR_SIG);
});

const DEVICE_AUTH_VECTOR_HASH = "0xf43220bd5a4a4cd5f718233bb5802df9dce1ff2df01c7c87725ed53acfe2f827";
const DEVICE_AUTH_VECTOR_SIG = "0x7e7c4962d5c26152fa50a58d2b4c2f86b1129eed53b898b30f23aac65e358702544d3704ef3cfd36ed26531bd1d939360713cbf7fa21bbb49d83b000aba08da11c";

test("session op calling safeTransferFrom", async () => {
  const t = encodeFunctionData({ abi: hub, functionName: "safeTransferFrom", args: [LEGACY, EOA, 1n, 1n, "0x"] });
  await denied(sessionOp(viaLegacy(t)), ON, migrated(), /personalMint or the Röbel groupMint/);
});

test("session op calling trust", async () => {
  const t = encodeFunctionData({ abi: hub, functionName: "trust", args: [EOA, 2n ** 95n] });
  await denied(sessionOp(viaLegacy(t)), ON, migrated(), /personalMint or the Röbel groupMint/);
});

test("session groupMint into another group", async () => {
  const g = encodeFunctionData({ abi: hub, functionName: "groupMint", args: [OTHER_GROUP, [LEGACY], [5n], "0x"] });
  await denied(sessionOp(viaLegacy(g)), ON, migrated(), /Röbel groupMint/);
});

test("session groupMint with foreign collateral (or extra collateral / data)", async () => {
  for (const args of [
    [ROEBEL_GROUP, [EOA], [5n], "0x"],
    [ROEBEL_GROUP, [LEGACY, EOA], [5n, 5n], "0x"],
    [ROEBEL_GROUP, [LEGACY], [5n], "0x01"],
  ] as const) {
    const g = encodeFunctionData({ abi: hub, functionName: "groupMint", args: args as never });
    await denied(sessionOp(viaLegacy(g)), ON, migrated(), /Röbel groupMint/);
  }
});

test("session groupMint amount 0", async () => {
  await denied(sessionOp(sessionClaimCallData(LEGACY, groupMintData(LEGACY, 0n))), ON, migrated(), /Röbel groupMint/);
});

test("session op via executeBatch", async () => {
  const batch = encodeFunctionData({ abi: legacyAbi, functionName: "executeBatch", args: [[CIRCLES_HUB], [0n], [personalMintData()]] });
  await denied(sessionOp(encode7579Execute([{ to: LEGACY, data: batch }])), ON, migrated(), /Röbel groupMint/);
  // the kill-switch fallback root claim (executeBatch) is not a session shape either
  await denied(sessionOp(rootClaimCallData(LEGACY, 5n)), ON, migrated(), /Röbel groupMint/);
});

test("session op batch mode", async () => {
  const call = { to: LEGACY, data: encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [CIRCLES_HUB, 0n, personalMintData()] }) };
  await denied(sessionOp(encode7579Execute([call, call])), ON, migrated(), /Röbel groupMint/);
  // EXEC_BATCH with a single execution
  const batchOne = encodeFunctionData({
    abi: safe7579Abi,
    functionName: "execute",
    args: [pad("0x01", { size: 32, dir: "right" }), encodeAbiParameters(parseAbiParameters("(address target, uint256 value, bytes callData)[]"), [[{ target: call.to, value: 0n, callData: call.data }]])],
  });
  await denied(sessionOp(batchOne), ON, migrated(), /Röbel groupMint/);
});

test("session op non-canonical bytes offset (0x80)", async () => {
  const inner = personalMintData();
  const nonCanonical = concatHex([
    "0xb61d27f6",
    pad(CIRCLES_HUB.toLowerCase() as Hex, { size: 32 }),
    pad("0x00", { size: 32 }),
    numberToHex(0x80, { size: 32 }),
    pad("0x00", { size: 32 }),
    numberToHex(4, { size: 32 }),
    pad(inner, { size: 32, dir: "right" }),
  ]);
  await denied(sessionOp(encode7579Execute([{ to: LEGACY, data: nonCanonical }])), ON, migrated(), /canonical|Röbel groupMint/);
  // trailing bytes after the canonical claim
  await denied(sessionOp(encode7579Execute([{ to: LEGACY, data: concatHex([encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [CIRCLES_HUB, 0n, inner] }), "0x00"]) }])), ON, migrated(), /canonical|Röbel groupMint/);
});

test("session op with value or a non-Hub target", async () => {
  const exec = encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [CIRCLES_HUB, 0n, personalMintData()] });
  await denied(sessionOp(encode7579Execute([{ to: LEGACY, value: 1n, data: exec }])), ON, migrated(), /Röbel groupMint/);
  const withValue = encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [CIRCLES_HUB, 1n, personalMintData()] });
  await denied(sessionOp(encode7579Execute([{ to: LEGACY, data: withValue }])), ON, migrated(), /Röbel groupMint/);
  const elsewhere = encodeFunctionData({ abi: legacyAbi, functionName: "execute", args: [EOA, 0n, personalMintData()] });
  await denied(sessionOp(encode7579Execute([{ to: LEGACY, data: elsewhere }])), ON, migrated(), /Röbel groupMint/);
  // directly from the Safe (identity = Safe): not a session shape
  await denied(sessionOp(encode7579Execute([{ to: CIRCLES_HUB, data: personalMintData() }])), ON, migrated(), /Röbel groupMint/);
});

test("session op for another legacy", async () => {
  // callData for LEGACY, request names OTHER_LEGACY
  await denied(sessionOp(PERSONAL), { ...ON, legacy: OTHER_LEGACY }, migrated(), /Röbel groupMint/);
  // callData and request for OTHER_LEGACY, which the Safe does not administer
  const other = sessionOp(sessionClaimCallData(OTHER_LEGACY, personalMintData()));
  await denied(other, await authed(other, { ...ON, legacy: OTHER_LEGACY }), migrated(), /not an admin/);
  // groupMint for LEGACY with OTHER_LEGACY collateral
  await denied(sessionOp(sessionClaimCallData(LEGACY, groupMintData(OTHER_LEGACY, 5n))), ON, migrated(), /Röbel groupMint/);
  // no legacy named
  await denied(sessionOp(PERSONAL), { ...ON, legacy: undefined }, migrated(), /legacy account/);
});

test("session op on a Safe without SmartSession", async () => {
  const o = sessionOp(PERSONAL);
  await denied(o, await authed(o), migrated((w) => w.smartSession.delete(SAFE.toLowerCase())), /SmartSession is not installed/);
});

test("session op on a 4337 Safe (not migrated)", async () => {
  const o = sessionOp(PERSONAL);
  await denied(o, await authed(o), fakeChain(), /layout/);
});

test("session op gas caps (M-2): each field at its cap passes, one above is denied", async () => {
  const caps: [keyof SponsorUserOp, bigint][] = [
    ["callGasLimit", SESSION_CAPS.sessionCallGasLimit],
    ["verificationGasLimit", SESSION_CAPS.sessionVerificationGasLimit],
    ["preVerificationGas", SESSION_CAPS.sessionPreVerificationGas],
    ["maxFeePerGas", SESSION_CAPS.sessionMaxFeePerGas],
    ["paymasterVerificationGasLimit", SESSION_CAPS.sessionPaymasterVerificationGasLimit],
    ["paymasterPostOpGasLimit", SESSION_CAPS.sessionPaymasterPostOpGasLimit],
  ];
  for (const [field, cap] of caps) {
    const at = sessionOp(PERSONAL, { [field]: cap });
    await passes(at, await authed(at));
    const over = sessionOp(PERSONAL, { [field]: cap + 1n });
    await denied(over, await authed(over), migrated(), new RegExp(`${field} over cap`));
  }
  assert.equal(SESSION_CAPS.sessionCallGasLimit, 300_000n);
  assert.equal(SESSION_CAPS.sessionVerificationGasLimit, 500_000n);
  assert.equal(SESSION_CAPS.sessionMaxFeePerGas, 2_000_000_000n);
});

test("session op with deviceSession, a factory, an ECDSA proof or a mini app", async () => {
  await denied(sessionOp(PERSONAL), GRANT_CTX, migrated(), /deviceSession/);
  await denied(sessionOp(PERSONAL, { factory: PASSKEY_SAFE.proxyFactory, factoryData: "0x01" }), ON, migrated(), /factory|deployed/);
  await denied(sessionOp(PERSONAL), { ecdsaOwner: EOA, legacy: undefined, nowSeconds: NOW, sessionKeysEnabled: true }, migrated(), /passkey Safes/);
  await denied(sessionOp(PERSONAL), { ...ON, miniApp: { id: "x", rules: [] } }, migrated(), /mini-app/);
});

test("session op chain failure throws ChainReadError (caller fails closed)", async () => {
  const o = sessionOp(PERSONAL);
  await assert.rejects(evaluateSponsorPolicy(o, await authed(o), brokenChain()), ChainReadError);
});

// =====================================================================
// nonce-key routing
// =====================================================================

test("key 0 never matches the session mode (the same claim bytes are an ordinary root op)", async () => {
  const r = await evaluateSponsorPolicy(op(PERSONAL), ON, migrated());
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
  assert.notEqual((r as { mode: string }).mode, "session");
  assert.equal(await evaluateSessionKeyModes(op(PERSONAL), ON, migrated()), null);
});

test("fuzz: 1000 random nonce keys other than 0 / SmartSession are denied", async () => {
  const chain = migrated();
  for (let i = 0; i < 1000; i++) {
    let k = 0n;
    for (let j = 0; j < 6; j++) k = (k << 32n) | BigInt(Math.floor(Math.random() * 2 ** 32));
    if (k === 0n || k === SESSION_NONCE_KEY) continue;
    for (const cd of [PERSONAL, revokeCallData([PIDS.personalMint])]) {
      const r = await evaluateSponsorPolicy(op(cd, { nonce: (k << 64n) | 3n }), ON, chain);
      assert.equal(r.ok, false, `key ${k.toString(16)} passed`);
      if (!r.ok) assert.match(r.reason, /nonce key/);
    }
  }
  // neighbours of the session key
  for (const k of [SESSION_NONCE_KEY + 1n, SESSION_NONCE_KEY - 1n, SESSION_NONCE_KEY ^ (1n << 191n)]) {
    const r = await evaluateSponsorPolicy(op(PERSONAL, { nonce: k << 64n }), ON, chain);
    assert.equal(r.ok, false);
  }
  assert.ok(!chain.reads.length, "denied before any chain read");
});

// =====================================================================
// kill switch
// =====================================================================

test("kill switch off: upgrade, grant, session denied; revoke and 7579 root ops still pass", async () => {
  for (const enabled of [false, undefined]) {
    const off: SponsorContext = { ...ON, sessionKeysEnabled: enabled };
    const offGrant: SponsorContext = { ...off, deviceSession: DS };
    const c1 = fakeChain();
    await denied(op(upgradeData(), GRANT_GAS), offGrant, c1, /switched off/);
    assert.equal(c1.reads.length, 0, "upgrade denied before any chain read");
    const c2 = migrated();
    await denied(op(grantCallData({ safe: SAFE, ...PARAMS, replace: true }), GRANT_GAS), offGrant, c2, /switched off/);
    await denied(sessionOp(PERSONAL), off, c2, /switched off/);
    await denied(sessionOp(GROUP), off, c2, /switched off/);
    assert.equal(c2.reads.length, 0, "denied before any chain read");
    // still sponsored
    assert.equal((await passes(op(revokeCallData([PIDS.personalMint, PIDS.groupMint])), off)).mode, "session-revoke");
    const root = await passes(op(rootClaimCallData(LEGACY, 5n)), off);
    assert.equal(root.budgetKey, LEGACY);
  }
});

// =====================================================================
// request parsing
// =====================================================================

test("parseSponsorRequest: deviceSession {signer, validUntil}", () => {
  const base = { chainId: 100, userOp: { sender: SAFE, nonce: "0x0", callData: "0x", callGasLimit: "0x1", verificationGasLimit: "0x1", preVerificationGas: "0x1", maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x1", paymasterVerificationGasLimit: "0x1", paymasterPostOpGasLimit: "0x1" }, x: KEY.x, y: KEY.y };
  assert.deepEqual(parseSponsorRequest({ ...base, deviceSession: { signer: SIGNER, validUntil: 1_800_000_000 } }).deviceSession, { signer: SIGNER, validUntil: 1_800_000_000 });
  assert.equal("deviceSession" in parseSponsorRequest(base), false);
  for (const bad of [{ signer: "nope", validUntil: 1 }, { signer: SIGNER, validUntil: "1" }, { signer: SIGNER, validUntil: 1.5 }, { signer: SIGNER, validUntil: -1 }, { signer: SIGNER }, "x", [SIGNER, 1]]) {
    assert.throws(() => parseSponsorRequest({ ...base, deviceSession: bad }));
  }
});

test("sanity: the addresses the policy pins", () => {
  assert.equal(MULTI_SEND_CALL_ONLY.toLowerCase(), ADDRESSES.multiSendCallOnly.toLowerCase());
});
