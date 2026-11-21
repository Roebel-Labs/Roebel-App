/**
 * Daily sponsorship budget for /api/passkey/sponsor.
 *
 * The handler reserves the voucher's `maxCostWei` (EntryPoint v0.7 required
 * prefund, the most the paymaster can be charged) BEFORE signing, keyed by the
 * citizen identity the policy bound the op to (lowercased): the legacy
 * thirdweb account, the citizen Safe itself, or the citizen wallet being recovered (the recovery of a
 * GUEST Safe is charged to the submitting Safe, never to the guest wallet). A refused reservation
 * spends nothing.
 *
 * Two stores:
 *  - `SupabaseSponsorBudget` (env PASSKEY_SPONSOR_BUDGET_STORE=supabase): one
 *    atomic RPC `passkey_sponsor_reserve_v2` (migrations
 *    supabase/migrations/20260927_passkey_sponsor_budget.sql +
 *    20261117a_passkey_sponsor_guest_cap.sql, NOT applied yet) that row-locks
 *    the UTC day's global row, the group row (guests) and the key's row, checks
 *    every cap and adds the cost in one transaction. Shared across serverless
 *    instances and cold starts. Errors throw, so the handler fails closed (503).
 *  - `InMemorySponsorBudget` (default): PREVIEW-ONLY, it lives in one serverless
 *    instance's memory, so a cold start resets it and parallel instances each
 *    get their own allowance.
 *
 * A caller may pass a TIGHTER per-key cap for one reservation (a guest
 * account); the effective key cap is min(store cap, tier cap).
 *
 * A caller may also name a GROUP with its own daily cap: every guest Safe's
 * reservation is counted against the shared `guests` total as well, so the
 * guests together can never spend more than that cap in a UTC day, however
 * many Safes they create. A reservation with a group is counted against the
 * key, the group and the global total at once; any cap reached = refused and
 * nothing counted. Reservations without a group (citizens) never touch it.
 *
 * SETTLE (security review M-2; device-session mint ops only, for now): a reservation may carry an
 * id = `<sender>:<nonce hex>` (`reservationIdOf`) and the voucher's validUntil. Only one op per
 * (sender, nonce) can ever land, so there is one reservation per id: a repeated request for the
 * same id tops the reservation up to the larger prefund instead of reserving again. After the op
 * lands, `settle(id, actualGasCost)` (the SERVER reads actualGasCost from the EntryPoint's
 * UserOperationEvent, sponsor-settle.ts) gives back `reserved - actual` on that day's rows; an op
 * that never lands is `release`d by the lazy sweep once its voucher has expired. Unsettled =
 * charged in full (fail safe). Supabase: passkey_sponsor_reserve_v3 / _settle_v1 / _release_v1 /
 * _expired_v1 (migration 20261121b_passkey_sponsor_settle.sql, NOT applied yet).
 *
 * A key in its own namespace (`session:<safe>`) may name its own per-key cap (`keyCapWei`), which
 * REPLACES the store's per-key cap for that reservation; any other key with `keyCapWei` is refused.
 */
import type { Hex } from "viem";

export interface ReserveLimits {
  /** Tighter per-key daily cap for this reservation; never loosens the store's cap. */
  perKeyDailyWei?: bigint;
  /** A shared daily total this reservation also counts against (the guest cap). */
  group?: { key: string; dailyWei: bigint };
  /** Own cap of a `session:` key; replaces the store's per-key cap. Any other key with it is refused. */
  keyCapWei?: bigint;
  /** A settle-able reservation (one per sender + nonce), open until settled, released or swept after `expiresAt`. */
  reservation?: { id: string; sender: Hex; nonce: bigint; expiresAt: number };
}

/** settle(): the reservation was settled now / was already settled / is unknown to the store. */
export type SettleResult = "settled" | "already_settled" | "unknown";

/** An open reservation whose voucher expired (input of the lazy sweep). */
export interface ExpiredReservation {
  id: string;
  sender: Hex;
  nonce: bigint;
  /** Unix seconds the reservation was first made. */
  createdAt: number;
}

export interface SponsorBudget {
  /** true = reserved (and counted); false = over a cap, nothing counted. Throws when the store is unreachable. */
  reserve(key: string, costWei: bigint, limits?: ReserveLimits): Promise<boolean>;
  /** Charge the op's actual cost (capped at the reservation) instead of the reserved prefund. */
  settle?(id: string, actualWei: bigint): Promise<SettleResult>;
  /** Give the whole reservation back (the op never landed). true = released. */
  release?(id: string): Promise<boolean>;
  /** Open reservations whose `expiresAt` is before `beforeSeconds`, oldest first, optionally of one key. */
  expiredReservations?(o: { beforeSeconds: number; budgetKey?: string; limit: number }): Promise<ExpiredReservation[]>;
}

/** The one reservation an op can have: its sender and EntryPoint nonce. */
export const reservationIdOf = (sender: Hex, nonce: bigint) => `${sender.toLowerCase()}:0x${nonce.toString(16)}`;

const OWN_CAP_KEY = /^session:0x[0-9a-f]{40}$/;

