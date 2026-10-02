import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asset, Rail } from "./constants";

export type Db = SupabaseClient;
export type TaskPayoutRail = Extract<Rail, "manual_safe" | "safe_eure">;
export interface VorhabenSettings {
  platformFeeBps: number;
  platformSafe: string;
  wahlhelferAsset: Asset;
  wahlhelferAmount: string;
  budgetFeeRail: Rail;
  /** Rail of an EURe task reward and its platform fee: manual_safe (Attester pays + records the hash) or safe_eure. */
  taskPayoutRail: TaskPayoutRail;
  windowDays: number;
  dispatchEnabled: boolean;
}

const ASSETS: Asset[] = ["EURe", "EURC", "MUENZEN", "XDAI"];
const RAILS: Rail[] = ["funder_muenzen", "funder_xdai", "safe_eure", "manual_safe", "safe_eurc_base"];
const TASK_RAILS: TaskPayoutRail[] = ["manual_safe", "safe_eure"];

export function parseSettings(rows: { key: string; value: string }[]): VorhabenSettings {
  const m = new Map(rows.map((r) => [r.key, r.value.trim()]));
  const get = (k: string) => { const v = m.get(k); if (v === undefined || v === "") throw new Error(`vorhaben_settings.${k} missing`); return v; };
  const int = (k: string) => { const n = Number(get(k)); if (!Number.isInteger(n) || n < 0) throw new Error(`vorhaben_settings.${k} invalid`); return n; };
  const platformSafe = get("platform_safe_address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(platformSafe)) throw new Error("vorhaben_settings.platform_safe_address invalid");
  const asset = get("wahlhelfer_reward_asset") as Asset;
  if (!ASSETS.includes(asset)) throw new Error("vorhaben_settings.wahlhelfer_reward_asset invalid");
  const rail = get("budget_fee_rail") as Rail;
  if (!RAILS.includes(rail)) throw new Error("vorhaben_settings.budget_fee_rail invalid");
  const amount = get("wahlhelfer_reward_amount");
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("vorhaben_settings.wahlhelfer_reward_amount invalid");
  // Optional: task payouts are manual until the operator opts back into Safe proposals.
  const taskRail = (m.get("task_payout_rail") || "manual_safe") as TaskPayoutRail;
  if (!TASK_RAILS.includes(taskRail)) throw new Error("vorhaben_settings.task_payout_rail invalid");
  const bps = int("platform_fee_bps");
  if (bps > 10000) throw new Error("vorhaben_settings.platform_fee_bps invalid");
  return {
    platformFeeBps: bps, platformSafe, wahlhelferAsset: asset, wahlhelferAmount: amount, budgetFeeRail: rail,
    taskPayoutRail: taskRail, windowDays: int("tally_confirm_window_days"), dispatchEnabled: get("dispatch_enabled") === "true",
  };
}

export async function loadSettings(db: Db): Promise<VorhabenSettings> {
  const { data, error } = await db.from("vorhaben_settings").select("key, value");
  if (error) throw new Error(`vorhaben_settings read failed: ${error.message}`);
  return parseSettings((data ?? []) as { key: string; value: string }[]);
}
