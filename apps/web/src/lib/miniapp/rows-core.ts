// Shared collections ("rows") — pure rules, no I/O. The store (rows.ts) and the route use
// these; tests cover them without a database.

export type RowScope = "shared" | "private";

export const COLLECTION_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const ROW_JSON_MAX = 8_000; // data + private_data, serialized
export const ROWS_PER_COLLECTION_MAX = 10_000;
export const ROWS_PER_AUTHOR_MAX = 500; // per collection
export const LIST_LIMIT_MAX = 200;

export interface DbRow {
  id: string;
  owner_wallet: string;
  key: string | null;
  data: Record<string, unknown>;
  private_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ApiRow {
  id: string;
  key: string | null;
  data: Record<string, unknown>;
  privateData?: Record<string, unknown> | null;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Who is looking: the signed-in person (may be null) and whether they own the app. */
export interface Viewer {
  wallet: string | null;
  appOwner: boolean;
}

export type RowRuleError = { code: "invalid_params"; message: string };

export function checkCollection(name: unknown): RowRuleError | null {
  return typeof name === "string" && COLLECTION_RE.test(name)
    ? null
    : { code: "invalid_params", message: "Ungültiger Sammlungsname (a-z, 0-9, - und _, bis 40 Zeichen)." };
}

export function checkKey(key: unknown): RowRuleError | null {
  if (key === undefined || key === null) return null;
  if (typeof key !== "string" || key.length < 1 || key.length > 120 || /[\s\u0000-\u001f]/.test(key)) {
    return { code: "invalid_params", message: "Ungültiger Schlüssel (1–120 Zeichen, ohne Leerzeichen)." };
  }
  return null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function checkPayload(data: unknown, privateData: unknown, requireData: boolean): RowRuleError | null {
  if (requireData && !isPlainObject(data)) return { code: "invalid_params", message: "data muss ein Objekt sein." };
  if (data !== undefined && !isPlainObject(data)) return { code: "invalid_params", message: "data muss ein Objekt sein." };
  if (privateData !== undefined && privateData !== null && !isPlainObject(privateData)) {
    return { code: "invalid_params", message: "privateData muss ein Objekt sein." };
  }
  const size = JSON.stringify(data ?? {}).length + JSON.stringify(privateData ?? null).length;
  if (size > ROW_JSON_MAX) {
    return { code: "invalid_params", message: `Der Eintrag ist zu groß (${size} Zeichen, max. ${ROW_JSON_MAX}).` };
  }
  return null;
}

export function clampLimit(limit: unknown): number {
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : 100;
  return Math.min(Math.max(n, 1), LIST_LIMIT_MAX);
}

/** Whether `viewer` may see this row at all (private rows: only the author). */
export function canSee(scope: RowScope, row: Pick<DbRow, "owner_wallet">, viewer: Viewer): boolean {
  if (scope === "shared") return true;
  return viewer.wallet !== null && row.owner_wallet === viewer.wallet;
}

/** The row as the viewer gets it: never the wallet; private_data only for author or app owner. */
export function toApiRow(scope: RowScope, row: DbRow, viewer: Viewer): ApiRow {
  const mine = viewer.wallet !== null && row.owner_wallet === viewer.wallet;
  const out: ApiRow = {
    id: row.id,
    key: row.key,
    data: row.data ?? {},
    mine,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (mine || (scope === "shared" && viewer.appOwner)) out.privateData = row.private_data ?? null;
  return out;
}

/** Author may change their row; nobody else (the app owner moderates by removing). */
export function canUpdate(row: Pick<DbRow, "owner_wallet">, viewer: Viewer): boolean {
  return viewer.wallet !== null && row.owner_wallet === viewer.wallet;
}

/** Author may remove; the app owner may remove shared rows (moderation, cancelling a booking). */
export function canRemove(scope: RowScope, row: Pick<DbRow, "owner_wallet">, viewer: Viewer): boolean {
  if (viewer.wallet !== null && row.owner_wallet === viewer.wallet) return true;
  return scope === "shared" && viewer.appOwner;
}

/** Escape a key prefix for a SQL LIKE pattern. */
export function likePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
}
