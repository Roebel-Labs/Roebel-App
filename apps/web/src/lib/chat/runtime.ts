// Agent loop for the chat suite (spec §3.6). Framework-agnostic: no next/*
// imports. Routes call runUserTurn / createThreadWithGreeting / runRoutine
// and serialize the emitted events (sse.ts).
import { randomUUID } from "node:crypto";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, hasToolCall, stepCountIs, streamText, tool } from "ai";
import type { ModelMessage, ToolSet, UserContent } from "ai";
import { z } from "zod";
import { estimateCostMicros, resolveModel } from "./models";
import { calendarPromptBlock, formatEventWhen, toCalendarEventPart } from "./calendar";
import { buildSystemPrompt, fallbackGreeting, greetingInstruction } from "./prompts";
import { quotaState } from "./quota";
import { nextRunAt, validateSchedule } from "./schedule";
import { sendChatPush } from "./push";
import { addRoutineTools } from "./routine-tools";
import { SplitStreamer, splitBubbles } from "./split";
import * as store from "./store";
import type { BotRow, MessageRow } from "./store";
import type { CalendarContextEvent, ChatMessage, ChatPart, ChatStreamEvent, ChatThread, SendMessageInput } from "./types";

export type Emit = (e: ChatStreamEvent) => void;

export const CONTEXT_MESSAGES = 30;
export const MAX_STEPS = 6;
export const MAX_BOTS_PER_TURN = 3;
const MAX_TEXT_CHARS = 8000;
const MAX_IMAGES = 4;

export class ChatInputError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// ---- model context -------------------------------------------------------------

function describePartForModel(p: ChatPart): string | null {
  switch (p.type) {
    case "text": return p.text;
    case "options": {
      const opts = p.options.map((o) => `${o.key}) ${o.label}`).join(" · ");
      const sel = p.selected ? p.options.find((o) => o.key === p.selected)?.label ?? p.selected : null;
      return `(Auswahlkarte: ${p.question} — ${opts}${sel ? ` — gewählt: ${sel}` : p.dismissed ? " — verworfen" : ""})`;
    }
    case "file": return `(Datei: ${p.name}.${p.ext}, id ${p.fileId})`;
    case "image": return null;
    case "integration": return `(Integration: ${p.title} — ${p.status === "connected" ? "verbunden" : "noch nicht verbunden"})`;
    case "sources": return p.items.length ? `(Quellen: ${p.items.map((s) => s.url).join(", ")})` : null;
    case "calendar_event": {
      const state = p.status === "added" ? "im Kalender" : p.status === "dismissed" ? "verworfen" : "vorgeschlagen";
      return `(Terminvorschlag: ${p.title}, ${formatEventWhen(p.start, p.end)}${p.location ? `, ${p.location}` : ""} — ${state})`;
    }
  }
}

/**
 * Converts stored rows into model messages from the perspective of `botId`.
 * Own bot messages → assistant; the human and other bots → user (other bots
 * prefixed "[Name]: "). Only the most recent user message carries its images.
 */
