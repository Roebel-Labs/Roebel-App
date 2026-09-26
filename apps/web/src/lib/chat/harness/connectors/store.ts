// agent_connectors data access (service role). Every function scopes by wallet.
// Secrets are encrypted with the row id as AAD (crypto.ts); they never leave
// the server — toPublic() is the only shape routes return.
import { randomUUID } from "node:crypto";
import { db } from "../../store";
import { decryptSecret, encryptSecret } from "./crypto";
import type { CachedMcpTool } from "./mcp";

export type ConnectorKind = "mcp" | "google";
export type ConnectorStatus = "active" | "error" | "disabled";

export interface ConnectorRow {
  id: string;
  wallet: string;
  kind: ConnectorKind;
  name: string;
  url: string | null;
  secret_enc: string | null;
  status: ConnectorStatus;
  tools_cache: CachedMcpTool[] | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicConnector {
  id: string;
  kind: ConnectorKind;
  name: string;
  url: string | null;
  status: ConnectorStatus;
  toolCount: number;
  lastError: string | null;
}

export const MAX_CONNECTORS = 10;

/** Strips secrets; shows only scheme + host + path of MCP URLs (no query string). */
export function toPublic(row: ConnectorRow): PublicConnector {
  let url: string | null = null;
  if (row.url) {
    try {
      const u = new URL(row.url);
      url = `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}`;
    } catch { url = null; }
  }
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    url,
    status: row.status,
    toolCount: row.kind === "google" ? 5 : Array.isArray(row.tools_cache) ? row.tools_cache.length : 0,
    lastError: row.last_error,
  };
}

export async function listConnectors(wallet: string, opts: { activeOnly?: boolean } = {}): Promise<ConnectorRow[]> {
  let q = db().from("agent_connectors").select("*").eq("wallet", wallet);
  if (opts.activeOnly) q = q.eq("status", "active");
  const res = await q.order("created_at", { ascending: true });
  if (res.error) throw new Error(`[connectors/store] list: ${res.error.message}`);
  return (res.data ?? []) as ConnectorRow[];
}

export async function getConnector(wallet: string, id: string): Promise<ConnectorRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await db().from("agent_connectors").select("*").eq("wallet", wallet).eq("id", id).maybeSingle();
  if (res.error) throw new Error(`[connectors/store] get: ${res.error.message}`);
  return (res.data as ConnectorRow | null) ?? null;
}

export async function insertConnector(input: {
  wallet: string; kind: ConnectorKind; name: string; url: string | null; secret: unknown;
  toolsCache?: CachedMcpTool[];
}): Promise<ConnectorRow> {
  const id = randomUUID();
  const res = await db().from("agent_connectors").insert({
    id,
    wallet: input.wallet,
    kind: input.kind,
    name: input.name,
    url: input.url,
    secret_enc: encryptSecret(input.secret ?? {}, { aad: id }),
    status: "active",
    tools_cache: input.toolsCache ?? [],
  }).select("*").single();
  if (res.error) throw new Error(`[connectors/store] insert: ${res.error.message}`);
  return res.data as ConnectorRow;
}

export async function updateConnector(wallet: string, id: string, patch: {
  status?: ConnectorStatus; toolsCache?: CachedMcpTool[]; lastError?: string | null; secret?: unknown;
}): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.toolsCache) row.tools_cache = patch.toolsCache;
  if (patch.lastError !== undefined) row.last_error = patch.lastError ? patch.lastError.slice(0, 300) : null;
  if (patch.secret !== undefined) row.secret_enc = encryptSecret(patch.secret, { aad: id });
  const res = await db().from("agent_connectors").update(row).eq("wallet", wallet).eq("id", id);
  if (res.error) throw new Error(`[connectors/store] update: ${res.error.message}`);
}

export async function deleteConnector(wallet: string, id: string): Promise<boolean> {
  const res = await db().from("agent_connectors").delete().eq("wallet", wallet).eq("id", id).select("id");
  if (res.error) throw new Error(`[connectors/store] delete: ${res.error.message}`);
  return Boolean(res.data?.length);
}

export async function deleteGoogleConnectors(wallet: string): Promise<void> {
  const res = await db().from("agent_connectors").delete().eq("wallet", wallet).eq("kind", "google");
  if (res.error) throw new Error(`[connectors/store] delete google: ${res.error.message}`);
}

export function secretOf<T>(row: ConnectorRow): T | null {
  if (!row.secret_enc) return null;
  return decryptSecret<T>(row.secret_enc, { aad: row.id });
}
