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
 * A citizen who is saving for an invitation (lib/muenzen-invite.ts) holds back `reserve` personal
 * Münzen: the group mint converts only what lies above it.
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
export function groupMintAmount(personalBalance: bigint, mintable: bigint, reserve = 0n): bigint {
  const total = personalBalance + mintable;
  const afterMargin = total - (total * GROUP_MINT_MARGIN_BPS) / 10_000n;
  return afterMargin > reserve ? afterMargin - reserve : 0n;
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
  /** Personal Münzen held back for invitations (never converted). */
  reserve?: bigint;
}): ClaimTx[] {
  const txs: ClaimTx[] = [];
  if (p.mintable > 0n) {
    txs.push({ chainId: 100, to: p.hub, value: 0n, data: encodeFunctionData({ abi: hubAbi, functionName: 'personalMint' }) });
  }
  if (p.member) {
    const amount = groupMintAmount(p.personalBalance, p.mintable, p.reserve ?? 0n);
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
  /** Personal Münzen to hold back for invitations; omitted = none. */
  inviteReserve?: (addr: string) => Promise<bigint>;
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
  const [member, personalBalance, mintable, reserve] = await Promise.all([
    reads.isGroupMember(self),
    reads.personalBalance(self),
    reads.mintable(self),
    reads.inviteReserve ? reads.inviteReserve(self) : Promise.resolve(0n),
  ]);
  const txs = buildMuenzenClaimTxs({ ...addrs, self, member, personalBalance, mintable, reserve });
  if (txs.length === 0) throw new Error(CLAIM_NOTHING_MESSAGE);
  const { transactionHash } = await account.sendBatchTransaction(txs);
  return { transactionHash, mintedRaw: mintable };
}

const PERSONAL_MINT_DATA = encodeFunctionData({ abi: hubAbi, functionName: 'personalMint' });

/** A partial device-session claim: personalMint landed, a later groupMint did not. */
export type DeviceSessionClaimResult = { mintedRaw: bigint; partial: boolean; error?: unknown };

/**
 * The device-session claim (no fingerprint): the same transactions as `buildMuenzenClaimTxs`,
 * one session op per transaction, in order (personalMint, then groupMint). `send(kind, data)`
 * sends one session op with the Hub calldata and resolves with its tx hash.
 *
 * An error on the FIRST op propagates (nothing landed; the caller may fall back to the passkey).
 * An error after personalMint landed returns `partial: true` with the error: the personal Münzen
 * are there, the next claim converts the rest.
 */
export async function claimMuenzenWithDeviceSession(
  account: Pick<BatchAccount, 'address'>,
  reads: ClaimReads,
  addrs: { hub: Address; group: Address },
  send: (kind: 'personalMint' | 'groupMint', data: Hex) => Promise<Hex>,
): Promise<DeviceSessionClaimResult> {
  const self = account.address as Address;
  const [member, personalBalance, mintable, reserve] = await Promise.all([
    reads.isGroupMember(self),
    reads.personalBalance(self),
    reads.mintable(self),
    reads.inviteReserve ? reads.inviteReserve(self) : Promise.resolve(0n),
  ]);
  const txs = buildMuenzenClaimTxs({ ...addrs, self, member, personalBalance, mintable, reserve });
  if (txs.length === 0) throw new Error(CLAIM_NOTHING_MESSAGE);
  let mintedRaw = 0n;
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const kind = tx.data.toLowerCase() === PERSONAL_MINT_DATA.toLowerCase() ? 'personalMint' : 'groupMint';
    try {
      await send(kind, tx.data);
    } catch (error) {
      if (i === 0) throw error;
      return { mintedRaw, partial: true, error };
    }
    if (kind === 'personalMint') mintedRaw = mintable;
  }
  return { mintedRaw, partial: false };
}

/** Claim route (see lib/passkey/session-keys/claim-route.ts). */
export type RoutedClaimPath = 'session' | 'renew-then-session' | 'offer' | 'passkey';

export type RoutedClaimDeps<S> = {
  path: RoutedClaimPath;
  /** The user accepted the offer sheet ("Erlauben"). */
  allowGrant: boolean;
  account: Pick<BatchAccount, 'address'>;
  reads: ClaimReads;
  addrs: { hub: Address; group: Address };
  /** grantDeviceSession (ONE passkey prompt). */
  grant: () => Promise<void>;
  /** This device's active session (record + key), or null. */
  loadSession: () => Promise<S | null>;
  /** One device-session op (no prompt); resolves with the tx hash. */
  sendSessionCall: (s: S, kind: 'personalMint' | 'groupMint', data: Hex) => Promise<Hex>;
  /** isDeviceSessionRejection. */
  isRejection: (e: unknown) => boolean;
  /** Deletes this device's record + key. */
  dropSession: () => Promise<void>;
  /** Today's one-batch passkey claim (ONE prompt). */
  passkeyClaim: () => Promise<{ mintedRaw: bigint }>;
};

export type RoutedClaimResult = { mintedRaw: bigint; partial: boolean; via: 'session' | 'passkey' };

/**
 * The passkey claim, routed through the device session when there is one:
 *   'session'                     → session ops (no prompt)
 *   'renew-then-session'          → renew (one prompt; the user opted in before), then session ops
 *   'offer' + allowGrant          → grant (one prompt), then session ops
 *   'offer' without it, 'passkey' → today's one-batch passkey claim (one prompt)
 * A rejected session (other device replaced it, expired, sponsor refusal) drops the local record
 * and runs the passkey claim ONCE; it never retries the session. A rejection after personalMint
 * landed drops the record and returns the partial result (no second prompt).
 */
export async function claimMuenzenRouted<S>(d: RoutedClaimDeps<S>): Promise<RoutedClaimResult> {
  const viaPasskey = async (): Promise<RoutedClaimResult> => ({ ...(await d.passkeyClaim()), partial: false, via: 'passkey' });
  const wantsSession = d.path === 'session' || d.path === 'renew-then-session' || (d.path === 'offer' && d.allowGrant);
  if (!wantsSession) return viaPasskey();
  if (d.path !== 'session') await d.grant();
  const s = await d.loadSession();
  if (!s) return viaPasskey();
  let result: DeviceSessionClaimResult;
  try {
    result = await claimMuenzenWithDeviceSession(d.account, d.reads, d.addrs, (kind, data) => d.sendSessionCall(s, kind, data));
  } catch (e) {
    if (!d.isRejection(e)) throw e;
    await d.dropSession().catch(() => {});
    return viaPasskey();
  }
  if (result.partial && d.isRejection(result.error)) await d.dropSession().catch(() => {});
  return { mintedRaw: result.mintedRaw, partial: result.partial, via: 'session' };
}