export function rowsToModelMessages(
  rows: Pick<MessageRow, "id" | "role" | "bot_id" | "parts">[], botId: string, botNames: Map<string, string>,
  extraUserText?: string,
): ModelMessage[] {
  const lastUserIdx = rows.map((r) => r.role).lastIndexOf("user");
  const out: ModelMessage[] = [];
  rows.forEach((row, i) => {
    const parts = store.partsOf(row.parts);
    const text = parts.map(describePartForModel).filter((s): s is string => Boolean(s && s.trim())).join("\n\n");
    const images = parts.filter((p): p is Extract<ChatPart, { type: "image" }> => p.type === "image");
    if (row.role === "bot" && row.bot_id === botId) {
      if (text) out.push({ role: "assistant", content: text });
      return;
    }
    if (row.role === "bot") {
      const name = (row.bot_id && botNames.get(row.bot_id)) || "Bot";
      if (text) out.push({ role: "user", content: `[${name}]: ${text}` });
      return;
    }
    if (row.role === "system") {
      if (text) out.push({ role: "user", content: `(Hinweis: ${text})` });
      return;
    }
    const content: Exclude<UserContent, string> = [];
    if (i === lastUserIdx) {
      for (const img of images.slice(0, MAX_IMAGES)) {
        try { content.push({ type: "image", image: new URL(img.url) }); } catch { /* bad url */ }
      }
    } else if (images.length) {
      content.push({ type: "text", text: `(${images.length === 1 ? "ein Bild" : `${images.length} Bilder`} angehängt)` });
    }
    if (text) content.push({ type: "text", text });
    if (content.length) out.push({ role: "user", content });
  });
  if (extraUserText) out.push({ role: "user", content: extraUserText });
  // Anthropic requires the conversation to start with a user turn.
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: "(Chat gestartet)" });
  return out;
}

// ---- mentions ------------------------------------------------------------------

/** Which thread bots answer this turn (in thread order). */
export function pickResponders(
  bots: Pick<BotRow, "id" | "name">[], opts: { text: string; mentionBotIds?: string[]; replyToBotId?: string | null },
): string[] {
  const ids = new Set<string>();
  for (const id of opts.mentionBotIds ?? []) if (bots.some((b) => b.id === id)) ids.add(id);
  const lower = opts.text.toLowerCase();
  for (const b of bots) {
    if (lower.includes(`@${b.name.toLowerCase()}`)) ids.add(b.id);
  }
  if (!ids.size && opts.replyToBotId && bots.some((b) => b.id === opts.replyToBotId)) ids.add(opts.replyToBotId);
  if (!ids.size) for (const b of bots) ids.add(b.id);
  return bots.filter((b) => ids.has(b.id)).map((b) => b.id).slice(0, MAX_BOTS_PER_TURN);
}

// ---- one bot turn ----------------------------------------------------------------

interface BotTurnContext {
  wallet: string;
  threadId: string;
  bot: BotRow;
  threadBots: BotRow[];
  emit: Emit;
  hasImages?: boolean;
  extraUserText?: string;
  /** Device-calendar events sent by the app; null/undefined = no read access. */
  calendarContext?: CalendarContextEvent[] | null;
  /** Scheduled routine run (no routine tools, no human watching). */
  routineRun?: boolean;
}

interface BotTurnResult {
  messages: ChatMessage[];
  inputTokens: number;
  outputTokens: number;
}

function mergeSources(into: Map<string, string>, url: unknown, title: unknown) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url) || into.has(url)) return;
  into.set(url, typeof title === "string" && title.trim() ? title.trim() : new URL(url).hostname);
}

