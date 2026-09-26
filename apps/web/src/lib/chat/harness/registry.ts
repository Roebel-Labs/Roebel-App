// Tool registry (spec §2/§3.1). Packs register HarnessTools; toolsFor() turns
// the tools a bot enables into an ai v6 ToolSet whose execute is wrapped with
// the policy: read/private run + audit, public/external run when granted else
// ask for approval (approval part + pending agent_actions row), money always asks.
import { tool } from "ai";
import type { ToolSet } from "ai";
import { auditExecuted, insertAction } from "./audit";
import { asGatedRisk, buildApprovalPart } from "./approvals";
import {
  decide, gatedExecutionsToday, gatedToolsOffered, isGated, listGrants, loadPolicyState,
} from "./policy";
import type { PolicyState } from "./policy";
import { registerAllPacks } from "./packs/index";
import type { HarnessContext, HarnessTool, ToolRegistry } from "./types";

// Stored on globalThis so a pack that calls registerTool() at module load
// (import cycle registry → packs → registry) never hits an uninitialised binding.
const REGISTRY_KEY = Symbol.for("ortis.harness.tools");
function toolMap(): Map<string, HarnessTool> {
  const g = globalThis as unknown as Record<symbol, Map<string, HarnessTool> | undefined>;
  return (g[REGISTRY_KEY] ??= new Map());
}

export function registerTool<I>(t: HarnessTool<I>): void {
  if (!/^[a-z][a-z0-9_]*$/.test(t.name)) throw new Error(`[harness/registry] invalid tool name ${t.name}`);
  toolMap().set(t.name, t as HarnessTool);
}

export const registry: ToolRegistry = { registerTool };

let packsLoaded = false;
/** Registers every pack once (idempotent). */
export function ensurePacks(): void {
  if (packsLoaded) return;
  packsLoaded = true;
  registerAllPacks(registry);
}

export function getTool(name: string): HarnessTool | null {
  ensurePacks();
  return toolMap().get(name) ?? null;
}

export function allTools(): HarnessTool[] {
  ensurePacks();
  return [...toolMap().values()];
}

// ---- bot.tools keys → tools -------------------------------------------------------

/**
 * Per-tool enable keys (the strings in chat_bots.tools). Tools not listed use
 * their pack name as key ('roebel', 'user', 'memory', 'web', …); chat-pack tools
 * not listed are always on (routines).
 */
export const TOOL_KEYS: Record<string, string> = {
  ask_options: "ask_options",
  write_file: "files",
  update_file: "files",
  propose_calendar_event: "calendar",
  request_calendar_access: "calendar",
  note_to_team: "actions_test",
};

/** Default keys for new bots (mirrors the chat_bots.tools column default). */
export const DEFAULT_BOT_TOOLS = ["web_search", "files", "ask_options", "roebel", "user", "memory", "web"] as const;

export function enableKeyFor(t: Pick<HarnessTool, "name" | "pack">): string | null {
  return TOOL_KEYS[t.name] ?? (t.pack === "chat" ? null : t.pack);
}

/** Pure selection: enabled by the bot, available in ctx, gated tools only when offered. */
export function selectTools(
  tools: HarnessTool[], botKeys: readonly string[] | null | undefined, ctx: HarnessContext,
  opts: { gatedOffered: boolean },
): HarnessTool[] {
  const keys = new Set(botKeys ?? []);
  return tools.filter((t) => {
    const key = enableKeyFor(t);
    if (key !== null && !keys.has(key)) return false;
    if (isGated(t.risk) && !opts.gatedOffered) return false;
    if (t.available) {
      try { if (!t.available(ctx)) return false; } catch { return false; }
    }
    return true;
  });
}

// ---- policy wrapper ----------------------------------------------------------------

export const AWAITING_NOTE =
  "Freigabe angefragt. Der Mensch sieht jetzt eine Freigabe-Karte. Beende deine Antwort jetzt mit höchstens einem kurzen Satz " +
  "und führe die Aktion nicht auf anderem Weg aus. Nach der Entscheidung meldest du dich mit dem Ergebnis.";

export interface AwaitingApproval { status: "awaiting_approval"; actionId: string; note: string }