const minCap = (cap: bigint, limits?: ReserveLimits) =>
  limits?.perKeyDailyWei !== undefined && limits.perKeyDailyWei < cap ? limits.perKeyDailyWei : cap;

/** The per-key cap for this reservation, or null when `keyCapWei` is used outside its namespace. */
function keyCap(storeCap: bigint, key: string, limits?: ReserveLimits): bigint | null {
  if (limits?.keyCapWei === undefined) return minCap(storeCap, limits);
  if (!OWN_CAP_KEY.test(key) || limits.keyCapWei < 0n) return null;
  return minCap(limits.keyCapWei, limits);
}

/** 0.01 xDAI per identity (budget key) per UTC day. */
export const DEFAULT_PER_KEY_DAILY_WEI = 10n ** 16n;
/**
 * 0.25 xDAI across all accounts per UTC day (was 0.05 until the M-2 fix): a device-session user
 * claiming hourly settles to ~0.031 xDAI/day (48 ops x ~320k gas x 2 gwei), so 5 such users take
 * ~0.154 xDAI and ~0.096 xDAI stays for everyday ops and open reservations.
 */
export const DEFAULT_GLOBAL_DAILY_WEI = 25n * 10n ** 16n;

/** 0.002 xDAI per guest (NON-citizen) account per UTC day: every guest result, any mode. */
export const DEFAULT_ONBOARDING_DAILY_WEI = 2n * 10n ** 15n;

/** The one group the database accepts: every guest (non-citizen) Safe together. */
export const GUEST_GROUP_KEY = "guests";
/** 0.02 xDAI across ALL guest Safes per UTC day. */
export const DEFAULT_GUEST_GLOBAL_DAILY_WEI = 2n * 10n ** 16n;

const DAY_MS = 86_400_000;

type MemReservation = {
  key: string;
  group?: string;
  day: number;
  reservedWei: bigint;
  status: "open" | "settled" | "released";
  sender: Hex;
  nonce: bigint;
  expiresAt: number;
  createdAt: number;
};

export class InMemorySponsorBudget implements SponsorBudget {
  private day = -1;
  private global = 0n;
  private perKey = new Map<string, bigint>();
  private perGroup = new Map<string, bigint>();
  private reservations = new Map<string, MemReservation>();
  private readonly perKeyDailyWei: bigint;
  private readonly globalDailyWei: bigint;
  private readonly now: () => number;

  constructor(opts: { perKeyDailyWei?: bigint; globalDailyWei?: bigint; now?: () => number } = {}) {
    this.perKeyDailyWei = opts.perKeyDailyWei ?? DEFAULT_PER_KEY_DAILY_WEI;
    this.globalDailyWei = opts.globalDailyWei ?? DEFAULT_GLOBAL_DAILY_WEI;
    this.now = opts.now ?? Date.now;
  }

  private rollDay(): number {
    const day = Math.floor(this.now() / DAY_MS);
    if (day !== this.day) {
      this.day = day;
      this.global = 0n;
      this.perKey.clear();
      this.perGroup.clear();
    }
    return day;
  }

  async reserve(key: string, costWei: bigint, limits?: ReserveLimits): Promise<boolean> {
    if (costWei < 0n) return false;
    const day = this.rollDay();
    const k = key.toLowerCase();
    const cap = keyCap(this.perKeyDailyWei, k, limits);
    if (cap === null) return false;
    const group = limits?.group;
    // One reservation per (sender, nonce): a repeat tops up to the larger prefund.
    const res = limits?.reservation;
    const prior = res ? this.reservations.get(res.id) : undefined;
    let cost = costWei;
    if (prior?.status === "settled") return false; // that nonce has landed already
    if (prior?.status === "open") {
      if (prior.day !== day || prior.key !== k || prior.group !== group?.key) return false;
      cost = costWei > prior.reservedWei ? costWei - prior.reservedWei : 0n;
    }
    const spent = this.perKey.get(k) ?? 0n;
    if (spent + cost > cap) return false;
    if (this.global + cost > this.globalDailyWei) return false;
    const groupSpent = group ? (this.perGroup.get(group.key) ?? 0n) : 0n;
    if (group && groupSpent + cost > group.dailyWei) return false;
    // All checks passed: count everywhere (no await between check and add).
    this.perKey.set(k, spent + cost);
    this.global += cost;
    if (group) this.perGroup.set(group.key, groupSpent + cost);
    if (res) {
      if (prior?.status === "open") {
        prior.reservedWei += cost;
        prior.expiresAt = Math.max(prior.expiresAt, res.expiresAt);
      } else {
        this.reservations.set(res.id, {
          key: k,
          group: group?.key,
          day,
          reservedWei: cost,
          status: "open",
          sender: res.sender,
          nonce: res.nonce,
          expiresAt: res.expiresAt,
          createdAt: Math.floor(this.now() / 1000),
        });
      }
    }
    return true;
  }

