/**
 * Gas budget for sponsored mini-app calls (sponsor mode "miniapp", owner decision 2 of
 * the mini-app plans). Separate from the citizens' everyday sponsor budget
 * (sponsor-budget.ts): a mini-app reservation never touches those counters, so an app
 * that uses up its gas cannot stop anyone from voting or collecting Röbel Münzen.
 *
 * Three counters, all must have room, a refused reservation counts nothing:
 *  - the app's lifetime budget (mini_apps.gas_budget_wei, granted at review; a new app has 0),
 *  - the person's allowance per UTC day across ALL mini apps (MINIAPP_GAS_PER_PERSON_DAILY_WEI),
 *  - the day's total across all mini apps (MINIAPP_GAS_GLOBAL_DAILY_WEI).
 * Like the everyday budget it counts the reserved maximum of each operation (the
 * EntryPoint prefund), so it drains faster than real gas use.
 *
 * Stores:
 *  - `SupabaseMiniAppGasBudget` (PASSKEY_SPONSOR_BUDGET_STORE=supabase): one atomic RPC
 *    `mini_app_gas_reserve` (migration 20261117mb_mini_app_contracts_gas.sql, NOT applied).
 *    Errors throw, so the handler fails closed.
 *  - `InMemoryMiniAppGasBudget`: PREVIEW-ONLY, per serverless instance; the app budget comes
 *    from `appBudgetWei(id)` and the app's spend is counted in memory only.
 */

export type GasVerdict = "ok" | "app_budget" | "person_budget" | "global_budget";

export interface MiniAppGasBudget {
  /** Throws when the store is unreachable. */
  reserve(miniAppId: string, person: string, costWei: bigint): Promise<GasVerdict>;
}

/** 0.003 xDAI per person per UTC day across all mini apps. */
export const DEFAULT_MINIAPP_PER_PERSON_DAILY_WEI = 3n * 10n ** 15n;
/** 0.05 xDAI across all mini apps per UTC day. */
export const DEFAULT_MINIAPP_GLOBAL_DAILY_WEI = 5n * 10n ** 16n;

const DAY_MS = 86_400_000;

export class InMemoryMiniAppGasBudget implements MiniAppGasBudget {
  private day = -1;
  private global = 0n;
  private perPerson = new Map<string, bigint>();
  /** Lifetime spend per app (never reset). */
  private perApp = new Map<string, bigint>();
  private readonly appBudgetWei: (id: string) => bigint;
  private readonly perPersonDailyWei: bigint;
  private readonly globalDailyWei: bigint;
  private readonly now: () => number;

  constructor(opts: {
    appBudgetWei(id: string): bigint;
    perPersonDailyWei?: bigint;
    globalDailyWei?: bigint;
    now?: () => number;
  }) {
    this.appBudgetWei = opts.appBudgetWei;
    this.perPersonDailyWei = opts.perPersonDailyWei ?? DEFAULT_MINIAPP_PER_PERSON_DAILY_WEI;
    this.globalDailyWei = opts.globalDailyWei ?? DEFAULT_MINIAPP_GLOBAL_DAILY_WEI;
    this.now = opts.now ?? Date.now;
  }

  async reserve(miniAppId: string, person: string, costWei: bigint): Promise<GasVerdict> {
    if (costWei < 0n) return "app_budget";
    const day = Math.floor(this.now() / DAY_MS);
    if (day !== this.day) {
      this.day = day;
      this.global = 0n;
      this.perPerson.clear();
    }
    const appSpent = this.perApp.get(miniAppId) ?? 0n;
    if (appSpent + costWei > this.appBudgetWei(miniAppId)) return "app_budget";
    const p = person.toLowerCase();
    const personSpent = this.perPerson.get(p) ?? 0n;
    if (personSpent + costWei > this.perPersonDailyWei) return "person_budget";
    if (this.global + costWei > this.globalDailyWei) return "global_budget";
    // All checks passed: count everywhere (no await between check and add).
    this.perApp.set(miniAppId, appSpent + costWei);
    this.perPerson.set(p, personSpent + costWei);
    this.global += costWei;
    return "ok";
  }
}

