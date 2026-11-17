import { createHash } from "node:crypto";
import type { SponsorBudgetRpcClient } from "./sponsor-budget";

/**
 * Fixed-window rate limit for sending verification codes.
 *
 * FixedWindowLimiter is in memory, per serverless instance, reset on cold start: the real
 * ceiling is limit x instances. SupabaseRateLimiter (PASSKEY_RATE_LIMIT_STORE=supabase, migration
 * 20261117b_passkey_rate_limits.sql) is the shared one for production.
 */
export interface RateLimiter {
  /** Counts one hit for `key`; false when the window's limit is already reached. */
  take(key: string): Promise<boolean>;
}

export class FixedWindowLimiter implements RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): Promise<boolean> {
    return Promise.resolve(this.takeSync(key));
  }

  private takeSync(key: string): boolean {
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

export class RateLimitStoreError extends Error {
  constructor() {
    super("rate limit store unavailable");
    this.name = "RateLimitStoreError";
  }
}

/** Shared limiter: one atomic RPC per hit. Only a sha256 of the lowercased key is stored. */
export class SupabaseRateLimiter implements RateLimiter {
  constructor(
    private readonly db: SponsorBudgetRpcClient,
    private readonly scope: "email-safe" | "email-address",
    private readonly limit: number,
    private readonly windowSeconds: number,
  ) {}

  async take(key: string): Promise<boolean> {
    const r = await this.db.rpc("passkey_rate_take", {
      p_scope: this.scope,
      p_key_hash: createHash("sha256").update(key.toLowerCase()).digest("hex"),
      p_limit: this.limit,
      p_window_seconds: this.windowSeconds,
    });
    if (r.error || typeof r.data !== "boolean") throw new RateLimitStoreError();
    return r.data;
  }
}

export const HOUR_MS = 3_600_000;
/** Code emails per Safe per hour. */
export const SAFE_SENDS_PER_HOUR = 5;
/** Code emails per address per hour (protects the recipient from being flooded). */
export const EMAIL_SENDS_PER_HOUR = 3;
