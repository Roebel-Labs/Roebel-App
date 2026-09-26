// Task worker (spec §3.2 GET /api/chat/cron/tasks, §4 tasks pack). One tick:
// claim (guarded) → rebuild the bot's context → run the agent loop with the
// goal + checkpoint + task-mode rules → persist steps/checkpoint → either
// requeue, wait for an approval, or finish (bot message + push).
// Entry points: runTaskTick (cron + kick), runDueTasks (cron), kickTask
// (after() right after start_task / an approval decision), askBot (ask_bot tool).
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, hasToolCall, stepCountIs } from "ai";
import type { StopCondition, ToolSet } from "ai";
import { estimateCostMicros, resolveModel } from "../models";
import { buildSystemPrompt } from "../prompts";
import { sendChatPush } from "../push";
import { checkQuota, rowsToModelMessages } from "../runtime";
import * as store from "../store";
import type { BotRow } from "../store";
import type { ChatPart } from "../types";
import { attachMessage } from "./audit";
import { buildHarnessContext, harnessSystemBlock } from "./context";
import { isGated } from "./policy";
import { findTool, getTool, isAwaitingApproval, toolsFor, wrapTool } from "./registry";
import {
  MAX_ATTEMPTS, MAX_RUNNING_PER_WALLET, TASK_MODE_RULES, claimTask, claimVerdict, clip, getTaskById,
  normalizeCheckpoint, normalizeSteps, patchTaskPart, runningTaskCount, settleSteps, taskNote,
  updateTask, dueTaskIds,
} from "./tasks";
import type { TaskCheckpoint, TaskFileRef, TaskRow } from "./tasks";
import type { HarnessContext } from "./types";

/** Model time per cron tick (cron maxDuration is 300 s). */
export const TICK_BUDGET_MS = 240_000;
/** Model time for the immediate kick (shares the request's 300 s with the chat turn). */
export const KICK_BUDGET_MS = 180_000;
/** Model steps (tool rounds) per tick. */
export const TICK_MAX_MODEL_STEPS = 16;
/** Parallel ticks per cron run. */
export const CRON_PARALLEL = 4;
const RETRY_BACKOFF_MS = 2 * 60_000;
const QUOTA_BACKOFF_MS = 30 * 60_000;

/** Chat tools that make no sense without a human watching (plus no nested tasks). */
export const TASK_DENY = ["ask_options", "request_calendar_access", "start_task"] as const;
/** Tools a bot answering ask_bot never gets (no recursion, no cards, no side effects). */
export const ASK_BOT_DENY = [
  "ask_bot", "start_task", "update_task_step", "complete_task", "ask_options", "request_calendar_access",
  "write_file", "update_file", "propose_calendar_event", "remember", "forget",
] as const;

export type TickOutcome =
  | "missing" | "skipped" | "quota" | "lost" | "concurrency"
  | "requeued" | "waiting_approval" | "done" | "failed" | "cancelled";

const stopOnApproval: StopCondition<ToolSet> = ({ steps }) =>
  (steps[steps.length - 1]?.toolResults ?? []).some((r) => isAwaitingApproval((r as { output?: unknown }).output));

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function resolveBot(row: TaskRow, threadBots: BotRow[]): Promise<BotRow | null> {
  const inThread = threadBots.find((b) => b.id === row.bot_id);
  if (inThread) return inThread;
  if (row.bot_id) {
    const b = await store.getBotRow(row.bot_id);
    if (b && (b.is_preset || b.owner_wallet === row.wallet)) return b;
  }
  return threadBots[0] ?? null;
}

function mergeFiles(cp: TaskCheckpoint, emitted: ChatPart[]): TaskCheckpoint {
  const files = [...(cp.files ?? [])];
  for (const p of emitted) {
    if (p.type !== "file") continue;
    const ref: TaskFileRef = { fileId: p.fileId, name: p.name, ext: p.ext, size: p.size };
    const i = files.findIndex((f) => f.fileId === p.fileId);
    if (i >= 0) files[i] = ref; else files.push(ref);
  }
  return { ...cp, files };
}

