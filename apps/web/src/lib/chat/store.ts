// Data access for the chat suite (service role; all chat_* tables are
// server-only). Maps DB rows → contract types (types.ts). Every function that
// takes a `wallet` scopes by owner — callers never pass unchecked ids through.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { BOT_EYES, BOT_SHAPES } from "./types";
import type {
  BotAvatarSpec, ChatBot, ChatMessage, ChatPart, ChatRoutine, ChatThread, ChatTier, RoutineSchedule,
} from "./types";
import { effectiveTier, quotaWindowStart, sumTokens } from "./quota";

let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  client ??= createAdminClient();
  return client;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`[chat/store] ${what}: ${res.error.message}`);
  return res.data as T;
}

// ---- rows ------------------------------------------------------------------

export interface BotRow {
  id: string;
  owner_wallet: string | null;
  slug: string | null;
  name: string;
  description: string;
  instructions: string;
  avatar: unknown;
  model_route: string;
  tools: string[] | null;
  is_preset: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}

interface ThreadRow {
  id: string;
  owner_wallet: string;
  title: string;
  topic: string | null;
  kind: "direct" | "group";
  last_message_at: string;
  last_message_preview: string;
  last_read_at: string;
  archived: boolean;
  created_at: string;
  chat_thread_bots?: { bot_id: string; chat_bots: BotRow | BotRow[] | null }[];
}

export interface MessageRow {
  id: string;
  thread_id: string;
  role: "user" | "bot" | "system";
  bot_id: string | null;
  parts: unknown;
  reply_to_id: string | null;
  reactions: unknown;
  created_at: string;
}

interface RoutineRow {
  id: string;
  owner_wallet: string;
  thread_id: string;
  bot_id: string;
  title: string;
  schedule: RoutineSchedule;
  prompt: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
}

// ---- mappers ---------------------------------------------------------------

export function normalizeAvatar(input: unknown): BotAvatarSpec {
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const shape = BOT_SHAPES.includes(a.shape as never) ? (a.shape as BotAvatarSpec["shape"]) : "circle";
  const eyes = BOT_EYES.includes(a.eyes as never) ? (a.eyes as BotAvatarSpec["eyes"]) : "dots";
  const color = typeof a.color === "string" && /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : "#00498B";
  return { shape, color, eyes };
}

export function rowToBot(row: BotRow, opts: { includeInstructions?: boolean } = {}): ChatBot {
  const bot: ChatBot = {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    avatar: normalizeAvatar(row.avatar),
    isPreset: row.is_preset,
    modelRoute: row.model_route,
  };
  // Preset instructions are house IP-ish and long; only user-owned bots expose them.
  if (opts.includeInstructions && !row.is_preset) bot.instructions = row.instructions ?? "";
  return bot;
}

function rowToThread(row: ThreadRow): ChatThread {
  const bots = (row.chat_thread_bots ?? [])
    .map((tb) => (Array.isArray(tb.chat_bots) ? tb.chat_bots[0] : tb.chat_bots))
    .filter((b): b is BotRow => Boolean(b))
    .sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at))
    .map((b) => rowToBot(b, { includeInstructions: true }));
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    kind: row.kind,
    bots,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview ?? "",
    unread: new Date(row.last_message_at).getTime() > new Date(row.last_read_at).getTime(),
  };
}

export function partsOf(raw: unknown): ChatPart[] {
  return Array.isArray(raw) ? (raw as ChatPart[]) : [];
}

export function previewOfParts(parts: ChatPart[], max = 120): string {
  for (const p of parts) {
    if (p.type === "text" && p.text.trim()) return clip(stripMarkdown(p.text), max);
  }
  for (const p of parts) {
    if (p.type === "options") return clip(p.question, max);
    if (p.type === "file") return `📄 ${p.name}.${p.ext}`;
    if (p.type === "image") return "📷 Bild";
    if (p.type === "integration") return p.title;
    if (p.type === "sources") return "🔗 Quellen";
  }
  return "";
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function rowToMessage(row: MessageRow, replyPreview: Map<string, string>): ChatMessage {
  const reactions: Record<string, number> = {};
  if (row.reactions && typeof row.reactions === "object") {
    for (const [k, v] of Object.entries(row.reactions as Record<string, unknown>)) {
      if (typeof v === "number" && v > 0) reactions[k] = v;
    }
  }
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    botId: row.bot_id,
    parts: partsOf(row.parts),
    replyTo: row.reply_to_id ? { id: row.reply_to_id, preview: replyPreview.get(row.reply_to_id) ?? "" } : null,
    reactions,
    createdAt: row.created_at,
  };
}

