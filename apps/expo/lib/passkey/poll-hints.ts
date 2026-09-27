/**
 * MACI poll ids for the passkey sponsor.
 *
 * The sponsor's everyday mode only pays for `Poll.publishMessage` when the request body names the
 * MACI `pollId` and `MACI.polls(pollId)` equals the call target (apps/web sponsor-policy.ts
 * `checkPolls`). thirdweb hands the adapter only `{ to, data, value }`, so the vote path records
 * "this Poll address is poll N" here right before it sends, and the adapter reads it back.
 *
 * Pure module (no native code): a thirdweb session records the hint too, it is simply never read.
 */
import { size, sliceHex, type Address, type Hex } from 'viem';

/** `publishMessage((uint256[10]),(uint256,uint256))` (MACI v2 Poll). */
export const PUBLISH_MESSAGE_SELECTOR: Hex = '0x27bea0da';

export const MISSING_POLL_ID_MESSAGE =
  'Die Umfrage für diese Stimme ist unbekannt. Bitte öffne den Vorschlag erneut und stimme noch einmal ab.';
export const MIXED_POLLS_MESSAGE = 'Es kann nur in einer Umfrage gleichzeitig abgestimmt werden.';

const hints = new Map<string, bigint>();

/** Called by the vote path before `sendTransaction`: the Poll at `poll` is MACI poll `pollId`. */
export function rememberPollId(poll: string, pollId: bigint): void {
  hints.set(poll.toLowerCase(), pollId);
}

export function lookupPollId(poll: string): bigint | undefined {
  return hints.get(poll.toLowerCase());
}

/** Test helper. */
export function clearPollHints(): void {
  hints.clear();
}

export function isPublishMessage(data: Hex | null | undefined): boolean {
  return !!data && size(data) >= 4 && sliceHex(data, 0, 4).toLowerCase() === PUBLISH_MESSAGE_SELECTOR;
}

/**
 * The pollId the sponsor needs for these transactions: undefined when none is a vote; throws a
 * German error when a vote's poll is unknown or when one op would vote in two polls (the server
 * accepts one pollId per op).
 */
export function pollIdForTxs(
  txs: ReadonlyArray<{ to?: Address | null; data?: Hex | null }>,
  lookup: (poll: string) => bigint | undefined = lookupPollId,
): bigint | undefined {
  let found: bigint | undefined;
  for (const tx of txs) {
    if (!tx.to || !isPublishMessage(tx.data)) continue;
    const id = lookup(tx.to);
    if (id === undefined) throw new Error(MISSING_POLL_ID_MESSAGE);
    if (found !== undefined && found !== id) throw new Error(MIXED_POLLS_MESSAGE);
    found = id;
  }
  return found;
}
