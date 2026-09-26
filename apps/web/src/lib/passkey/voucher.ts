/**
 * Sponsorship voucher v2 for NetizenVerifyingPaymaster
 * (0x11ed03Db610c88b010FfE38B13142D3657f2E84f on Gnosis).
 *
 * Port of netizen_labs/packages/signer/src/vouchers.ts, trimmed to what the
 * passkey sponsor route needs. Encodings are unchanged and pinned
 * byte-for-byte by __tests__/voucher.test.ts against the Solidity golden
 * vector (__tests__/voucher-vector.json).
 *
 * Why `hashStableFields` instead of EntryPoint's userOpHash: the real
 * userOpHash covers the full paymasterAndData, which would contain this very
 * signature. The stable hash covers every field except the account signature
 * and the paymasterData tail - INCLUDING both paymaster gas limits, so the
 * client must submit exactly the limits echoed by the route.
 *
 * paymasterAndData layout (EntryPoint v0.7 + paymaster `_decodeVoucher`):
 *   paymaster (20) ++ uint128 paymasterVerificationGasLimit (16)
 *   ++ uint128 paymasterPostOpGasLimit (16) ++ paymasterData (exactly 320)
 *   = 372 bytes.
 */
import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  numberToHex,
  slice,
  stringToBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const SPONSORSHIP_DOMAIN_NAME = "NetizenSponsorship";
export const SPONSORSHIP_DOMAIN_VERSION = "2";
export const SPONSORSHIP_PRIMARY_TYPE = "SponsorshipVoucher" as const;

