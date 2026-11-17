/**
 * Sponsored ERC-4337 v0.7 userOps from a Safe (Safe4337Module v0.3.0): the passkey Safe or the
 * expert path's ECDSA-owner Safe. Who signs is a `SafeOpSigner` (`passkeyOpSigner`,
 * `ecdsaOpSigner`); `sendSafeUserOp` is signer-neutral, `sendPasskeyUserOp` its passkey wrapper.
 *
 * Sequence (plan Review Focus 5 — any re-estimate after sponsoring invalidates the voucher):
 *   build unsigned op → eth_estimateUserOperationGas with a 372-byte stub paymasterAndData and a
 *   realistic dummy signature (the signer's) → POST /api/passkey/sponsor → rebuild with the echoed
 *   paymaster gas limits VERBATIM → Safe4337Module op hash → the signer's signature →
 *   eth_sendUserOperation → poll eth_getUserOperationReceipt.
 *
 * All byte layouts are pinned by contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json.
 */
import {
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  hashTypedData,
  hexToBigInt,
  numberToHex,
  sha256,
  size,
  sliceHex,
  stringToBytes,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import {
  ENTRY_POINT_V07,
  MULTI_SEND_CALL_ONLY,
  NETIZEN_VERIFYING_PAYMASTER,
  PASSKEY_API_URL,
  PASSKEY_PAYMASTER,
  PASSKEY_BUNDLER_URL,
  PASSKEY_CHAIN_ID,
  PASSKEY_RP_ID,
  PAYMASTER_AND_DATA_LENGTH,
  PAYMASTER_DATA_LENGTH,
  P256_N,
  SAFE_4337_MODULE,
  SAFE_PROXY_FACTORY,
  SAFE_WEBAUTHN_SHARED_SIGNER,
} from './constants';
import { base64UrlEncode } from './encoding';
import { encodeExecuteUserOp } from './legacy-handover';
import { ecdsaSafeFactoryData, predictEcdsaSafeAddress } from './ecdsa-safe';
import { encodeMultiSendTx, predictSafeAddress, safeFactoryData } from './safe-address';
import { signWithPasskey, type PasskeyAssertion } from './webauthn';

/** One call from the Safe. `value` (native xDAI from the Safe) defaults to 0. */
export type SponsoredCall = { to: Address; data: Hex; value?: bigint };

/** Unpacked EntryPoint v0.7 userOp (the RPC shape), numeric fields as bigint. */
export type UnpackedUserOp = {
  sender: Address;
  nonce: bigint;
  factory?: Address;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: Address;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterData?: Hex;
  signature: Hex;
};

export type PackedUserOp = {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
};

export type SponsorResponse = {
  paymasterAndData: Hex;
  paymasterVerificationGasLimit: Hex | string | number;
  paymasterPostOpGasLimit: Hex | string | number;
  validUntil: number;
};

// ---------------------------------------------------------------------------
// Packing + hashing
// ---------------------------------------------------------------------------

const u128 = (v: bigint): Hex => numberToHex(v, { size: 16 });

export function packUserOp(op: UnpackedUserOp): PackedUserOp {
  const initCode = op.factory ? concatHex([op.factory, op.factoryData ?? '0x']) : '0x';
  const paymasterAndData = op.paymaster
    ? concatHex([
        op.paymaster,
        u128(op.paymasterVerificationGasLimit ?? 0n),
        u128(op.paymasterPostOpGasLimit ?? 0n),
        op.paymasterData ?? '0x',
      ])
    : '0x';
  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode: initCode.toLowerCase() as Hex,
    callData: op.callData,
    accountGasLimits: concatHex([u128(op.verificationGasLimit), u128(op.callGasLimit)]),
    preVerificationGas: op.preVerificationGas,
    gasFees: concatHex([u128(op.maxPriorityFeePerGas), u128(op.maxFeePerGas)]),
    paymasterAndData: paymasterAndData.toLowerCase() as Hex,
    signature: op.signature,
  };
}

const safeOpTypes = {
  SafeOp: [
    { name: 'safe', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'verificationGasLimit', type: 'uint128' },
    { name: 'callGasLimit', type: 'uint128' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'maxPriorityFeePerGas', type: 'uint128' },
    { name: 'maxFeePerGas', type: 'uint128' },
    { name: 'paymasterAndData', type: 'bytes' },
    { name: 'validAfter', type: 'uint48' },
    { name: 'validUntil', type: 'uint48' },
    { name: 'entryPoint', type: 'address' },
  ],
} as const;