async function mapMessages(rows: MessageRow[]): Promise<ChatMessage[]> {
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter((x): x is string => Boolean(x)))];
  const previews = new Map<string, string>();
  const known = new Map(rows.map((r) => [r.id, r]));
  const missing: string[] = [];
  for (const id of replyIds) {
    const r = known.get(id);
    if (r) previews.set(id, previewOfParts(partsOf(r.parts), 80));
    else missing.push(id);
  }
  if (missing.length) {
    const res = await db().from("chat_messages").select("id, parts").in("id", missing);
    for (const r of must(res, "reply previews") as { id: string; parts: unknown }[]) {
      previews.set(r.id, previewOfParts(partsOf(r.parts), 80));
    }
  }
  return rows.map((r) => rowToMessage(r, previews));
}

export async function toMessage(row: MessageRow): Promise<ChatMessage> {
  return (await mapMessages([row]))[0];
}

// ---- bots ------------------------------------------------------------------

export async function listPresetBots(): Promise<ChatBot[]> {
  const res = await db().from("chat_bots").select("*").eq("is_preset", true).order("sort");
  return (must(res, "presets") as BotRow[]).map((r) => rowToBot(r));
}

export async function listUserBots(wallet: string): Promise<ChatBot[]> {
  const res = await db().from("chat_bots").select("*").eq("owner_wallet", wallet).order("created_at");
  return (must(res, "user bots") as BotRow[]).map((r) => rowToBot(r, { includeInstructions: true }));
}

/** Bots the wallet may use: presets + own bots. */
export async function getUsableBotRows(wallet: string, ids: string[]): Promise<BotRow[]> {
  if (!ids.length) return [];
  const res = await db().from("chat_bots").select("*").in("id", ids);
  return (must(res, "bots by id") as BotRow[]).filter((b) => b.is_preset || b.owner_wallet === wallet);
}

export async function getBotRow(id: string): Promise<BotRow | null> {
  const res = await db().from("chat_bots").select("*").eq("id", id).maybeSingle();
  return must(res, "bot") as BotRow | null;
}

export async function createBot(wallet: string, input: {
  name: string; description: string; instructions: string; avatar: BotAvatarSpec; modelRoute?: string;
}): Promise<ChatBot> {
  const res = await db().from("chat_bots").insert({
    owner_wallet: wallet,
    name: input.name,
    description: input.description,
    instructions: input.instructions,
    avatar: input.avatar,
    model_route: input.modelRoute ?? "bot-smart",
    is_preset: false,
  }).select("*").single();
  return rowToBot(must(res, "create bot") as BotRow, { includeInstructions: true });
}

export async function updateBot(wallet: string, id: string, patch: Partial<{
  name: string; description: string; instructions: string; avatar: BotAvatarSpec; model_route: string;
}>): Promise<ChatBot | null> {
  const res = await db().from("chat_bots")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).eq("owner_wallet", wallet).eq("is_preset", false)
    .select("*").maybeSingle();
  const row = must(res, "update bot") as BotRow | null;
  return row ? rowToBot(row, { includeInstructions: true }) : null;
}

// ---- threads ---------------------------------------------------------------

const THREAD_SELECT = "*, chat_thread_bots(bot_id, chat_bots(*))";

export async function listThreads(wallet: string): Promise<ChatThread[]> {
  const res = await db().from("chat_threads").select(THREAD_SELECT)
    .eq("owner_wallet", wallet).eq("archived", false)
    .order("last_message_at", { ascending: false }).limit(200);
  return (must(res, "threads") as ThreadRow[]).map(rowToThread);
}

export async function getThread(wallet: string, id: string): Promise<ChatThread | null> {
  if (!isUuid(id)) return null;
  const res = await db().from("chat_threads").select(THREAD_SELECT).eq("id", id).eq("owner_wallet", wallet).maybeSingle();
  const row = must(res, "thread") as ThreadRow | null;
  return row ? rowToThread(row) : null;
}

/** Bot rows of a thread (with instructions + tools), sorted like the UI. */
export async function getThreadBotRows(threadId: string): Promise<BotRow[]> {
  const res = await db().from("chat_thread_bots").select("chat_bots(*)").eq("thread_id", threadId);
  const rows = (must(res, "thread bots") as { chat_bots: BotRow | BotRow[] | null }[])
    .map((r) => (Array.isArray(r.chat_bots) ? r.chat_bots[0] : r.chat_bots))
    .filter((b): b is BotRow => Boolean(b));
  return rows.sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
}

