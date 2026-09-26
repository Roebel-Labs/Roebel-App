// Built-in chat tools (pack 'chat', risk 'private'), migrated unchanged in
// behaviour from runtime.ts: ask_options, write_file, update_file,
// propose_calendar_event, request_calendar_access, and the routine tools.
// Enable keys (chat_bots.tools): ask_options, files, calendar; routines always on.
import { z } from "zod";
import { formatEventWhen, toCalendarEventPart } from "../../calendar";
import { routineTools } from "../../routine-tools";
import * as store from "../../store";
import type { HarnessTool, ToolRegistry } from "../types";

const askOptionsInput = z.object({
  question: z.string().min(1).max(200).describe("Kurze Frage über der Karte"),
  options: z.array(z.string().min(1).max(80)).min(2).max(5).describe("Die Optionen als kurze Beschriftungen"),
});

export const askOptions: HarnessTool<z.infer<typeof askOptionsInput>> = {
  name: "ask_options",
  pack: "chat",
  risk: "private",
  description: "Zeigt dem Menschen eine Auswahlkarte mit 2–5 Optionen (A–E). Danach die Antwort beenden und auf die Wahl warten.",
  inputSchema: askOptionsInput,
  summarize: ({ question }) => `Auswahlkarte: ${question}`,
  execute: async ({ question, options }, ctx) => {
    ctx.emitPart({
      type: "options",
      question,
      options: options.map((label, i) => ({ key: String.fromCharCode(65 + i), label })),
      selected: null,
    });
    return "Auswahlkarte wird angezeigt. Beende jetzt deine Antwort ohne die Frage zu wiederholen.";
  },
};

const writeFileInput = z.object({
  name: z.string().min(1).max(80).describe("Dateiname ohne Endung, z. B. 'Wochenplan'"),
  content: z.string().min(1).max(100_000).describe("Vollständiger Markdown-Inhalt"),
});

export const writeFile: HarnessTool<z.infer<typeof writeFileInput>> = {
  name: "write_file",
  pack: "chat",
  risk: "private",
  description: "Legt eine neue Markdown-Datei im Chat an (für lange oder strukturierte Inhalte). Der Mensch sieht eine Dateikarte.",
  inputSchema: writeFileInput,
  summarize: ({ name }) => `Datei „${name}“ anlegen`,
  execute: async ({ name, content }, ctx) => {
    const clean = name.replace(/\.(md|markdown|txt)$/i, "").replace(/[/\\]/g, "-").trim() || "Notiz";
    const f = await store.createFile(ctx.wallet, ctx.threadId, clean, "md", content);
    ctx.emitPart({ type: "file", fileId: f.id, name: f.name, ext: f.ext, size: f.size });
    return { fileId: f.id, name: `${f.name}.${f.ext}` };
  },
};

const updateFileInput = z.object({
  fileId: z.string().describe("id der Datei"),
  content: z.string().min(1).max(100_000),
});

export const updateFile: HarnessTool<z.infer<typeof updateFileInput>> = {
  name: "update_file",
  pack: "chat",
  risk: "private",
  description: "Ersetzt den Inhalt einer bestehenden Datei dieses Chats (vollständiger neuer Inhalt).",
  inputSchema: updateFileInput,
  summarize: () => "Datei aktualisieren",
  execute: async ({ fileId, content }, ctx) => {
    if (!store.isUuid(fileId)) return { error: "Unbekannte Datei-id." };
    const f = await store.updateFileContent(ctx.wallet, ctx.threadId, fileId, content);
    if (!f) return { error: "Datei nicht gefunden." };
    ctx.emitPart({ type: "file", fileId: f.id, name: f.name, ext: f.ext, size: f.size });
    return { fileId: f.id, name: `${f.name}.${f.ext}`, updated: true };
  },
};

const proposeEventInput = z.object({
  title: z.string().min(1).max(200).describe("Kurzer Titel des Termins"),
  start: z.string().describe("Beginn, ISO 8601 mit Offset, z. B. 2026-09-26T10:00:00+02:00"),
  end: z.string().optional().describe("Ende, ISO 8601 mit Offset; ohne Angabe 1 Stunde nach Beginn"),
  location: z.string().max(200).optional().describe("Ort, falls bekannt"),
  notes: z.string().max(1000).optional().describe("Kurze Notiz zum Termin"),
});

export const proposeCalendarEvent: HarnessTool<z.infer<typeof proposeEventInput>> = {
  name: "propose_calendar_event",
  pack: "chat",
  risk: "private",
  description: "Schlägt dem Menschen einen konkreten Termin vor. Er sieht eine Terminkarte und kann ihn mit einem Tipp seinem Kalender hinzufügen.",
  inputSchema: proposeEventInput,
  summarize: ({ title }) => `Termin vorschlagen: ${title}`,
  execute: async (input, ctx) => {
    const part = toCalendarEventPart(input);
    if ("error" in part) return { error: part.error };
    ctx.emitPart(part);
    return { ok: true, shown: `${part.title}, ${formatEventWhen(part.start, part.end)}` };
  },
};

export const requestCalendarAccess: HarnessTool<Record<string, never>> = {
  name: "request_calendar_access",
  pack: "chat",
  risk: "private",
  description: "Zeigt eine Karte, mit der der Mensch seinen Gerätekalender (Google/iCloud auf dem Handy) für dich freigeben kann. Nur nutzen, wenn du seine Termine wirklich brauchst.",
  inputSchema: z.object({}) as unknown as z.ZodType<Record<string, never>>,
  // Only while the device calendar is not shared.
  available: (ctx) => !ctx.turn?.calendarContext,
  summarize: () => "Kalender-Freigabe anfragen",
  execute: async (_input, ctx) => {
    const alreadyShown = [...(ctx.turn?.recentParts ?? []), ...(ctx.turn?.emitted ?? [])]
      .some((p) => p.type === "integration" && p.provider === "device_calendar" && p.status === "pending");
    if (alreadyShown) return { ok: true, note: "Die Freigabe-Karte ist schon sichtbar. Bitte alternativ ums Diktieren der Termine." };
    ctx.emitPart({
      type: "integration",
      provider: "device_calendar",
      title: "Kalender",
      description: "Erlaube den Zugriff auf deinen Kalender, damit ich deine Termine der nächsten 7 Tage sehe.",
      status: "pending",
    });
    return { ok: true, note: "Karte wird angezeigt. Biete an, die Termine alternativ zu diktieren." };
  },
};

export const chatTools: HarnessTool[] = [
  askOptions, writeFile, updateFile, proposeCalendarEvent, requestCalendarAccess, ...routineTools,
];

export function register(registry: ToolRegistry): void {
  for (const t of chatTools) registry.registerTool(t);
}
