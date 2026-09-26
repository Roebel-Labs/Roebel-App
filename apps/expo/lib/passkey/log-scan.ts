/**
 * Chunked eth_getLogs over Gnosis. Public RPCs cap a getLogs block range (publicnode: 10 000
 * blocks on some backends, measured 2026-09-26), so every event lookup walks the chain in windows. The fetcher is
 * injected: tests pass a fake, the runtime passes a viem public client (its http transport has a
 * timeout, so a hung request aborts instead of spinning forever).
 */

/**
 * Largest block range the default Gnosis RPC accepts per eth_getLogs. publicnode's backends
 * disagree (50 000 on some, 10 000 on others, measured 2026-09-26): use the smaller one.
 */
export const LOG_BLOCK_RANGE = 10_000n;

/** Gnosis produces one block per 5 s slot (missed slots only make blocks rarer). */
export const GNOSIS_SLOT_SECONDS = 5n;

/**
 * No passkey Safe existed before this block (the feature branch started 2026-09-26 at block
 * ~48 453 000). AdminUpdated events that link a passkey Safe to a legacy account are all later.
 */
export const PASSKEY_EPOCH_BLOCK = 48_400_000n;

/** CitizenNFTv2 was deployed 2026-06-24 (MACI core at 46 867 803 came right after). */
export const CITIZEN_NFT_V2_FROM_BLOCK = 46_800_000n;

export type BlockWindow = { fromBlock: bigint; toBlock: bigint };

/** Windows covering [from, to], newest first (backward) or oldest first. */
export function blockWindows(from: bigint, to: bigint, range: bigint = LOG_BLOCK_RANGE, backward = false): BlockWindow[] {
  if (range <= 0n) throw new Error('range must be positive');
  if (to < from) return [];
  const out: BlockWindow[] = [];
  if (backward) {
    for (let hi = to; hi >= from; hi -= range) {
      const lo = hi - range + 1n > from ? hi - range + 1n : from;
      out.push({ fromBlock: lo, toBlock: hi });
      if (lo === from) break;
    }
  } else {
    for (let lo = from; lo <= to; lo += range) {
      const hi = lo + range - 1n < to ? lo + range - 1n : to;
      out.push({ fromBlock: lo, toBlock: hi });
    }
  }
  return out;
}

/**
 * Fetches every window (at most `concurrency` in flight) and returns all logs in window order.
 * `stop` is checked after each batch: when it returns true for the logs gathered so far, the
 * remaining windows are skipped (used by the backward "newest match wins" scans).
 */
export async function scanLogs<T>(
  windows: BlockWindow[],
  fetchWindow: (w: BlockWindow) => Promise<T[]>,
  opts: { concurrency?: number; stop?: (logsSoFar: T[]) => boolean } = {},
): Promise<T[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const out: T[] = [];
  for (let i = 0; i < windows.length; i += concurrency) {
    const batch = windows.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((w) => fetchWindow(w)));
    for (const r of results) out.push(...r);
    if (opts.stop?.(out)) break;
  }
  return out;
}
