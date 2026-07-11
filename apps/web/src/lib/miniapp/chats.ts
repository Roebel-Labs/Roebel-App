// Editor chats — server-side persistence of /editor builder sessions.
// One row per chat (mini_app_editor_chats). Owned by a developer; other users
// can join via the share_token invite link and then read/write the session
// (turn-based collaboration, last write wins). All access flows through
// /api/mini-apps/chats — same MVP wallet trust tier as the rest of the builder.
import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MiniAppError } from "./types";

const TABLE = "mini_app_editor_chats";

/** Server-side cap for the stored session JSON (localStorage keeps the full set). */
const SESSION_MAX_CHARS = 1_500_000;
/** How many version HTMLs survive server-side trimming. */
const KEEP_VERSION_HTMLS = 2;
const PREVIEW_MAX = 140;
const TITLE_MAX = 80;

export interface EditorChatMeta {
  id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  app_slug: string | null;
  preview: string | null;
  /** True when the requester accesses someone else's chat as collaborator. */
  shared: boolean;
  share_token: string | null;
}

export interface EditorChatRow extends Omit<EditorChatMeta, "shared"> {
  developer_id: string;
  session: Record<string, unknown>;
  collaborators: string[];
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
      "Chat-Verlauf ist noch nicht freigeschaltet — die Migration 20260711_editor_chats muss auf Supabase angewendet werden.",
      503,
    );
  }
  throw new MiniAppError("internal", e?.message ?? "Datenbankfehler", 500);
}

const lower = (w: string) => w.trim().toLowerCase();

function canAccess(row: EditorChatRow, developerId: string, wallet: string | null): boolean {
  if (row.developer_id === developerId) return true;
  return Boolean(wallet && row.collaborators.includes(lower(wallet)));
}

/** Derive title/preview from the session's messages (first/last user-visible text). */
function deriveMeta(session: Record<string, unknown>): { title: string | null; preview: string | null } {
  const messages = Array.isArray(session.messages)
    ? (session.messages as { role?: string; content?: string }[])
    : [];
  const firstUser = messages.find((m) => m.role === "user" && m.content?.trim());
  const last = [...messages].reverse().find((m) => m.content?.trim());
  const clip = (s: string | undefined, n: number) =>
    s ? (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s) : null;
  return {
    title: clip(firstUser?.content?.trim(), TITLE_MAX),
    preview: clip(last?.content?.trim(), PREVIEW_MAX),
  };
}

/** Trim version HTMLs (keep the newest N) until the session fits the cap. */
function trimSession(session: Record<string, unknown>): Record<string, unknown> {
  let json = JSON.stringify(session);
  if (json.length <= SESSION_MAX_CHARS) return session;
  const versions = Array.isArray(session.versions)
    ? (session.versions as { html?: string | null; notes?: string }[])
    : [];
  const trimmed = {
    ...session,
    versions: versions.map((v, i) =>
      i < versions.length - KEEP_VERSION_HTMLS ? { ...v, html: null } : v,
    ),
  };
  json = JSON.stringify(trimmed);
  if (json.length > SESSION_MAX_CHARS) {
    throw new MiniAppError(
      "invalid_params",
      "Der Chat ist zu groß zum Speichern — bitte einen neuen Chat beginnen.",
      413,
    );
  }
  return trimmed;
}

function toMeta(row: EditorChatRow, developerId: string): EditorChatMeta {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    title: row.title,
    app_slug: row.app_slug,
    preview: row.preview,
    shared: row.developer_id !== developerId,
    share_token: row.developer_id === developerId ? row.share_token : null,
  };
}

