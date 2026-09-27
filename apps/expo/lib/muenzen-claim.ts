/**
 * Röbel Münzen claim for a PASSKEY session: one tap → one sponsored userOp → one fingerprint.
 *
 * The thirdweb session keeps its existing flow unchanged (RoebelTalerProvider.dailyMint: two
 * gasless sends, settled detached with retries by the settlement queue; thirdweb signs silently).
 * Under a passkey session every send is a WebAuthn prompt, so that flow meant two surprise
 * fingerprints — and up to three more per retry — long after the tap. Here instead:
 *
 *   - the claim runs in the FOREGROUND, only from an explicit "Münzen abholen" tap, never retried
 *     in the background;
 *   - `personalMint()` and (citizens only) `groupMint(group, [self], [amount], 0x)` go out as ONE
 *     batch through the adapter's `sendBatchTransaction`, which the adapter turns into one
 *     `legacy.executeBatch` for a legacy identity (apps/web everyday allowlist accepts exactly that
 *     shape, see everyday-policy.test.ts).
 *
 * groupMint needs its amount BEFORE personalMint has run, so it is computed as the current
 * personal balance + the accrued issuance, minus a 0.1 % margin. The margin covers the daily
 * demurrage step (≈0.02 %/day) if the op lands after midnight; without it the groupMint — and with
 * it the whole batch — would revert. The dust stays personal and is swept by the next claim.
 *
 * Pure: reads and the account are injected.
 */
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { passkeySessionOf } from './passkey/active';

const hubAbi = [
  { type: 'function', name: 'personalMint', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'groupMint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_group', type: 'address' },
      { name: '_collateralAvatars', type: 'address[]' },
      { name: '_amounts', type: 'uint256[]' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

/** 0.1 % of the group-mint amount stays personal (see file comment). */
export const GROUP_MINT_MARGIN_BPS = 10n;

export const CLAIM_NOTHING_MESSAGE = 'Gerade gibt es keine Röbel Münzen zum Abholen. Schau in einer Stunde wieder vorbei.';

export type ClaimTx = { chainId: 100; to: Address; value: 0n; data: Hex };

/** groupMint amount: everything personal after the mint, minus the demurrage margin. */
export function groupMintAmount(personalBalance: bigint, mintable: bigint): bigint {
  const total = personalBalance + mintable;
  return total - (total * GROUP_MINT_MARGIN_BPS) / 10_000n;
}

/**
 * The claim's transactions: `personalMint()` when something accrued, then — for a group member —
 * `groupMint` converting the personal Münzen into Röbel Münzen. Empty = nothing to claim.
 */
export function buildMuenzenClaimTxs(p: {
  hub: Address;
  group: Address;
  self: Address;
  member: boolean;
  personalBalance: bigint;
  mintable: bigint;
}): ClaimTx[] {
  const txs: ClaimTx[] = [];
  if (p.mintable > 0n) {
    txs.push({ chainId: 100, to: p.hub, value: 0n, data: encodeFunctionData({ abi: hubAbi, functionName: 'personalMint' }) });
  }
  if (p.member) {
    const amount = groupMintAmount(p.personalBalance, p.mintable);
    if (amount > 0n) {
      txs.push({
        chainId: 100,
        to: p.hub,
        value: 0n,
        data: encodeFunctionData({ abi: hubAbi, functionName: 'groupMint', args: [p.group, [p.self], [amount], '0x'] }),
      });
    }
  }
  return txs;
}

/** Does this account claim in the foreground as one batch (passkey session)? thirdweb: no. */
export function claimsAsOneBatch(account: unknown): boolean {
  return passkeySessionOf(account) !== null;
}

export type BatchAccount = {
  address: string;
  sendBatchTransaction?: (txs: ClaimTx[]) => Promise<{ transactionHash: Hex }>;
};

export type ClaimReads = {
  isGroupMember: (addr: string) => Promise<boolean>;
  personalBalance: (addr: string) => Promise<bigint>;
  mintable: (addr: string) => Promise<bigint>;
};

/** Whole Münzen (18 decimals) for the success line, rounded, never below 1. */
export function wholeMuenzen(raw: bigint): number {
  return Math.max(1, Math.round(Number(raw / 10n ** 16n) / 100));
}

/**
 * The passkey claim: fresh reads, one batch, one `sendBatchTransaction` (= one userOp, one
 * fingerprint). Reads that fail throw (the user sees an error and can tap again) — a failed
 * membership read must not silently skip the group mint.
 */
export async function claimMuenzenAsOneBatch(
  account: BatchAccount,
  reads: ClaimReads,
  addrs: { hub: Address; group: Address },
): Promise<{ transactionHash: Hex; mintedRaw: bigint }> {
  if (!claimsAsOneBatch(account) || typeof account.sendBatchTransaction !== 'function') {
    throw new Error('claimMuenzenAsOneBatch is for passkey sessions only');
  }
  const self = account.address as Address;
  const [member, personalBalance, mintable] = await Promise.all([
    reads.isGroupMember(self),
    reads.personalBalance(self),
    reads.mintable(self),
  ]);
  const txs = buildMuenzenClaimTxs({ ...addrs, self, member, personalBalance, mintable });
  if (txs.length === 0) throw new Error(CLAIM_NOTHING_MESSAGE);
  const { transactionHash } = await account.sendBatchTransaction(txs);
  return { transactionHash, mintedRaw: mintable };
}
