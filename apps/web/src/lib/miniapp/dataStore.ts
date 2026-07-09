// Mini-app datastore ("Mini-CMS") — typed helpers over mini_app_data.
// Server-only; all access flows through /api/mini-apps/data (host bridge,
// dashboard Inhalte editor, MCP content tools).
//
//   scope 'app'  — the app's editable content. World-readable, developer/
//                  admin-writable. The app runtime reads it via sdk.data.get/
//                  list and ships built-in fallbacks.
//   scope 'user' — per-wallet state, read/written by the app at runtime
//                  (sdk.data.getUser/setUser) through the host.
//
// Table staged in supabase/migrations/20260709_mini_app_data.sql — until it
// is applied every helper throws a clear German 503.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MiniAppError } from "./types";

const TABLE = "mini_app_data";

export const DATA_KEY_RE = /^[a-z0-9][a-z0-9-_.]{0,63}$/;
const VALUE_MAX_CHARS = 32_000;
const APP_KEYS_MAX = 200;
const USER_KEYS_MAX = 100;

export interface DataItem {
  key: string;
  value: unknown;
  updated_at: string;
}

function db() {
  return createAdminClient();
}

function missingTable(e: { code?: string; message?: string } | null): boolean {
  return Boolean(
    e &&
      (e.code === "42P01" ||
        e.code === "PGRST205" ||
        /relation .* does not exist|schema cache/i.test(e.message ?? "")),
  );
}

function gate(e: { code?: string; message?: string } | null): never {
  if (missingTable(e)) {
    throw new MiniAppError(
      "internal",
      "Der Daten-Speicher ist noch nicht freigeschaltet — die Migration 20260709_mini_app_data muss auf Supabase angewendet werden.",
      503,
    );
  }
  throw new MiniAppError("internal", e?.message ?? "Datenbankfehler", 500);
}

function checkKey(key: string): void {
  if (!DATA_KEY_RE.test(key)) {
    throw new MiniAppError(
      "invalid_params",
      "Ungültiger Schlüssel — erlaubt: a-z, 0-9, Bindestrich, Unterstrich, Punkt (max. 64 Zeichen).",
    );
  }
}

function checkValue(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  if (json.length > VALUE_MAX_CHARS) {
    throw new MiniAppError(
      "invalid_params",
      `Der Wert ist zu groß (${json.length} Zeichen, max. ${VALUE_MAX_CHARS}).`,
    );
  }
  return json;
}

const lower = (w: string) => w.trim().toLowerCase();

export async function getData(
  miniAppId: string,
  scope: "app" | "user",
  key: string,
  wallet?: string | null,
): Promise<DataItem | null> {
  checkKey(key);
  let q = db()
    .from(TABLE)
    .select("key, value, updated_at")
    .eq("mini_app_id", miniAppId)
    .eq("scope", scope)
    .eq("key", key);
  q = scope === "user" ? q.eq("wallet", lower(wallet ?? "")) : q.is("wallet", null);
  const { data, error } = await q.maybeSingle();
  if (error) gate(error);
  return (data as DataItem | null) ?? null;
}

export async function listData(
  miniAppId: string,
  scope: "app" | "user",
  opts?: { prefix?: string; wallet?: string | null },
): Promise<DataItem[]> {
  let q = db()
    .from(TABLE)
    .select("key, value, updated_at")
    .eq("mini_app_id", miniAppId)
    .eq("scope", scope)
    .order("key")
    .limit(APP_KEYS_MAX);
  q = scope === "user" ? q.eq("wallet", lower(opts?.wallet ?? "")) : q.is("wallet", null);
  if (opts?.prefix) q = q.like("key", `${opts.prefix.replace(/[%_]/g, "")}%`);
  const { data, error } = await q;
  if (error) gate(error);
  return (data ?? []) as DataItem[];
}

export async function setData(
  miniAppId: string,
  scope: "app" | "user",
  key: string,
  value: unknown,
  wallet?: string | null,
): Promise<DataItem> {
  checkKey(key);
  checkValue(value);
  const w = scope === "user" ? lower(wallet ?? "") : null;
  if (scope === "user" && !w) {
    throw new MiniAppError("unauthorized", "Kein Wallet verbunden — Speichern nicht möglich.");
  }

  // Quota: count keys before inserting a NEW one (updating existing is free).
  // App scope caps total content keys; user scope caps per (wallet, app).
  const existing = await getData(miniAppId, scope, key, w);
  if (!existing) {
    let cq = db()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("mini_app_id", miniAppId)
      .eq("scope", scope);
    if (scope === "user") cq = cq.eq("wallet", w!);
    const { count, error: cntErr } = await cq;
    if (cntErr) gate(cntErr);
    const max = scope === "app" ? APP_KEYS_MAX : USER_KEYS_MAX;
    if ((count ?? 0) >= max) {
      throw new MiniAppError(
        "invalid_params",
        scope === "app"
          ? `Maximal ${APP_KEYS_MAX} Inhalts-Schlüssel pro App.`
          : `Maximal ${USER_KEYS_MAX} gespeicherte Schlüssel pro Nutzer:in und App.`,
      );
    }
  }

  // The coalesce-unique index can't be an upsert conflict target — explicit
  // update-or-insert (last write wins; a rare insert race hits the unique
  // index and is retried as an update).
  if (existing) {
    let q = db()
      .from(TABLE)
      .update({ value: value ?? null, updated_at: new Date().toISOString() })
      .eq("mini_app_id", miniAppId)
      .eq("scope", scope)
      .eq("key", key);
    q = scope === "user" ? q.eq("wallet", w!) : q.is("wallet", null);
    const { data, error } = await q.select("key, value, updated_at").maybeSingle();
    if (error || !data) gate(error);
    return data as DataItem;
  }
  const { data, error } = await db()
    .from(TABLE)
    .insert({ mini_app_id: miniAppId, scope, wallet: w, key, value: value ?? null })
    .select("key, value, updated_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return setData(miniAppId, scope, key, value, wallet);
    gate(error);
  }
  if (!data) gate(null);
  return data as DataItem;
}

export async function deleteData(
  miniAppId: string,
  scope: "app" | "user",
  key: string,
  wallet?: string | null,
): Promise<void> {
  checkKey(key);
  let q = db().from(TABLE).delete().eq("mini_app_id", miniAppId).eq("scope", scope).eq("key", key);
  q = scope === "user" ? q.eq("wallet", lower(wallet ?? "")) : q.is("wallet", null);
  const { error } = await q;
  if (error) gate(error);
}
