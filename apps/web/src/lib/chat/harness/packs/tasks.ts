// Tasks pack (spec §4, wave 2; bot.tools key 'tasks'):
//   start_task  — creates a durable background task, shows a task card, returns at once
//   ask_bot     — one non-streaming turn of another preset/own bot, returns its answer
// Task-mode only (offered while a task tick runs, ctx.taskId set):
//   update_task_step, complete_task
// The worker (task-worker.ts) is imported lazily: it pulls in the registry and
// the model runtime, which would otherwise form an import cycle.
import { z } from "zod";
import {
  MAX_ACTIVE_PER_WALLET, MAX_STEPS, activeTaskCount, appendNote, applyStepUpdate, clip, createTask,
  getTaskById, normalizeCheckpoint, normalizeSteps, patchTaskPart, settleSteps, taskPartOf, updateTask,
} from "../tasks";
import type { HarnessTool, ToolRegistry } from "../types";

const startTaskInput = z.object({
  title: z.string().min(1).max(80).describe("Kurzer Titel der Aufgabe, z. B. „Vereinsfest vorbereiten“"),
  goal: z.string().min(1).max(2000).describe("Was am Ende erreicht sein soll, mit allen nötigen Details aus dem Gespräch"),
  steps: z.array(z.string().min(1).max(120)).max(MAX_STEPS).optional()
    .describe("Optional: 2–8 geplante Schritte als kurze Beschriftungen"),
});

export const startTask: HarnessTool<z.infer<typeof startTaskInput>> = {
  name: "start_task",
  pack: "tasks",
  risk: "private",
  description:
    "Startet eine längere Aufgabe im Hintergrund (Recherche über mehrere Quellen, Entwürfe, Pläne mit mehreren Schritten). " +
    "Der Mensch sieht eine Aufgabenkarte mit dem Fortschritt und bekommt eine Nachricht, wenn sie fertig ist. " +
    "Nutze das nur für Arbeit, die deutlich länger dauert als eine normale Antwort.",
  inputSchema: startTaskInput,
  // Never inside a running task (no nested tasks).
  available: (ctx) => !ctx.taskId,
  summarize: ({ title }) => `Hintergrund-Aufgabe starten: ${title}`,
  execute: async ({ title, goal, steps }, ctx) => {
    if (ctx.taskId) return { error: "Innerhalb einer Aufgabe kann keine neue Aufgabe gestartet werden." };
    if ((await activeTaskCount(ctx.wallet)) >= MAX_ACTIVE_PER_WALLET) {
      return { error: `Es laufen schon ${MAX_ACTIVE_PER_WALLET} Aufgaben. Warte, bis eine fertig ist, oder brich eine ab.` };
    }
    const row = await createTask({
      wallet: ctx.wallet, threadId: ctx.threadId, botId: ctx.botId, title, goal, steps: steps ?? [],
    });
    ctx.emitPart(taskPartOf(row));
    // Immediate run after the response; the minute cron is the fallback.
    const { kickTask } = await import("../task-worker");
    await kickTask(row.id);
    return {
      taskId: row.id,
      status: "queued",
      note: "Die Aufgabe läuft im Hintergrund. Sag dem Menschen in einem kurzen Satz, dass du dich meldest, sobald sie fertig ist, " +
        "und beende deine Antwort. Warte nicht auf das Ergebnis.",
    };
  },
};

const askBotInput = z.object({
  botSlugOrName: z.string().min(1).max(80).describe("Name (oder Kürzel) des anderen Bots, z. B. „Mecky“"),
  question: z.string().min(1).max(2000).describe("Die Frage an den anderen Bot, mit allem Kontext, den er braucht"),
});

export const askBot: HarnessTool<z.infer<typeof askBotInput>> = {
  name: "ask_bot",
  pack: "tasks",
  risk: "private",
  description:
    "Fragt einen anderen Bot (Vorlage oder eigener Bot des Menschen) um Rat und liefert seine Antwort als Text. " +
    "Nützlich, wenn ein anderer Bot dafür Fachmann ist. Der Mensch sieht die Antwort nicht direkt; fass sie selbst zusammen.",
  inputSchema: askBotInput,
  summarize: ({ botSlugOrName }) => `${botSlugOrName} um Rat fragen`,
  execute: async (input, ctx) => {
    const worker = await import("../task-worker");
    return worker.askBot(ctx, input);
  },
};