async function runBotTurn(ctx: BotTurnContext): Promise<BotTurnResult> {
  const { wallet, threadId, bot, emit } = ctx;
  const route = ctx.hasImages && bot.model_route === "bot-fast" ? "vision" : bot.model_route;
  const resolved = resolveModel(route);
  const enabled = new Set(bot.tools ?? []);
  const canSearch = enabled.has("web_search") && resolved.provider === "anthropic";

  const [rows, files] = await Promise.all([
    store.recentMessageRows(threadId, CONTEXT_MESSAGES),
    store.listThreadFiles(threadId),
  ]);
  const botNames = new Map(ctx.threadBots.map((b) => [b.id, b.name]));
  const messages = rowsToModelMessages(rows, bot.id, botNames, ctx.extraUserText);
  const baseSystem = buildSystemPrompt({
    botName: bot.name,
    instructions: bot.instructions,
    otherBots: ctx.threadBots.filter((b) => b.id !== bot.id).map((b) => b.name),
    files,
    now: new Date(),
    canSearch,
  });
  const hasCalendar = enabled.has("calendar");
  const system = hasCalendar ? `${baseSystem}\n\n${calendarPromptBlock(ctx.calendarContext)}` : baseSystem;

  // Non-text parts collected during the run; attached to the last bubble.
  const extraParts: ChatPart[] = [];
  const sources = new Map<string, string>();

  const tools: ToolSet = {};
  if (hasCalendar) {
    tools.propose_calendar_event = tool({
      description: "Schlägt dem Menschen einen konkreten Termin vor. Er sieht eine Terminkarte und kann ihn mit einem Tipp seinem Kalender hinzufügen.",
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe("Kurzer Titel des Termins"),
        start: z.string().describe("Beginn, ISO 8601 mit Offset, z. B. 2026-09-26T10:00:00+02:00"),
        end: z.string().optional().describe("Ende, ISO 8601 mit Offset; ohne Angabe 1 Stunde nach Beginn"),
        location: z.string().max(200).optional().describe("Ort, falls bekannt"),
        notes: z.string().max(1000).optional().describe("Kurze Notiz zum Termin"),
      }),
      execute: async (input) => {
        const part = toCalendarEventPart(input);
        if ("error" in part) return { error: part.error };
        extraParts.push(part);
        return { ok: true, shown: `${part.title}, ${formatEventWhen(part.start, part.end)}` };
      },
    });
    if (!ctx.calendarContext) {
      tools.request_calendar_access = tool({
        description: "Zeigt eine Karte, mit der der Mensch seinen Gerätekalender (Google/iCloud auf dem Handy) für dich freigeben kann. Nur nutzen, wenn du seine Termine wirklich brauchst.",
        inputSchema: z.object({}),
        execute: async () => {
          const alreadyShown = [...rows.slice(-10).flatMap((r) => store.partsOf(r.parts)), ...extraParts]
            .some((p) => p.type === "integration" && p.provider === "device_calendar" && p.status === "pending");
          if (alreadyShown) return { ok: true, note: "Die Freigabe-Karte ist schon sichtbar. Bitte alternativ ums Diktieren der Termine." };
          extraParts.push({
            type: "integration",
            provider: "device_calendar",
            title: "Kalender",
            description: "Erlaube den Zugriff auf deinen Kalender, damit ich deine Termine der nächsten 7 Tage sehe.",
            status: "pending",
          });
          return { ok: true, note: "Karte wird angezeigt. Biete an, die Termine alternativ zu diktieren." };
        },
      });
    }
  }
  if (enabled.has("ask_options")) {
    tools.ask_options = tool({
      description: "Zeigt dem Menschen eine Auswahlkarte mit 2–5 Optionen (A–E). Danach die Antwort beenden und auf die Wahl warten.",
      inputSchema: z.object({
        question: z.string().min(1).max(200).describe("Kurze Frage über der Karte"),
        options: z.array(z.string().min(1).max(80)).min(2).max(5).describe("Die Optionen als kurze Beschriftungen"),
      }),
      execute: async ({ question, options }) => {
        extraParts.push({
          type: "options",
          question,
          options: options.map((label, i) => ({ key: String.fromCharCode(65 + i), label })),
          selected: null,
        });
        return "Auswahlkarte wird angezeigt. Beende jetzt deine Antwort ohne die Frage zu wiederholen.";
      },
    });
  }
  if (enabled.has("files")) {
    tools.write_file = tool({
      description: "Legt eine neue Markdown-Datei im Chat an (für lange oder strukturierte Inhalte). Der Mensch sieht eine Dateikarte.",
      inputSchema: z.object({
        name: z.string().min(1).max(80).describe("Dateiname ohne Endung, z. B. 'Wochenplan'"),
        content: z.string().min(1).max(100_000).describe("Vollständiger Markdown-Inhalt"),
      }),
      execute: async ({ name, content }) => {
        const clean = name.replace(/\.(md|markdown|txt)$/i, "").replace(/[/\\]/g, "-").trim() || "Notiz";
        const f = await store.createFile(wallet, threadId, clean, "md", content);
        extraParts.push({ type: "file", fileId: f.id, name: f.name, ext: f.ext, size: f.size });
        return { fileId: f.id, name: `${f.name}.${f.ext}` };
      },
    });
    tools.update_file = tool({
      description: "Ersetzt den Inhalt einer bestehenden Datei dieses Chats (vollständiger neuer Inhalt).",
      inputSchema: z.object({
        fileId: z.string().describe("id der Datei"),
        content: z.string().min(1).max(100_000),
      }),
      execute: async ({ fileId, content }) => {
        if (!store.isUuid(fileId)) return { error: "Unbekannte Datei-id." };
        const f = await store.updateFileContent(wallet, threadId, fileId, content);
        if (!f) return { error: "Datei nicht gefunden." };
        extraParts.push({ type: "file", fileId: f.id, name: f.name, ext: f.ext, size: f.size });
        return { fileId: f.id, name: `${f.name}.${f.ext}`, updated: true };
      },
    });
  }
  // create_routine / list_routines / delete_routine (not during a routine run itself).
  if (!ctx.routineRun) addRoutineTools(tools, { wallet, threadId, botId: bot.id });
  if (canSearch) {
    tools.web_search = anthropic.tools.webSearch_20250305({
      maxUses: 5,
      userLocation: { type: "approximate", city: "Röbel/Müritz", region: "Mecklenburg-Vorpommern", country: "DE", timezone: "Europe/Berlin" },
    });
  }

  const result = streamText({
    model: resolved.model,
    system,
    messages,
    tools,
    stopWhen: [stepCountIs(MAX_STEPS), hasToolCall("ask_options")],
    maxOutputTokens: 4000,
  });

  const done: ChatMessage[] = [];
  let messageId = randomUUID();
  let bubbleText = "";
  let needsSeparator = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let streamError: unknown = null;
  const splitter = new SplitStreamer();

  emit({ event: "bot_start", data: { botId: bot.id, messageId } });

  const persistBubble = async (final: boolean) => {
    const parts: ChatPart[] = [];
    const text = bubbleText.trim();
    if (text) parts.push({ type: "text", text });
    if (final) {
      if (sources.size) extraParts.push({ type: "sources", items: [...sources].map(([url, title]) => ({ url, title })) });
      for (const p of extraParts) {
        parts.push(p);
        emit({ event: "part", data: { messageId, part: p } });
      }
      if (!parts.length) {
        const fallback = streamError
          ? "Entschuldige, da ist gerade etwas schiefgelaufen. Magst du es noch einmal versuchen?"
          : "Hm, dazu fällt mir gerade nichts ein. Magst du es anders formulieren?";
        parts.push({ type: "text", text: fallback });
        emit({ event: "delta", data: { messageId, text: fallback } });
      }
    } else if (!parts.length) {
      return false;
    }
    const row = await store.insertMessage({ id: messageId, threadId, role: "bot", botId: bot.id, parts });
    const msg = await store.toMessage(row);
    done.push(msg);
    emit({ event: "bot_done", data: { message: msg } });
    return true;
  };

  const applySplit = async (events: ReturnType<SplitStreamer["push"]>) => {
    for (const ev of events) {
      if (ev.type === "text") {
        let t = ev.text;
        if (!bubbleText.trim()) t = t.replace(/^\s+/, "");
        if (!t) continue;
        bubbleText += t;
        emit({ event: "delta", data: { messageId, text: t } });
      } else if (await persistBubble(false)) {
        messageId = randomUUID();
        bubbleText = "";
        emit({ event: "bot_start", data: { botId: bot.id, messageId } });
      }
    }
  };

  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          let t = part.text;
          if (needsSeparator && t) { t = `\n\n${t}`; needsSeparator = false; }
          await applySplit(splitter.push(t));
          break;
        }
        case "finish-step":
          if (bubbleText.trim()) needsSeparator = true;
          break;
        case "source":
          if (part.sourceType === "url") mergeSources(sources, part.url, part.title);
          break;
        case "tool-result":
          if (part.toolName === "web_search" && Array.isArray(part.output)) {
            for (const r of part.output as { url?: unknown; title?: unknown }[]) mergeSources(sources, r?.url, r?.title);
          }
          break;
        case "finish":
          inputTokens = part.totalUsage.inputTokens ?? 0;
          outputTokens = part.totalUsage.outputTokens ?? 0;
          break;
        case "error":
          streamError = part.error;
          break;
      }
      if (streamError) break;
    }
  } catch (err) {
    streamError = err;
  }
  await applySplit(splitter.end());
  await persistBubble(true);

  await store.recordRun({
    wallet, threadId, botId: bot.id, route: resolved.route,
    inputTokens, outputTokens,
    costMicros: resolved.provider === "anthropic" ? estimateCostMicros(resolved.modelId, inputTokens, outputTokens) : 0,
    status: streamError ? "error" : "ok",
    error: streamError ? errorText(streamError) : null,
  });
  if (streamError) console.error("[chat/runtime] model stream failed", streamError);
  return { messages: done, inputTokens, outputTokens };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- user turn -------------------------------------------------------------------