/** Safe4337Module v0.3.0 `getOperationHash` (EIP-712 domain {chainId, verifyingContract: module}). */
export function safeOpHash(op: UnpackedUserOp, validAfter: number, validUntil: number): Hex {
  const p = packUserOp(op);
  return hashTypedData({
    domain: { chainId: PASSKEY_CHAIN_ID, verifyingContract: SAFE_4337_MODULE },
    types: safeOpTypes,
    primaryType: 'SafeOp',
    message: {
      safe: op.sender,
      nonce: op.nonce,
      initCode: p.initCode,
      callData: op.callData,
      verificationGasLimit: op.verificationGasLimit,
      callGasLimit: op.callGasLimit,
      preVerificationGas: op.preVerificationGas,
      maxPriorityFeePerGas: op.maxPriorityFeePerGas,
      maxFeePerGas: op.maxFeePerGas,
      paymasterAndData: p.paymasterAndData,
      validAfter,
      validUntil,
      entryPoint: ENTRY_POINT_V07,
    },
  });
}

// ---------------------------------------------------------------------------
// Paymaster
// ---------------------------------------------------------------------------

export function stubPaymasterAndData(
  pmVerificationGasLimit: bigint,
  pmPostOpGasLimit: bigint,
  paymaster: Address = NETIZEN_VERIFYING_PAYMASTER,
): Hex {
  return concatHex([
    paymaster,
    u128(pmVerificationGasLimit),
    u128(pmPostOpGasLimit),
    `0x${'00'.repeat(PAYMASTER_DATA_LENGTH)}`,
  ]).toLowerCase() as Hex;
}

export function splitPaymasterAndData(pmd: Hex): {
  paymaster: Address;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  paymasterData: Hex;
} {
  if (size(pmd) < 52) throw new Error('paymasterAndData too short');
  return {
    paymaster: getAddress(sliceHex(pmd, 0, 20)),
    paymasterVerificationGasLimit: hexToBigInt(sliceHex(pmd, 20, 36)),
    paymasterPostOpGasLimit: hexToBigInt(sliceHex(pmd, 36, 52)),
    paymasterData: size(pmd) > 52 ? sliceHex(pmd, 52) : '0x',
  };
}

/**
 * Applies the sponsor's voucher. The paymaster gas limits are covered by the voucher signature,
 * so they are taken VERBATIM from the reply — and must agree with the bytes inside paymasterAndData.
 */
export function applySponsorship(op: UnpackedUserOp, reply: SponsorResponse): UnpackedUserOp {
  const pmd = reply.paymasterAndData;
  if (typeof pmd !== 'string' || !pmd.startsWith('0x') || size(pmd) !== PAYMASTER_AND_DATA_LENGTH) {
    throw new Error(`sponsor returned paymasterAndData of unexpected length (want ${PAYMASTER_AND_DATA_LENGTH} bytes)`);
  }
  const parts = splitPaymasterAndData(pmd);
  // The sponsor must sign for the paymaster the op was estimated with.
  const expected = op.paymaster ?? NETIZEN_VERIFYING_PAYMASTER;
  if (parts.paymaster.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('sponsor returned an unexpected paymaster');
  }
  const pmVerif = BigInt(reply.paymasterVerificationGasLimit);
  const pmPost = BigInt(reply.paymasterPostOpGasLimit);
  if (pmVerif !== parts.paymasterVerificationGasLimit || pmPost !== parts.paymasterPostOpGasLimit) {
    throw new Error('sponsor gas limits disagree with paymasterAndData');
  }
  return {
    ...op,
    paymaster: parts.paymaster,
    paymasterVerificationGasLimit: pmVerif,
    paymasterPostOpGasLimit: pmPost,
    paymasterData: parts.paymasterData,
  };
}

// ---------------------------------------------------------------------------
// WebAuthn → Safe signature
// ---------------------------------------------------------------------------

const CLIENT_DATA_PREFIX = '{"type":"webauthn.get","challenge":"';