  /** Adds `delta` (may be negative) to the rows of a reservation's day, if that day is still held. */
  private adjust(r: MemReservation, delta: bigint) {
    this.rollDay();
    if (r.day !== this.day) return; // an earlier day's counters are gone (they no longer cap anything)
    const sub = (v: bigint) => (v + delta < 0n ? 0n : v + delta);
    this.global = sub(this.global);
    this.perKey.set(r.key, sub(this.perKey.get(r.key) ?? 0n));
    if (r.group) this.perGroup.set(r.group, sub(this.perGroup.get(r.group) ?? 0n));
  }

  async settle(id: string, actualWei: bigint): Promise<SettleResult> {
    const r = this.reservations.get(id);
    if (!r) return "unknown";
    if (r.status === "settled") return "already_settled";
    const actual = actualWei < 0n ? 0n : actualWei;
    const charge = actual < r.reservedWei ? actual : r.reservedWei;
    // open: give back reserved - charge; released (swept, but it did land): charge again.
    this.adjust(r, r.status === "open" ? charge - r.reservedWei : charge);
    r.status = "settled";
    return "settled";
  }

  async release(id: string): Promise<boolean> {
    const r = this.reservations.get(id);
    if (!r || r.status !== "open") return false;
    this.adjust(r, -r.reservedWei);
    r.status = "released";
    return true;
  }

  async expiredReservations(o: { beforeSeconds: number; budgetKey?: string; limit: number }): Promise<ExpiredReservation[]> {
    const key = o.budgetKey?.toLowerCase();
    return [...this.reservations.entries()]
      .filter(([, r]) => r.status === "open" && r.expiresAt < o.beforeSeconds && (key === undefined || r.key === key))
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, Math.max(0, o.limit))
      .map(([id, r]) => ({ id, sender: r.sender, nonce: r.nonce, createdAt: r.createdAt }));
  }
}

/** Name of the atomic reserve function (security definer, service role only). */
export const SPONSOR_RESERVE_RPC = "passkey_sponsor_reserve_v2";
/** Reserve WITH a settle-able reservation (migration 20261121b_passkey_sponsor_settle.sql). */
export const SPONSOR_RESERVE_V3_RPC = "passkey_sponsor_reserve_v3";
export const SPONSOR_SETTLE_RPC = "passkey_sponsor_settle_v1";
export const SPONSOR_RELEASE_RPC = "passkey_sponsor_release_v1";
export const SPONSOR_EXPIRED_RPC = "passkey_sponsor_expired_v1";

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
    const k = key.toLowerCase();
    const cap = keyCap(this.perKeyDailyWei, k, limits);
    if (cap === null) return false;
    const args = {
      p_budget_key: k,
      // numeric(78,0) in Postgres; decimal strings keep full uint256 precision through PostgREST.
      p_cost_wei: costWei.toString(),
      p_key_cap_wei: cap.toString(),
      p_global_cap_wei: this.globalDailyWei.toString(),
      p_group_key: limits?.group?.key ?? null,
      p_group_cap_wei: limits?.group ? limits.group.dailyWei.toString() : null,
    };
    const res = limits?.reservation;
    const r = res
      ? await this.db.rpc(SPONSOR_RESERVE_V3_RPC, {
          ...args,
          p_reservation_id: res.id,
          p_sender: res.sender.toLowerCase(),
          p_nonce: res.nonce.toString(),
          p_expires_at: new Date(res.expiresAt * 1000).toISOString(),
        })
      : await this.db.rpc(SPONSOR_RESERVE_RPC, args);
    if (r.error) throw new SponsorBudgetStoreError();
    return r.data === true;
  }

  async settle(id: string, actualWei: bigint): Promise<SettleResult> {
    const r = await this.db.rpc(SPONSOR_SETTLE_RPC, {
      p_reservation_id: id,
      p_actual_wei: (actualWei < 0n ? 0n : actualWei).toString(),
    });
    if (r.error) throw new SponsorBudgetStoreError();
    return r.data === "settled" || r.data === "already_settled" ? r.data : "unknown";
  }

  async release(id: string): Promise<boolean> {
    const r = await this.db.rpc(SPONSOR_RELEASE_RPC, { p_reservation_id: id });
    if (r.error) throw new SponsorBudgetStoreError();
    return r.data === true;
  }

  async expiredReservations(o: { beforeSeconds: number; budgetKey?: string; limit: number }): Promise<ExpiredReservation[]> {
    const r = await this.db.rpc(SPONSOR_EXPIRED_RPC, {
      p_before: new Date(o.beforeSeconds * 1000).toISOString(),
      p_budget_key: o.budgetKey?.toLowerCase() ?? null,
      p_limit: o.limit,
    });
    if (r.error) throw new SponsorBudgetStoreError();
    if (!Array.isArray(r.data)) return [];
    const out: ExpiredReservation[] = [];
    for (const row of r.data as Record<string, unknown>[]) {
      const sender = row.sender;
      const nonce = row.nonce;
      if (typeof row.reservation_id !== "string" || typeof sender !== "string" || !/^0x[0-9a-f]{40}$/.test(sender)) continue;
      if (typeof nonce !== "string" || !/^[0-9]{1,78}$/.test(nonce)) continue;
      out.push({ id: row.reservation_id, sender: sender as Hex, nonce: BigInt(nonce), createdAt: Number(row.created_at) || 0 });
    }
    return out;
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
