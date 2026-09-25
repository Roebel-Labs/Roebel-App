// Daily token quota per tier (spec §3.6). Day boundary = midnight Europe/Berlin.
import type { ChatQuota, ChatTier } from "./types";
import { startOfZonedDay } from "./time";

export const DAILY_TOKEN_LIMITS: Record<ChatTier, number> = {
  free: 150_000,
  plus: 1_500_000,
  ultra: 6_000_000,
};

export function quotaLimit(tier: ChatTier): number {
  return DAILY_TOKEN_LIMITS[tier] ?? DAILY_TOKEN_LIMITS.free;
}

export function sumTokens(runs: { input_tokens: number | null; output_tokens: number | null }[]): number {
  return runs.reduce((acc, r) => acc + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
}

export function quotaState(used: number, tier: ChatTier): ChatQuota & { remaining: number; exceeded: boolean } {
  const limit = quotaLimit(tier);
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, exceeded: used >= limit };
}

/** Effective tier from an entitlement row; expired or missing → free. */
export function effectiveTier(
  row: { tier: string | null; expires_at: string | null } | null | undefined, now: Date = new Date(),
): ChatTier {
  if (!row || (row.tier !== "plus" && row.tier !== "ultra")) return "free";
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return "free";
  return row.tier;
}

/** ISO instant from which today's usage counts (midnight Europe/Berlin). */
export function quotaWindowStart(now: Date = new Date()): string {
  return startOfZonedDay(now).toISOString();
}
