// Harness policy (spec §3.1): risk → run | approval | blocked, plus the state it
// depends on — "immer erlauben" grants (agent_grants), the daily cap on gated
// executions, the kill switch app_settings.agent_actions_enabled (missing =
// enabled) and the per-user pause (agent_prefs.paused).
// The decision itself is pure (decide) so it is unit-tested without a DB.
import { db } from "../store";
import { startOfZonedDay } from "../time";
import type { Risk } from "./types";

/** Gated executions (public / external / money) per wallet and Berlin day. */
export const DAILY_GATED_CAP = 20;
export const KILL_SWITCH_KEY = "agent_actions_enabled";

export const GATED_RISKS: readonly Risk[] = ["public", "external", "money"];
export const isGated = (risk: Risk): boolean => GATED_RISKS.includes(risk);
/** Money is never grantable ("immer erlauben" is only offered for public/external). */
export const isGrantable = (risk: Risk): boolean => risk === "public" || risk === "external";

export interface PolicyState {
  /** Kill switch: false → gated tools unavailable. */
  actionsEnabled: boolean;
  /** Per-user pause (agent_prefs.paused). */
  paused: boolean;
  /** Gated executions today (Berlin day). */
  usedToday: number;
  cap?: number;
}

export type PolicyDecision =
  | { kind: "run" }
  | { kind: "approval" }
  | { kind: "blocked"; reason: "disabled" | "paused" | "cap"; message: string };

export const BLOCKED_MESSAGES = {
  disabled: "Aktionen sind gerade zentral abgeschaltet. Nur Lesen und Private Werkzeuge funktionieren.",
  paused: "Der Mensch hat Aktionen für seine Bots pausiert. Schlag vor, was du tun würdest, und lass ihn es selbst erledigen.",
  cap: `Das Tageslimit von ${DAILY_GATED_CAP} freigabepflichtigen Aktionen ist erreicht. Morgen geht es weiter.`,
} as const;

/** Pure policy decision for one tool call. */
export function decide(risk: Risk, opts: { granted: boolean } & PolicyState): PolicyDecision {
  if (!isGated(risk)) return { kind: "run" };
  if (!opts.actionsEnabled) return { kind: "blocked", reason: "disabled", message: BLOCKED_MESSAGES.disabled };
  if (opts.paused) return { kind: "blocked", reason: "paused", message: BLOCKED_MESSAGES.paused };
  if (opts.usedToday >= (opts.cap ?? DAILY_GATED_CAP)) return { kind: "blocked", reason: "cap", message: BLOCKED_MESSAGES.cap };
  if (risk === "money") return { kind: "approval" };
  return opts.granted && isGrantable(risk) ? { kind: "run" } : { kind: "approval" };
}

/** Whether gated tools are offered at all for this turn (kill switch + pause). */
export function gatedToolsOffered(state: Pick<PolicyState, "actionsEnabled" | "paused">): boolean {
  return state.actionsEnabled && !state.paused;
}

/** Parses the app_settings value: only an explicit 'false' / '0' / 'off' disables. */
export function parseEnabledSetting(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return !["false", "0", "off", "no"].includes(value.trim().toLowerCase());
}

// ---- state loaders (service role) ----------------------------------------------

export async function actionsEnabled(): Promise<boolean> {
  const res = await db().from("app_settings").select("value").eq("key", KILL_SWITCH_KEY).maybeSingle();
  if (res.error) {
    console.error("[harness/policy] kill switch read failed", res.error.message);
    return true;
  }
  return parseEnabledSetting((res.data as { value: string | null } | null)?.value ?? null);
}

export async function isPaused(wallet: string): Promise<boolean> {
  const res = await db().from("agent_prefs").select("paused").eq("wallet", wallet).maybeSingle();
  if (res.error) {
    console.error("[harness/policy] prefs read failed", res.error.message);
    return false;
  }
  return Boolean((res.data as { paused: boolean } | null)?.paused);
}

export async function gatedExecutionsToday(wallet: string, now: Date = new Date()): Promise<number> {
  const res = await db().from("agent_actions").select("id", { count: "exact", head: true })
    .eq("wallet", wallet).eq("status", "executed").in("risk", GATED_RISKS as Risk[])
    .gte("executed_at", startOfZonedDay(now).toISOString());
  if (res.error) throw new Error(`[harness/policy] cap count: ${res.error.message}`);
  return res.count ?? 0;
}

export async function loadPolicyState(wallet: string): Promise<PolicyState> {
  const [enabled, paused, usedToday] = await Promise.all([
    actionsEnabled(), isPaused(wallet), gatedExecutionsToday(wallet),
  ]);
  return { actionsEnabled: enabled, paused, usedToday };
}

// ---- grants ---------------------------------------------------------------------

export async function listGrants(wallet: string, botId: string): Promise<string[]> {
  const res = await db().from("agent_grants").select("tool").eq("wallet", wallet).eq("bot_id", botId).order("tool");
  if (res.error) throw new Error(`[harness/policy] grants: ${res.error.message}`);
  return (res.data as { tool: string }[]).map((r) => r.tool);
}

export async function addGrant(wallet: string, botId: string, tool: string): Promise<void> {
  const res = await db().from("agent_grants").upsert({ wallet, bot_id: botId, tool }, { onConflict: "wallet,bot_id,tool", ignoreDuplicates: true });
  if (res.error) throw new Error(`[harness/policy] add grant: ${res.error.message}`);
}

/** Replaces the bot's grant set with `tools` (caller filters to grantable tools). */
export async function setGrants(wallet: string, botId: string, tools: string[]): Promise<string[]> {
  const unique = [...new Set(tools)].sort();
  const del = await db().from("agent_grants").delete().eq("wallet", wallet).eq("bot_id", botId);
  if (del.error) throw new Error(`[harness/policy] clear grants: ${del.error.message}`);
  if (unique.length) {
    const ins = await db().from("agent_grants").insert(unique.map((tool) => ({ wallet, bot_id: botId, tool })));
    if (ins.error) throw new Error(`[harness/policy] set grants: ${ins.error.message}`);
  }
  return unique;
}
