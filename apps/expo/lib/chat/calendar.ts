// Device-calendar helpers for Mecky Chat (phase 3). Pure: no native module, no I/O — the
// native calls live in lib/chat/device-calendar.ts so jest can drive this file directly.
import type { CalendarContextEvent, CalendarEventStatus, ChatMessage, ChatPart, ChatThread } from './types';

export const CALENDAR_CONTEXT_MAX = 50;
export const CALENDAR_CONTEXT_DAYS = 7;
const DAY_MS = 86_400_000;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Minimal shape of an expo-calendar event (legacy API). */
export interface DeviceEventLike {
  title?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  location?: string | null;
}

const toTime = (v: string | Date): number => (v instanceof Date ? v.getTime() : Date.parse(v));

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * Device events → the send body's `calendarContext`: events overlapping [now, now + 7 d],
 * sorted by start, at most 50, only title/start/end/location.
 */
export function buildCalendarContext(events: DeviceEventLike[], now: Date = new Date()): CalendarContextEvent[] {
  const from = now.getTime();
  const to = from + CALENDAR_CONTEXT_DAYS * DAY_MS;
  return events
    .map((e) => ({ e, s: toTime(e.startDate), en: toTime(e.endDate) }))
    .filter(({ s, en }) => Number.isFinite(s) && Number.isFinite(en) && en >= s && en > from && s < to)
    .sort((a, b) => a.s - b.s)
    .slice(0, CALENDAR_CONTEXT_MAX)
    .map(({ e, s, en }) => {
      const out: CalendarContextEvent = {
        title: e.title && e.title.trim() ? clip(e.title, 200) : '(ohne Titel)',
        start: new Date(s).toISOString(),
        end: new Date(en).toISOString(),
      };
      if (e.location && e.location.trim()) out.location = clip(e.location, 200);
      return out;
    });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "Fr, 26.09. · 10:00–10:30" in device-local time; all-day → "Fr, 26.09. · ganztägig". */
export function formatEventWhen(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const day = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const span = e.getTime() - s.getTime();
  if (s.getHours() === 0 && s.getMinutes() === 0 && span > 0 && span % DAY_MS === 0) return `${day(s)} · ganztägig`;
  if (day(s) === day(e)) return `${day(s)} · ${time(s)}–${time(e)}`;
  return `${day(s)} · ${time(s)} – ${day(e)} ${time(e)}`;
}

/** True when any bot in the thread has the 'calendar' tool. */
export function isCalendarThread(thread: Pick<ChatThread, 'bots'> | null | undefined): boolean {
  return Boolean(thread?.bots.some((b) => b.tools?.includes('calendar')));
}

/**
 * Part-status reducer: returns the message with part `index` set to `status`
 * (calendar_event: proposed|added|dismissed · integration: pending|connected).
 * Unknown index / wrong part type → the message unchanged (same reference).
 */
export function withPartStatus(
  message: ChatMessage,
  index: number,
  status: CalendarEventStatus | 'pending' | 'connected',
): ChatMessage {
  const part = message.parts[index];
  if (!part) return message;
  let next: ChatPart | null = null;
  if (part.type === 'calendar_event' && (status === 'proposed' || status === 'added' || status === 'dismissed')) {
    next = { ...part, status };
  } else if (part.type === 'integration' && (status === 'pending' || status === 'connected')) {
    next = { ...part, status };
  }
  if (!next || (next as { status: string }).status === (part as { status: string }).status) return message;
  const parts = message.parts.slice();
  parts[index] = next;
  return { ...message, parts };
}
