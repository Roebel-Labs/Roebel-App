// Röbel Münzen hourly mint: constants and pure helpers shared by the Münzen
// page (app/rewards/index.tsx) and the profile's Münzen button. Both persist
// the same AsyncStorage keys so the cooldown and streak agree everywhere.

/** Min claimable Röbel Münzen before the mint activates (≈6 min of accrual at ~1/hour). */
export const MIN_MINTABLE = 0.1;
/** One full Röbel Münze accrues ≈1h after a mint. */
export const MINT_COOLDOWN_MS = 3_600_000;

export const rtClaimKey = (addr: string) => `rt_lastclaim_${addr.toLowerCase()}`;
export const rtStreakKey = (addr: string) => `rt_streak_${addr.toLowerCase()}`;

/** Local midnight at the start of the day containing `ts`. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight at the end of the day containing `ts`. */
export function nextMidnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min ${sec} s`;
}

/** Whole Münzen a mint lands right now; never below one. */
export function claimAmount(mintable: number): number {
  return Math.max(1, Math.round(mintable));
}

export function isInCooldown(lastClaim: number | null, now: number): boolean {
  return lastClaim != null && now < lastClaim + MINT_COOLDOWN_MS;
}

/**
 * Consecutive-day streak after a claim at `now`. Same day keeps the streak
 * (repairing 0 → 1), yesterday extends it, anything older restarts at 1.
 * "Yesterday" is derived through dayStart so DST days (23h/25h) still count.
 */
export function computeNextStreak(prevStreak: number, prevLastClaim: number | null, now: number): number {
  if (prevLastClaim == null) return 1;
  const today = dayStart(now);
  const yesterday = dayStart(today - 12 * 3_600_000);
  const lastDay = dayStart(prevLastClaim);
  if (lastDay === today) return Math.max(1, prevStreak);
  if (lastDay === yesterday) return prevStreak + 1;
  return 1;
}

/** "MM:SS" for the in-button cooldown clock; clamps at 00:00. */
export function formatCooldownClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
