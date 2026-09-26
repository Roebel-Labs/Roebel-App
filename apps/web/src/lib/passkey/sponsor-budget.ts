/**
 * Daily sponsorship budget for /api/passkey/sponsor.
 *
 * The handler reserves the voucher's `maxCostWei` (EntryPoint v0.7 required
 * prefund, the most the paymaster can be charged) BEFORE signing, keyed by the
 * citizen identity the policy bound the op to (lowercased): the legacy
 * thirdweb account, the citizen Safe itself, or the wallet being recovered. A refused reservation spends
 * nothing.
 *
 * `InMemorySponsorBudget` is PREVIEW-ONLY: it lives in one serverless
 * instance's memory, so a cold start resets it and parallel instances each
 * get their own allowance. A persistent (shared) budget is a production gate.
 */

export interface SponsorBudget {
  /** true = reserved (and counted); false = over a cap, nothing counted. */
  reserve(key: string, costWei: bigint): Promise<boolean>;
}

/** 0.01 xDAI per identity (budget key) per UTC day. */
export const DEFAULT_PER_KEY_DAILY_WEI = 10n ** 16n;
/** 0.05 xDAI across all accounts per UTC day. */
export const DEFAULT_GLOBAL_DAILY_WEI = 5n * 10n ** 16n;

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

  async reserve(key: string, costWei: bigint): Promise<boolean> {
    if (costWei < 0n) return false;
    const day = Math.floor(this.now() / DAY_MS);
    if (day !== this.day) {
      this.day = day;
      this.global = 0n;
      this.perKey.clear();
    }
    const k = key.toLowerCase();
    const spent = this.perKey.get(k) ?? 0n;
    if (spent + costWei > this.perKeyDailyWei) return false;
    if (this.global + costWei > this.globalDailyWei) return false;
    this.perKey.set(k, spent + costWei);
    this.global += costWei;
    return true;
  }
}

function weiFromEnv(v: string | undefined, fallback: bigint): bigint {
  if (!v || !/^[0-9]{1,40}$/.test(v)) return fallback;
  return BigInt(v);
}

/** PASSKEY_SPONSOR_DAILY_WEI / PASSKEY_SPONSOR_GLOBAL_DAILY_WEI (decimal wei); malformed = default. */
export function budgetFromEnv(
  env: Record<string, string | undefined> = process.env,
  now?: () => number,
): InMemorySponsorBudget {
  return new InMemorySponsorBudget({
    perKeyDailyWei: weiFromEnv(env.PASSKEY_SPONSOR_DAILY_WEI, DEFAULT_PER_KEY_DAILY_WEI),
    globalDailyWei: weiFromEnv(env.PASSKEY_SPONSOR_GLOBAL_DAILY_WEI, DEFAULT_GLOBAL_DAILY_WEI),
    now,
  });
}