/**
 * clientDataFields = everything after `"challenge":"<b64url43>",` up to (excluding) the final `}`.
 * Verifies the embedded challenge is exactly base64url(challenge) — the Safe signer re-derives it.
 */
export function extractClientDataFields(clientDataJSON: string, challenge: Hex): string {
  const expected = `${CLIENT_DATA_PREFIX}${base64UrlEncode(stringToBytesHex(challenge))}",`;
  if (!clientDataJSON.startsWith(expected)) {
    throw new Error('clientDataJSON does not carry the expected challenge / layout');
  }
  if (!clientDataJSON.endsWith('}')) throw new Error('clientDataJSON is not a closed object');
  return clientDataJSON.slice(expected.length, -1);
}

function stringToBytesHex(h: Hex): Uint8Array {
  const clean = h.slice(2);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** message = authenticatorData ++ sha256(clientDataJSON); digest = sha256(message). */
export function webAuthnSigningDigest(authenticatorData: Hex, clientDataJSON: string): { message: Hex; digest: Hex } {
  const message = concatHex([authenticatorData, sha256(stringToBytes(clientDataJSON))]);
  return { message, digest: sha256(message) };
}

/** abi.encode(bytes authenticatorData, string clientDataFields, uint256 r, uint256 s). */
export function encodeWebAuthnSignature(authenticatorData: Hex, clientDataFields: string, r: bigint, s: bigint): Hex {
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }],
    [authenticatorData, clientDataFields, r, s],
  );
}

/** Safe contract signature for ONE owner: r = owner, s = 65, v = 0, then len ++ data. */
export function encodeSafeSignature(webAuthnSignature: Hex, owner: Address = SAFE_WEBAUTHN_SHARED_SIGNER): Hex {
  return encodePacked(
    ['uint256', 'uint256', 'uint8', 'uint256', 'bytes'],
    [BigInt(owner), 65n, 0, BigInt(size(webAuthnSignature)), webAuthnSignature],
  );
}

/** Safe4337Module userOp signature = uint48 validAfter ++ uint48 validUntil ++ safeSignatures. */
export function encodeUserOpSignature(validAfter: number, validUntil: number, safeSignature: Hex): Hex {
  return encodePacked(['uint48', 'uint48', 'bytes'], [validAfter, validUntil, safeSignature]);
}

/**
 * One-owner Safe contract signature from a passkey assertion over `challenge`. `owner` is the
 * Safe's owner the passkey signs through: SafeWebAuthnSharedSigner for a Safe created with this
 * passkey, or the per-key SafeWebAuthnSignerFactory signer after a guardian recovery.
 * Used for userOps (challenge = Safe op hash) and ERC-1271 (challenge = SafeMessage hash).
 */
export function safeSignatureFromAssertion(
  assertion: PasskeyAssertion,
  challenge: Hex,
  owner: Address = SAFE_WEBAUTHN_SHARED_SIGNER,
): Hex {
  const flags = parseInt(assertion.authenticatorData.slice(2 + 64, 2 + 66), 16);
  if (!(flags & 0x04)) throw new Error('passkey assertion lacks user verification (UV)');
  const fields = extractClientDataFields(assertion.clientDataJSON, challenge);
  const s = assertion.s > P256_N / 2n ? P256_N - assertion.s : assertion.s;
  return encodeSafeSignature(encodeWebAuthnSignature(assertion.authenticatorData, fields, assertion.r, s), owner);
}

/** Full userOp signature from a passkey assertion over `challenge` (= Safe op hash). */
export function userOpSignatureFromAssertion(
  assertion: PasskeyAssertion,
  challenge: Hex,
  owner: Address = SAFE_WEBAUTHN_SHARED_SIGNER,
): Hex {
  return encodeUserOpSignature(0, 0, safeSignatureFromAssertion(assertion, challenge, owner));
}

/**
 * Dummy signature for gas estimation: same layout, realistic (slightly pessimistic) sizes and
 * non-zero bytes so preVerificationGas is not under-estimated.
 */