/** Name of the atomic reserve function (security definer, service role only). */
export const MINIAPP_GAS_RESERVE_RPC = "mini_app_gas_reserve";

export interface MiniAppGasRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export class MiniAppGasStoreError extends Error {
  constructor() {
    super("mini-app gas budget store unavailable");
    this.name = "MiniAppGasStoreError";
  }
}

const VERDICTS: readonly GasVerdict[] = ["ok", "app_budget", "person_budget", "global_budget"];

export class SupabaseMiniAppGasBudget implements MiniAppGasBudget {
  private readonly perPersonDailyWei: bigint;
  private readonly globalDailyWei: bigint;

  constructor(
    private readonly db: MiniAppGasRpcClient,
    caps: { perPersonDailyWei?: bigint; globalDailyWei?: bigint } = {},
  ) {
    this.perPersonDailyWei = caps.perPersonDailyWei ?? DEFAULT_MINIAPP_PER_PERSON_DAILY_WEI;
    this.globalDailyWei = caps.globalDailyWei ?? DEFAULT_MINIAPP_GLOBAL_DAILY_WEI;
  }

  async reserve(miniAppId: string, person: string, costWei: bigint): Promise<GasVerdict> {
    if (costWei < 0n) return "app_budget";
    const r = await this.db.rpc(MINIAPP_GAS_RESERVE_RPC, {
      p_mini_app_id: miniAppId,
      p_person: person.toLowerCase(),
      // numeric(78,0): decimal strings keep full precision through PostgREST.
      p_cost_wei: costWei.toString(),
      p_person_cap_wei: this.perPersonDailyWei.toString(),
      p_global_cap_wei: this.globalDailyWei.toString(),
    });
    if (r.error) throw new MiniAppGasStoreError();
    if (typeof r.data !== "string" || !VERDICTS.includes(r.data as GasVerdict)) throw new MiniAppGasStoreError();
    return r.data as GasVerdict;
  }
}

function weiFromEnv(v: string | undefined, fallback: bigint): bigint {
  if (!v || !/^[0-9]{1,40}$/.test(v)) return fallback;
  return BigInt(v);
}

/**
 * MINIAPP_GAS_PER_PERSON_DAILY_WEI / MINIAPP_GAS_GLOBAL_DAILY_WEI (decimal wei; malformed =
 * default). PASSKEY_SPONSOR_BUDGET_STORE=supabase + a service-role client = the Postgres
 * store; else in-memory, with the app budgets from `appBudgetWei` (default: none = 0).
 */
export function miniAppGasBudgetFromEnv(
  env: Record<string, string | undefined> = process.env,
  makeClient?: () => MiniAppGasRpcClient | null,
  appBudgetWei: (id: string) => bigint = () => 0n,
): MiniAppGasBudget {
  const caps = {
    perPersonDailyWei: weiFromEnv(env.MINIAPP_GAS_PER_PERSON_DAILY_WEI, DEFAULT_MINIAPP_PER_PERSON_DAILY_WEI),
    globalDailyWei: weiFromEnv(env.MINIAPP_GAS_GLOBAL_DAILY_WEI, DEFAULT_MINIAPP_GLOBAL_DAILY_WEI),
  };
  if (env.PASSKEY_SPONSOR_BUDGET_STORE === "supabase") {
    const client = makeClient?.() ?? null;
    if (client) return new SupabaseMiniAppGasBudget(client, caps);
    console.error("[passkey-sponsor] PASSKEY_SPONSOR_BUDGET_STORE=supabase but Supabase env is missing; mini-app gas in memory");
  }
  return new InMemoryMiniAppGasBudget({ ...caps, appBudgetWei });
}
