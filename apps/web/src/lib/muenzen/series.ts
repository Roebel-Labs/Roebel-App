// Time-series bucketing for the Röbel Münzen charts. Shared by the overview and
// flow routes. Server-only (operates on Circles transfer data).
import "server-only";
import { attoToNumber } from "./constants";
import { classifyTransfer } from "./economy";
import type { CirclesTransfer } from "./circles-rpc";

export interface DayBucket {
  date: string; // YYYY-MM-DD
  mint: number;
  earn: number;
  spend: number;
  peer: number;
}

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Bucket transfers into per-day flow totals within [sinceMs, now]. */
export function dailyBuckets(transfers: CirclesTransfer[], sinceMs: number): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const t of transfers) {
    if (t.timestamp <= 0 || t.timestamp < sinceMs) continue;
    const k = dayKey(t.timestamp);
    let b = map.get(k);
    if (!b) {
      b = { date: k, mint: 0, earn: 0, spend: 0, peer: 0 };
      map.set(k, b);
    }
    b[classifyTransfer(t)] += attoToNumber(t.value);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface SupplyPoint extends DayBucket {
  supply: number; // cumulative issued (mint) over the window
}

/** Add a running cumulative-issuance line to daily buckets. */
export function withCumulativeSupply(buckets: DayBucket[], base = 0): SupplyPoint[] {
  let cum = base;
  return buckets.map((b) => {
    cum += b.mint;
    return { ...b, supply: cum };
  });
}
