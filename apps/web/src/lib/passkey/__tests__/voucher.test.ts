/**
 * Pins the ported voucher encoder against the golden vector produced by the
 * Solidity NetizenVerifyingPaymaster test suite (copied verbatim from
 * netizen_labs/contracts/test/fixtures/voucher-vector.json). If any assertion
 * here fails, vouchers signed by this route will not verify on-chain.
 *
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/voucher.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashTypedData, recoverTypedDataAddress, type Hex } from "viem";
import {
  encodePaymasterAndData,
  hashStableFields,
  issueSponsorship,
  packUint128Pair,
  requiredPrefund,
  signVoucher,
  voucherTypedData,
  SPONSORSHIP_VOUCHER_TYPES,
  type SponsorshipVoucher,
  type UserOperationV07,
} from "../voucher";

const vector = JSON.parse(readFileSync(join(__dirname, "voucher-vector.json"), "utf8"));

const ctx = {
  chainId: Number(vector.domain.chainId),
  paymaster: vector.domain.verifyingContract as Hex,
};

function vectorOp(): UserOperationV07 {
  const op = vector.userOp;
  return {
    sender: op.sender,
    nonce: BigInt(op.nonce),
    initCode: op.initCode,
    callData: op.callData,
    accountGasLimits: op.accountGasLimits,
    preVerificationGas: BigInt(op.preVerificationGas),
    gasFees: op.gasFees,
    paymasterVerificationGasLimit: BigInt(op.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: BigInt(op.paymasterPostOpGasLimit),
  };
}

function vectorVoucher(): SponsorshipVoucher {
  return {
    userOpHash: vector.hashStableFields,
    subjectHash: vector.voucher.subjectHash,
    maxCostWei: BigInt(vector.voucher.maxCostWei),
    validAfter: Number(vector.voucher.validAfter),
    validUntil: Number(vector.voucher.validUntil),
    nonce: vector.voucher.voucherNonce,
  };
}

test("types match the vector's EIP-712 struct exactly", () => {
  assert.deepEqual(SPONSORSHIP_VOUCHER_TYPES, vector.types);
});

test("hashStableFields reproduces the Solidity output", () => {
  assert.equal(hashStableFields(vectorOp()), vector.hashStableFields);
});

test("EIP-712 digest matches", () => {
  assert.equal(hashTypedData(voucherTypedData(vectorVoucher(), ctx)), vector.eip712Digest);
});

test("signature over the vector matches byte-for-byte (Anvil key #0, test-only)", async () => {
  const sig = await signVoucher(vector.signerPrivateKey, vectorVoucher(), ctx);
  assert.equal(sig, vector.signature);
});

test("paymasterAndData (372 bytes) matches byte-for-byte", () => {
  const pad = encodePaymasterAndData({
    paymaster: ctx.paymaster,
    paymasterVerificationGasLimit: BigInt(vector.userOp.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: BigInt(vector.userOp.paymasterPostOpGasLimit),
    voucher: vectorVoucher(),
    signature: vector.signature,
  });
  assert.equal(pad, vector.paymasterAndData);
  assert.equal((pad.length - 2) / 2, 372);
  assert.equal(`0x${pad.slice(2 + 52 * 2)}`, vector.paymasterData);
});

test("validUntil == 0 is refused before signing or encoding", async () => {
  const v = { ...vectorVoucher(), validUntil: 0 };
  await assert.rejects(signVoucher(vector.signerPrivateKey, v, ctx));
  assert.throws(() =>
    encodePaymasterAndData({
      paymaster: ctx.paymaster,
      paymasterVerificationGasLimit: 1n,
      paymasterPostOpGasLimit: 1n,
      voucher: v,
      signature: vector.signature,
    }),
  );
});

test("packUint128Pair reproduces the vector's packed gas words", () => {
  assert.equal(packUint128Pair(100000n, 200000n), vector.userOp.accountGasLimits);
  assert.equal(packUint128Pair(1000000000n, 2000000000n), vector.userOp.gasFees);
});

test("requiredPrefund = total gas * maxFeePerGas", () => {
  const total = 100000n + 200000n + 80000n + 40000n + 21000n;
  assert.equal(requiredPrefund(vectorOp()), total * 2000000000n);
});

test("issueSponsorship signs a voucher the sponsor address recovers, valid for 10 min", async () => {
  const now = 1_800_000_000;
  const op = vectorOp();
  const out = await issueSponsorship({ op, privateKey: vector.signerPrivateKey, ctx, nowSeconds: now });
  assert.equal(out.validUntil, now + 600);
  assert.equal(out.voucher.userOpHash, vector.hashStableFields);
  assert.equal(out.voucher.maxCostWei, requiredPrefund(op));
  assert.equal(out.paymasterAndData.length, 2 + 372 * 2);
  const recovered = await recoverTypedDataAddress({
    ...voucherTypedData(out.voucher, ctx),
    signature: out.signature,
  });
  assert.equal(recovered, vector.signerAddress);
  // Header echoes the paymaster gas limits verbatim (80000 = 0x13880, 40000 = 0x9c40).
  assert.equal(
    out.paymasterAndData.slice(0, 2 + 52 * 2),
    `${ctx.paymaster.toLowerCase()}${"0".repeat(27)}13880${"0".repeat(28)}9c40`,
  );
});
