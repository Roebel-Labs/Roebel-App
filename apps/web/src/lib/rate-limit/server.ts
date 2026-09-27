// Server wiring for the shared limiter: a lazily created service-role client used only for the
// `api_rate_limit_take` RPC. Returns null when the env is missing (local dev) so the limiter
// degrades to its per-instance layer.
import { createClient } from "@supabase/supabase-js";
import { SharedLimiter, type RateLimiter, type RateRule, type RpcClient } from "./index";

let cached: RpcClient | null | undefined;

export function adminRpcClient(): RpcClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? (createClient(url, key, { auth: { persistSession: false } }) as unknown as RpcClient) : null;
  return cached;
}

export function sharedLimiters(rules: RateRule[]): RateLimiter[] {
  return rules.map((rule) => new SharedLimiter(rule, adminRpcClient));
}
