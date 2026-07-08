// Developer API keys — auth for the MCP server + external publishing (Claude
// Code, CI, other agents). Server-only.
//
// Key format nz_<40 hex>; only the SHA-256 hash is stored (shown once at
// creation). Table: developer_api_keys (migration 20260708_developer_api_keys
// — until it is applied, createApiKey/listApiKeys throw MiniAppError
// "unsupported" with a German hint, and verifyApiKey returns null).
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MiniAppError, type DeveloperRow } from "./types";

export interface ApiKeyRow {
  id: string;
  created_at: string;
  developer_id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const TABLE = "developer_api_keys";

function db() {
  return createAdminClient();
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function missingTable(e: { code?: string; message?: string } | null): boolean {
  // 42P01 undefined_table; PostgREST surfaces missing relations as PGRST205.
  return Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|schema cache/i.test(e.message ?? "")));
}

function tableGate(e: { code?: string; message?: string } | null): never {
  if (missingTable(e)) {
    throw new MiniAppError(
      "internal",
      "API-Keys sind noch nicht freigeschaltet — die Migration 20260708_developer_api_keys muss auf Supabase angewendet werden.",
      503,
    );
  }
  throw new MiniAppError("internal", e?.message ?? "Datenbankfehler", 500);
}

/** Create a key for the developer. Returns the PLAIN key exactly once. */
export async function createApiKey(
  developer: DeveloperRow,
  name?: string,
): Promise<{ key: string; row: ApiKeyRow }> {
  const key = `nz_${randomBytes(20).toString("hex")}`;
  const { data, error } = await db()
    .from(TABLE)
    .insert({
      developer_id: developer.id,
      name: (name ?? "API-Key").slice(0, 60),
      key_prefix: key.slice(0, 12),
      key_hash: hashKey(key),
    })
    .select("id, created_at, developer_id, name, key_prefix, last_used_at, revoked_at")
    .single();
  if (error || !data) tableGate(error);
  return { key, row: data as ApiKeyRow };
}

export async function listApiKeys(developer: DeveloperRow): Promise<ApiKeyRow[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select("id, created_at, developer_id, name, key_prefix, last_used_at, revoked_at")
    .eq("developer_id", developer.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) tableGate(error);
  return (data ?? []) as ApiKeyRow[];
}

export async function revokeApiKey(developer: DeveloperRow, keyId: string): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("developer_id", developer.id);
  if (error) tableGate(error);
}

/**
 * Resolve an API key to its developer. Returns null for unknown/revoked keys
 * AND when the table doesn't exist yet (callers may then fall back to other
 * auth). Touches last_used_at (fire-and-forget).
 */
export async function verifyApiKey(key: string): Promise<DeveloperRow | null> {
  if (!/^nz_[0-9a-f]{40}$/.test(key)) return null;
  const client = db();
  const { data, error } = await client
    .from(TABLE)
    .select("id, developer_id, revoked_at, developers(*)")
    .eq("key_hash", hashKey(key))
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return null;
    console.error("[miniapp/keys] verify failed", error.message);
    return null;
  }
  if (!data || data.revoked_at) return null;
  void client
    .from(TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});
  const dev = (Array.isArray(data.developers) ? data.developers[0] : data.developers) as
    | DeveloperRow
    | undefined;
  return dev && dev.status === "active" ? dev : null;
}