export async function checkQuota(wallet: string) {
  const [tier, used] = await Promise.all([store.getTier(wallet), store.usedTokensToday(wallet)]);
  return { tier, ...quotaState(used, tier) };
}

export const QUOTA_MESSAGE = "Dein Tageskontingent ist aufgebraucht. Mit Ultra geht's sofort weiter – oder morgen wieder kostenlos.";

/**
 * Runs one user turn: persists the user message, then each addressed bot
 * answers in turn. Emits the SSE events of spec §3.5. Throws ChatInputError
 * for invalid input BEFORE anything is emitted or persisted.
 */
export async function runUserTurn(opts: {
  wallet: string; thread: ChatThread; input: SendMessageInput; emit: Emit;
}): Promise<void> {
  const { wallet, thread, input, emit } = opts;
  const text = typeof input.text === "string" ? input.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  const imageUrls = (Array.isArray(input.imageUrls) ? input.imageUrls : [])
    .filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)).slice(0, MAX_IMAGES);

  const quota = await checkQuota(wallet);
  if (quota.exceeded) {
    await store.recordRun({ wallet, threadId: thread.id, botId: null, route: "-", inputTokens: 0, outputTokens: 0, costMicros: 0, status: "quota" });
    emit({ event: "error", data: { code: "quota", message: QUOTA_MESSAGE } });
    return;
  }

  // Option answer: mark the card, use the label as text when none given.
  let userText = text;
  if (input.optionAnswer) {
    const { messageId, key } = input.optionAnswer;
    const row = await store.getMessageRow(wallet, messageId);
    if (!row || row.thread_id !== thread.id) throw new ChatInputError("not_found", "Die Auswahlkarte wurde nicht gefunden.", 404);
    const parts = store.partsOf(row.parts);
    const idx = parts.findIndex((p) => p.type === "options");
    const card = idx >= 0 ? (parts[idx] as Extract<ChatPart, { type: "options" }>) : null;
    const option = card?.options.find((o) => o.key === key);
    if (!card || !option) throw new ChatInputError("bad_request", "Diese Option gibt es nicht.");
    parts[idx] = { ...card, selected: key, dismissed: false };
    await store.updateMessageParts(row.id, parts);
    if (!userText) userText = option.label;
  }
  if (!userText && !imageUrls.length) throw new ChatInputError("bad_request", "Die Nachricht ist leer.");

  let replyToId: string | null = null;
  let replyToBotId: string | null = null;
  if (input.replyToId) {
    const r = await store.getMessageRow(wallet, input.replyToId);
    if (r && r.thread_id === thread.id) { replyToId = r.id; replyToBotId = r.bot_id; }
  }

  const userParts: ChatPart[] = [
    ...imageUrls.map((url) => ({ type: "image", url }) as ChatPart),
    ...(userText ? [{ type: "text", text: userText } as ChatPart] : []),
  ];
  const userRow = await store.insertMessage({ threadId: thread.id, role: "user", parts: userParts, replyToId });
  const userMsg = await store.toMessage(userRow);
  await store.touchThread(thread.id, store.previewOfParts(userParts), userRow.created_at, { read: true });
  emit({ event: "user", data: { message: userMsg } });

  const threadBots = await store.getThreadBotRows(thread.id);
  const responders = pickResponders(threadBots, {
    text: userText, mentionBotIds: input.mentionBotIds, replyToBotId,
  });

  let last: ChatMessage | null = null;
  let spent = 0;
  for (const botId of responders) {
    const bot = threadBots.find((b) => b.id === botId)!;
    if (spent > 0 && quota.used + spent >= quota.limit) break;
    const res = await runBotTurn({
      wallet, threadId: thread.id, bot, threadBots, emit, hasImages: imageUrls.length > 0,
      calendarContext: input.calendarContext ?? null,
    });
    spent += res.inputTokens + res.outputTokens;
    if (res.messages.length) last = res.messages[res.messages.length - 1];
  }
  if (last) await store.touchThread(thread.id, previewForThread(last, threadBots), last.createdAt);

  const fresh = await store.getThread(wallet, thread.id);
  if (fresh) emit({ event: "done", data: { thread: fresh } });
}

