/**
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  concatHex,
  encodeFunctionData,
  encodePacked,
  getAddress,
  parseAbi,
  size,
  zeroAddress,
  type Hex,
} from "viem";
import {
  ADDRESSES,
  CAPS,
  ChainReadError,
  LEGACY_ACCOUNT_PROXY_CODE,
  evaluateSponsorPolicy,
  parseSponsorRequest,
  parseSponsorUserOp,
  toPackedUserOperation,
  type ChainReader,
  type SponsorContext,
  type SponsorUserOp,
} from "../sponsor-policy";
import { FALLBACK_HANDLER_SLOT, PASSKEY_SAFE, WEBAUTHN_VERIFIERS, safeFactoryData } from "../safe-address";
import { packUint128Pair } from "../voucher";
import {
  BAD_SIG,
  EOA,
  GOOD_SIG,
  GUARDIAN,
  KEY,
  LEGACY,
  OTHER_LEGACY,
  RECIPIENT,
  RECOVERED_SIGNER,
  SAFE,
  brokenChain,
  fakeChain,
  type FakeChain,
} from "./fake-chain";

const safe4337 = parseAbi([
  "function executeUserOp(address to, uint256 value, bytes data, uint8 operation)",
  "function executeUserOpWithErrorString(address to, uint256 value, bytes data, uint8 operation)",
]);
const account = parseAbi([
  "struct SignerPermissionRequest { address signer; uint8 isAdmin; address[] approvedTargets; uint256 nativeTokenLimitPerTransaction; uint128 permissionStartTimestamp; uint128 permissionEndTimestamp; uint128 reqValidityStartTimestamp; uint128 reqValidityEndTimestamp; bytes32 uid; }",
  "function setPermissionsForSigner(SignerPermissionRequest req, bytes signature)",
  "function execute(address target, uint256 value, bytes calldata)",
  "function executeBatch(address[] target, uint256[] value, bytes[] calldata)",
]);
const srm = parseAbi([
  "function addGuardianWithThreshold(address guardian, uint256 threshold)",
  "function revokeGuardianWithThreshold(address prevGuardian, address guardian, uint256 threshold)",
  "function changeThreshold(uint256 threshold)",
  "function confirmRecovery(address wallet, address[] newOwners, uint256 newThreshold, bool execute)",
  "function cancelRecovery()",
  "function executeRecovery(address wallet, address[] newOwners, uint256 newThreshold)",
  "function finalizeRecovery(address wallet)",
]);
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);
const erc20 = parseAbi(["function transfer(address to, uint256 amount)"]);
const proxyFactoryAbi = parseAbi([
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce)",
]);

const NOW = 1_790_000_100;
const CTX: SponsorContext = { x: KEY.x, y: KEY.y, legacy: LEGACY, nowSeconds: NOW };
const ATTACKER = "0x9999999999999999999999999999999999999999" as Hex;

function permReq(isAdmin: number, signer: Hex = SAFE, sig: Hex = GOOD_SIG, validity: [bigint, bigint] = [BigInt(NOW - 60), BigInt(NOW + 3600)]) {
  return encodeFunctionData({
    abi: account,
    functionName: "setPermissionsForSigner",
    args: [
      {
        signer,
        isAdmin,
        approvedTargets: [],
        nativeTokenLimitPerTransaction: 0n,
        permissionStartTimestamp: 0n,
        permissionEndTimestamp: 0n,
        reqValidityStartTimestamp: validity[0],
        reqValidityEndTimestamp: validity[1],
        uid: `0x${"01".repeat(32)}`,
      },
      sig,
    ],
  });
}

const execLegacy = (target: Hex, value: bigint, data: Hex) =>
  encodeFunctionData({ abi: account, functionName: "execute", args: [target, value, data] });
const srmCall = {
  add: () => encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] }),
  cancel: () => encodeFunctionData({ abi: srm, functionName: "cancelRecovery" }),
  confirm: () =>
    encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [RECIPIENT, [GUARDIAN], 1n, false] }),
};

const outer = (
  to: Hex,
  data: Hex,
  operation = 0,
  value = 0n,
  fn: "executeUserOp" | "executeUserOpWithErrorString" = "executeUserOp",
) => encodeFunctionData({ abi: safe4337, functionName: fn, args: [to, value, data, operation] });

type Inner = { operation?: number; to: Hex; value?: bigint; data: Hex };
function packMultiSend(txs: Inner[]): Hex {
  const packed = concatHex(
    txs.map((t) =>
      encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [t.operation ?? 0, t.to, t.value ?? 0n, BigInt(size(t.data)), t.data],
      ),
    ),
  );
  return encodeFunctionData({ abi: multiSendAbi, functionName: "multiSend", args: [packed] });
}
const viaMultiSend = (txs: Inner[]) => outer(ADDRESSES.multiSendCallOnly, packMultiSend(txs), 1);

function op(callData: Hex, over: Partial<SponsorUserOp> = {}): SponsorUserOp {
  return {
    sender: SAFE,
    nonce: 0n,
    callData,
    callGasLimit: 300_000n,
    verificationGasLimit: 500_000n,
    preVerificationGas: 60_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    paymasterVerificationGasLimit: 150_000n,
    paymasterPostOpGasLimit: 50_000n,
    ...over,
  };
}

/** A first op: the Safe does not exist yet (factory + factoryData). */
const deployOp = (callData: Hex, over: Partial<SponsorUserOp> = {}) =>
  op(callData, { factory: PASSKEY_SAFE.proxyFactory, factoryData: safeFactoryData(KEY), ...over });
