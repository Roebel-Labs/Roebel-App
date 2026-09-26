/**
 * Guardians + social recovery on the Candide SocialRecoveryModule (SRM) 0x3827…541c, for passkey
 * Safes. Pure encoders (each returns a `SponsoredCall` ready for `sendPasskeyUserOp`), chain reads
 * through a Gnosis public client, and the guardian's off-chain approval signature.
 *
 * Recovery UX (proven in contracts/passkey-accounts/test/GuardianErc1271.t.sol, pinned by
 * test/fixtures/recovery-vector.json):
 *  1. The recovering person creates a NEW passkey on the new device. Its per-key Safe owner is
 *     `readWebAuthnSigner(newX, newY)` (SafeWebAuthnSignerFactory.getSigner).
 *  2. Each guardian with a DEPLOYED passkey Safe signs `recoveryApprovalTypedData(wallet,
 *     [newSigner], 1, nonce)` OFF-CHAIN with `signRecoveryApprovalAsGuardian` (ERC-1271 through
 *     their Safe: the WebAuthn challenge is the Safe's SafeMessage hash of the recovery hash).
 *     A guardian whose Safe is still COUNTERFACTUAL cannot sign off-chain (no code, the SRM's
 *     ERC-1271 check fails): they send `encodeConfirmRecovery(...)` in their own sponsored userOp
 *     instead (it deploys their Safe), which counts the same.
 *  3. The new device submits ONE sponsored userOp from its fresh passkey Safe (no `legacy`; pass
 *     `recoveryLegacy` if the wallet itself holds no CitizenNFT):
 *     [encodeCreateSigner(newX, newY), encodeMultiConfirmRecovery(wallet, [newSigner], 1, approvals)].
 *  4. After SOCIAL_RECOVERY_PERIOD_SEC (3 days), a second sponsored op: [encodeFinalizeRecovery(wallet)].
 *  5. From then on the wallet signs with the new passkey through `newSigner`: persist it with
 *     `saveRecoveredRecord` (migration.ts) and call `sendPasskeyUserOp({ sender: wallet, owner: newSigner, deployed: true, ... })`.
 * The legitimate owner can stop a recovery during the delay with `encodeCancelRecovery()`.
 */
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  http,
  isAddressEqual,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from 'viem';
import {
  PASSKEY_CHAIN_ID,
  SAFE_WEBAUTHN_SHARED_SIGNER,
  SAFE_WEBAUTHN_SIGNER_FACTORY,
  SOCIAL_RECOVERY_MODULE,
  SOCIAL_RECOVERY_SENTINEL,
  WEBAUTHN_VERIFIERS,
} from './constants';
import { DEFAULT_GNOSIS_RPC_URL, safeSignatureFromAssertion, type SponsoredCall } from './userop';
import { signWithPasskey, type PasskeyAssertion } from './webauthn';

