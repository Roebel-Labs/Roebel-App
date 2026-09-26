// Routine tools for the agent loop (spec §5 phase 2): create_routine,
// list_routines, delete_routine. Scoped to the owner's wallet + current thread.
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import { formatSchedule, nextRunAt, parseGermanSchedule, validateSchedule } from "./schedule";
import * as store from "./store";
import type { RoutineSchedule } from "./types";

export const MAX_ROUTINES = 20;

export interface RoutineToolInput {
  when?: string;
  kind?: "daily" | "weekly";
  weekday?: number;
  hour?: number;
  minute?: number;
}

/**
 * The user's own words win ("jeden Sonntag um 8:41" is parsed deterministically);
 * the model's structured fields are the fallback for phrasings the parser does not know.
 */
export function resolveRoutineSchedule(input: RoutineToolInput): RoutineSchedule | null {
  const parsed = input.when ? parseGermanSchedule(input.when) : null;
  if (parsed) return parsed;
  if (!input.kind || input.hour === undefined) return null;
  return validateSchedule({ kind: input.kind, weekday: input.weekday, hour: input.hour, minute: input.minute ?? 0 });
}

function berlinTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function addRoutineTools(tools: ToolSet, ctx: { wallet: string; threadId: string; botId: string }): void {
  const { wallet, threadId, botId } = ctx;

  tools.create_routine = tool({
    description:
      "Legt eine wiederkehrende Routine an: Zur geplanten Zeit schreibst du automatisch in diesen Chat " +
      "(täglich oder wöchentlich, Zeitzone Europe/Berlin). Gib in `when` die Zeitangabe des Menschen wörtlich an " +
      "(z. B. „jeden Sonntag um 8:41“) und zusätzlich kind/weekday/hour/minute.",
    inputSchema: z.object({
      title: z.string().min(1).max(60).describe("Kurzer Titel, z. B. 'Wöchentliche Essensplanung'"),
      prompt: z.string().min(1).max(1000).describe("Was du zur geplanten Zeit tun sollst"),
      when: z.string().max(120).optional().describe("Zeitangabe in den Worten des Menschen, z. B. 'jeden Sonntag um 8:41'"),
      kind: z.enum(["daily", "weekly"]).optional(),
      weekday: z.number().int().min(0).max(6).optional().describe("Nur bei weekly: 0 = Sonntag, 1 = Montag … 6 = Samstag"),
      hour: z.number().int().min(0).max(23).optional(),
      minute: z.number().int().min(0).max(59).optional(),
    }),
    execute: async (input) => {
      const schedule = resolveRoutineSchedule(input);
      if (!schedule) {
        return { error: "Zeitplan unklar. Frag nach Wochentag (oder täglich) und Uhrzeit." };
      }
      const existing = await store.listRoutines(wallet);
      if (existing.length >= MAX_ROUTINES) return { error: `Es gibt schon ${MAX_ROUTINES} Routinen. Bitte zuerst eine löschen.` };
      const title = input.title.trim();
      const r = await store.createRoutine(wallet, {
        threadId, botId, title, schedule, prompt: input.prompt.trim(),
        nextRunAt: nextRunAt(schedule).toISOString(),
      });
      await store.setThreadTopic(threadId, title);
      return {
        ok: true, routineId: r.id, title, schedule: formatSchedule(schedule),
        nextRun: berlinTime(r.nextRunAt),
      };
    },
  });

  tools.list_routines = tool({
    description: "Listet die Routinen dieses Chats (Titel, Zeitplan, aktiv, nächster Lauf).",
    inputSchema: z.object({}),
    execute: async () => {
      const routines = await store.listThreadRoutines(wallet, threadId);
      return {
        routines: routines.map((r) => ({
          id: r.id, title: r.title, schedule: formatSchedule(r.schedule), enabled: r.enabled,
          nextRun: r.enabled ? berlinTime(r.nextRunAt) : null, task: r.prompt,
        })),
      };
    },
  });

  tools.delete_routine = tool({
    description: "Löscht eine Routine dieses Chats endgültig. Nur auf ausdrücklichen Wunsch; id vorher mit list_routines holen.",
    inputSchema: z.object({ routineId: z.string().describe("id aus list_routines") }),
    execute: async ({ routineId }) => {
      if (!store.isUuid(routineId)) return { error: "Unbekannte Routine-id." };
      const routine = await store.getRoutine(wallet, routineId);
      if (!routine || routine.threadId !== threadId) return { error: "Diese Routine gibt es in diesem Chat nicht." };
      await store.deleteRoutine(wallet, routineId);
      return { ok: true, deleted: routine.title };
    },
  });
}