/** Posts a bot message into the task's thread, bumps the thread and pushes the owner. */
async function postBotMessage(row: TaskRow, bot: BotRow | null, parts: ChatPart[], pushTitle: string): Promise<string | null> {
  try {
    const msg = await store.insertMessage({ threadId: row.thread_id, role: "bot", botId: bot?.id ?? row.bot_id, parts });
    const preview = store.previewOfParts(parts);
    await store.touchThread(row.thread_id, preview, msg.created_at);
    await sendChatPush({ wallet: row.wallet, threadId: row.thread_id, title: pushTitle, body: preview });
    return msg.id;
  } catch (err) {
    console.error("[harness/task-worker] post message failed", row.id, err);
    return null;
  }
}

/** Final message for done/failed tasks: result text + files the task wrote (+ other cards of this tick). */
export function finalMessageParts(
  row: Pick<TaskRow, "title" | "status" | "result" | "error">, cp: TaskCheckpoint, extra: ChatPart[] = [],
): ChatPart[] {
  const parts: ChatPart[] = [];
  if (row.status === "done") {
    parts.push({ type: "text", text: `**Aufgabe erledigt: ${row.title}**\n\n${row.result?.trim() || "Fertig."}` });
  } else {
    parts.push({
      type: "text",
      text: `Die Aufgabe „${row.title}“ konnte ich leider nicht abschließen.${row.error ? ` ${row.error}` : ""}`,
    });
  }
  for (const f of cp.files ?? []) parts.push({ type: "file", fileId: f.fileId, name: f.name, ext: f.ext, size: f.size });
  for (const p of extra) if (p.type === "calendar_event" || p.type === "sources") parts.push(p);
  return parts;
}

async function finish(
  row: TaskRow, bot: BotRow | null, outcome: "done" | "failed", cp: TaskCheckpoint,
  opts: { result?: string; error?: string; extra?: ChatPart[] } = {},
): Promise<TickOutcome> {
  let fresh: TaskRow | null = row;
  if (row.status !== outcome) {
    fresh = await updateTask(row.id, ["running", "queued", "waiting_approval"], {
      status: outcome,
      steps: settleSteps(normalizeSteps(row.steps), outcome),
      checkpoint: cp,
      ...(outcome === "done" ? { result: opts.result ?? row.result ?? "Fertig." } : { error: opts.error ?? row.error ?? "Unbekannter Fehler." }),
    });
    if (!fresh) return "cancelled";
  } else {
    // complete_task already set the status; store the files.
    fresh = (await updateTask(row.id, outcome, { checkpoint: cp })) ?? row;
  }
  await patchTaskPart(fresh);
  const title = outcome === "done" ? "Aufgabe erledigt" : "Aufgabe fehlgeschlagen";
  await postBotMessage(fresh, bot, finalMessageParts(fresh, cp, opts.extra), `${bot?.name ?? "Bot"} · ${title}`);
  return outcome;
}

// ---- one tick ------------------------------------------------------------------------

export async function runTaskTick(taskId: string, opts: { budgetMs?: number; now?: Date } = {}): Promise<TickOutcome> {
  const now = opts.now ?? new Date();
  const row = await getTaskById(taskId);
  if (!row) return "missing";

  const verdict = claimVerdict(row, now, await runningTaskCount(row.wallet, now));
  if (!verdict.ok) {
    if (verdict.reason === "attempts") {
      return finish(row, null, "failed", normalizeCheckpoint(row.checkpoint), {
        error: "Die Aufgabe hat zu viele Anläufe gebraucht.",
      });
    }
    return verdict.reason === "concurrency" ? "concurrency" : "skipped";
  }

  const quota = await checkQuota(row.wallet);
  if (quota.exceeded) {
    await updateTask(row.id, row.status, {
      status: "queued", nextTickAt: new Date(now.getTime() + QUOTA_BACKOFF_MS),
    });
    return "quota";
  }

  const claimed = await claimTask(row, now);
  if (!claimed) return "lost";
  // Two workers can both see 2 running and claim → re-check and step back.
  if (row.status === "queued" && (await runningTaskCount(row.wallet, now)) > MAX_RUNNING_PER_WALLET) {
    await updateTask(claimed.id, "running", {
      status: "queued", attempts: row.attempts, nextTickAt: new Date(now.getTime() + 30_000),
    });
    return "concurrency";
  }
  await patchTaskPart(claimed);

  try {
    return await runClaimed(claimed, opts.budgetMs ?? TICK_BUDGET_MS);
  } catch (err) {
    console.error("[harness/task-worker] tick failed", claimed.id, err);
    const cp = normalizeCheckpoint(claimed.checkpoint);
    if (claimed.attempts >= MAX_ATTEMPTS) return finish(claimed, null, "failed", cp, { error: "Ein technischer Fehler ist aufgetreten." });
    const back = await updateTask(claimed.id, "running", {
      status: "queued", nextTickAt: new Date(Date.now() + RETRY_BACKOFF_MS),
    });
    if (back) await patchTaskPart(back);
    return "requeued";
  }
}

