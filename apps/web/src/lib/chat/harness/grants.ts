// "Immer erlauben" surface (GET/PUT /api/chat/bots/:id/grants): which gated
// tools a bot could use that may be always-allowed (public/external, never money).
import { isGrantable } from "./policy";
import { allTools, enableKeyFor } from "./registry";
import type { HarnessTool, Risk } from "./types";

export interface GrantableTool { tool: string; label: string; risk: Risk }

/** First sentence of the German description, as a short label. */
export function toolLabel(t: Pick<HarnessTool, "description" | "name">): string {
  const first = t.description.split(/(?<=[.!?])\s/)[0]?.trim() || t.name;
  return first.length > 120 ? `${first.slice(0, 119)}…` : first;
}

export function grantableFrom(tools: HarnessTool[], botKeys: readonly string[] | null | undefined): GrantableTool[] {
  const keys = new Set(botKeys ?? []);
  return tools
    .filter((t) => isGrantable(t.risk))
    .filter((t) => { const k = enableKeyFor(t); return k === null || keys.has(k); })
    .map((t) => ({ tool: t.name, label: toolLabel(t), risk: t.risk }))
    .sort((a, b) => a.tool.localeCompare(b.tool));
}

export function grantableToolsFor(botKeys: readonly string[] | null | undefined): GrantableTool[] {
  return grantableFrom(allTools(), botKeys);
}
