/**
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  concatHex,
  encodeFunctionData,
  encodePacked,
  parseAbi,
  size,
  zeroAddress,
  type Hex,
} from "viem";
import {
  ADDRESSES,
  CAPS,
  evaluateSponsorPolicy,
  parseSponsorUserOp,
  toPackedUserOperation,
  type SponsorUserOp,
} from "../sponsor-policy";
import { packUint128Pair } from "../voucher";

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

const LEGACY = "0x1111111111111111111111111111111111111111" as Hex;
const SAFE = "0x2222222222222222222222222222222222222222" as Hex;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Hex;
const GUARDIAN = "0x4444444444444444444444444444444444444444" as Hex;
const SIG65 = `0x${"ab".repeat(65)}` as Hex;

function permReq(isAdmin: number) {
  return encodeFunctionData({
    abi: account,
    functionName: "setPermissionsForSigner",
    args: [
      {
        signer: SAFE,
        isAdmin,
        approvedTargets: [],
        nativeTokenLimitPerTransaction: 0n,
        permissionStartTimestamp: 0n,
        permissionEndTimestamp: 0n,
        reqValidityStartTimestamp: 1n,
        reqValidityEndTimestamp: 2n,
        uid: `0x${"01".repeat(32)}`,
      },
      SIG65,
    ],
  });
}

const execLegacy = (target: Hex, value: bigint, data: Hex) =>
  encodeFunctionData({ abi: account, functionName: "execute", args: [target, value, data] });

const outer = (to: Hex, data: Hex, operation = 0, value = 0n, fn: "executeUserOp" | "executeUserOpWithErrorString" = "executeUserOp") =>
  encodeFunctionData({ abi: safe4337, functionName: fn, args: [to, value, data, operation] });

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
    paymasterVerificationGasLimit: 100_000n,
    paymasterPostOpGasLimit: 0n,
    ...over,
  };
}

function ok(o: SponsorUserOp) {
  const r = evaluateSponsorPolicy(o);
  assert.deepEqual(r, { ok: true });
}
function rejected(o: SponsorUserOp, re?: RegExp) {
  const r = evaluateSponsorPolicy(o);
  assert.equal(r.ok, false, "expected rejection");
  if (!r.ok && re) assert.match(r.reason, re);
}

// ---- allowed shapes ----

test("allows setPermissionsForSigner(isAdmin=1) on the legacy account", () => {
  ok(op(outer(LEGACY, permReq(1))));
});

test("allows executeUserOpWithErrorString too", () => {
  ok(op(outer(LEGACY, permReq(1), 0, 0n, "executeUserOpWithErrorString")));
});

test("allows legacy execute (value inside the legacy call is the legacy account's own)", () => {
  ok(op(outer(LEGACY, execLegacy(RECIPIENT, 1n, "0x"))));
});

test("allows legacy executeBatch", () => {
  ok(
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

test("allows each SRM guardian-management selector on the exact SRM address", () => {
  const calls: Hex[] = [
    encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] }),
    encodeFunctionData({ abi: srm, functionName: "revokeGuardianWithThreshold", args: [zeroAddress, GUARDIAN, 1n] }),
    encodeFunctionData({ abi: srm, functionName: "changeThreshold", args: [2n] }),
    encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [SAFE, [GUARDIAN], 1n, false] }),
    encodeFunctionData({ abi: srm, functionName: "cancelRecovery" }),
  ];
  for (const c of calls) ok(op(outer(ADDRESSES.socialRecoveryModule, c)));
});

test("allows the deploy+handover op: delegatecall MultiSendCallOnly with allowlisted inner calls", () => {
  const factoryData = encodeFunctionData({
    abi: proxyFactoryAbi,
    functionName: "createProxyWithNonce",
    args: [ADDRESSES.safeL2Singleton, "0x1234", 0n],
  });
  ok(
    op(
      viaMultiSend([
        { to: LEGACY, data: permReq(1) },
        {
          to: ADDRESSES.socialRecoveryModule,
          data: encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] }),
        },
      ]),
      { factory: ADDRESSES.safeProxyFactory, factoryData },
    ),
  );
});

// ---- rejections ----

test("rejects removal requests (isAdmin=2), directly, via execute and inside multisend", () => {
  rejected(op(outer(LEGACY, permReq(2))), /isAdmin/);
  rejected(op(outer(LEGACY, execLegacy(LEGACY, 0n, permReq(2)))), /isAdmin/);
  rejected(op(viaMultiSend([{ to: LEGACY, data: permReq(2) }])), /isAdmin/);
});

test("rejects isAdmin=0 (plain session-key grant) in tranche 1", () => {
  rejected(op(outer(LEGACY, permReq(0))), /isAdmin/);
});

test("rejects an arbitrary ERC-20 transfer", () => {
  const t = encodeFunctionData({ abi: erc20, functionName: "transfer", args: [RECIPIENT, 1n] });
  rejected(op(outer(RECIPIENT, t)));
  rejected(op(viaMultiSend([{ to: RECIPIENT, data: t }])));
});

test("rejects delegatecall to anything but MultiSendCallOnly", () => {
  rejected(op(outer(LEGACY, permReq(1), 1)), /delegatecall/);
  rejected(op(outer(ADDRESSES.multiSend141, packMultiSend([{ to: LEGACY, data: permReq(1) }]), 1)), /delegatecall/);
});

test("rejects a plain call to MultiSendCallOnly (operation must be delegatecall)", () => {
  rejected(op(outer(ADDRESSES.multiSendCallOnly, packMultiSend([{ to: LEGACY, data: permReq(1) }]), 0)));
});

test("rejects non-multiSend calldata delegatecalled into MultiSendCallOnly", () => {
  rejected(op(outer(ADDRESSES.multiSendCallOnly, permReq(1), 1)));
});

test("rejects inner delegatecall or inner value in multisend", () => {
  rejected(op(viaMultiSend([{ to: LEGACY, data: permReq(1), operation: 1 }])));
  rejected(op(viaMultiSend([{ to: LEGACY, data: permReq(1), value: 1n }])));
});

test("rejects malformed multisend packing and empty batches", () => {
  // Inner tx claims 100 data bytes but only 2 follow.
  const truncated = encodeFunctionData({
    abi: multiSendAbi,
    functionName: "multiSend",
    args: [concatHex([encodePacked(["uint8", "address", "uint256", "uint256"], [0, LEGACY, 0n, 100n]), "0x1234"])],
  });
  rejected(op(outer(ADDRESSES.multiSendCallOnly, truncated, 1)));
  rejected(op(viaMultiSend([])));
});

test("rejects non-zero outer value", () => {
  rejected(op(outer(LEGACY, permReq(1), 0, 1n)), /value/);
});

test("rejects SRM selectors on a foreign address and non-guardian SRM functions", () => {
  rejected(
    op(outer(RECIPIENT, encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] }))),
  );
  rejected(
    op(outer(ADDRESSES.socialRecoveryModule, encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [SAFE, [GUARDIAN], 1n] }))),
  );
  rejected(
    op(outer(ADDRESSES.socialRecoveryModule, encodeFunctionData({ abi: srm, functionName: "finalizeRecovery", args: [SAFE] }))),
  );
});

test("rejects unknown outer selectors", () => {
  rejected(op(execLegacy(RECIPIENT, 0n, "0x")));
  rejected(op("0x"));
});

test("rejects gas over each cap", () => {
  const c = outer(LEGACY, permReq(1));
  rejected(op(c, { callGasLimit: CAPS.callGasLimit + 1n }), /callGasLimit/);
  rejected(op(c, { verificationGasLimit: CAPS.verificationGasLimit + 1n }), /verificationGasLimit/);
  rejected(op(c, { preVerificationGas: CAPS.preVerificationGas + 1n }), /preVerificationGas/);
  rejected(op(c, { maxFeePerGas: CAPS.maxFeePerGas + 1n }), /maxFeePerGas/);
  rejected(op(c, { paymasterVerificationGasLimit: CAPS.paymasterVerificationGasLimit + 1n }), /paymasterVerificationGasLimit/);
  rejected(op(c, { paymasterPostOpGasLimit: CAPS.paymasterPostOpGasLimit + 1n }), /paymasterPostOpGasLimit/);
  rejected(op(c, { maxPriorityFeePerGas: 3_000_000_000n }), /maxPriorityFeePerGas/);
});

test("caps are the plan's values", () => {
  assert.equal(CAPS.callGasLimit, 1_500_000n);
  assert.equal(CAPS.verificationGasLimit, 1_000_000n);
  assert.equal(CAPS.preVerificationGas, 200_000n);
  assert.equal(CAPS.maxFeePerGas, 50_000_000_000n);
});

test("rejects a foreign factory, a foreign singleton, and factoryData without factory", () => {
  const c = outer(LEGACY, permReq(1));
  const fd = (singleton: Hex) =>
    encodeFunctionData({ abi: proxyFactoryAbi, functionName: "createProxyWithNonce", args: [singleton, "0x", 0n] });
  rejected(op(c, { factory: RECIPIENT, factoryData: fd(ADDRESSES.safeL2Singleton) }), /factory/);
  rejected(op(c, { factory: ADDRESSES.safeProxyFactory, factoryData: fd(RECIPIENT) }), /singleton/);
  rejected(op(c, { factory: ADDRESSES.safeProxyFactory, factoryData: "0xdeadbeef" }), /factory/);
  rejected(op(c, { factoryData: fd(ADDRESSES.safeL2Singleton) }), /factory/);
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
  assert.throws(() =>
    parseSponsorUserOp({ ...parsed, nonce: "12", callGasLimit: "0x2" } as unknown as Record<string, unknown>),
  );
});

test("toPackedUserOperation packs gas words and initCode = factory ++ factoryData", () => {
  const p = toPackedUserOperation(op("0x12", { factory: ADDRESSES.safeProxyFactory, factoryData: "0xabcd" }));
  assert.equal(p.accountGasLimits, packUint128Pair(500_000n, 300_000n));
  assert.equal(p.gasFees, packUint128Pair(1_000_000_000n, 2_000_000_000n));
  assert.equal(p.initCode.toLowerCase(), `${ADDRESSES.safeProxyFactory.toLowerCase()}abcd`);
  assert.equal(toPackedUserOperation(op("0x12")).initCode, "0x");
});