function previewForThread(msg: ChatMessage, bots: BotRow[]): string {
  const preview = store.previewOfParts(msg.parts);
  if (bots.length > 1 && msg.botId) {
    const name = bots.find((b) => b.id === msg.botId)?.name;
    if (name) return `${name}: ${preview}`;
  }
  return preview;
}

// ---- thread create + greeting ------------------------------------------------------

export async function createThreadWithGreeting(wallet: string, botIds: string[]): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
  const unique = [...new Set(botIds.filter(store.isUuid))].slice(0, 8);
  if (!unique.length) throw new ChatInputError("bad_request", "Bitte wähle mindestens einen Bot.");
  const rows = await store.getUsableBotRows(wallet, unique);
  if (rows.length !== unique.length) throw new ChatInputError("not_found", "Mindestens ein Bot wurde nicht gefunden.", 404);
  const ordered = unique.map((id) => rows.find((r) => r.id === id)!);
  const thread = await store.createThread(wallet, ordered);

  const quota = await checkQuota(wallet);
  const isGroup = ordered.length > 1;
  const greeters = ordered.slice(0, 2);
  const messages: ChatMessage[] = [];
  for (const bot of greeters) {
    const bubbles = quota.exceeded ? [] : await generateGreeting(wallet, thread.id, bot, ordered, isGroup);
    const texts = bubbles.length ? bubbles : [fallbackGreeting(bot.name, bot.description)];
    for (const t of texts.slice(0, isGroup ? 1 : 2)) {
      const row = await store.insertMessage({ threadId: thread.id, role: "bot", botId: bot.id, parts: [{ type: "text", text: t }] });
      messages.push(await store.toMessage(row));
    }
  }
  const last = messages[messages.length - 1];
  if (last) {
    // Greetings count as read: the user is looking at them right now.
    await store.touchThread(thread.id, previewForThread(last, ordered), last.createdAt, { read: true });
  }
  const fresh = (await store.getThread(wallet, thread.id)) ?? thread;
  return { thread: fresh, messages };
}

