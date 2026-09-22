// Deterministic German poster lines built from event fields. This is the only
// source of dates, times, prices and places on a poster (never an LLM).
import type { PosterContent, PosterEventInput } from "./types";

const DE_LONG_DATE = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatGermanDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((isoDate ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(d.getTime())) return null;
  return DE_LONG_DATE.format(d);
}

export function formatClock(time?: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function formatPriceLine(price?: number | string | null): string | null {
  if (price === null || price === undefined || price === "") return null;
  const n = typeof price === "string" ? Number(price.replace(",", ".")) : price;
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return "Eintritt frei";
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
  return `Eintritt ${formatted} €`;
}

function clean(value?: string | null): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v || null;
}

function websiteHost(url?: string | null): string | null {
  const w = clean(url);
  if (!w) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    return u.host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function buildPosterContent(event: PosterEventInput): PosterContent {
  const start = formatClock(event.time);
  const end = formatClock(event.end_time);
  const timeLine = start ? (end ? `${start} bis ${end} Uhr` : `${start} Uhr`) : null;
  return {
    title: clean(event.title) ?? "",
    dateLine: event.date ? formatGermanDate(event.date) : null,
    timeLine,
    placeLine: clean(event.location),
    priceLine: formatPriceLine(event.ticket_price),
    organizerLine: clean(event.organizer_name),
    websiteLine: websiteHost(event.website_url),
    category: clean(event.category),
  };
}

/** The lines in poster order; date and time share one line. */
export function contentLines(c: PosterContent): string[] {
  const when =
    c.dateLine && c.timeLine ? `${c.dateLine} · ${c.timeLine}` : (c.dateLine ?? c.timeLine);
  return [
    c.title,
    when,
    c.placeLine,
    c.priceLine,
    c.organizerLine ? `Veranstalter: ${c.organizerLine}` : null,
    c.websiteLine,
  ].filter((line): line is string => !!line);
}