async function runClaimed(row: TaskRow, budgetMs: number): Promise<TickOutcome> {
  const thread = await store.getThread(row.wallet, row.thread_id);
  const threadBots = thread ? await store.getThreadBotRows(thread.id) : [];
  const bot = thread ? await resolveBot(row, threadBots) : null;
  if (!thread || !bot) {
    return finish(row, bot, "failed", normalizeCheckpoint(row.checkpoint), { error: "Der Chat oder Bot dieser Aufgabe existiert nicht mehr." });
  }

  const resolved = resolveModel(bot.model_route);
  const enabled = new Set(bot.tools ?? []);
  const canSearch = enabled.has("web_search") && resolved.provider === "anthropic";
  const [rows, files] = await Promise.all([
    store.recentMessageRows(thread.id, 20),
    store.listThreadFiles(thread.id),
  ]);
  const emitted: ChatPart[] = [];
  const harness = await buildHarnessContext({
    wallet: row.wallet, threadId: thread.id, botId: bot.id, taskId: row.id,
    emitPart: (p) => { emitted.push(p); },
    turn: { routineRun: true, calendarContext: null, recentParts: [], emitted },
  });
  const baseSystem = buildSystemPrompt({
    botName: bot.name, instructions: bot.instructions,
    otherBots: threadBots.filter((b) => b.id !== bot.id).map((b) => b.name),
    files, now: new Date(), canSearch,
  });
  const system = [baseSystem, await harnessSystemBlock(harness, { withMemory: enabled.has("memory") }), TASK_MODE_RULES].join("\n\n");

  const tools = await toolsFor({ bot, ctx: harness });
  for (const name of TASK_DENY) delete tools[name];
  // Task-mode tools are always there while a task runs, whatever the bot's keys say.
  for (const name of ["update_task_step", "complete_task"]) {
    const t = getTool(name);
    if (t && !tools[name]) {
      tools[name] = wrapTool(t, harness, { grants: new Set(), policy: { actionsEnabled: true, paused: false, usedToday: 0 } });
    }
  }
  if (canSearch) {
    tools.web_search = anthropic.tools.webSearch_20250305({
      maxUses: 8,
      userLocation: { type: "approximate", city: "Röbel/Müritz", region: "Mecklenburg-Vorpommern", country: "DE", timezone: "Europe/Berlin" },
    });
  }

  const botNames = new Map(threadBots.map((b) => [b.id, b.name]));
  const messages = rowsToModelMessages(rows, bot.id, botNames, taskNote(row));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let lastText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cancelled = false;
  let timedOut = false;
  let modelError: unknown = null;
  let finishReason: string | null = null;
  try {
    const res = await generateText({
      model: resolved.model,
      system,
      messages,
      tools,
      stopWhen: [stepCountIs(TICK_MAX_MODEL_STEPS), hasToolCall("complete_task"), stopOnApproval],
      maxOutputTokens: 4000,
      abortSignal: controller.signal,
      onStepFinish: async (step) => {
        inputTokens += step.usage?.inputTokens ?? 0;
        outputTokens += step.usage?.outputTokens ?? 0;
        if (step.text?.trim()) lastText = step.text.trim();
        const fresh = await getTaskById(row.id).catch(() => null);
        if (fresh?.status === "cancelled") { cancelled = true; controller.abort(); }
      },
    });
    finishReason = res.finishReason;
    if (res.text?.trim()) lastText = res.text.trim();
  } catch (err) {
    if (controller.signal.aborted) timedOut = !cancelled;
    else modelError = err;
  } finally {
    clearTimeout(timer);
  }

  await store.recordRun({
    wallet: row.wallet, threadId: thread.id, botId: bot.id, route: resolved.route,
    inputTokens, outputTokens,
    costMicros: resolved.provider === "anthropic" ? estimateCostMicros(resolved.modelId, inputTokens, outputTokens) : 0,
    status: modelError ? "error" : "ok",
    error: modelError ? `task ${row.id}: ${errorText(modelError)}` : null,
  });

  let cp = mergeFiles(normalizeCheckpoint((await getTaskById(row.id))?.checkpoint ?? row.checkpoint), emitted);
  if (lastText) cp = { ...cp, lastText: clip(lastText, 2000) };
  const fresh = await getTaskById(row.id);
  if (!fresh || fresh.status === "cancelled" || cancelled) return "cancelled";

  // complete_task ran.
  if (fresh.status === "done" || fresh.status === "failed") return finish(fresh, bot, fresh.status, cp, { extra: emitted });

  // A gated tool asked for approval → card message + wait.
  const approvals = emitted.filter((p): p is Extract<ChatPart, { type: "approval" }> => p.type === "approval");
  if (approvals.length) {
    const waiting = await updateTask(row.id, "running", { status: "waiting_approval", checkpoint: cp });
    if (!waiting) return "cancelled";
    await patchTaskPart(waiting);
    const extra = emitted.filter((p) => p.type === "calendar_event");
    const msgId = await postBotMessage(waiting, bot, [
      { type: "text", text: `Für die Aufgabe „${row.title}“ brauche ich kurz deine Freigabe.` },
      ...approvals, ...extra,
    ], `${bot.name} · Freigabe nötig`);
    if (msgId) await attachMessage(approvals.map((a) => a.actionId), msgId);
    return "waiting_approval";
  }

  if (modelError) {
    if (fresh.attempts >= MAX_ATTEMPTS) return finish(fresh, bot, "failed", cp, { error: "Das Modell war mehrfach nicht erreichbar." });
    const back = await updateTask(row.id, "running", { status: "queued", checkpoint: cp, nextTickAt: new Date(Date.now() + RETRY_BACKOFF_MS) });
    if (back) await patchTaskPart(back);
    return "requeued";
  }

  // Out of time or steps → next tick continues from the checkpoint.
  if (timedOut || finishReason === "tool-calls" || finishReason === "length") {
    if (fresh.attempts >= MAX_ATTEMPTS) {
      return finish(fresh, bot, "failed", cp, { error: "Die Aufgabe war zu umfangreich für die verfügbare Zeit." });
    }
    const back = await updateTask(row.id, "running", { status: "queued", checkpoint: cp, nextTickAt: new Date() });
    if (back) await patchTaskPart(back);
    return "requeued";
  }

  // The model stopped on its own without complete_task: its last text is the result.
  return finish(fresh, bot, "done", cp, { result: lastText || cp.lastText || "Fertig.", extra: emitted });
}