/** Do not reorder/rename/retype: pinned to SPONSORSHIP_VOUCHER_TYPEHASH on-chain. */
export const SPONSORSHIP_VOUCHER_TYPES = {
  SponsorshipVoucher: [
    { name: "userOpHash", type: "bytes32" },
    { name: "subjectHash", type: "bytes32" },
    { name: "maxCostWei", type: "uint256" },
    { name: "validAfter", type: "uint48" },
    { name: "validUntil", type: "uint48" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** Voucher lifetime issued by the route. */
export const VOUCHER_TTL_SECONDS = 600;

/** The packed EntryPoint v0.7 userOp fields covered by `hashStableFields`. */
export interface UserOperationV07 {
  sender: Hex;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  /** verificationGasLimit (hi128) ++ callGasLimit (lo128) */
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  /** maxPriorityFeePerGas (hi128) ++ maxFeePerGas (lo128) */
  gasFees: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}

export interface SponsorshipVoucher {
  /** hashStableFields(op), NOT EntryPoint's userOpHash. */
  userOpHash: Hex;
  subjectHash: Hex;
  maxCostWei: bigint;
  validAfter: number;
  /** Must be nonzero: 0 means "never expires" to EntryPoint; the paymaster reverts on it. */
  validUntil: number;
  nonce: Hex;
}

export interface VoucherContext {
  chainId: number;
  paymaster: Hex;
}

const STABLE_FIELDS_ABI = [
  { type: "address" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "uint256" },
  { type: "uint256" },
] as const;

/** Byte-identical to NetizenVerifyingPaymaster.hashStableFields. */
export function hashStableFields(op: UserOperationV07): Hex {
  return keccak256(
    encodeAbiParameters(STABLE_FIELDS_ABI, [
      op.sender,
      op.nonce,
      keccak256(op.initCode),
      keccak256(op.callData),
      op.accountGasLimits,
      op.preVerificationGas,
      op.gasFees,
      op.paymasterVerificationGasLimit,
      op.paymasterPostOpGasLimit,
    ]),
  );
}

/** bytes32(uint128 hi << 128 | uint128 lo) - accountGasLimits / gasFees packing. */
export function packUint128Pair(hi: bigint, lo: bigint): Hex {
  return concatHex([numberToHex(hi, { size: 16 }), numberToHex(lo, { size: 16 })]);
}

function unpackHigh128(packed: Hex): bigint {
  return BigInt(slice(packed, 0, 16));
}

function unpackLow128(packed: Hex): bigint {
  return BigInt(slice(packed, 16, 32));
}

/** EntryPoint v0.7 max-cost formula - the paymaster rejects if maxCost > maxCostWei. */
export function requiredPrefund(op: UserOperationV07): bigint {
  const totalGas =
    unpackHigh128(op.accountGasLimits) +
    unpackLow128(op.accountGasLimits) +
    op.paymasterVerificationGasLimit +
    op.paymasterPostOpGasLimit +
    op.preVerificationGas;
  return totalGas * unpackLow128(op.gasFees);
}

function assertValidUntilNonzero(validUntil: number): void {
  if (validUntil === 0) {
    throw new Error("SponsorshipVoucher.validUntil must be nonzero (0 = never expires to EntryPoint).");
  }
}

export function voucherTypedData(v: SponsorshipVoucher, ctx: VoucherContext) {
  return {
    domain: {
      name: SPONSORSHIP_DOMAIN_NAME,
      version: SPONSORSHIP_DOMAIN_VERSION,
      chainId: ctx.chainId,
      verifyingContract: ctx.paymaster,
    },
    types: SPONSORSHIP_VOUCHER_TYPES,
    primaryType: SPONSORSHIP_PRIMARY_TYPE,
    message: {
      userOpHash: v.userOpHash,
      subjectHash: v.subjectHash,
      maxCostWei: v.maxCostWei,
      validAfter: v.validAfter,
      validUntil: v.validUntil,
      nonce: v.nonce,
    },
  } as const;
}

export async function signVoucher(privateKey: Hex, v: SponsorshipVoucher, ctx: VoucherContext): Promise<Hex> {
  assertValidUntilNonzero(v.validUntil);
  return privateKeyToAccount(privateKey).signTypedData(voucherTypedData(v, ctx));
}

export function encodePaymasterAndData(args: {
  paymaster: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  voucher: SponsorshipVoucher;
  signature: Hex;
}): Hex {
  assertValidUntilNonzero(args.voucher.validUntil);
  const paymasterData = encodeAbiParameters(
    [
      { type: "uint48" },
      { type: "uint48" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "bytes" },
    ],
    [
      args.voucher.validAfter,
      args.voucher.validUntil,
      args.voucher.nonce,
      args.voucher.subjectHash,
      args.voucher.maxCostWei,
      args.signature,
    ],
  );
  return concatHex([
    args.paymaster,
    numberToHex(args.paymasterVerificationGasLimit, { size: 16 }),
    numberToHex(args.paymasterPostOpGasLimit, { size: 16 }),
    paymasterData,
  ]).toLowerCase() as Hex;
}

export function hashSubject(subject: string): Hex {
  return keccak256(stringToBytes(subject));
}

function randomBytes32(): Hex {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}` as Hex;
}

/**
 * Builds and signs a voucher for `op`: maxCostWei = requiredPrefund(op),
 * valid for VOUCHER_TTL_SECONDS, random nonce, non-PII subject tag.
 * The op's paymaster gas limits are echoed verbatim into paymasterAndData.
 */
export async function issueSponsorship(args: {
  op: UserOperationV07;
  privateKey: Hex;
  ctx: VoucherContext;
  nowSeconds?: number;
}): Promise<{ voucher: SponsorshipVoucher; signature: Hex; paymasterAndData: Hex; validUntil: number }> {
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const voucher: SponsorshipVoucher = {
    userOpHash: hashStableFields(args.op),
    subjectHash: hashSubject("roebel:passkey-sponsor:v1"),
    maxCostWei: requiredPrefund(args.op),
    validAfter: 0,
    validUntil: now + VOUCHER_TTL_SECONDS,
    nonce: randomBytes32(),
  };
  const signature = await signVoucher(args.privateKey, voucher, args.ctx);
  const paymasterAndData = encodePaymasterAndData({
    paymaster: args.ctx.paymaster,
    paymasterVerificationGasLimit: args.op.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: args.op.paymasterPostOpGasLimit,
    voucher,
    signature,
  });
  return { voucher, signature, paymasterAndData, validUntil: voucher.validUntil };
}