const undeployed = () =>
  fakeChain((w) => {
    w.codes.delete(SAFE.toLowerCase());
    w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase());
  });

async function ok(o: SponsorUserOp, chain: ChainReader = fakeChain(), ctx: SponsorContext = CTX, budgetKey?: Hex) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, true, r.ok ? "" : `expected ok, got: ${r.reason}`);
  if (r.ok) assert.equal(r.budgetKey.toLowerCase(), (budgetKey ?? ctx.legacy ?? o.sender).toLowerCase(), "budget key");
}
async function rejected(o: SponsorUserOp, re?: RegExp, chain: ChainReader = fakeChain(), ctx: SponsorContext = CTX) {
  const r = await evaluateSponsorPolicy(o, ctx, chain);
  assert.equal(r.ok, false, "expected rejection");
  if (!r.ok && re) assert.match(r.reason, re);
}

// ---- happy paths ----

test("deployed passkey Safe (admin of its legacy account) may execute through it", async () => {
  await ok(op(outer(LEGACY, execLegacy(RECIPIENT, 1n, "0x"))));
  await ok(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"), 0, 0n, "executeUserOpWithErrorString")));
  await ok(
    op(
      outer(
        LEGACY,
        encodeFunctionData({
          abi: account,
          functionName: "executeBatch",
          args: [[RECIPIENT, RECIPIENT], [0n, 1n], ["0x", "0x1234"]],
        }),
      ),
    ),
  );
});

test("deploy + handover: exact factoryData, verified handover signature", async () => {
  const chain = undeployed();
  await ok(deployOp(outer(LEGACY, permReq(1))), chain);
  assert.ok(chain.reads.includes("verifySignerPermissionRequest"));
  // The Safe is counterfactual: none of the deployed-Safe reads happen.
  assert.equal(chain.reads.includes("getStorageAt"), false);
});

test("deploy + handover + guardian setup + execute in one batch", async () => {
  await ok(
    deployOp(
      viaMultiSend([
        { to: LEGACY, data: permReq(1) },
        { to: ADDRESSES.socialRecoveryModule, data: srmCall.add() },
        { to: LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") },
      ]),
    ),
    undeployed(),
  );
});

test("each SRM guardian-management selector is allowed for a Safe that is admin of the legacy account", async () => {
  const calls: Hex[] = [
    srmCall.add(),
    encodeFunctionData({ abi: srm, functionName: "revokeGuardianWithThreshold", args: [zeroAddress, GUARDIAN, 1n] }),
    encodeFunctionData({ abi: srm, functionName: "changeThreshold", args: [2n] }),
    srmCall.confirm(),
    srmCall.cancel(),
  ];
  for (const c of calls) await ok(op(outer(ADDRESSES.socialRecoveryModule, c)));
});

test("a recovered Safe (owner = SafeWebAuthnSignerFactory signer for the new key) is accepted", async () => {
  const newKey = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  const chain = fakeChain((w) => {
    w.owners.set(SAFE.toLowerCase(), [RECOVERED_SIGNER]);
    w.codes.set(RECOVERED_SIGNER.toLowerCase(), "0x60806040");
    w.webauthnSigners.set(`${BigInt(newKey.x)}:${BigInt(newKey.y)}:${WEBAUTHN_VERIFIERS}`, RECOVERED_SIGNER);
  });
  await ok(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), chain, { ...CTX, ...newKey });
  // ...but not with some other key.
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), /owner/, chain);
});

