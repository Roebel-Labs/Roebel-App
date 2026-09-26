// Pack 'connectors' (bot tool key 'connectors'): the wallet's own connectors,
// resolved per turn through a dynamic tool source (the static registry cannot
// know a user's MCP servers).
//  - MCP: every cached tool of an active server → `mcp_<server>_<tool>`;
//    risk 'read' when the server marks it readOnlyHint, else 'external' (approval).
//    execute = connect (5 s) + callTool (30 s) + close, output ≤ 8k chars.
//  - Google: the five google_* tools when GOOGLE_OAUTH_CLIENT_ID/SECRET are set
//    and the wallet linked Google.
// Rows are loaded by ctx.wallet, so a connector only ever runs for its owner.
import type { HarnessContext, HarnessTool, ToolRegistry } from "../types";
import { googleEnabled, googleTools } from "../connectors/google";
import { callMcpTool, mcpInputSchema, mcpToolName, riskForMcpTool } from "../connectors/mcp";
import type { CachedMcpTool } from "../connectors/mcp";
import { listConnectors, secretOf } from "../connectors/store";
import type { ConnectorRow } from "../connectors/store";
import { registerDynamicSource } from "../registry";

function mcpTool(row: ConnectorRow, cached: CachedMcpTool, name: string): HarnessTool {
  const risk = riskForMcpTool({ readOnlyHint: cached.readOnly });
  const label = `„${cached.name}“ (MCP-Server ${row.name})`;
  return {
    name,
    pack: "connectors",
    risk,
    description:
      `[Externer MCP-Server „${row.name}“, vom Menschen selbst verbunden] ${cached.description || cached.name}`.slice(0, 1024) +
      (risk === "external" ? " Braucht die Freigabe des Menschen." : ""),
    inputSchema: mcpInputSchema(cached.inputSchema),
    summarize: () => `Werkzeug ${label} ausführen`,
    preview: (input) => ({
      kind: "generic",
      fields: [{ label: "Dienst", value: row.name }, { label: "Werkzeug", value: cached.name }],
      body: JSON.stringify(input ?? {}, null, 2).slice(0, 2000),
    }),
    execute: async (input) => {
      const secret = secretOf<{ headers?: Record<string, string> }>(row);
      return callMcpTool(row.url ?? "", secret?.headers ?? {}, cached.name, (input ?? {}) as Record<string, unknown>);
    },
  };
}

/** Pure: connector rows → harness tools (unique names). */
export function toolsFromConnectors(rows: ConnectorRow[], opts: { google: boolean }): HarnessTool[] {
  const out: HarnessTool[] = [];
  const names = new Set<string>();
  for (const row of rows) {
    if (row.status !== "active") continue;
    if (row.kind === "google") {
      if (!opts.google) continue;
      for (const t of googleTools(row)) if (!names.has(t.name)) { names.add(t.name); out.push(t); }
      continue;
    }
    if (!row.url) continue;
    for (const cached of Array.isArray(row.tools_cache) ? row.tools_cache : []) {
      let name = mcpToolName(row.name, cached.name);
      if (names.has(name)) name = mcpToolName(`${row.name}_${row.id.slice(0, 4)}`, cached.name);
      if (names.has(name)) continue;
      names.add(name);
      out.push(mcpTool(row, cached, name));
    }
  }
  return out;
}

async function loadFor(wallet: string): Promise<HarnessTool[]> {
  const rows = await listConnectors(wallet, { activeOnly: true });
  return toolsFromConnectors(rows, { google: googleEnabled() });
}

export function register(_registry: ToolRegistry): void {
  registerDynamicSource({
    id: "connectors",
    key: "connectors",
    load: (ctx: HarnessContext) => loadFor(ctx.wallet),
    find: async (name: string, wallet: string) => (await loadFor(wallet)).find((t) => t.name === name) ?? null,
  });
}