/** Own chats + chats joined as collaborator, newest first. */
export async function listChats(
  developerId: string,
  wallet: string | null,
  limit = 30,
): Promise<EditorChatMeta[]> {
  const supabase = db();
  const cols = "id, created_at, updated_at, developer_id, title, app_slug, preview, share_token, collaborators";
  const [own, shared] = await Promise.all([
    supabase
      .from(TABLE)
      .select(cols)
      .eq("developer_id", developerId)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(limit),
    wallet
      ? supabase
          .from(TABLE)
          .select(cols)
          .contains("collaborators", [lower(wallet)])
          .eq("archived", false)
          .order("updated_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (own.error) gate(own.error);
  if (shared.error) gate(shared.error);
  const seen = new Set<string>();
  const rows = [...(own.data ?? []), ...(shared.data ?? [])] as EditorChatRow[];
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, limit)
    .map((r) => toMeta(r, developerId));
}

export async function getChat(
  id: string,
  developerId: string,
  wallet: string | null,
): Promise<EditorChatRow> {
  const { data, error } = await db().from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) gate(error);
  const row = data as EditorChatRow | null;
  if (!row) throw new MiniAppError("not_found", "Chat nicht gefunden.");
  if (!canAccess(row, developerId, wallet)) {
    throw new MiniAppError("unauthorized", "Kein Zugriff auf diesen Chat.");
  }
  return row;
}

/** Create (no id) or update (id) a chat. Collaborators may update the session. */
export async function upsertChat(params: {
  id?: string | null;
  developerId: string;
  wallet: string | null;
  session: Record<string, unknown>;
  appSlug?: string | null;
  title?: string | null;
}): Promise<EditorChatMeta> {
  const supabase = db();
  const session = trimSession(params.session ?? {});
  const derived = deriveMeta(session);
  const patch = {
    session,
    title: params.title?.slice(0, TITLE_MAX) || derived.title,
    preview: derived.preview,
    app_slug: params.appSlug ?? null,
    updated_at: new Date().toISOString(),
  };

  if (params.id) {
    const existing = await getChat(params.id, params.developerId, params.wallet);
    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) gate(error);
    return toMeta(data as EditorChatRow, params.developerId);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...patch, developer_id: params.developerId })
    .select("*")
    .single();
  if (error) gate(error);
  return toMeta(data as EditorChatRow, params.developerId);
}

/** Owner-only hard delete. */
export async function deleteChat(id: string, developerId: string): Promise<void> {
  const { data, error } = await db()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("developer_id", developerId)
    .select("id");
  if (error) gate(error);
  if (!data?.length) throw new MiniAppError("not_found", "Chat nicht gefunden (oder kein Besitzer).");
}

/** Owner-only: ensure a share token exists and return it. */
export async function createInvite(id: string, developerId: string): Promise<string> {
  const supabase = db();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, developer_id, share_token")
    .eq("id", id)
    .maybeSingle();
  if (error) gate(error);
  const row = data as Pick<EditorChatRow, "id" | "developer_id" | "share_token"> | null;
  if (!row) throw new MiniAppError("not_found", "Chat nicht gefunden.");
  if (row.developer_id !== developerId) {
    throw new MiniAppError("unauthorized", "Nur der Besitzer kann einladen.");
  }
  if (row.share_token) return row.share_token;
  const token = randomBytes(18).toString("hex");
  const { error: upErr } = await supabase.from(TABLE).update({ share_token: token }).eq("id", id);
  if (upErr) gate(upErr);
  return token;
}

/** Join a chat via invite token: adds the wallet as collaborator. */
export async function joinChat(id: string, token: string, wallet: string): Promise<void> {
  const supabase = db();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, share_token, collaborators")
    .eq("id", id)
    .maybeSingle();
  if (error) gate(error);
  const row = data as Pick<EditorChatRow, "id" | "share_token" | "collaborators"> | null;
  if (!row) throw new MiniAppError("not_found", "Chat nicht gefunden.");
  if (!row.share_token || row.share_token !== token) {
    throw new MiniAppError("unauthorized", "Einladungslink ist ungültig oder abgelaufen.");
  }
  const w = lower(wallet);
  if (row.collaborators.includes(w)) return;
  const { error: upErr } = await supabase
    .from(TABLE)
    .update({ collaborators: [...row.collaborators, w] })
    .eq("id", id);
  if (upErr) gate(upErr);
}