// ---- reviewer attack cases ----

test("attack A: arbitrary sender + SRM cancelRecovery", async () => {
  // Sender is an EOA / random address: no code.
  await rejected(op(outer(ADDRESSES.socialRecoveryModule, srmCall.cancel()), { sender: ATTACKER }), /not a passkey Safe/);
  // A genuine passkey Safe that is NOT admin of the named legacy account.
  const notAdmin = fakeChain((w) => w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase()));
  await rejected(op(outer(ADDRESSES.socialRecoveryModule, srmCall.cancel())), /not an admin/, notAdmin);
  await rejected(op(outer(ADDRESSES.socialRecoveryModule, srmCall.confirm())), /not an admin/, notAdmin);
});

test("attack B: multiSend of a handover with a garbage signature + execute", async () => {
  const notAdmin = fakeChain((w) => w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase()));
  await rejected(
    op(
      viaMultiSend([
        { to: LEGACY, data: permReq(1, SAFE, BAD_SIG) },
        { to: LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") },
      ]),
    ),
    /handover signature/,
    notAdmin,
  );
  // Same with a garbage-signed handover that would unlock SRM calls.
  await rejected(
    op(
      viaMultiSend([
        { to: LEGACY, data: permReq(1, SAFE, BAD_SIG) },
        { to: ADDRESSES.socialRecoveryModule, data: srmCall.cancel() },
      ]),
    ),
    /handover signature/,
    notAdmin,
  );
});

test("a handover signed by a non-admin, or already executed, is rejected", async () => {
  const eoaNotAdmin = fakeChain((w) => {
    w.admins.delete(`${LEGACY}:${EOA}`.toLowerCase());
    w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase());
  });
  await rejected(op(outer(LEGACY, permReq(1))), /handover signature/, eoaNotAdmin);
  const replay = fakeChain((w) => w.executedUids.add(`0x${"01".repeat(32)}`));
  await rejected(op(outer(LEGACY, permReq(1))), /handover signature/, replay);
});

test("a handover outside its validity window is rejected without chain reads", async () => {
  const chain = fakeChain();
  await rejected(op(outer(LEGACY, permReq(1, SAFE, GOOD_SIG, [1n, 2n]))), /validity/, chain);
  await rejected(op(outer(LEGACY, permReq(1, SAFE, GOOD_SIG, [BigInt(NOW + 10), BigInt(NOW + 20)]))), /validity/, chain);
  assert.equal(chain.reads.length, 0);
});

test("attack: deploy op with a foreign initializer / salt / singleton / factory", async () => {
  const c = outer(LEGACY, permReq(1));
  const fd = (singleton: Hex, init: Hex, salt = 0n) =>
    encodeFunctionData({ abi: proxyFactoryAbi, functionName: "createProxyWithNonce", args: [singleton, init, salt] });
  // Foreign initializer (e.g. an EOA owner) at the matching predicted sender.
  await rejected(deployOp(c, { factoryData: fd(ADDRESSES.safeL2Singleton, "0x1234") }), /factoryData/, undeployed());
  // Right initializer, other salt nonce.
  const init = (await import("../safe-address")).buildSafeSetup(KEY).initializer;
  await rejected(deployOp(c, { factoryData: fd(ADDRESSES.safeL2Singleton, init, 1n) }), /factoryData/, undeployed());
  await rejected(deployOp(c, { factoryData: fd(RECIPIENT, init) }), /factoryData/, undeployed());
  await rejected(deployOp(c, { factory: RECIPIENT }), /factory/, undeployed());
  await rejected(deployOp(c, { factoryData: "0xdeadbeef" }), /factoryData/, undeployed());
  await rejected(op(c, { factoryData: safeFactoryData(KEY) }), /factory/);
  // Correct factoryData for KEY, but the sender is someone else.
  await rejected(deployOp(c, { sender: ATTACKER }), /sender/, undeployed());
  // Correct deploy for KEY, but the request names another key.
  await rejected(deployOp(c), /factoryData/, undeployed(), { ...CTX, x: `0x${"aa".repeat(32)}` });
});