const updateStepInput = z.object({
  step: z.number().int().min(1).max(MAX_STEPS).optional().describe("Nummer des Schritts (1 = erster)"),
  label: z.string().min(1).max(120).optional().describe("Beschriftung; ohne Nummer wird ein neuer Schritt angelegt"),
  status: z.enum(["running", "done", "failed"]).describe("running = beginne jetzt, done = erledigt, failed = gescheitert"),
  result: z.string().max(600).optional().describe("Kurzes Ergebnis des Schritts (bei done/failed)"),
});

export const updateTaskStep: HarnessTool<z.infer<typeof updateStepInput>> = {
  name: "update_task_step",
  pack: "tasks",
  risk: "private",
  description: "Aktualisiert einen Schritt der laufenden Hintergrund-Aufgabe (nur im Hintergrund-Modus).",
  inputSchema: updateStepInput,
  available: (ctx) => Boolean(ctx.taskId),
  summarize: ({ step, label, status }) => `Schritt ${step ?? label ?? ""}: ${status}`,
  execute: async ({ step, label, status, result }, ctx) => {
    if (!ctx.taskId) return { error: "Keine laufende Aufgabe." };
    const row = await getTaskById(ctx.taskId);
    if (!row || row.wallet !== ctx.wallet) return { error: "Aufgabe nicht gefunden." };
    if (row.status === "cancelled") return { cancelled: true, note: "Der Mensch hat die Aufgabe abgebrochen. Hör sofort auf." };
    if (row.status !== "running") return { error: "Die Aufgabe läuft gerade nicht." };
    const applied = applyStepUpdate(normalizeSteps(row.steps), { index: step, label, status });
    if ("error" in applied) return { error: applied.error };
    let checkpoint = normalizeCheckpoint(row.checkpoint);
    if (result?.trim() && status !== "running") {
      checkpoint = appendNote(checkpoint, `Schritt ${applied.index + 1} (${applied.steps[applied.index].label}): ${result}`);
    }
    const next = await updateTask(row.id, "running", { steps: applied.steps, checkpoint });
    if (!next) return { cancelled: true, note: "Die Aufgabe wurde abgebrochen. Hör sofort auf." };
    await patchTaskPart(next);
    return { ok: true, steps: applied.steps.map((s, i) => `${i + 1}. ${s.label} (${s.status})`) };
  },
};

const completeInput = z.object({
  summary: z.string().min(1).max(3000).describe("Ergebnis für den Menschen in 2–5 Sätzen (Markdown erlaubt)"),
  failed: z.boolean().optional().describe("true, wenn das Ziel nicht erreicht werden konnte (summary = Grund)"),
});

export const completeTask: HarnessTool<z.infer<typeof completeInput>> = {
  name: "complete_task",
  pack: "tasks",
  risk: "private",
  description: "Schließt die laufende Hintergrund-Aufgabe ab (nur im Hintergrund-Modus). Danach nichts mehr tun.",
  inputSchema: completeInput,
  available: (ctx) => Boolean(ctx.taskId),
  summarize: ({ failed }) => (failed ? "Aufgabe als gescheitert abschließen" : "Aufgabe abschließen"),
  execute: async ({ summary, failed }, ctx) => {
    if (!ctx.taskId) return { error: "Keine laufende Aufgabe." };
    const row = await getTaskById(ctx.taskId);
    if (!row || row.wallet !== ctx.wallet) return { error: "Aufgabe nicht gefunden." };
    if (row.status !== "running") return { error: "Die Aufgabe läuft gerade nicht." };
    const outcome = failed ? "failed" : "done";
    const next = await updateTask(row.id, "running", {
      status: outcome,
      steps: settleSteps(normalizeSteps(row.steps), outcome),
      ...(failed ? { error: clip(summary, 1000) } : { result: summary }),
    });
    if (!next) return { cancelled: true, note: "Die Aufgabe wurde abgebrochen." };
    await patchTaskPart(next);
    return { ok: true, note: "Aufgabe abgeschlossen. Beende jetzt ohne weiteren Text." };
  },
};

export const taskTools: HarnessTool[] = [startTask, askBot, updateTaskStep, completeTask];

export function register(registry: ToolRegistry): void {
  for (const t of taskTools) registry.registerTool(t);
}
