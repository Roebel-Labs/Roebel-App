/** Dashboard time ranges ("7 Tage · 28 Tage · 90 Tage · 365 Tage · Zeitraum"). Dates are local ISO days. */

export type RangeKey = '7d' | '28d' | '90d' | '365d' | 'custom';
export type DayRange = { from: string; to: string };

export const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': '7 Tage',
  '28d': '28 Tage',
  '90d': '90 Tage',
  '365d': '365 Tage',
  custom: 'Zeitraum',
};

export const RANGE_KEYS: RangeKey[] = ['7d', '28d', '90d', '365d', 'custom'];
export const DEFAULT_RANGE: RangeKey = '28d';
export const MAX_RANGE_DAYS = 730;

const LENGTH: Record<Exclude<RangeKey, 'custom'>, number> = { '7d': 7, '28d': 28, '90d': 90, '365d': 365 };

export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

export function rangeDates(key: RangeKey, today: Date, custom?: { from: Date; to: Date }): DayRange {
  if (key === 'custom' && custom) return { from: isoDay(custom.from), to: isoDay(custom.to) };
  const len = key === 'custom' ? LENGTH['28d'] : LENGTH[key];
  return { from: isoDay(addDays(today, -(len - 1))), to: isoDay(today) };
}

/** The same-length window directly before `r`. */
export function previousRange(r: DayRange): DayRange {
  const len = daysBetween(r.from, r.to) + 1;
  const from = parseDay(r.from);
  return { from: isoDay(addDays(from, -len)), to: isoDay(addDays(from, -1)) };
}

export function isValidCustomRange(from: Date, to: Date): boolean {
  const days = daysBetween(isoDay(from), isoDay(to));
  return days >= 0 && days <= MAX_RANGE_DAYS;
}

/** Whole-percent change; null when there was nothing before (UI shows "neu"). */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Every ISO day in the range, inclusive. */
export function eachDay(r: DayRange): string[] {
  const out: string[] = [];
  const end = parseDay(r.to);
  for (let d = parseDay(r.from); d <= end; d = addDays(d, 1)) out.push(isoDay(d));
  return out;
}

/** "12. Aug" style label for chart axes. */
export function shortDayLabel(iso: string): string {
  const d = parseDay(iso);
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${d.getDate()}. ${months[d.getMonth()]}`;
}