test("attack: a deployed sender that is not a passkey Safe", async () => {
  const c = outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"));
  const variants: Array<[string, (w: FakeChain["world"]) => void, RegExp]> = [
    ["no code", (w) => w.codes.delete(SAFE.toLowerCase()), /not a passkey Safe/],
    ["other code", (w) => w.codes.set(SAFE.toLowerCase(), "0x6080604052"), /not a passkey Safe/],
    ["legacy thirdweb account as sender", (w) => w.codes.set(SAFE.toLowerCase(), LEGACY_ACCOUNT_PROXY_CODE), /not a passkey Safe/],
    ["other singleton", (w) => w.storage.set(`${SAFE}:0x${"0".repeat(64)}`.toLowerCase(), `0x${RECIPIENT.slice(2).padStart(64, "0")}`), /singleton/],
    ["other fallback handler", (w) => w.storage.set(`${SAFE}:${FALLBACK_HANDLER_SLOT}`.toLowerCase(), `0x${"0".repeat(64)}`), /fallback handler/],
    ["4337 module disabled", (w) => w.modules.delete(`${SAFE}:${PASSKEY_SAFE.safe4337Module}`.toLowerCase()), /module/],
    ["two owners", (w) => w.owners.set(SAFE.toLowerCase(), [PASSKEY_SAFE.sharedSigner, EOA]), /owner/],
    ["EOA owner", (w) => w.owners.set(SAFE.toLowerCase(), [EOA]), /owner/],
    ["shared signer configured with another key", (w) => w.sharedConfig.set(SAFE.toLowerCase(), { x: 1n, y: 2n, verifiers: WEBAUTHN_VERIFIERS }), /owner/],
  ];
  for (const [name, mutate, re] of variants) {
    await rejected(op(c), re, fakeChain(mutate)).catch((e) => {
      throw new Error(`${name}: ${e.message}`);
    });
  }
});

test("attack: a non-citizen legacy account", async () => {
  const chain = fakeChain((w) => w.citizens.delete(LEGACY.toLowerCase()));
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), /CitizenNFT/, chain);
  await rejected(deployOp(outer(LEGACY, permReq(1))), /CitizenNFT/, fakeChain((w) => {
    w.citizens.delete(LEGACY.toLowerCase());
    w.codes.delete(SAFE.toLowerCase());
  }));
});

test("attack: the legacy account in the request is not a thirdweb account", async () => {
  const chain = fakeChain((w) => {
    w.codes.set(LEGACY.toLowerCase(), "0x6080604052");
  });
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), /legacy thirdweb account/, chain);
});

test("attack: maxFeePerGas 50 gwei", async () => {
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x")), { maxFeePerGas: 50_000_000_000n }), /maxFeePerGas/);
});