// ---- cron ---------------------------------------------------------------------------

export interface TaskCronReport { picked: number; outcomes: Record<string, number> }

export async function runDueTasks(now: Date = new Date()): Promise<TaskCronReport> {
  const ids = await dueTaskIds(now, CRON_PARALLEL * 2);
  const outcomes: Record<string, number> = {};
  let next = 0;
  const lane = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      const out = await runTaskTick(id, { now: new Date() }).catch((err) => {
        console.error("[harness/task-worker] cron tick", id, err);
        return "failed" as TickOutcome;
      });
      outcomes[out] = (outcomes[out] ?? 0) + 1;
      // One long tick per lane is enough for this minute.
      if (out === "requeued" || out === "done" || out === "failed" || out === "waiting_approval") break;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CRON_PARALLEL, ids.length) }, lane));
  return { picked: ids.length, outcomes };
}

/**
 * Runs a tick right after the current response (next/server after()). Outside
 * a request scope (tests, scripts) it is a no-op: the minute cron picks it up.
 */
export async function kickTask(taskId: string): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(async () => {
      try {
        await runTaskTick(taskId, { budgetMs: KICK_BUDGET_MS });
      } catch (err) {
        console.error("[harness/task-worker] kick failed", taskId, err);
      }
    });
  } catch {
    // No request scope: the cron runs it within a minute.
  }
}

// ---- ask_bot ----------------------------------------------------------------------------

