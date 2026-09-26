/**
 * Fixed-window rate limit for sending verification codes.
 *
 * PREVIEW-ONLY: in memory, per serverless instance, reset on cold start. The real ceiling is
 * limit x instances. A shared limiter (Postgres row or Upstash) is a production gate.
 */
export interface RateLimiter {
  /** Counts one hit for `key`; false when the window's limit is already reached. */
  take(key: string): boolean;
}

export class FixedWindowLimiter implements RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    }
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    if (cur.count >= this.limit) return false;
    cur.count += 1;
    return true;
  }
}

export const HOUR_MS = 3_600_000;
/** Code emails per Safe per hour. */
export const SAFE_SENDS_PER_HOUR = 5;
/** Code emails per address per hour (protects the recipient from being flooded). */
export const EMAIL_SENDS_PER_HOUR = 3;
