/**
 * Daily sponsorship budget for /api/passkey/sponsor.
 *
 * The handler reserves the voucher's `maxCostWei` (EntryPoint v0.7 required
 * prefund, the most the paymaster can be charged) BEFORE signing, keyed by the
 * citizen identity the policy bound the op to (lowercased): the legacy
 * thirdweb account, the citizen Safe itself, or the wallet being recovered. A refused reservation spends
 * nothing.
 *
 * Two stores:
 *  - `SupabaseSponsorBudget` (env PASSKEY_SPONSOR_BUDGET_STORE=supabase): one
 *    atomic RPC `passkey_sponsor_reserve` (migration
 *    supabase/migrations/20260927_passkey_sponsor_budget.sql, NOT applied yet)
 *    that row-locks the UTC day's global row and the key's row, checks both
 *    caps and adds the cost in one transaction. Shared across serverless
 *    instances and cold starts. Errors throw, so the handler fails closed (503).
 *  - `InMemorySponsorBudget` (default): PREVIEW-ONLY, it lives in one serverless
 *    instance's memory, so a cold start resets it and parallel instances each
 *    get their own allowance.
 *
 * A caller may pass a TIGHTER per-key cap for one reservation (the everyday
 * mode's non-citizen tier); the effective key cap is min(store cap, tier cap).
 */

export interface ReserveLimits {
  /** Tighter per-key daily cap for this reservation; never loosens the store's cap. */
  perKeyDailyWei?: bigint;
}

export interface SponsorBudget {
  /** true = reserved (and counted); false = over a cap, nothing counted. Throws when the store is unreachable. */
  reserve(key: string, costWei: bigint, limits?: ReserveLimits): Promise<boolean>;
}

const minCap = (cap: bigint, limits?: ReserveLimits) =>
  limits?.perKeyDailyWei !== undefined && limits.perKeyDailyWei < cap ? limits.perKeyDailyWei : cap;

/** 0.01 xDAI per identity (budget key) per UTC day. */
export const DEFAULT_PER_KEY_DAILY_WEI = 10n ** 16n;
/** 0.05 xDAI across all accounts per UTC day. */
export const DEFAULT_GLOBAL_DAILY_WEI = 5n * 10n ** 16n;

/** 0.002 xDAI per NON-citizen passkey Safe per UTC day (everyday mode, onboarding tier). */
export const DEFAULT_ONBOARDING_DAILY_WEI = 2n * 10n ** 15n;

const DAY_MS = 86_400_000;

export class InMemorySponsorBudget implements SponsorBudget {
  private day = -1;
  private global = 0n;
  private perKey = new Map<string, bigint>();
  private readonly perKeyDailyWei: bigint;
  private readonly globalDailyWei: bigint;
  private readonly now: () => number;

  constructor(opts: { perKeyDailyWei?: bigint; globalDailyWei?: bigint; now?: () => number } = {}) {
    this.perKeyDailyWei = opts.perKeyDailyWei ?? DEFAULT_PER_KEY_DAILY_WEI;
    this.globalDailyWei = opts.globalDailyWei ?? DEFAULT_GLOBAL_DAILY_WEI;
    this.now = opts.now ?? Date.now;
  }

  async reserve(key: string, costWei: bigint, limits?: ReserveLimits): Promise<boolean> {
    if (costWei < 0n) return false;
    const day = Math.floor(this.now() / DAY_MS);
    if (day !== this.day) {
      this.day = day;
      this.global = 0n;
      this.perKey.clear();
    }
    const k = key.toLowerCase();
    const spent = this.perKey.get(k) ?? 0n;
    if (spent + costWei > minCap(this.perKeyDailyWei, limits)) return false;
    if (this.global + costWei > this.globalDailyWei) return false;
    this.perKey.set(k, spent + costWei);
    this.global += costWei;
    return true;
  }
}

/** Name of the atomic reserve function (security definer, service role only). */
export const SPONSOR_RESERVE_RPC = "passkey_sponsor_reserve";

/** The slice of a SupabaseClient this store needs (service-role client). */
export interface SponsorBudgetRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export class SponsorBudgetStoreError extends Error {
  constructor() {
    super("sponsor budget store unavailable");
    this.name = "SponsorBudgetStoreError";
  }
}

export class SupabaseSponsorBudget implements SponsorBudget {
  private readonly perKeyDailyWei: bigint;
  private readonly globalDailyWei: bigint;

  constructor(
    private readonly db: SponsorBudgetRpcClient,
    opts: { perKeyDailyWei?: bigint; globalDailyWei?: bigint } = {},
  ) {
    this.perKeyDailyWei = opts.perKeyDailyWei ?? DEFAULT_PER_KEY_DAILY_WEI;
    this.globalDailyWei = opts.globalDailyWei ?? DEFAULT_GLOBAL_DAILY_WEI;
  }

  async reserve(key: string, costWei: bigint, limits?: ReserveLimits): Promise<boolean> {
    if (costWei < 0n) return false;
    const r = await this.db.rpc(SPONSOR_RESERVE_RPC, {
      p_budget_key: key.toLowerCase(),
      // numeric(78,0) in Postgres; decimal strings keep full uint256 precision through PostgREST.
      p_cost_wei: costWei.toString(),
      p_key_cap_wei: minCap(this.perKeyDailyWei, limits).toString(),
      p_global_cap_wei: this.globalDailyWei.toString(),
    });
    if (r.error) throw new SponsorBudgetStoreError();
    return r.data === true;
  }
}

export function weiFromEnv(v: string | undefined, fallback: bigint): bigint {
  if (!v || !/^[0-9]{1,40}$/.test(v)) return fallback;
  return BigInt(v);
}

/**
 * PASSKEY_SPONSOR_DAILY_WEI / PASSKEY_SPONSOR_GLOBAL_DAILY_WEI (decimal wei); malformed = default.
 * PASSKEY_SPONSOR_BUDGET_STORE=supabase + a service-role client (from `makeClient`, null when the
 * Supabase env is missing) = the shared Postgres budget; anything else = in-memory.
 */
export function budgetFromEnv(
  env: Record<string, string | undefined> = process.env,
  now?: () => number,
  makeClient?: () => SponsorBudgetRpcClient | null,
): SponsorBudget {
  const caps = {
    perKeyDailyWei: weiFromEnv(env.PASSKEY_SPONSOR_DAILY_WEI, DEFAULT_PER_KEY_DAILY_WEI),
    globalDailyWei: weiFromEnv(env.PASSKEY_SPONSOR_GLOBAL_DAILY_WEI, DEFAULT_GLOBAL_DAILY_WEI),
  };
  if (env.PASSKEY_SPONSOR_BUDGET_STORE === "supabase") {
    const client = makeClient?.() ?? null;
    if (client) return new SupabaseSponsorBudget(client, caps);
    console.error("[passkey-sponsor] PASSKEY_SPONSOR_BUDGET_STORE=supabase but Supabase env is missing; using in-memory");
  }
  return new InMemorySponsorBudget({ ...caps, now });
}