export async function createThread(wallet: string, bots: BotRow[]): Promise<ChatThread> {
  const kind = bots.length > 1 ? "group" : "direct";
  const title = bots.map((b) => b.name).join(", ").slice(0, 80);
  const now = new Date().toISOString();
  const res = await db().from("chat_threads").insert({
    owner_wallet: wallet, title, kind, last_message_at: now, last_read_at: now,
  }).select("id").single();
  const { id } = must(res, "create thread") as { id: string };
  must(await db().from("chat_thread_bots").insert(bots.map((b) => ({ thread_id: id, bot_id: b.id }))), "thread bots");
  const thread = await getThread(wallet, id);
  if (!thread) throw new Error("[chat/store] thread vanished after insert");
  return thread;
}

export async function touchThread(threadId: string, preview: string, at: string, opts: { read?: boolean } = {}): Promise<void> {
  const patch: Record<string, unknown> = { last_message_at: at, last_message_preview: preview.slice(0, 200) };
  if (opts.read) patch.last_read_at = at;
  must(await db().from("chat_threads").update(patch).eq("id", threadId), "touch thread");
}

export async function setThreadTopic(threadId: string, topic: string | null): Promise<void> {
  must(await db().from("chat_threads").update({ topic }).eq("id", threadId), "thread topic");
}

export async function markThreadRead(wallet: string, threadId: string): Promise<boolean> {
  const res = await db().from("chat_threads").update({ last_read_at: new Date().toISOString() })
    .eq("id", threadId).eq("owner_wallet", wallet).select("id");
  return (must(res, "mark read") as unknown[]).length > 0;
}

// ---- messages --------------------------------------------------------------

export async function listMessages(threadId: string, opts: { before?: string | null; limit?: number } = {}): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let q = db().from("chat_messages").select("*").eq("thread_id", threadId)
    .order("created_at", { ascending: false }).limit(limit + 1);
  if (opts.before) q = q.lt("created_at", opts.before);
  const rows = must(await q, "messages") as MessageRow[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: await mapMessages(page), hasMore };
}

/** Last `n` rows (ascending) for the model context. */
export async function recentMessageRows(threadId: string, n = 30): Promise<MessageRow[]> {
  const res = await db().from("chat_messages").select("*").eq("thread_id", threadId)
    .order("created_at", { ascending: false }).limit(n);
  return (must(res, "recent messages") as MessageRow[]).reverse();
}

export async function getMessageRow(wallet: string, id: string): Promise<MessageRow | null> {
  if (!isUuid(id)) return null;
  const res = await db().from("chat_messages").select("*, chat_threads!inner(owner_wallet)")
    .eq("id", id).eq("chat_threads.owner_wallet", wallet).maybeSingle();
  const row = must(res, "message") as (MessageRow & { chat_threads?: unknown }) | null;
  if (!row) return null;
  delete row.chat_threads;
  return row;
}

export async function insertMessage(input: {
  threadId: string; role: "user" | "bot" | "system"; botId?: string | null; parts: ChatPart[];
  replyToId?: string | null; id?: string; createdAt?: string;
}): Promise<MessageRow> {
  const res = await db().from("chat_messages").insert({
    ...(input.id ? { id: input.id } : {}),
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
    thread_id: input.threadId,
    role: input.role,
    bot_id: input.botId ?? null,
    parts: input.parts,
    reply_to_id: input.replyToId ?? null,
  }).select("*").single();
  return must(res, "insert message") as MessageRow;
}

export async function updateMessageParts(id: string, parts: ChatPart[]): Promise<MessageRow> {
  const res = await db().from("chat_messages").update({ parts }).eq("id", id).select("*").single();
  return must(res, "update parts") as MessageRow;
}

export async function setMessageReactions(id: string, reactions: Record<string, number>): Promise<void> {
  must(await db().from("chat_messages").update({ reactions }).eq("id", id), "reactions");
}

// ---- files -----------------------------------------------------------------

export async function createFile(wallet: string, threadId: string, name: string, ext: string, content: string) {
  const res = await db().from("chat_files").insert({
    owner_wallet: wallet, thread_id: threadId, name, ext, content, size: byteLength(content),
  }).select("id, name, ext, size").single();
  return must(res, "create file") as { id: string; name: string; ext: string; size: number };
}

export async function updateFileContent(wallet: string, threadId: string, id: string, content: string) {
  const res = await db().from("chat_files")
    .update({ content, size: byteLength(content), updated_at: new Date().toISOString() })
    .eq("id", id).eq("thread_id", threadId).eq("owner_wallet", wallet)
    .select("id, name, ext, size").maybeSingle();
  return must(res, "update file") as { id: string; name: string; ext: string; size: number } | null;
}