export function dummyUserOpSignature(owner: Address = SAFE_WEBAUTHN_SHARED_SIGNER): Hex {
  const authData = concatHex([sha256(stringToHex(PASSKEY_RP_ID)), '0x05', '0x00000000']);
  const fields = `"origin":"android:apk-key-hash:${'A'.repeat(43)}","androidPackageName":"app.roebel.dummy.estimate"`;
  const rs = P256_N / 2n - 1n;
  return encodeUserOpSignature(0, 0, encodeSafeSignature(encodeWebAuthnSignature(authData, fields, rs, rs), owner));
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

export type UserOpDeps = {
  fetch?: FetchLike;
  /** Paymaster the sponsor route signs for (default EXPO_PUBLIC_PASSKEY_PAYMASTER_ADDRESS). */
  paymaster?: Address | '';
  /** Passkey assertion for `sendPasskeyUserOp` (default the native passkey); unused by other signers. */
  sign?: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>;
  apiUrl?: string;
  bundlerUrl?: string;
  rpcUrl?: string;
  requestTimeoutMs?: number;
  receiptTimeoutMs?: number;
  pollIntervalMs?: number;
};

export const DEFAULT_GNOSIS_RPC_URL = process.env.EXPO_PUBLIC_GNOSIS_RPC_URL || 'https://gnosis-rpc.publicnode.com';

/** RN fetch never times out on its own — every request gets an AbortController deadline. */
async function postJson(fetchImpl: FetchLike, url: string, body: unknown, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json && (json.error?.message ?? json.error ?? json.message);
      throw new Error(`HTTP ${res.status}${msg ? `: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}` : ''}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

let rpcId = 1;
async function rpc<T>(fetchImpl: FetchLike, url: string, method: string, params: unknown[], timeoutMs: number): Promise<T> {
  const json = await postJson(fetchImpl, url, { jsonrpc: '2.0', id: rpcId++, method, params }, timeoutMs);
  if (json?.error) throw new Error(`${method}: ${json.error.message ?? JSON.stringify(json.error)}`);
  return json?.result as T;
}

const getNonceAbi = [
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    outputs: [{ name: 'nonce', type: 'uint256' }],
  },
] as const;

/** RPC form: hex quantities, optional fields omitted. */
export function toRpcUserOp(op: UnpackedUserOp): Record<string, Hex> {
  const out: Record<string, Hex> = {
    sender: op.sender,
    nonce: numberToHex(op.nonce),
    callData: op.callData,
    callGasLimit: numberToHex(op.callGasLimit),
    verificationGasLimit: numberToHex(op.verificationGasLimit),
    preVerificationGas: numberToHex(op.preVerificationGas),
    maxFeePerGas: numberToHex(op.maxFeePerGas),
    maxPriorityFeePerGas: numberToHex(op.maxPriorityFeePerGas),
    signature: op.signature,
  };
  if (op.factory) {
    out.factory = op.factory;
    out.factoryData = op.factoryData ?? '0x';
  }
  if (op.paymaster) {
    out.paymaster = op.paymaster;
    out.paymasterVerificationGasLimit = numberToHex(op.paymasterVerificationGasLimit ?? 0n);
    out.paymasterPostOpGasLimit = numberToHex(op.paymasterPostOpGasLimit ?? 0n);
    out.paymasterData = op.paymasterData ?? '0x';
  }
  return out;
}

/** Sponsor body: the unsigned op without paymaster fields except the estimated paymaster gas. */
function toSponsorUserOp(op: UnpackedUserOp): Record<string, Hex> {
  const r = toRpcUserOp(op);
  delete r.paymaster;
  delete r.paymasterData;
  delete r.signature;
  return r;
}

/**
 * POST /api/passkey/sponsor body: { chainId, userOp, (x, y) | ecdsaOwner, legacy?, recoveryLegacy?,
 * pollId? }. The proof names the Safe's owner: the passkey key (x, y) or the expert path's ECDSA
 * owner, never both. Optional identity hints are omitted (not null) when unset.
 */
export function sponsorRequestBody(
  op: UnpackedUserOp,
  args: Pick<SafeUserOpArgs, 'legacy' | 'recoveryLegacy' | 'pollId'> & { proof: SafeOpProof },
): Record<string, unknown> {
  return {
    chainId: PASSKEY_CHAIN_ID,
    userOp: toSponsorUserOp(op),
    ...('ecdsaOwner' in args.proof ? { ecdsaOwner: getAddress(args.proof.ecdsaOwner) } : { x: args.proof.x, y: args.proof.y }),
    ...(args.legacy ? { legacy: args.legacy } : {}),
    ...(args.recoveryLegacy ? { recoveryLegacy: args.recoveryLegacy } : {}),
    // 0x hex quantity, as the server's parseSponsorRequest expects.
    ...(args.pollId !== undefined ? { pollId: `0x${args.pollId.toString(16)}` } : {}),
  };
}

/** Safe4337Module callData: one call = CALL; several = DELEGATECALL MultiSendCallOnly 1.4.1. */
export function buildCallData(calls: SponsoredCall[]): Hex {
  if (calls.length === 0) throw new Error('no calls');
  if (calls.length === 1) return encodeExecuteUserOp(calls[0].to, calls[0].value ?? 0n, calls[0].data);
  const txs = concatHex(calls.map((c) => encodeMultiSendTx(0, c.to, c.value ?? 0n, c.data)));
  const multiSend = encodeFunctionData({
    abi: [{ type: 'function', name: 'multiSend', stateMutability: 'payable', inputs: [{ name: 'transactions', type: 'bytes' }], outputs: [] }] as const,
    functionName: 'multiSend',
    args: [txs],
  });
  return encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'executeUserOp',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
        ],
        outputs: [],
      },
    ] as const,
    functionName: 'executeUserOp',
    args: [MULTI_SEND_CALL_ONLY, 0n, multiSend, 1],
  });
}

/** eth_getCode != 0x. */
export async function isSafeDeployed(safe: Address, deps: UserOpDeps = {}): Promise<boolean> {
  const f = deps.fetch ?? (fetch as unknown as FetchLike);
  const code = await rpc<Hex>(f, deps.rpcUrl ?? DEFAULT_GNOSIS_RPC_URL, 'eth_getCode', [safe, 'latest'], deps.requestTimeoutMs ?? 15_000);
  return !!code && code !== '0x';
}

/**
 * Paymaster gas. The estimate runs against a zero-filled stub voucher, so the paymaster's
 * signature check short-circuits and the bundler under-reports verification gas. Floors = the
 * limits the fork proofs actually ran with (contracts/passkey-accounts PasskeySafeBase:
 * PM_VERIFICATION_GAS 150_000, PM_POST_OP_GAS 50_000); caps = the sponsor route's CAPS.
 */
export const PM_VERIFICATION_GAS_FLOOR = 150_000n;
export const PM_POST_OP_GAS_FLOOR = 50_000n;
export const PM_VERIFICATION_GAS_CAP = 300_000n;
export const PM_POST_OP_GAS_CAP = 100_000n;

/** Pimlico on Gnosis rejects maxFeePerGas below 1.5 gwei (see apps/web/src/lib/highgas-bundler.ts). */
export const GAS_PRICE_FLOOR = 1_500_000_000n;
/** The sponsor route refuses maxFeePerGas above 3 gwei. */
export const MAX_FEE_CAP = 3_000_000_000n;

const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
const minBig = (a: bigint, b: bigint) => (a < b ? a : b);

type GasTier = { maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex };

/**
 * userOp fees, decided BEFORE estimation and sponsoring (the voucher covers them).
 * Bundler `pimlico_getUserOperationGasPrice` (.fast, else .standard), floored at 1.5 gwei; if the
 * bundler lacks the method, max(1.5 gwei, 2*baseFee + priority) clamped to the 3 gwei cap. A
 * bundler that DEMANDS more than the cap is an error: the sponsor would refuse the op anyway.
 */
export async function resolveUserOpFees(
  fetchImpl: FetchLike,
  bundlerUrl: string,
  rpcUrl: string,
  timeoutMs: number,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  let tier: GasTier | undefined;
  try {
    const res = await rpc<{ fast?: GasTier; standard?: GasTier }>(fetchImpl, bundlerUrl, 'pimlico_getUserOperationGasPrice', [], timeoutMs);
    tier = res?.fast?.maxFeePerGas ? res.fast : res?.standard;
  } catch {
    tier = undefined; // not a Pimlico-compatible bundler: fall back to the chain
  }
  if (tier?.maxFeePerGas && tier.maxPriorityFeePerGas) {
    const maxFeePerGas = maxBig(BigInt(tier.maxFeePerGas), GAS_PRICE_FLOOR);
    if (maxFeePerGas > MAX_FEE_CAP) {
      throw new Error(`bundler requires maxFeePerGas ${maxFeePerGas} wei, above the 3 gwei sponsor cap; try again later`);
    }
    return { maxFeePerGas, maxPriorityFeePerGas: minBig(BigInt(tier.maxPriorityFeePerGas), maxFeePerGas) };
  }
  const block = await rpc<{ baseFeePerGas?: Hex }>(fetchImpl, rpcUrl, 'eth_getBlockByNumber', ['latest', false], timeoutMs);
  const priority = BigInt(await rpc<Hex>(fetchImpl, rpcUrl, 'eth_maxPriorityFeePerGas', [], timeoutMs));
  const baseFee = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n;
  const maxFeePerGas = minBig(maxBig(GAS_PRICE_FLOOR, baseFee * 2n + priority), MAX_FEE_CAP);
  return { maxFeePerGas, maxPriorityFeePerGas: minBig(priority, maxFeePerGas) };
}

export type PasskeyUserOpArgs = {
  credentialId: string;
  x: Hex;
  y: Hex;
  /**
   * The citizen's legacy thirdweb account the op drives (sponsor mode "legacy"). Omit when the
   * Safe itself holds citizenship (after a v3 moveTo) or for recovery ops.
   */
  legacy?: Address;
  /** Recovery ops: the legacy account the wallet being recovered administers (if the wallet holds no CitizenNFT). */
  recoveryLegacy?: Address;
  /** Everyday votes: the MACI poll id of the Poll the op publishes to (sponsor checks MACI.polls(pollId)). */
  pollId?: bigint;
  calls: SponsoredCall[];
  deployed: boolean;
  /**
   * The Safe sending the op. Default: the counterfactual passkey Safe for (x, y). A RECOVERED Safe
   * keeps its old address, which is no longer derivable from the new key: pass the persisted one.
   */
  sender?: Address;
  /** The Safe owner the passkey signs through (default SharedSigner; per-key signer after recovery). */
  owner?: Address;
};

/** What the sponsor checks the op's sender against: the passkey key, or the expert path's ECDSA owner. */
export type SafeOpProof = { x: Hex; y: Hex } | { ecdsaOwner: Address };

/**
 * Everything about a userOp that depends on who signs it. `signOpHash` returns the COMPLETE userOp
 * signature (validAfter ++ validUntil ++ Safe signature) over the Safe4337Module op hash.
 */
export type SafeOpSigner = {
  proof: SafeOpProof;
  /** The counterfactual Safe this signer deploys with its first op. */
  predicted: Address;
  /** factoryData of that first op (`factory` = SAFE_PROXY_FACTORY). */
  factoryData: Hex;
  /** Same layout and size as a real signature, for gas estimation. */
  dummySignature: Hex;
  signOpHash: (hash: Hex) => Promise<Hex>;
};

/**
 * The passkey Safe's signer. `owner` = the Safe owner the passkey signs through (default
 * SharedSigner; the per-key signer after a recovery).
 */
export function passkeyOpSigner(
  p: { credentialId: string; x: Hex; y: Hex; owner?: Address },
  sign: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>,
): SafeOpSigner {
  const key = { x: p.x, y: p.y };
  const owner = p.owner ?? SAFE_WEBAUTHN_SHARED_SIGNER;
  return {
    proof: key,
    predicted: predictSafeAddress(key),
    factoryData: safeFactoryData(key),
    dummySignature: dummyUserOpSignature(owner),
    signOpHash: async (hash) => userOpSignatureFromAssertion(await sign(p.credentialId, hash), hash, owner),
  };
}

/**
 * The ECDSA signer's gas-estimation stand-in: a fixed, well-formed r ++ s ++ v signature (v = 27,
 * low-s, r a real curve point, no zero bytes). It is a real signature by the public test key 1 over
 * keccak256("roebel ecdsa dummy signature 3"), so over any op hash it recovers to SOME non-zero,
 * non-owner address. That makes the Safe's check take the same path as the real signature
 * (ecrecover, then the cold `owners[recovered]` read) before it fails. A v = 0xff stand-in would take
 * the eth_sign branch, recover address(0) and stop before that read: under-estimated verification gas.
 * The fork test EcdsaSafe.t.sol (`test_dummySignatureCoversRealVerificationGas`) asserts it.
 */
export const ECDSA_DUMMY_SIGNATURE: Hex =
  '0x134a75f59d27787d05a79232d0dc26d6500f736a7d731f4016d6181a5db0918b726b8b1644daeb10c9cf161051f3f6d9ffe8625252f71cbec3904a30cbfbbece1b';

/**
 * The expert path's signer: the Safe has ONE plain ECDSA owner (the words' account key).
 * `signDigest` signs the raw 32-byte digest (no message prefix) and returns r ++ s ++ v (65 bytes,
 * v = 27/28): exactly the Safe's ECDSA owner signature, so it goes after the validity window as is.
 */
export function ecdsaOpSigner(owner: Address, signDigest: (digest: Hex) => Promise<Hex>): SafeOpSigner {
  const ecdsaOwner = getAddress(owner);
  return {
    proof: { ecdsaOwner },
    predicted: predictEcdsaSafeAddress(ecdsaOwner),
    factoryData: ecdsaSafeFactoryData(ecdsaOwner),
    dummySignature: encodeUserOpSignature(0, 0, ECDSA_DUMMY_SIGNATURE),
    signOpHash: async (hash) => encodeUserOpSignature(0, 0, normalizeEcdsaSignature(await signDigest(hash))),
  };
}

/**
 * A 65-byte r ++ s ++ v ECDSA signature as the Safe's ECDSA owner check needs it: v = 27/28. A
 * signer returning v = 0/1 (y-parity) is normalised (+27); any other v, or another length, is refused
 * (Safe would read v > 30 as eth_sign and v = 0/1 as contract / approved-hash signatures).
 */
export function normalizeEcdsaSignature(sig: Hex): Hex {
  if (size(sig) !== 65) throw new Error('an ECDSA owner signature must be 65 bytes');
  let v = parseInt(sig.slice(-2), 16);
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) throw new Error('an ECDSA owner signature needs v = 27 or 28');
  return `${sig.slice(0, -2)}${v.toString(16)}`.toLowerCase() as Hex;
}

export type SafeUserOpArgs = {
  signer: SafeOpSigner;
  calls: SponsoredCall[];
  deployed: boolean;
  /** The Safe sending the op (default `signer.predicted`; a recovered Safe keeps its old address). */
  sender?: Address;
  /** See PasskeyUserOpArgs. */
  legacy?: Address;
  recoveryLegacy?: Address;
  pollId?: bigint;
};

/** `sendSafeUserOp` with a passkey signer (`deps.sign`, default the native passkey). */
export async function sendPasskeyUserOp(
  args: PasskeyUserOpArgs,
  deps: UserOpDeps = {},
): Promise<{ userOpHash: Hex; txHash: Hex }> {
  const { credentialId, x, y, owner, ...rest } = args;
  return sendSafeUserOp({ ...rest, signer: passkeyOpSigner({ credentialId, x, y, owner }, deps.sign ?? signWithPasskey) }, deps);
}

/**
 * One sponsored userOp from a Safe, whoever signs it (passkey or ECDSA owner):
 * nonce + fees → estimate with the stub voucher and the signer's dummy → sponsor → verbatim
 * paymaster limits → the signer signs the op hash → send → receipt.
 */
export async function sendSafeUserOp(
  args: SafeUserOpArgs,
  deps: UserOpDeps = {},
): Promise<{ userOpHash: Hex; txHash: Hex }> {
  const fetchImpl = deps.fetch ?? (fetch as unknown as FetchLike);
  const apiUrl = deps.apiUrl ?? PASSKEY_API_URL;
  if (!apiUrl) throw new Error('EXPO_PUBLIC_PASSKEY_API_URL is not configured');
  const paymaster = (deps.paymaster ?? PASSKEY_PAYMASTER) as Address | '';
  if (!paymaster) throw new Error('EXPO_PUBLIC_PASSKEY_PAYMASTER_ADDRESS is not configured');
  const bundlerUrl = deps.bundlerUrl ?? (PASSKEY_BUNDLER_URL || `${apiUrl}/api/bundler`);
  const rpcUrl = deps.rpcUrl ?? DEFAULT_GNOSIS_RPC_URL;
  const timeout = deps.requestTimeoutMs ?? 20_000;

  const { signer } = args;
  const sender = args.sender ?? signer.predicted;
  if (!args.deployed && getAddress(sender) !== getAddress(signer.predicted)) {
    throw new Error("only the signer's own counterfactual Safe can be deployed by its first userOp");
  }
  const callData = buildCallData(args.calls);

  // 1. nonce + fees (fees are fixed here, before estimation and sponsoring)
  const nonceData = await rpc<Hex>(
    fetchImpl,
    rpcUrl,
    'eth_call',
    [{ to: ENTRY_POINT_V07, data: encodeFunctionData({ abi: getNonceAbi, functionName: 'getNonce', args: [sender, 0n] }) }, 'latest'],
    timeout,
  );
  const nonce = decodeFunctionResult({ abi: getNonceAbi, functionName: 'getNonce', data: nonceData });
  const { maxFeePerGas, maxPriorityFeePerGas } = await resolveUserOpFees(fetchImpl, bundlerUrl, rpcUrl, timeout);

  // 2. unsigned op with the 372-byte stub + realistic dummy signature → estimate
  let op: UnpackedUserOp = {
    sender,
    nonce,
    ...(args.deployed ? {} : { factory: SAFE_PROXY_FACTORY, factoryData: signer.factoryData }),
    callData,
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymaster,
    paymasterVerificationGasLimit: PM_VERIFICATION_GAS_FLOOR,
    paymasterPostOpGasLimit: PM_POST_OP_GAS_FLOOR,
    paymasterData: `0x${'00'.repeat(PAYMASTER_DATA_LENGTH)}`,
    signature: signer.dummySignature,
  };
  const est = await rpc<Record<string, Hex | undefined>>(
    fetchImpl,
    bundlerUrl,
    'eth_estimateUserOperationGas',
    [toRpcUserOp(op), ENTRY_POINT_V07],
    timeout,
  );
  const pmVerification = maxBig(BigInt(est.paymasterVerificationGasLimit ?? '0x0'), PM_VERIFICATION_GAS_FLOOR);
  const pmPostOp = maxBig(BigInt(est.paymasterPostOpGasLimit ?? '0x0'), PM_POST_OP_GAS_FLOOR);
  if (pmVerification > PM_VERIFICATION_GAS_CAP || pmPostOp > PM_POST_OP_GAS_CAP) {
    throw new Error('estimated paymaster gas exceeds the sponsor caps (300k verification / 100k postOp)');
  }
  op = {
    ...op,
    callGasLimit: BigInt(est.callGasLimit ?? '0x0'),
    verificationGasLimit: BigInt(est.verificationGasLimit ?? '0x0'),
    preVerificationGas: BigInt(est.preVerificationGas ?? '0x0'),
    paymasterVerificationGasLimit: pmVerification,
    paymasterPostOpGasLimit: pmPostOp,
  };

  // 3. sponsor — echoed paymaster limits are voucher-covered: use them verbatim, never re-estimate
  const reply = (await postJson(
    fetchImpl,
    `${apiUrl}/api/passkey/sponsor`,
    sponsorRequestBody(op, { ...args, proof: signer.proof }),
    timeout,
  )) as SponsorResponse;
  op = applySponsorship(op, reply);

  // 4. the signer signs the Safe op hash
  const hash = safeOpHash(op, 0, 0);
  op = { ...op, signature: await signer.signOpHash(hash) };

  // 5. submit + wait for the receipt
  const userOpHash = await rpc<Hex>(fetchImpl, bundlerUrl, 'eth_sendUserOperation', [toRpcUserOp(op), ENTRY_POINT_V07], timeout);
  const deadline = Date.now() + (deps.receiptTimeoutMs ?? 120_000);
  const interval = deps.pollIntervalMs ?? 2_000;
  for (;;) {
    const receipt = await rpc<{ success?: boolean; reason?: string; receipt?: { transactionHash?: Hex } } | null>(
      fetchImpl,
      bundlerUrl,
      'eth_getUserOperationReceipt',
      [userOpHash],
      timeout,
    ).catch(() => null);
    if (receipt?.receipt?.transactionHash) {
      if (receipt.success === false) throw new Error(`userOp reverted${receipt.reason ? `: ${receipt.reason}` : ''}`);
      return { userOpHash, txHash: receipt.receipt.transactionHash };
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for the userOp receipt');
    await new Promise((r) => setTimeout(r, interval));
  }
}