async function generateGreeting(wallet: string, threadId: string, bot: BotRow, all: BotRow[], isGroup: boolean): Promise<string[]> {
  const resolved = resolveModel("bot-fast");
  try {
    const res = await generateText({
      model: resolved.model,
      system: buildSystemPrompt({
        botName: bot.name, instructions: bot.instructions,
        otherBots: all.filter((b) => b.id !== bot.id).map((b) => b.name),
        files: [], now: new Date(), canSearch: false,
      }),
      messages: [{ role: "user", content: greetingInstruction({ isGroup, otherBots: all.filter((b) => b.id !== bot.id).map((b) => b.name) }) }],
      maxOutputTokens: 300,
    });
    const inputTokens = res.totalUsage.inputTokens ?? 0;
    const outputTokens = res.totalUsage.outputTokens ?? 0;
    await store.recordRun({
      wallet, threadId, botId: bot.id, route: resolved.route, inputTokens, outputTokens,
      costMicros: resolved.provider === "anthropic" ? estimateCostMicros(resolved.modelId, inputTokens, outputTokens) : 0,
      status: "ok",
    });
    return splitBubbles(res.text, 2);
  } catch (err) {
    console.error("[chat/runtime] greeting failed", err);
    await store.recordRun({ wallet, threadId, botId: bot.id, route: resolved.route, inputTokens: 0, outputTokens: 0, costMicros: 0, status: "error", error: errorText(err) });
    return [];
  }
}

