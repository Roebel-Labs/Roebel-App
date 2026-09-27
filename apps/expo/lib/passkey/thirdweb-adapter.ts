/**
 * A thirdweb v5 `Account` backed by the person's passkey Safe, wrapped as a thirdweb wallet with
 * `createWalletAdapter` (wallet id "adapter"). Once it is the active wallet, `useActiveAccount()`
 * returns it app-wide and every existing `sendTransaction(...)` / `account.signMessage(...)` site
 * runs through the Safe without code changes.
 *
 * address — the IDENTITY (session.identity):
 *   - migrated person: the legacy thirdweb account (Safe = co-admin), so the user row, the
 *     CitizenNFT, Circles/Münzen and every wallet-keyed row stay attached;
 *   - passkey-only person, or after the v3 `moveTo`: the Safe itself.
 *
 * sendTransaction(tx) — one sponsored ERC-4337 userOp from the Safe (`sendPasskeyUserOp`):
 *   - identity = legacy: the Safe calls `legacy.execute(to, value, data)` (thirdweb Account,
 *     contract admins may call it directly) and the sponsor body names `legacy`;
 *   - identity = Safe: the Safe calls `to` directly.
 *   Batches are ONE op: identity = legacy → one `legacy.executeBatch(targets, values, datas)`
 *   call (one fingerprint, one sponsor check); identity = Safe → several direct calls
 *   (MultiSendCallOnly). Never mixed identities.
 *
 * signMessage / signTypedData — ERC-1271 by the Safe: WebAuthn challenge =
 * safeMessageHash(safe, hash) (fork-proven in contracts/passkey-accounts/test/GuardianErc1271.t.sol,
 * pinned by __tests__/recovery-vector.json), encoded as the Safe's one-owner contract signature.
 *   - identity = Safe: that signature as is (ERC-6492-wrapped while the Safe is counterfactual),
 *     so a standard `verifyMessage({ address: safe })` on Gnosis accepts it.
 *   - identity = legacy: the legacy account CANNOT validate it (thirdweb Account's
 *     isValidSignature is ECDSA-only). The adapter returns the Safe-admin envelope
 *     `SAFE_ADMIN_SIGNATURE_MAGIC ++ abi.encode(address safe, bytes safeSignature)` (rule (b) of
 *     apps/web/src/lib/auth/account-signature-core.ts); a verifier accepts it when the Safe's
 *     ERC-1271 check passes AND `legacy.isAdmin(safe)` is true. See docs/PASSKEY_SIGNIN_NOTES.md.
 *
 * Every side effect is injected so the logic is unit-tested without native code.
 */
import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  hashMessage,
  hashTypedData,
  isAddressEqual,
  keccak256,
  serializeErc6492Signature,
  size,
  sliceHex,
  stringToHex,
  type Address,
  type Hex,
  type SignableMessage,
} from 'viem';
import { PASSKEY_CHAIN_ID, SAFE_PROXY_FACTORY } from './constants';
import { safeMessageHash } from './guardians';
import { markSponsoredOpSucceeded } from './detach';
import { pollIdForTxs } from './poll-hints';
import { predictSafeAddress, safeFactoryData } from './safe-address';
import { PASSKEY_SESSION_PROP } from './active';
import { identityKind, type PasskeySession } from './session';
import { safeSignatureFromAssertion, type PasskeyUserOpArgs, type SponsoredCall } from './userop';
import type { PasskeyAssertion } from './webauthn';

export const WRONG_CHAIN_MESSAGE = 'Dein unabhängiges Konto funktioniert nur auf der Gnosis Chain.';
export const NO_TARGET_MESSAGE = 'Diese Aktion wird mit deinem unabhängigen Konto noch nicht unterstützt.';

/**
 * Prefix of the Safe-admin envelope = keccak256("roebel.safe-admin-signature.v1"). Must equal
 * SAFE_ADMIN_SIGNATURE_MAGIC in apps/web/src/lib/auth/account-signature-core.ts (and its edge
 * function copy apps/expo/supabase/functions/_shared/verify-account-signature.ts).
 */
export const SAFE_ADMIN_SIGNATURE_MAGIC: Hex = keccak256(stringToHex('roebel.safe-admin-signature.v1'));

const legacyExecuteAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_target', type: 'address' },
      { name: '_value', type: 'uint256' },
      { name: '_calldata', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_target', type: 'address[]' },
      { name: '_value', type: 'uint256[]' },
      { name: '_calldata', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const;

/** A transaction as thirdweb hands it to `Account.sendTransaction` (the fields we use). */
export type AdapterTx = { chainId?: number; to?: Address | null; value?: bigint | null; data?: Hex | null };

/** `legacy.execute(to, value, data)` — the call the Safe makes for a legacy identity. */
export function encodeLegacyExecute(to: Address, value: bigint, data: Hex): Hex {
  return encodeFunctionData({ abi: legacyExecuteAbi, functionName: 'execute', args: [to, value, data] });
}

/** `legacy.executeBatch(targets, values, datas)` — a legacy identity's batch as ONE call (selector 0x47e1da2a). */
export function encodeLegacyExecuteBatch(calls: readonly { to: Address; value: bigint; data: Hex }[]): Hex {
  return encodeFunctionData({
    abi: legacyExecuteAbi,
    functionName: 'executeBatch',
    args: [calls.map((c) => c.to), calls.map((c) => c.value), calls.map((c) => c.data)],
  });
}

/**
 * The Safe's calls for thirdweb transactions, plus the sponsor's `legacy` hint.
 * A legacy identity's batch (2+ txs) becomes ONE `legacy.executeBatch` call.
 * Throws a German error for another chain or a contract deployment (no `to`).
 */
export function buildAdapterCalls(
  session: Pick<PasskeySession, 'safe' | 'identity'>,
  txs: readonly AdapterTx[],
): { calls: SponsoredCall[]; legacy?: Address } {
  if (txs.length === 0) throw new Error('no transactions');
  const kind = identityKind(session);
  const inner = txs.map((tx) => {
    if (tx.chainId !== undefined && tx.chainId !== PASSKEY_CHAIN_ID) throw new Error(WRONG_CHAIN_MESSAGE);
    if (!tx.to) throw new Error(NO_TARGET_MESSAGE);
    return { to: tx.to, value: tx.value ?? 0n, data: (tx.data ?? '0x') as Hex };
  });
  if (kind === 'legacy') {
    const data =
      inner.length === 1 ? encodeLegacyExecute(inner[0].to, inner[0].value, inner[0].data) : encodeLegacyExecuteBatch(inner);
    return { calls: [{ to: session.identity, data }], legacy: session.identity };
  }
  return { calls: inner.map(({ to, value, data }): SponsoredCall => (value > 0n ? { to, data, value } : { to, data })) };
}

// ---------------------------------------------------------------------------
// ERC-1271
// ---------------------------------------------------------------------------

/** MAGIC ++ abi.encode(address safe, bytes safeSignature). */
export function encodeOnBehalfSignature(safe: Address, safeSignature: Hex): Hex {
  return concatHex([SAFE_ADMIN_SIGNATURE_MAGIC, encodeAbiParameters([{ type: 'address' }, { type: 'bytes' }], [safe, safeSignature])]);
}

/** Inverse of `encodeOnBehalfSignature` (null when `sig` is not an envelope). Mirrors the server. */
export function decodeOnBehalfSignature(sig: Hex): { safe: Address; signature: Hex } | null {
  if (size(sig) < 32 + 96 || sliceHex(sig, 0, 32).toLowerCase() !== SAFE_ADMIN_SIGNATURE_MAGIC.toLowerCase()) return null;
  try {
    const [safe, signature] = decodeAbiParameters([{ type: 'address' }, { type: 'bytes' }], sliceHex(sig, 32));
    return { safe, signature };
  } catch {
    return null;
  }
}

export type AdapterDeps = {
  /** WebAuthn assertion over a 32-byte challenge (default: signWithPasskey — the biometric prompt). */
  sign: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>;
  isSafeDeployed: (safe: Address) => Promise<boolean>;
  sendUserOp: (args: PasskeyUserOpArgs) => Promise<{ userOpHash: Hex; txHash: Hex }>;
  /** MACI pollId for a Poll address (default: the hints the vote path records, poll-hints.ts). */
  pollIdFor?: (poll: string) => bigint | undefined;
};

/**
 * The Safe's ERC-1271 signature over `hash` (the digest a verifier passes to isValidSignature),
 * ERC-6492-wrapped while the Safe is counterfactual, and wrapped in the on-behalf envelope when
 * the identity is a legacy account.
 */
export async function signHashAsIdentity(session: PasskeySession, hash: Hex, deps: AdapterDeps): Promise<Hex> {
  return (await signHashAsIdentityWithPrf(session, hash, deps)).signature;
}

/**
 * `signHashAsIdentity` plus the passkey PRF output of the SAME assertion (when the authenticator
 * returns one): the key backup signs its request and unwraps the blobs with one fingerprint.
 */
export async function signHashAsIdentityWithPrf(
  session: PasskeySession,
  hash: Hex,
  deps: AdapterDeps,
): Promise<{ signature: Hex; prf?: Hex }> {
  const challenge = safeMessageHash(session.safe, hash);
  const assertion = await deps.sign(session.credentialId, challenge);
  let sig = safeSignatureFromAssertion(assertion, challenge, session.owner);
  if (!(await deps.isSafeDeployed(session.safe))) {
    const key = { x: session.x, y: session.y };
    // Only the Safe created with this key can be deployed from it (a recovered Safe always has code).
    if (!isAddressEqual(predictSafeAddress(key), session.safe)) throw new Error('passkey Safe is not deployed');
    sig = serializeErc6492Signature({ address: SAFE_PROXY_FACTORY, data: safeFactoryData(key), signature: sig });
  }
  const signature = identityKind(session) === 'legacy' ? encodeOnBehalfSignature(session.safe, sig) : sig;
  return assertion.prf ? { signature, prf: assertion.prf } : { signature };
}

// ---------------------------------------------------------------------------
// The thirdweb Account
// ---------------------------------------------------------------------------

/** Structural subset of thirdweb's `Account` that this adapter implements. */
export type PasskeyThirdwebAccount = {
  address: Address;
  [PASSKEY_SESSION_PROP]: PasskeySession;
  sendTransaction: (tx: AdapterTx & Record<string, unknown>) => Promise<{ transactionHash: Hex }>;
  sendBatchTransaction: (txs: Array<AdapterTx & Record<string, unknown>>) => Promise<{ transactionHash: Hex }>;
  signMessage: (args: { message: SignableMessage; originalMessage?: string; chainId?: number }) => Promise<Hex>;
  signTypedData: (typedData: any) => Promise<Hex>;
};

export function createPasskeyAccount(session: PasskeySession, deps: AdapterDeps): PasskeyThirdwebAccount {
  const send = async (txs: AdapterTx[]) => {
    const { calls, legacy } = buildAdapterCalls(session, txs);
    // Poll.publishMessage needs the MACI pollId in the sponsor body (everyday mode).
    const pollId = deps.pollIdFor ? pollIdForTxs(txs, deps.pollIdFor) : pollIdForTxs(txs);
    const deployed = await deps.isSafeDeployed(session.safe);
    const { txHash } = await deps.sendUserOp({
      credentialId: session.credentialId,
      x: session.x,
      y: session.y,
      ...(legacy ? { legacy } : {}),
      ...(pollId !== undefined ? { pollId } : {}),
      calls,
      deployed,
      sender: session.safe,
      owner: session.owner,
    });
    markSponsoredOpSucceeded(); // "thirdweb trennen" checklist item (4)
    return { transactionHash: txHash };
  };
  return {
    address: session.identity,
    [PASSKEY_SESSION_PROP]: session,
    sendTransaction: (tx) => send([tx]),
    sendBatchTransaction: (txs) => send(txs),
    signMessage: ({ message, chainId }) => {
      if (chainId !== undefined && chainId !== PASSKEY_CHAIN_ID) return Promise.reject(new Error(WRONG_CHAIN_MESSAGE));
      return signHashAsIdentity(session, hashMessage(message), deps);
    },
    signTypedData: (typedData) => {
      const chainId = typedData?.domain?.chainId;
      if (chainId !== undefined && Number(chainId) !== PASSKEY_CHAIN_ID) return Promise.reject(new Error(WRONG_CHAIN_MESSAGE));
      return signHashAsIdentity(session, hashTypedData(typedData), deps);
    },
  };
}

/**
 * Options for thirdweb's `createWalletAdapter` (wallet id "adapter"): the passkey account, Gnosis
 * only (`switchChain` elsewhere throws a German error), and `onDisconnect` = clear ONLY the
 * passkey session (every existing `useDisconnect` logout site ends up here).
 */
export function passkeyWalletOptions<C extends { id: number }, Cl>(
  session: PasskeySession,
  p: { client: Cl; chain: C; deps: AdapterDeps; clearSession: () => Promise<void> },
) {
  return {
    client: p.client,
    adaptedAccount: createPasskeyAccount(session, p.deps),
    chain: p.chain,
    onDisconnect: async () => {
      await p.clearSession().catch(() => undefined);
    },
    switchChain: (next: { id: number }) => {
      if (next.id !== PASSKEY_CHAIN_ID) throw new Error(WRONG_CHAIN_MESSAGE);
    },
  };
}
