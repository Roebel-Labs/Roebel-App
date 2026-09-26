// Agent memory (spec §4 memory pack, §5): facts a bot keeps about the human.
// Stored per wallet; bot_id = the bot that remembered it, null = for all bots.
// Tools: remember / recall / forget (risk 'private').
import { z } from "zod";
import { db, isUuid } from "../store";
import type { HarnessTool, ToolRegistry } from "./types";

export const MAX_FACT_CHARS = 500;
export const MAX_MEMORIES_PER_WALLET = 200;
export const CONTEXT_MEMORIES = 20;

export interface MemoryItem {
  id: string;
  botId: string | null;
  fact: string;
  createdAt: string;
}

interface MemoryRow { id: string; wallet: string; bot_id: string | null; fact: string; created_at: string }

const toItem = (r: MemoryRow): MemoryItem => ({ id: r.id, botId: r.bot_id, fact: r.fact, createdAt: r.created_at });

/** Normalises a fact: single spaces, trimmed, ≤ 500 chars. Empty → null. */
export function cleanFact(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > MAX_FACT_CHARS ? `${t.slice(0, MAX_FACT_CHARS - 1)}…` : t;
}

// ---- store ----------------------------------------------------------------------

export async function listMemories(wallet: string, limit = MAX_MEMORIES_PER_WALLET): Promise<MemoryItem[]> {
  const res = await db().from("agent_memory").select("*").eq("wallet", wallet)
    .order("created_at", { ascending: false }).limit(limit);
  if (res.error) throw new Error(`[harness/memory] list: ${res.error.message}`);
  return (res.data as MemoryRow[]).map(toItem);
}

/** Memories visible to `botId`: its own + shared (bot_id null), newest first. */
export async function memoriesForBot(wallet: string, botId: string, limit = CONTEXT_MEMORIES): Promise<MemoryItem[]> {
  const res = await db().from("agent_memory").select("*").eq("wallet", wallet)
    .or(`bot_id.eq.${botId},bot_id.is.null`)
    .order("created_at", { ascending: false }).limit(limit);
  if (res.error) throw new Error(`[harness/memory] for bot: ${res.error.message}`);
  return (res.data as MemoryRow[]).map(toItem);
}

export async function addMemory(wallet: string, botId: string | null, fact: string): Promise<MemoryItem> {
  const res = await db().from("agent_memory").insert({ wallet, bot_id: botId, fact }).select("*").single();
  if (res.error) throw new Error(`[harness/memory] add: ${res.error.message}`);
  return toItem(res.data as MemoryRow);
}

export async function countMemories(wallet: string): Promise<number> {
  const res = await db().from("agent_memory").select("id", { count: "exact", head: true }).eq("wallet", wallet);
  if (res.error) throw new Error(`[harness/memory] count: ${res.error.message}`);
  return res.count ?? 0;
}

export async function deleteMemory(wallet: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db().from("agent_memory").delete().eq("id", id).eq("wallet", wallet).select("id");
  if (res.error) throw new Error(`[harness/memory] delete: ${res.error.message}`);
  return (res.data as unknown[]).length > 0;
}

export async function searchMemories(wallet: string, botId: string, query: string, limit = 10): Promise<MemoryItem[]> {
  const words = query.toLowerCase().split(/\s+/).map((w) => w.replace(/[%_,()*\\]/g, "")).filter((w) => w.length >= 3).slice(0, 5);
  const all = await memoriesForBot(wallet, botId, MAX_MEMORIES_PER_WALLET);
  if (!words.length) return all.slice(0, limit);
  return all
    .map((m) => ({ m, score: words.filter((w) => m.fact.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
}

// ---- tools ----------------------------------------------------------------------

const rememberInput = z.object({
  fact: z.string().min(1).max(MAX_FACT_CHARS).describe("Ein kurzer, eigenständiger Satz, z. B. 'Mag keine Pilze.'"),
  forAllBots: z.boolean().optional().describe("true = alle Bots des Menschen dürfen es wissen"),
});

export const rememberTool: HarnessTool<z.infer<typeof rememberInput>> = {
  name: "remember",
  pack: "memory",
  risk: "private",
  description:
    "Merkt sich eine dauerhafte, nützliche Information über den Menschen (Vorlieben, Familie, Verein, Pläne). " +
    "Nur Dinge, die er selbst gesagt hat und die später helfen; keine Gesundheits-, Finanz- oder Passwortdaten. " +
    "Sag kurz, dass du es dir gemerkt hast.",
  inputSchema: rememberInput,
  summarize: ({ fact }) => `Merken: ${fact.slice(0, 80)}`,
  execute: async ({ fact, forAllBots }, ctx) => {
    const clean = cleanFact(fact);
    if (!clean) return { error: "Leere Notiz." };
    if ((await countMemories(ctx.wallet)) >= MAX_MEMORIES_PER_WALLET) {
      return { error: "Das Gedächtnis ist voll. Der Mensch kann alte Einträge unter „Gedächtnis“ löschen." };
    }
    const m = await addMemory(ctx.wallet, forAllBots ? null : ctx.botId, clean);
    return { ok: true, id: m.id, fact: m.fact };
  },
};

const recallInput = z.object({
  query: z.string().max(200).describe("Stichworte, z. B. 'Essen Allergie'; leer = die neuesten Einträge"),
});

export const recallTool: HarnessTool<z.infer<typeof recallInput>> = {
  name: "recall",
  pack: "memory",
  risk: "private",
  description: "Sucht in dem, was du dir über den Menschen gemerkt hast (über die Liste im Systemtext hinaus).",
  inputSchema: recallInput,
  summarize: ({ query }) => `Im Gedächtnis suchen: ${query || "neueste"}`,
  execute: async ({ query }, ctx) => {
    const items = await searchMemories(ctx.wallet, ctx.botId, query);
    return { memories: items.map((m) => ({ id: m.id, fact: m.fact })) };
  },
};

const forgetInput = z.object({ id: z.string().describe("id des Eintrags (aus der Gedächtnis-Liste oder recall)") });

export const forgetTool: HarnessTool<z.infer<typeof forgetInput>> = {
  name: "forget",
  pack: "memory",
  risk: "private",
  description: "Löscht einen gemerkten Eintrag, wenn der Mensch das möchte oder er nicht mehr stimmt.",
  inputSchema: forgetInput,
  summarize: () => "Gemerkten Eintrag löschen",
  execute: async ({ id }, ctx) => {
    const ok = await deleteMemory(ctx.wallet, id);
    return ok ? { ok: true } : { error: "Diesen Eintrag gibt es nicht." };
  },
};

export function register(registry: ToolRegistry): void {
  registry.registerTool(rememberTool);
  registry.registerTool(recallTool);
  registry.registerTool(forgetTool);
}