export function isAwaitingApproval(output: unknown): output is AwaitingApproval {
  return Boolean(output && typeof output === "object" && (output as { status?: unknown }).status === "awaiting_approval");
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Runs a tool (after policy said run) and writes the audit row. */
async function runAndAudit(t: HarnessTool, input: unknown, ctx: HarnessContext, summary: string): Promise<unknown> {
  const base = { wallet: ctx.wallet, threadId: ctx.threadId, botId: ctx.botId, taskId: ctx.taskId, tool: t.name, risk: t.risk, input, summary };
  try {
    const result = await t.execute(input, ctx);
    if (isGated(t.risk)) await insertAction({ ...base, status: "executed", result, executed: true });
    else await auditExecuted({ ...base, status: "executed", result, executed: true });
    return result;
  } catch (err) {
    console.error(`[harness] tool ${t.name} failed`, err);
    await auditExecuted({ ...base, status: "failed", error: errorText(err), executed: true });
    return { error: "Das Werkzeug ist gerade fehlgeschlagen. Sag das kurz und biete eine Alternative an." };
  }
}

/** Creates the pending action + approval card; returns the model-facing marker. */
async function requestApproval(t: HarnessTool, input: unknown, ctx: HarnessContext, summary: string): Promise<AwaitingApproval> {
  const risk = asGatedRisk(t.risk)!;
  const preview = t.preview ? await t.preview(input, ctx) : null;
  const row = await insertAction({
    wallet: ctx.wallet, threadId: ctx.threadId, botId: ctx.botId, taskId: ctx.taskId,
    tool: t.name, risk: t.risk, input, summary, status: "pending",
  });
  ctx.emitPart(buildApprovalPart({ actionId: row.id, tool: t.name, risk, summary, preview }));
  return { status: "awaiting_approval", actionId: row.id, note: AWAITING_NOTE };
}

export function wrapTool(
  t: HarnessTool, ctx: HarnessContext, state: { grants: Set<string>; policy: PolicyState },
): ToolSet[string] {
  return tool({
    description: t.description,
    inputSchema: t.inputSchema,
    execute: async (input: unknown) => {
      let summary = t.name;
      try { summary = t.summarize(input, ctx) || t.name; } catch { /* keep name */ }
      // Re-count right before a gated run: several calls in one turn share the cap.
      const usedToday = isGated(t.risk) ? await gatedExecutionsToday(ctx.wallet) : 0;
      const decision = decide(t.risk, { granted: state.grants.has(t.name), ...state.policy, usedToday });
      if (decision.kind === "blocked") return { error: decision.message };
      if (decision.kind === "approval") return requestApproval(t, input, ctx, summary);
      return runAndAudit(t, input, ctx, summary);
    },
  } as Parameters<typeof tool>[0]) as ToolSet[string];
}

/**
 * The bot's tools for this turn as an ai ToolSet (policy-wrapped). Loads the
 * kill switch, pause state and grants once per turn.
 */
export async function toolsFor({ bot, ctx }: {
  bot: { id: string; tools: string[] | null };
  ctx: HarnessContext;
}): Promise<ToolSet> {
  const tools = allTools();
  const needsPolicy = tools.some((t) => isGated(t.risk));
  const policy: PolicyState = needsPolicy
    ? await loadPolicyState(ctx.wallet).catch((err) => {
        console.error("[harness/registry] policy state failed", err);
        return { actionsEnabled: false, paused: false, usedToday: 0 };
      })
    : { actionsEnabled: true, paused: false, usedToday: 0 };
  const selected = selectTools(tools, bot.tools, ctx, { gatedOffered: gatedToolsOffered(policy) });
  const grants = selected.some((t) => isGated(t.risk))
    ? new Set(await listGrants(ctx.wallet, bot.id).catch(() => [] as string[]))
    : new Set<string>();
  const set: ToolSet = {};
  for (const t of selected) set[t.name] = wrapTool(t, ctx, { grants, policy });
  return set;
}

/** Executes an approved action's tool outside the model loop (approve route). */
export async function executeApproved(
  t: HarnessTool, rawInput: unknown, ctx: HarnessContext,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const parsed = t.inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Die gespeicherten Angaben sind ungültig." };
  try {
    return { ok: true, result: await t.execute(parsed.data, ctx) };
  } catch (err) {
    console.error(`[harness] approved tool ${t.name} failed`, err);
    return { ok: false, error: errorText(err) };
  }
}
