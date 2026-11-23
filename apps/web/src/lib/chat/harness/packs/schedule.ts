// Pack 'user' (risk 'private') — show_schedule: the person's own plan for the
// next days (marked events + events of their orgs) as a 'schedule' card. Clients
// that don't list 'schedule' in the send body's partTypes (older app builds,
// SMS/e-mail channels) get the same data back for a text answer instead.
import { z } from "zod";
import type { TenantRef } from "../../../roebel-data/public";
import { shapeOutput } from "../../../roebel-data/shape";
import type { Db } from "../../../roebel-data/tenant";
import { getMySchedule, type ScheduleEntry } from "../../../roebel-data/user";
import { ToolInputError } from "../errors";
import type { ChatPart, ScheduleItem } from "../../types";
import type { HarnessContext, HarnessTool, ToolRegistry } from "../types";

async function db(): Promise<Db> {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

export function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Heute";
  if (iso === addDays(today, 1)) return "Morgen";
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]}, ${shortDate(iso)}`;
}

/** Groups entries by day (sorted), items by time (all-day/unknown last), then title. */
export function buildScheduleDays(entries: ScheduleEntry[]): { date: string; items: ScheduleItem[] }[] {
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return [...byDay.keys()].sort().map((date) => ({
    date,
    items: byDay.get(date)!
      .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title, "de"))
      .map((e) => ({ title: e.title, time: e.time, location: e.location, url: e.url, tag: e.tag })),
  }));
}

export function scheduleTitle(from: string, days: number, today: string): { title: string; subtitle: string } {
  const to = addDays(from, days - 1);
  const subtitle = days === 1 ? dayLabel(from, today) : `${shortDate(from)} – ${shortDate(to)}`;
  if (from === today && days === 7) return { title: "Deine nächsten 7 Tage", subtitle };
  if (days === 1) return { title: "Dein Tag", subtitle };
  return { title: "Dein Plan", subtitle };
}

/** DB seam (tests replace it). */
export const scheduleDeps = {
  async entries(ctx: HarnessContext, args: { from: string; to: string; includeOrgEvents: boolean }): Promise<ScheduleEntry[]> {
    const tenant: TenantRef = { id: ctx.tenant.id, appOrigin: ctx.tenant.appOrigin };
    return getMySchedule(await db(), tenant, ctx.wallet, args);
  },
};

const scheduleInput = z.object({
  from: z.string().optional().describe("Erster Tag JJJJ-MM-TT (Standard: heute)"),
  days: z.number().int().min(1).max(14).default(7).describe("Anzahl Tage (Standard 7)"),
  include_org_events: z.boolean().default(true).describe("Auch Veranstaltungen der eigenen Organisationen zeigen"),
  title: z.string().max(60).optional().describe("Eigene Überschrift (optional)"),
});
type ScheduleInput = z.infer<typeof scheduleInput>;

export const showSchedule: HarnessTool<ScheduleInput> = {
  name: "show_schedule",
  pack: "user",
  risk: "private",
  description:
    "Zeigt dem Menschen seinen Plan als Wochenübersicht-Karte: vorgemerkte Veranstaltungen (Interesse) und die seiner " +
    "Organisationen, nach Tagen sortiert. Nutze das für Fragen wie 'Was steht diese Woche an?' oder 'Mein Wochenplan'.",
  inputSchema: scheduleInput,
  summarize: ({ days }) => `Deinen Plan für ${days ?? 7} Tage zeigen`,
  execute: async (input, ctx) => {
    const today = berlinToday();
    const from = input.from?.trim() || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new ToolInputError("Datum bitte als JJJJ-MM-TT angeben.");
    const days = input.days ?? 7;
    const to = addDays(from, days - 1);
    const entries = await scheduleDeps.entries(ctx, { from, to, includeOrgEvents: input.include_org_events ?? true });
    const grouped = buildScheduleDays(entries);
    const head = scheduleTitle(from, days, today);
    const title = input.title?.trim() || head.title;

    if (ctx.turn?.partTypes?.includes("schedule")) {
      const part: ChatPart = {
        type: "schedule", title, subtitle: head.subtitle, days: grouped,
        ...(grouped.length ? {} : { empty: "In diesem Zeitraum hast du nichts vorgemerkt." }),
      };
      ctx.emitPart(part);
      return {
        angezeigt: "als Karte",
        termine: entries.length,
        hinweis: "Der Mensch sieht die Übersicht als Karte. Schreib höchstens einen kurzen Satz dazu und wiederhole die Termine nicht.",
      };
    }
    return shapeOutput({
      zeitraum: head.subtitle,
      tage: grouped.map((d) => ({
        tag: dayLabel(d.date, today),
        termine: d.items.map((i) => ({ uhrzeit: i.time, titel: i.title, ort: i.location, info: i.tag, url: i.url })),
      })),
      hinweis: grouped.length
        ? "Stell das als kurze Liste nach Tagen dar (Tag fett, darunter Uhrzeit · Titel · Ort, Titel als Link)."
        : "In diesem Zeitraum ist nichts vorgemerkt. Biete an, passende Veranstaltungen zu suchen (list_events).",
    }, { maxChars: 5000 });
  },
};

export const SCHEDULE_TOOLS = [showSchedule];

export function register(registry: ToolRegistry): void {
  for (const t of SCHEDULE_TOOLS) registry.registerTool(t);
}