// ---- routines ------------------------------------------------------------------------

/** Stop claiming new routines after this long; the rest run on the next 5-minute tick. */
export const ROUTINE_BUDGET_MS = 200_000;

export interface RoutineReport { ran: number; skipped: number; quota: number; failed: number; pushed: number; deferred: number }

/**
 * Runs every due routine once (Vercel cron, every 5 min). Each routine is
 * claimed first (next_run_at moves forward, optimistic lock), so overlapping
 * ticks never double-post. Over quota → recorded as a 'quota' run and skipped.
 * After a post the thread owner gets a push that opens the thread.
 */
export async function runDueRoutines(now: Date = new Date()): Promise<RoutineReport> {
  const started = Date.now();
  const due = await store.dueRoutineRows(now);
  const report: RoutineReport = { ran: 0, skipped: 0, quota: 0, failed: 0, pushed: 0, deferred: 0 };
  for (const row of due) {
    if (Date.now() - started > ROUTINE_BUDGET_MS) { report.deferred++; continue; }
    const schedule = validateSchedule(row.schedule);
    const next = schedule ? nextRunAt(schedule, now).toISOString() : new Date(now.getTime() + 86_400_000).toISOString();
    if (!(await store.claimRoutine(row, next, now))) { report.skipped++; continue; }
    try {
      const thread = await store.getThread(row.owner_wallet, row.thread_id);
      const threadBots = thread ? await store.getThreadBotRows(thread.id) : [];
      const bot = threadBots.find((b) => b.id === row.bot_id) ?? (await store.getBotRow(row.bot_id));
      if (!thread || !bot || !schedule) { report.skipped++; continue; }
      const quota = await checkQuota(row.owner_wallet);
      if (quota.exceeded) {
        await store.recordRun({
          wallet: row.owner_wallet, threadId: thread.id, botId: bot.id, route: "routine",
          inputTokens: 0, outputTokens: 0, costMicros: 0, status: "quota", error: `routine ${row.id} skipped: quota`,
        });
        report.quota++;
        continue;
      }
      const res = await runBotTurn({
        wallet: row.owner_wallet, threadId: thread.id, bot, threadBots: threadBots.length ? threadBots : [bot],
        emit: () => {},
        routineRun: true,
        extraUserText: `(Automatische Routine „${row.title}“ – der Mensch hat das so geplant, er schreibt gerade nicht aktiv.) ${row.prompt}`,
      });
      const last = res.messages[res.messages.length - 1];
      if (last) {
        const preview = store.previewOfParts(last.parts);
        await store.touchThread(thread.id, previewForThread(last, threadBots), last.createdAt);
        const pushed = await sendChatPush({
          wallet: row.owner_wallet, threadId: thread.id, title: `${bot.name} · ${row.title}`, body: preview,
        });
        if (pushed) report.pushed++;
      }
      report.ran++;
    } catch (err) {
      console.error("[chat/runtime] routine failed", row.id, err);
      report.failed++;
    }
  }
  return report;
}