test("attack: a second legacy account in a batch (or any target other than the request's legacy)", async () => {
  await rejected(
    op(
      viaMultiSend([
        { to: LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") },
        { to: OTHER_LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") },
      ]),
    ),
    /request's legacy account/,
  );
  await rejected(op(outer(OTHER_LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), /request's legacy account/);
  await rejected(op(outer(OTHER_LEGACY, permReq(1))), /request's legacy account/);
  await rejected(op(outer(RECIPIENT, execLegacy(RECIPIENT, 0n, "0x"))), /request's legacy account/);
});

// ---- structural rules kept from tranche 1 ----

test("rejects removal requests (isAdmin=2), directly, via execute and inside multisend", async () => {
  await rejected(op(outer(LEGACY, permReq(2))), /isAdmin/);
  await rejected(op(outer(LEGACY, execLegacy(LEGACY, 0n, permReq(2)))), /isAdmin/);
  await rejected(op(viaMultiSend([{ to: LEGACY, data: permReq(2) }])), /isAdmin/);
  await rejected(op(outer(LEGACY, permReq(0))), /isAdmin/);
});

test("rejects a handover whose req.signer is not the sender, also nested", async () => {
  await rejected(op(outer(LEGACY, permReq(1, GUARDIAN))), /signer/);
  await rejected(op(outer(LEGACY, execLegacy(LEGACY, 0n, permReq(1, GUARDIAN)))), /signer/);
});

test("rejects an arbitrary ERC-20 transfer", async () => {
  const t = encodeFunctionData({ abi: erc20, functionName: "transfer", args: [RECIPIENT, 1n] });
  await rejected(op(outer(RECIPIENT, t)));
  await rejected(op(viaMultiSend([{ to: RECIPIENT, data: t }])));
});

test("rejects delegatecall to anything but MultiSendCallOnly, and plain calls to it", async () => {
  await rejected(op(outer(LEGACY, permReq(1), 1)), /delegatecall/);
  await rejected(op(outer(ADDRESSES.multiSend141, packMultiSend([{ to: LEGACY, data: permReq(1) }]), 1)), /delegatecall/);
  await rejected(op(outer(ADDRESSES.multiSendCallOnly, packMultiSend([{ to: LEGACY, data: permReq(1) }]), 0)));
  await rejected(op(outer(ADDRESSES.multiSendCallOnly, permReq(1), 1)));
});

test("rejects inner delegatecall / inner value / malformed or empty multisend / outer value", async () => {
  await rejected(op(viaMultiSend([{ to: LEGACY, data: permReq(1), operation: 1 }])));
  await rejected(op(viaMultiSend([{ to: LEGACY, data: permReq(1), value: 1n }])));
  const truncated = encodeFunctionData({
    abi: multiSendAbi,
    functionName: "multiSend",
    args: [concatHex([encodePacked(["uint8", "address", "uint256", "uint256"], [0, LEGACY, 0n, 100n]), "0x1234"])],
  });
  await rejected(op(outer(ADDRESSES.multiSendCallOnly, truncated, 1)));
  await rejected(op(viaMultiSend([])));
  await rejected(op(outer(LEGACY, permReq(1), 0, 1n)), /value/);
});

test("rejects SRM selectors on a foreign address and non-guardian SRM functions", async () => {
  await rejected(op(outer(RECIPIENT, srmCall.add())));
  await rejected(
    op(outer(ADDRESSES.socialRecoveryModule, encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [SAFE, [GUARDIAN], 1n] }))),
  );
  await rejected(
    op(outer(ADDRESSES.socialRecoveryModule, encodeFunctionData({ abi: srm, functionName: "finalizeRecovery", args: [SAFE] }))),
  );
  await rejected(op(execLegacy(RECIPIENT, 0n, "0x")));
  await rejected(op("0x"));
});

test("rejects gas over each cap and priority above maxFee", async () => {
  const c = outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"));
  await rejected(op(c, { callGasLimit: CAPS.callGasLimit + 1n }), /callGasLimit/);
  await rejected(op(c, { verificationGasLimit: CAPS.verificationGasLimit + 1n }), /verificationGasLimit/);
  await rejected(op(c, { preVerificationGas: CAPS.preVerificationGas + 1n }), /preVerificationGas/);
  await rejected(op(c, { maxFeePerGas: CAPS.maxFeePerGas + 1n }), /maxFeePerGas/);
  await rejected(op(c, { paymasterVerificationGasLimit: CAPS.paymasterVerificationGasLimit + 1n }), /paymasterVerificationGasLimit/);
  await rejected(op(c, { paymasterPostOpGasLimit: CAPS.paymasterPostOpGasLimit + 1n }), /paymasterPostOpGasLimit/);
  await rejected(op(c, { maxPriorityFeePerGas: 2_000_000_001n }), /maxPriorityFeePerGas/);
});

test("caps: 3 gwei fee cap; gas caps unchanged", () => {
  assert.equal(CAPS.maxFeePerGas, 3_000_000_000n);
  assert.equal(CAPS.callGasLimit, 1_500_000n);
  assert.equal(CAPS.verificationGasLimit, 1_000_000n);
  assert.equal(CAPS.preVerificationGas, 200_000n);
  assert.equal(CAPS.paymasterVerificationGasLimit, 300_000n);
  assert.equal(CAPS.paymasterPostOpGasLimit, 100_000n);
});

test("execute before the handover in the same batch needs the sender to already be admin", async () => {
  const notAdmin = fakeChain((w) => w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase()));
  await rejected(
    op(
      viaMultiSend([
        { to: LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") },
        { to: LEGACY, data: permReq(1) },
      ]),
    ),
    /not an admin/,
    notAdmin,
  );
  await ok(
    op(
      viaMultiSend([
        { to: LEGACY, data: permReq(1) },
        { to: LEGACY, data: execLegacy(RECIPIENT, 0n, "0x") },
      ]),
    ),
    fakeChain((w) => w.admins.delete(`${LEGACY}:${SAFE}`.toLowerCase())),
  );
});

// ---- fail closed / no reads before structure ----

test("chain read failure fails closed with ChainReadError (never ok)", async () => {
  await assert.rejects(evaluateSponsorPolicy(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), CTX, brokenChain()), ChainReadError);
  await assert.rejects(evaluateSponsorPolicy(deployOp(outer(LEGACY, permReq(1))), CTX, brokenChain()), ChainReadError);
});

test("structural rejections do not touch the chain", async () => {
  const chain = fakeChain();
  await rejected(op(outer(LEGACY, permReq(2))), /isAdmin/, chain);
  await rejected(op(outer(OTHER_LEGACY, execLegacy(RECIPIENT, 0n, "0x"))), /legacy/, chain);
  await rejected(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x")), { maxFeePerGas: 50_000_000_000n }), /maxFeePerGas/, chain);
  await rejected(deployOp(outer(LEGACY, permReq(1)), { factoryData: "0x1234" }), /factoryData/, chain);
  assert.deepEqual(chain.reads, []);
});

// ---- parsing / packing ----

test("parseSponsorUserOp reads hex numerics and rejects malformed input", () => {
  const parsed = parseSponsorUserOp({
    sender: SAFE,
    nonce: "0x1",
    callData: "0x1234",
    callGasLimit: "0x2",
    verificationGasLimit: "0x3",
    preVerificationGas: "0x4",
    maxFeePerGas: "0x5",
    maxPriorityFeePerGas: "0x6",
    paymasterVerificationGasLimit: "0x7",
    paymasterPostOpGasLimit: "0x0",
  });
  assert.equal(parsed.nonce, 1n);
  assert.equal(parsed.paymasterVerificationGasLimit, 7n);
  assert.equal(parsed.factory, undefined);
  assert.throws(() => parseSponsorUserOp({ sender: "nope" }));
  assert.throws(() => parseSponsorUserOp(null));
});

test("parseSponsorRequest requires 32-byte x, y; legacy / recoveryLegacy are optional addresses", () => {
  const userOp = { ...toRpc(op(outer(LEGACY, execLegacy(RECIPIENT, 0n, "0x")))) };
  const good = parseSponsorRequest({ chainId: 100, userOp, x: KEY.x, y: KEY.y, legacy: LEGACY });
  assert.equal(good.chainId, 100);
  assert.equal(good.x, KEY.x);
  assert.equal(getAddress(good.legacy!), LEGACY);
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp, y: KEY.y, legacy: LEGACY }));
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp, x: "0x1234", y: KEY.y, legacy: LEGACY }));
  const noLegacy = parseSponsorRequest({ chainId: 100, userOp, x: KEY.x, y: KEY.y });
  assert.equal(noLegacy.legacy, undefined);
  assert.equal(noLegacy.recoveryLegacy, undefined);
  assert.equal(parseSponsorRequest({ chainId: 100, userOp, x: KEY.x, y: KEY.y, recoveryLegacy: LEGACY }).recoveryLegacy, LEGACY);
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp, x: KEY.x, y: KEY.y, legacy: "0x12" }));
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp, x: KEY.x, y: KEY.y, recoveryLegacy: "nope" }));
});

