// Device-calendar integration for the chat suite (phase 3). Pure helpers only:
// sanitising the `calendarContext` the app sends, rendering it into the system
// prompt, validating bot-proposed events and applying part-status updates.
import { CHAT_TZ } from "./time";
import type { CalendarContextEvent, CalendarEventStatus, ChatPart } from "./types";

export const CALENDAR_CONTEXT_MAX = 50;
export const CALENDAR_CONTEXT_DAYS = 7;
const MAX_TITLE = 200;
const MAX_LOCATION = 200;
const MAX_NOTES = 1000;
const DAY_MS = 86_400_000;
/** A proposed event may last at most this long. */
const MAX_EVENT_MS = 14 * DAY_MS;

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const isoTime = (v: unknown): number | null => {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * Validates the send body's `calendarContext`. Returns null when absent (no
 * read access on the device), "invalid" when not an array. Invalid entries are
 * dropped; the rest is limited to [now − 1 h, now + 7 d + 1 d], sorted by start
 * and capped at 50.
 */
export function sanitizeCalendarContext(raw: unknown, now: Date = new Date()): CalendarContextEvent[] | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return "invalid";
  const from = now.getTime() - 3_600_000;
  const to = now.getTime() + (CALENDAR_CONTEXT_DAYS + 1) * DAY_MS;
  const out: { ev: CalendarContextEvent; t: number }[] = [];
  for (const item of raw.slice(0, CALENDAR_CONTEXT_MAX * 4)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const start = isoTime(r.start);
    const end = isoTime(r.end);
    if (start === null || end === null || end < start) continue;
    if (end < from || start > to) continue;
    const title = typeof r.title === "string" && r.title.trim() ? clip(r.title, MAX_TITLE) : "(ohne Titel)";
    const ev: CalendarContextEvent = { title, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    if (typeof r.location === "string" && r.location.trim()) ev.location = clip(r.location, MAX_LOCATION);
    out.push({ ev, t: start });
  }
  return out.sort((a, b) => a.t - b.t).slice(0, CALENDAR_CONTEXT_MAX).map((x) => x.ev);
}

const dayFmt = new Intl.DateTimeFormat("de-DE", { timeZone: CHAT_TZ, weekday: "short", day: "2-digit", month: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: CHAT_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Fr., 26.09. 10:00–10:30" (Europe/Berlin); all-day spans → "ganztägig". */
export function formatEventWhen(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const day = dayFmt.format(s);
  const allDay = timeFmt.format(s) === "00:00" && (e.getTime() - s.getTime()) % DAY_MS === 0 && e > s;
  if (allDay) return `${day} ganztägig`;
  const sameDay = dayFmt.format(e) === day;
  return sameDay
    ? `${day} ${timeFmt.format(s)}–${timeFmt.format(e)}`
    : `${day} ${timeFmt.format(s)} – ${dayFmt.format(e)} ${timeFmt.format(e)}`;
}

/** System-prompt block for bots with the 'calendar' tool. */
export function calendarPromptBlock(events: CalendarContextEvent[] | null | undefined): string {
  const lines: string[] = [
    "Kalender-Werkzeuge:",
    "- Wenn ein konkreter Termin entsteht (Titel + Zeit), schlag ihn mit propose_calendar_event vor; der Mensch fügt ihn mit einem Tipp seinem Kalender hinzu. Zeiten als ISO 8601 mit Offset in Europe/Berlin (z. B. 2026-09-26T10:00:00+02:00). Schreib den Termin danach nicht noch einmal ausführlich in den Text.",
  ];
  if (!events) {
    lines.push(
      "- Der Gerätekalender des Menschen ist (noch) nicht freigegeben. Wenn du seine Termine brauchst, ruf einmal request_calendar_access auf " +
      "und biete an, dass er die Termine alternativ einfach diktiert. Erfinde keine Termine.",
    );
    return lines.join("\n");
  }
  if (!events.length) {
    lines.push(`Kalender des Nutzers (Gerätekalender, nächste ${CALENDAR_CONTEXT_DAYS} Tage, Zeitzone Europe/Berlin): keine Termine.`);
    return lines.join("\n");
  }
  lines.push(`Kalender des Nutzers (Gerätekalender, nächste ${CALENDAR_CONTEXT_DAYS} Tage, Zeitzone Europe/Berlin):`);
  for (const ev of events) {
    lines.push(`- ${formatEventWhen(ev.start, ev.end)} · ${ev.title}${ev.location ? ` · ${ev.location}` : ""}`);
  }
  return lines.join("\n");
}

export type ProposedEventInput = { title: string; start: string; end?: string; location?: string; notes?: string };

/** Validates a bot-proposed event into a `calendar_event` part (status 'proposed') or an error text. */
export function toCalendarEventPart(input: ProposedEventInput): Extract<ChatPart, { type: "calendar_event" }> | { error: string } {
  const title = typeof input.title === "string" ? clip(input.title, MAX_TITLE) : "";
  if (!title) return { error: "Titel fehlt." };
  const start = isoTime(input.start);
  if (start === null) return { error: "Ungültige Startzeit (ISO 8601 mit Offset erwartet)." };
  const endRaw = input.end === undefined || input.end === "" ? start + 3_600_000 : isoTime(input.end);
  if (endRaw === null) return { error: "Ungültige Endzeit (ISO 8601 mit Offset erwartet)." };
  if (endRaw <= start) return { error: "Das Ende muss nach dem Beginn liegen." };
  if (endRaw - start > MAX_EVENT_MS) return { error: "Der Termin ist zu lang (max. 14 Tage)." };
  const part: Extract<ChatPart, { type: "calendar_event" }> = {
    type: "calendar_event",
    title,
    start: new Date(start).toISOString(),
    end: new Date(endRaw).toISOString(),
    status: "proposed",
  };
  if (input.location?.trim()) part.location = clip(input.location, MAX_LOCATION);
  if (input.notes?.trim()) part.notes = input.notes.trim().slice(0, MAX_NOTES);
  return part;
}

const CALENDAR_STATUSES: readonly CalendarEventStatus[] = ["proposed", "added", "dismissed"];

/**
 * Applies a client status update to part `index`. Allowed: calendar_event →
 * proposed|added|dismissed; integration → pending|connected. Returns the new
 * parts (a copy) or an error text.
 */
export function applyPartStatus(parts: ChatPart[], index: number, status: unknown): ChatPart[] | { error: string } {
  if (!Number.isInteger(index) || index < 0 || index >= parts.length) return { error: "Diesen Teil der Nachricht gibt es nicht." };
  const part = parts[index];
  const next = parts.slice();
  if (part.type === "calendar_event") {
    if (!CALENDAR_STATUSES.includes(status as CalendarEventStatus)) return { error: "Ungültiger Status." };
    next[index] = { ...part, status: status as CalendarEventStatus };
    return next;
  }
  if (part.type === "integration") {
    if (status !== "pending" && status !== "connected") return { error: "Ungültiger Status." };
    next[index] = { ...part, status };
    return next;
  }
  return { error: "Dieser Teil hat keinen Status." };
}