export const socialRecoveryAbi = [
  {
    type: 'function',
    name: 'addGuardianWithThreshold',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_guardian', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeGuardianWithThreshold',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_prevGuardian', type: 'address' },
      { name: '_guardian', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'changeThreshold',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_threshold', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'confirmRecovery',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
      { name: '_execute', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'multiConfirmRecovery',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
      {
        name: '_signatures',
        type: 'tuple[]',
        components: [
          { name: 'signer', type: 'address' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: '_execute', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeRecovery',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeRecovery',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [],
  },
  { type: 'function', name: 'cancelRecovery', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'getGuardians',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'threshold',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'nonce',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '_nonce', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getRecoveryRequest',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'guardiansApprovalCount', type: 'uint256' },
          { name: 'newThreshold', type: 'uint256' },
          { name: 'executeAfter', type: 'uint64' },
          { name: 'newOwners', type: 'address[]' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getRecoveryApprovals',
    stateMutability: 'view',
    inputs: [
      { name: '_wallet', type: 'address' },
      { name: '_newOwners', type: 'address[]' },
      { name: '_newThreshold', type: 'uint256' },
    ],
    outputs: [{ name: 'approvalCount', type: 'uint256' }],
  },
] as const;

const signerFactoryAbi = [
  {
    type: 'function',
    name: 'getSigner',
    stateMutability: 'view',
    inputs: [
      { name: 'x', type: 'uint256' },
      { name: 'y', type: 'uint256' },
      { name: 'verifiers', type: 'uint176' },
    ],
    outputs: [{ name: 'signer', type: 'address' }],
  },
  {
    type: 'function',
    name: 'createSigner',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'x', type: 'uint256' },
      { name: 'y', type: 'uint256' },
      { name: 'verifiers', type: 'uint176' },
    ],
    outputs: [{ name: 'signer', type: 'address' }],
  },
] as const;

const srm = (data: Hex): SponsoredCall => ({ to: SOCIAL_RECOVERY_MODULE, data });

// ---------------------------------------------------------------------------
// Guardian management (sent by the wallet's own Safe; sponsor mode "legacy" or "safe")
// ---------------------------------------------------------------------------

export function encodeAddGuardian(guardian: Address, threshold: bigint | number): SponsoredCall {
  return srm(
    encodeFunctionData({ abi: socialRecoveryAbi, functionName: 'addGuardianWithThreshold', args: [guardian, BigInt(threshold)] }),
  );
}

/** `prev` = the guardian before `guardian` in `readGuardians` order (see `prevGuardianOf`). */
export function encodeRevokeGuardian(prev: Address, guardian: Address, threshold: bigint | number): SponsoredCall {
  return srm(
    encodeFunctionData({
      abi: socialRecoveryAbi,
      functionName: 'revokeGuardianWithThreshold',
      args: [prev, guardian, BigInt(threshold)],
    }),
  );
}

export function encodeChangeThreshold(threshold: bigint | number): SponsoredCall {
  return srm(encodeFunctionData({ abi: socialRecoveryAbi, functionName: 'changeThreshold', args: [BigInt(threshold)] }));
}

/** The linked-list predecessor: SENTINEL (0x…01) for the first guardian of `readGuardians`. */
export function prevGuardianOf(guardians: readonly Address[], guardian: Address): Address {
  const i = guardians.findIndex((g) => isAddressEqual(g, guardian));
  if (i < 0) throw new Error('not a guardian of this wallet');
  return i === 0 ? SOCIAL_RECOVERY_SENTINEL : guardians[i - 1];
}

// ---------------------------------------------------------------------------
// Recovery (sponsor mode "recovery": the op names no legacy)
// ---------------------------------------------------------------------------

export type GuardianApproval = { signer: Address; signature: Hex };

/**
 * SRM.multiConfirmRecovery(wallet, newOwners, threshold, approvals, execute). Approvals are sorted
 * by signer address (the SRM requires strictly increasing signers); duplicates are rejected.
 * The sponsor only accepts newOwners = [readWebAuthnSigner(submitter's key)] and threshold 1.
 */
export function encodeMultiConfirmRecovery(
  wallet: Address,
  newOwners: readonly Address[],
  threshold: bigint | number,
  approvals: readonly GuardianApproval[],
  execute = true,
): SponsoredCall {
  if (approvals.length === 0) throw new Error('no guardian approvals');
  const sorted = [...approvals].sort((a, b) => (BigInt(a.signer) < BigInt(b.signer) ? -1 : 1));
  for (let i = 1; i < sorted.length; i++) {
    if (isAddressEqual(sorted[i].signer, sorted[i - 1].signer)) throw new Error('duplicate guardian approval');
  }
  return srm(
    encodeFunctionData({
      abi: socialRecoveryAbi,
      functionName: 'multiConfirmRecovery',
      args: [wallet, [...newOwners], BigInt(threshold), sorted, execute],
    }),
  );
}

/** A guardian's own ON-CHAIN approval (the path for a guardian whose Safe is not deployed yet). */
export function encodeConfirmRecovery(
  wallet: Address,
  newOwners: readonly Address[],
  threshold: bigint | number,
  execute = false,
): SponsoredCall {
  return srm(
    encodeFunctionData({
      abi: socialRecoveryAbi,
      functionName: 'confirmRecovery',
      args: [wallet, [...newOwners], BigInt(threshold), execute],
    }),
  );
}

/** Starts the delay once enough guardians confirmed on-chain. */
export function encodeExecuteRecovery(wallet: Address, newOwners: readonly Address[], threshold: bigint | number): SponsoredCall {
  return srm(
    encodeFunctionData({ abi: socialRecoveryAbi, functionName: 'executeRecovery', args: [wallet, [...newOwners], BigInt(threshold)] }),
  );
}

export function encodeFinalizeRecovery(wallet: Address): SponsoredCall {
  return srm(encodeFunctionData({ abi: socialRecoveryAbi, functionName: 'finalizeRecovery', args: [wallet] }));
}

/** The wallet owner stops an ongoing recovery (during the 3-day delay). */
export function encodeCancelRecovery(): SponsoredCall {
  return srm(encodeFunctionData({ abi: socialRecoveryAbi, functionName: 'cancelRecovery' }));
}

/** SafeWebAuthnSignerFactory.createSigner(x, y, verifiers): deploys the per-key owner the recovery installs. */
export function encodeCreateSigner(x: Hex, y: Hex): SponsoredCall {
  return {
    to: SAFE_WEBAUTHN_SIGNER_FACTORY,
    data: encodeFunctionData({ abi: signerFactoryAbi, functionName: 'createSigner', args: [BigInt(x), BigInt(y), WEBAUTHN_VERIFIERS] }),
  };
}

// ---------------------------------------------------------------------------
// Approval hashing + guardian signature
// ---------------------------------------------------------------------------

export const recoveryApprovalTypes = {
  ExecuteRecovery: [
    { name: 'wallet', type: 'address' },
    { name: 'newOwners', type: 'address[]' },
    { name: 'newThreshold', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

/**
 * EIP-712 of SRM.getRecoveryHash: domain ('Social Recovery Module', '0.0.1', 100, SRM),
 * ExecuteRecovery(address wallet,address[] newOwners,uint256 newThreshold,uint256 nonce).
 * `nonce` = readRecoveryNonce(wallet) at signing time (any recovery start or invalidateNonce bumps it).
 */
export function recoveryApprovalTypedData(
  wallet: Address,
  newOwners: readonly Address[],
  threshold: bigint | number,
  nonce: bigint | number,
): TypedDataDefinition<typeof recoveryApprovalTypes, 'ExecuteRecovery'> {
  return {
    domain: { name: 'Social Recovery Module', version: '0.0.1', chainId: PASSKEY_CHAIN_ID, verifyingContract: SOCIAL_RECOVERY_MODULE },
    types: recoveryApprovalTypes,
    primaryType: 'ExecuteRecovery',
    message: { wallet, newOwners: [...newOwners], newThreshold: BigInt(threshold), nonce: BigInt(nonce) },
  };
}

export function recoveryHash(wallet: Address, newOwners: readonly Address[], threshold: bigint | number, nonce: bigint | number): Hex {
  return hashTypedData(recoveryApprovalTypedData(wallet, newOwners, threshold, nonce));
}

/**
 * ERC-1271 challenge of a Safe 1.4.1 with CompatibilityFallbackHandler semantics (Safe4337Module
 * v0.3.0 inherits it): EIP-712 SafeMessage(bytes message) with message = abi.encode(hash), domain
 * EIP712Domain(uint256 chainId,address verifyingContract) = (100, safe).
 */
export function safeMessageHash(safe: Address, hash: Hex): Hex {
  return hashTypedData({
    domain: { chainId: PASSKEY_CHAIN_ID, verifyingContract: safe },
    types: { SafeMessage: [{ name: 'message', type: 'bytes' }] },
    primaryType: 'SafeMessage',
    message: { message: encodeAbiParameters([{ type: 'bytes32' }], [hash]) },
  });
}

/**
 * The guardian's off-chain approval: a WebAuthn assertion over safeMessageHash(guardianSafe,
 * recoveryHash), encoded as the guardian Safe's one-owner contract signature. The guardian Safe
 * MUST be deployed (check with `isSafeDeployed`); otherwise use `encodeConfirmRecovery`.
 */
export async function signRecoveryApprovalAsGuardian(
  args: {
    credentialId: string;
    guardianSafe: Address;
    /** The guardian Safe's owner (SharedSigner unless the guardian's own Safe was recovered). */
    guardianOwner?: Address;
    wallet: Address;
    newOwners: readonly Address[];
    threshold: bigint | number;
    nonce: bigint | number;
  },
  deps: { sign?: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion> } = {},
): Promise<GuardianApproval> {
  const sign = deps.sign ?? signWithPasskey;
  const challenge = safeMessageHash(args.guardianSafe, recoveryHash(args.wallet, args.newOwners, args.threshold, args.nonce));
  const assertion = await sign(args.credentialId, challenge);
  return {
    signer: getAddress(args.guardianSafe),
    signature: safeSignatureFromAssertion(assertion, challenge, args.guardianOwner ?? SAFE_WEBAUTHN_SHARED_SIGNER),
  };
}

// ---------------------------------------------------------------------------
// Chain reads (Gnosis)
// ---------------------------------------------------------------------------

export type GnosisReadClient = {
  readContract: (args: any) => Promise<any>;
};

let defaultClient: GnosisReadClient | null = null;
function gnosis(client?: GnosisReadClient): GnosisReadClient {
  if (client) return client;
  defaultClient ??= createPublicClient({ transport: http(DEFAULT_GNOSIS_RPC_URL, { timeout: 15_000, retryCount: 1 }) });
  return defaultClient;
}

const readSrm = (client: GnosisReadClient | undefined, functionName: string, args: unknown[]) =>
  gnosis(client).readContract({ address: SOCIAL_RECOVERY_MODULE, abi: socialRecoveryAbi, functionName, args });

/** Guardians in linked-list order (newest first). */
export async function readGuardians(safe: Address, client?: GnosisReadClient): Promise<Address[]> {
  return [...((await readSrm(client, 'getGuardians', [safe])) as readonly Address[])];
}

export async function readThreshold(safe: Address, client?: GnosisReadClient): Promise<bigint> {
  return BigInt(await readSrm(client, 'threshold', [safe]));
}

export async function readRecoveryNonce(safe: Address, client?: GnosisReadClient): Promise<bigint> {
  return BigInt(await readSrm(client, 'nonce', [safe]));
}

export type RecoveryRequest = {
  guardiansApprovalCount: bigint;
  newThreshold: bigint;
  /** Unix seconds; 0 = no recovery in progress. */
  executeAfter: bigint;
  newOwners: Address[];
};

export async function readRecoveryRequest(safe: Address, client?: GnosisReadClient): Promise<RecoveryRequest> {
  const r = (await readSrm(client, 'getRecoveryRequest', [safe])) as {
    guardiansApprovalCount: bigint;
    newThreshold: bigint;
    executeAfter: bigint | number;
    newOwners: readonly Address[];
  };
  return {
    guardiansApprovalCount: BigInt(r.guardiansApprovalCount),
    newThreshold: BigInt(r.newThreshold),
    executeAfter: BigInt(r.executeAfter),
    newOwners: [...r.newOwners],
  };
}

/** On-chain approvals already counted for (wallet, newOwners, threshold) at the current nonce. */
export async function readRecoveryApprovals(
  wallet: Address,
  newOwners: readonly Address[],
  threshold: bigint | number,
  client?: GnosisReadClient,
): Promise<bigint> {
  return BigInt(await readSrm(client, 'getRecoveryApprovals', [wallet, [...newOwners], BigInt(threshold)]));
}

/** SafeWebAuthnSignerFactory.getSigner(x, y, verifiers): the per-key owner for a recovery to this passkey. */
export async function readWebAuthnSigner(x: Hex, y: Hex, client?: GnosisReadClient): Promise<Address> {
  return gnosis(client).readContract({
    address: SAFE_WEBAUTHN_SIGNER_FACTORY,
    abi: signerFactoryAbi,
    functionName: 'getSigner',
    args: [BigInt(x), BigInt(y), WEBAUTHN_VERIFIERS],
  });
}