export function matchBot(bots: Pick<BotRow, "id" | "slug" | "name">[], query: string): Pick<BotRow, "id" | "slug" | "name"> | null {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  if (!q) return null;
  return bots.find((b) => b.id === query.trim())
    ?? bots.find((b) => b.slug?.toLowerCase() === q)
    ?? bots.find((b) => b.name.toLowerCase() === q)
    ?? bots.find((b) => b.name.toLowerCase().startsWith(q))
    ?? null;
}

export async function askBot(ctx: HarnessContext, input: { botSlugOrName: string; question: string }): Promise<unknown> {
  const res = await store.db().from("chat_bots").select("*")
    .or(`is_preset.eq.true,owner_wallet.eq.${ctx.wallet}`).limit(200);
  if (res.error) throw new Error(`[harness/task-worker] ask_bot bots: ${res.error.message}`);
  const bots = res.data as BotRow[];
  const hit = matchBot(bots, input.botSlugOrName);
  const target = hit ? bots.find((b) => b.id === hit.id)! : null;
  if (!target) {
    return { error: `Keinen Bot „${input.botSlugOrName}“ gefunden. Verfügbar: ${bots.slice(0, 12).map((b) => b.name).join(", ")}.` };
  }
  if (target.id === ctx.botId) return { error: "Du kannst dich nicht selbst fragen." };
  const quota = await checkQuota(ctx.wallet);
  if (quota.exceeded) return { error: "Das Tageskontingent ist aufgebraucht." };

  const resolved = resolveModel(target.model_route);
  const enabled = new Set(target.tools ?? []);
  const canSearch = enabled.has("web_search") && resolved.provider === "anthropic";
  const nested = await buildHarnessContext({
    wallet: ctx.wallet, threadId: ctx.threadId, botId: target.id, taskId: null,
    emitPart: () => { /* no cards from a consulted bot */ },
    profile: ctx.profile,
    turn: { routineRun: true, calendarContext: null, recentParts: [], emitted: [] },
  });
  const tools = await toolsFor({ bot: target, ctx: nested });
  for (const name of Object.keys(tools)) {
    // findTool also knows the wallet's connector tools; unknown tools are dropped, never kept.
    const t = await findTool(name, ctx.wallet);
    if ((ASK_BOT_DENY as readonly string[]).includes(name) || !t || isGated(t.risk)) delete tools[name];
  }
  if (canSearch) tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: 3 });

  const asker = (await store.getBotRow(ctx.botId).catch(() => null))?.name ?? "ein anderer Bot";
  const system = [
    buildSystemPrompt({ botName: target.name, instructions: target.instructions, otherBots: [], files: [], now: new Date(), canSearch }),
    await harnessSystemBlock(nested, { withMemory: false }),
    `Du wirst gerade von ${asker} um Rat gefragt, nicht direkt vom Menschen. Antworte sachlich und knapp (höchstens 12 Sätze), ` +
      "ohne Rückfragen und ohne Auswahlkarten. Deine Antwort wird weitergegeben.",
  ].join("\n\n");

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const out = await generateText({
      model: resolved.model,
      system,
      messages: [{ role: "user", content: input.question }],
      tools,
      stopWhen: stepCountIs(4),
      maxOutputTokens: 1500,
      abortSignal: AbortSignal.timeout(90_000),
    });
    inputTokens = out.totalUsage.inputTokens ?? 0;
    outputTokens = out.totalUsage.outputTokens ?? 0;
    await store.recordRun({
      wallet: ctx.wallet, threadId: ctx.threadId, botId: target.id, route: resolved.route, inputTokens, outputTokens,
      costMicros: resolved.provider === "anthropic" ? estimateCostMicros(resolved.modelId, inputTokens, outputTokens) : 0,
      status: "ok",
    });
    const answer = out.text.trim();
    return answer ? { bot: target.name, answer: clip(answer, 6000) } : { bot: target.name, error: "Keine Antwort erhalten." };
  } catch (err) {
    await store.recordRun({
      wallet: ctx.wallet, threadId: ctx.threadId, botId: target.id, route: resolved.route, inputTokens, outputTokens,
      costMicros: 0, status: "error", error: `ask_bot: ${errorText(err)}`,
    });
    return { bot: target.name, error: `${target.name} konnte gerade nicht antworten.` };
  }
}

