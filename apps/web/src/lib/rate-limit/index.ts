// Fixed-window rate limits for the server routes that spend money on the app's behalf
// (AI proxy, menu-image generation, Irys uploads).
//
// Two layers:
//  1. MemoryLimiter: per serverless instance, always on. Cheap first line; the real ceiling is
//     limit x warm instances.
//  2. SharedLimiter: one counter across all instances via the Postgres function
//     `api_rate_limit_take` (supabase/migrations/20260927_api_rate_limits.sql). When the RPC is
//     missing or errors (migration not applied yet, Supabase down) it falls back to layer 1, so a
//     deploy never breaks a feature because of the limiter.
//
// No next/* imports and relative imports only, so `npx tsx --test` can load it.

export interface RateLimiter {
  /** Counts one hit for `key`; resolves false when the window's limit is already reached. */
  take(key: string): Promise<boolean>;
}

export interface RateRule {
  /** Short, stable bucket name, e.g. "ai-anthropic-min". Part of the shared key. */
  name: string;
  limit: number;
  windowMs: number;
}

export class MemoryLimiter implements RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async take(key: string): Promise<boolean> {
    return this.takeSync(key);
  }

  takeSync(key: string): boolean {
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

/** Minimal slice of a Supabase client: only `.rpc` is used. */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export class SharedLimiter implements RateLimiter {
  private readonly memory: MemoryLimiter;
  private warned = false;

  constructor(
    private readonly rule: RateRule,
    private readonly getClient: () => RpcClient | null,
    now: () => number = Date.now,
  ) {
    this.memory = new MemoryLimiter(rule.limit, rule.windowMs, now);
  }

  async take(key: string): Promise<boolean> {
    // Instance-local first: a flood from one caller never reaches the database.
    if (!this.memory.takeSync(key)) return false;
    const client = this.safeClient();
    if (!client) return true;
    try {
      const { data, error } = await client.rpc("api_rate_limit_take", {
        p_key: `${this.rule.name}:${key}`,
        p_limit: this.rule.limit,
        p_window_seconds: Math.max(1, Math.round(this.rule.windowMs / 1000)),
      });
      if (error) throw error;
      return data !== false;
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn(`[rate-limit] shared limiter unavailable for ${this.rule.name}; using the per-instance limit`, errMessage(err));
      }
      return true;
    }
  }

  private safeClient(): RpcClient | null {
    try {
      return this.getClient();
    } catch {
      return null;
    }
  }
}

/** Every limiter must allow the hit. Stops at the first refusal (later windows are not counted). */
export async function takeAll(limiters: RateLimiter[], key: string): Promise<boolean> {
  for (const l of limiters) {
    if (!(await l.take(key))) return false;
  }
  return true;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