function toRpc(o: SponsorUserOp): Record<string, string> {
  const hex = (n: bigint) => `0x${n.toString(16)}`;
  return {
    sender: o.sender,
    nonce: hex(o.nonce),
    callData: o.callData,
    callGasLimit: hex(o.callGasLimit),
    verificationGasLimit: hex(o.verificationGasLimit),
    preVerificationGas: hex(o.preVerificationGas),
    maxFeePerGas: hex(o.maxFeePerGas),
    maxPriorityFeePerGas: hex(o.maxPriorityFeePerGas),
    paymasterVerificationGasLimit: hex(o.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: hex(o.paymasterPostOpGasLimit),
  };
}

test("toPackedUserOperation packs gas words and initCode = factory ++ factoryData", () => {
  const p = toPackedUserOperation(op("0x12", { factory: ADDRESSES.safeProxyFactory, factoryData: "0xabcd" }));
  assert.equal(p.accountGasLimits, packUint128Pair(500_000n, 300_000n));
  assert.equal(p.gasFees, packUint128Pair(1_000_000_000n, 2_000_000_000n));
  assert.equal(p.initCode.toLowerCase(), `${ADDRESSES.safeProxyFactory.toLowerCase()}abcd`);
  assert.equal(toPackedUserOperation(op("0x12")).initCode, "0x");
});

test("proxy code constant is the EIP-1167 clone of the live Account impl", () => {
  assert.equal(
    LEGACY_ACCOUNT_PROXY_CODE,
    "0x363d3d373d3d3d363d73f22175c80c6e074c171811c59c6c0087e2a6a3465af43d82803e903d91602b57fd5bf3",
  );
});
