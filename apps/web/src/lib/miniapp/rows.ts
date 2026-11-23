// Shared collections ("rows") — store over public.mini_app_rows (migration
// 20261123_mini_app_rows, applied 2026-11-23). Server-only; reached through
// /api/mini-apps/rows (host bridge `data.rows`, owner view in Studio/dashboard).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ROWS_PER_AUTHOR_MAX,
  ROWS_PER_COLLECTION_MAX,
  canRemove,
  canSee,
  canUpdate,
  clampLimit,
  likePrefix,
  toApiRow,
  type ApiRow,
  type DbRow,
  type RowScope,
  type Viewer,
} from "./rows-core";
import { MiniAppError } from "./types";

const TABLE = "mini_app_rows";
const COLUMNS = "id, owner_wallet, key, data, private_data, created_at, updated_at";

function db() {
  return createAdminClient();
}

function fail(e: { code?: string; message?: string } | null): never {
  if (e && (e.code === "42P01" || e.code === "PGRST205")) {
    throw new MiniAppError("internal", "Sammlungen sind noch nicht freigeschaltet (Migration 20261123_mini_app_rows).", 503);
  }
  throw new MiniAppError("internal", e?.message ?? "Datenbankfehler", 500);
}

export interface RowRef {
  appId: string;
  collection: string;
  scope: RowScope;
}

export async function listRows(
  ref: RowRef,
  viewer: Viewer,
  q: { keyPrefix?: string; mine?: boolean; limit?: number; order?: "newest" | "oldest" | "key" },
): Promise<{ rows: ApiRow[]; total: number }> {
  if (ref.scope === "private" && !viewer.wallet) {
    throw new MiniAppError("unauthorized", "Bitte anmelden, um deine Einträge zu sehen.", 401);
  }
  if (q.mine && !viewer.wallet) return { rows: [], total: 0 };
  let query = db()
    .from(TABLE)
    .select(COLUMNS, { count: "exact" })
    .eq("mini_app_id", ref.appId)
    .eq("scope", ref.scope)
    .eq("collection", ref.collection);
  if (ref.scope === "private" || q.mine) query = query.eq("owner_wallet", viewer.wallet!);
  if (q.keyPrefix) query = query.like("key", likePrefix(q.keyPrefix));
  const order = q.order ?? "newest";
  query =
    order === "key"
      ? query.order("key", { ascending: true, nullsFirst: false })
      : query.order("created_at", { ascending: order === "oldest" });
  const { data, error, count } = await query.limit(clampLimit(q.limit));
  if (error) fail(error);
  const rows = ((data ?? []) as DbRow[]).filter((r) => canSee(ref.scope, r, viewer)).map((r) => toApiRow(ref.scope, r, viewer));
  return { rows, total: count ?? rows.length };
}

async function countRows(ref: RowRef, wallet?: string): Promise<number> {
  let q = db()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("mini_app_id", ref.appId)
    .eq("scope", ref.scope)
    .eq("collection", ref.collection);
  if (wallet) q = q.eq("owner_wallet", wallet);
  const { count, error } = await q;
  if (error) fail(error);
  return count ?? 0;
}

export async function addRow(
  ref: RowRef,
  wallet: string,
  row: { key?: string | null; data: Record<string, unknown>; privateData?: Record<string, unknown> | null },
): Promise<ApiRow> {
  const [all, mine] = await Promise.all([countRows(ref), countRows(ref, wallet)]);
  if (all >= ROWS_PER_COLLECTION_MAX) {
    throw new MiniAppError("rate_limited", "Diese Sammlung ist voll. Die App-Betreiber:in kann alte Einträge löschen.", 429);
  }
  if (mine >= ROWS_PER_AUTHOR_MAX) {
    throw new MiniAppError("rate_limited", "Du hast hier schon sehr viele Einträge. Lösche ältere, um neue anzulegen.", 429);
  }
  const { data, error } = await db()
    .from(TABLE)
    .insert({
      mini_app_id: ref.appId,
      collection: ref.collection,
      scope: ref.scope,
      owner_wallet: wallet,
      key: row.key ?? null,
      data: row.data,
      private_data: row.privateData ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new MiniAppError("conflict", "Schon vergeben.", 409);
    fail(error);
  }
  return toApiRow(ref.scope, data as DbRow, { wallet, appOwner: false });
}

async function getRow(ref: RowRef, id: string): Promise<DbRow | null> {
  const { data, error } = await db()
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .eq("mini_app_id", ref.appId)
    .eq("scope", ref.scope)
    .eq("collection", ref.collection)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null; // not a uuid
    fail(error);
  }
  return (data as DbRow | null) ?? null;
}

export async function updateRow(
  ref: RowRef,
  viewer: Viewer,
  id: string,
  patch: { data?: Record<string, unknown>; privateData?: Record<string, unknown> | null },
): Promise<ApiRow> {
  const row = await getRow(ref, id);
  if (!row || !canSee(ref.scope, row, viewer)) throw new MiniAppError("not_found", "Eintrag nicht gefunden.", 404);
  if (!canUpdate(row, viewer)) throw new MiniAppError("unauthorized", "Nur wer den Eintrag angelegt hat, kann ihn ändern.", 403);
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.data !== undefined) fields.data = patch.data;
  if (patch.privateData !== undefined) fields.private_data = patch.privateData;
  const { data, error } = await db().from(TABLE).update(fields).eq("id", row.id).select(COLUMNS).single();
  if (error) fail(error);
  return toApiRow(ref.scope, data as DbRow, viewer);
}

export async function removeRow(ref: RowRef, viewer: Viewer, id: string): Promise<{ ok: boolean }> {
  const row = await getRow(ref, id);
  if (!row || !canSee(ref.scope, row, viewer)) return { ok: false };
  if (!canRemove(ref.scope, row, viewer)) throw new MiniAppError("unauthorized", "Diesen Eintrag kannst du nicht löschen.", 403);
  const { error } = await db().from(TABLE).delete().eq("id", row.id);
  if (error) fail(error);
  return { ok: true };
}

/** Collections of an app with their row counts (owner view in Studio / dashboard). */
export async function collectionsOf(appId: string): Promise<{ collection: string; scope: RowScope; rows: number }[]> {
  const { data, error } = await db().from(TABLE).select("collection, scope").eq("mini_app_id", appId).limit(20_000);
  if (error) fail(error);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { collection: string; scope: RowScope }[]) {
    const k = `${r.scope}:${r.collection}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([k, rows]) => {
    const [scope, collection] = k.split(":") as [RowScope, string];
    return { collection, scope, rows };
  });
}
