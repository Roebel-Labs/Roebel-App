/**
 * Mittagstisch day resolution. Restaurants put the serving day into the
 * category name as free text ("Montag, 02.11.", "DIENSTAG", "Fr"), so the
 * day is parsed from there and anchored to the menu's start week.
 */

const WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
const WEEKDAY_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WEEKDAY_SHORT = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];

/** YYYY-MM-DD of a local Date. */
export function toIsoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseIsoDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 0 = Monday … 6 = Sunday, or null when the text names no weekday. */
function weekdayIndex(text: string): number | null {
  const lower = text.toLowerCase();
  const long = WEEKDAYS.findIndex((w) => lower.includes(w));
  if (long >= 0) return long;
  const short = /^\s*(mo|di|mi|do|fr|sa|so)\b/.exec(lower);
  return short ? WEEKDAY_SHORT.indexOf(short[1]) : null;
}

/**
 * The serving day of a dish as YYYY-MM-DD, or null when the category names
 * no day. An explicit "dd.mm." wins; otherwise the weekday is placed in the
 * week of the menu's start date.
 */
export function resolveDishDay(categoryName: string | null | undefined, menuStartDate: string | null): string | null {
  if (!categoryName) return null;
  const start = menuStartDate ? parseIsoDay(menuStartDate) : null;

  const explicit = /(\d{1,2})\.(\d{1,2})\./.exec(categoryName);
  if (explicit && start) {
    const d = new Date(start.getFullYear(), Number(explicit[2]) - 1, Number(explicit[1]));
    // A menu starting late December can list early-January days.
    if (d.getTime() < start.getTime() - 180 * 86_400_000) d.setFullYear(d.getFullYear() + 1);
    return toIsoDay(d);
  }

  const idx = weekdayIndex(categoryName);
  if (idx === null || !start) return null;
  const monday = new Date(start);
  monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  monday.setDate(monday.getDate() + idx);
  return toIsoDay(monday);
}

/** "Heute", "Morgen" or the weekday name for a YYYY-MM-DD day. */
export function dishDayLabel(day: string, today: string): string {
  const d = parseIsoDay(day);
  const t = parseIsoDay(today);
  if (!d || !t) return '';
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  return WEEKDAY_LABELS[(d.getDay() + 6) % 7];
}