export async function getFile(wallet: string, id: string) {
  if (!isUuid(id)) return null;
  const res = await db().from("chat_files").select("id, name, ext, size, content")
    .eq("id", id).eq("owner_wallet", wallet).maybeSingle();
  return must(res, "file") as { id: string; name: string; ext: string; size: number; content: string } | null;
}

export async function listThreadFiles(threadId: string) {
  const res = await db().from("chat_files").select("id, name, ext, size").eq("thread_id", threadId).order("created_at");
  return must(res, "thread files") as { id: string; name: string; ext: string; size: number }[];
}

// ---- routines --------------------------------------------------------------

function rowToRoutine(r: RoutineRow): ChatRoutine {
  return {
    id: r.id, threadId: r.thread_id, botId: r.bot_id, title: r.title, schedule: r.schedule,
    prompt: r.prompt, enabled: r.enabled, nextRunAt: r.next_run_at, lastRunAt: r.last_run_at,
  };
}

export async function listRoutines(wallet: string): Promise<ChatRoutine[]> {
  const res = await db().from("chat_routines").select("*").eq("owner_wallet", wallet).order("created_at");
  return (must(res, "routines") as RoutineRow[]).map(rowToRoutine);
}

export async function createRoutine(wallet: string, input: {
  threadId: string; botId: string; title: string; schedule: RoutineSchedule; prompt: string; nextRunAt: string;
}): Promise<ChatRoutine> {
  const res = await db().from("chat_routines").insert({
    owner_wallet: wallet, thread_id: input.threadId, bot_id: input.botId, title: input.title,
    schedule: input.schedule, prompt: input.prompt, enabled: true, next_run_at: input.nextRunAt,
  }).select("*").single();
  return rowToRoutine(must(res, "create routine") as RoutineRow);
}

export async function deleteRoutine(wallet: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db().from("chat_routines").delete().eq("id", id).eq("owner_wallet", wallet).select("id");
  return (must(res, "delete routine") as unknown[]).length > 0;
}

export async function dueRoutineRows(now: Date, limit = 20): Promise<RoutineRow[]> {
  const res = await db().from("chat_routines").select("*").eq("enabled", true)
    .lte("next_run_at", now.toISOString()).order("next_run_at").limit(limit);
  return must(res, "due routines") as RoutineRow[];
}

/** Claims a due routine by moving next_run_at forward (optimistic lock on the old value). */
export async function claimRoutine(row: RoutineRow, nextRunAt: string, now: Date): Promise<boolean> {
  let q = db().from("chat_routines")
    .update({ next_run_at: nextRunAt, last_run_at: now.toISOString() })
    .eq("id", row.id);
  q = row.next_run_at ? q.eq("next_run_at", row.next_run_at) : q.is("next_run_at", null);
  const res = await q.select("id");
  return (must(res, "claim routine") as unknown[]).length > 0;
}

/** Thread ids with at least one enabled routine (online dot). */
export async function threadsWithActiveRoutines(wallet: string): Promise<Set<string>> {
  const res = await db().from("chat_routines").select("thread_id").eq("owner_wallet", wallet).eq("enabled", true);
  return new Set((must(res, "active routines") as { thread_id: string }[]).map((r) => r.thread_id));
}

// ---- usage + entitlements ----------------------------------------------------

export async function recordRun(input: {
  wallet: string; threadId: string | null; botId: string | null; route: string;
  inputTokens: number; outputTokens: number; costMicros: number;
  status: "ok" | "error" | "quota"; error?: string | null;
}): Promise<void> {
  const res = await db().from("chat_runs").insert({
    owner_wallet: input.wallet, thread_id: input.threadId, bot_id: input.botId, route: input.route,
    input_tokens: input.inputTokens, output_tokens: input.outputTokens, cost_micros: input.costMicros,
    status: input.status, error: input.error?.slice(0, 1000) ?? null,
  });
  if (res.error) console.error("[chat/store] record run", res.error.message);
}

export async function usedTokensToday(wallet: string, now: Date = new Date()): Promise<number> {
  const res = await db().from("chat_runs").select("input_tokens, output_tokens")
    .eq("owner_wallet", wallet).gte("created_at", quotaWindowStart(now)).limit(5000);
  return sumTokens(must(res, "usage") as { input_tokens: number; output_tokens: number }[]);
}

export async function getTier(wallet: string, now: Date = new Date()): Promise<ChatTier> {
  const res = await db().from("chat_entitlements").select("tier, expires_at").eq("wallet", wallet).maybeSingle();
  return effectiveTier(must(res, "entitlement") as { tier: string; expires_at: string | null } | null, now);
}

// ---- utils -----------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
