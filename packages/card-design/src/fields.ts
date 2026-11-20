// Personal fields are resolved only on the holder's device. Public renders never
// show a field value or its sample text (spec §7).
import type { FieldId, Layer } from './schema';

export type FieldValues = Partial<Record<FieldId, string>>;
export type RenderMode = 'holder' | 'preview' | 'public';

export function resolveText(layer: Layer, mode: RenderMode, values: FieldValues): string | null {
  if (layer.type === 'text') return layer.text;
  if (layer.type !== 'field') return null;
  if (mode === 'public') return null;
  const value = values[layer.field];
  const has = typeof value === 'string' && value.length > 0;
  if (mode === 'holder') return has ? value : null;
  return has ? value : layer.sampleText;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Calendar date of `iso` in Europe/Berlin: de `31.12.2027`, en `31 Dec 2027`. Invalid input → ''. */
export function formatDate(iso: string, locale: 'de' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const { y, m, d } = berlinParts(date);
  if (locale === 'en') return `${d} ${MONTHS_EN[m - 1]} ${y}`;
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

function berlinParts(date: Date): { y: number; m: number; d: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const y = get('year'), m = get('month'), d = get('day');
    if (y && m && d) return { y, m, d };
  } catch {
    // Runtimes without time-zone data fall through to the manual offset below.
  }
  // Fallback: CET/CEST by the EU rule (last Sunday of March/October, 01:00 UTC).
  const yr = date.getUTCFullYear();
  const lastSunday = (month: number) => {
    const last = new Date(Date.UTC(yr, month + 1, 0, 1));
    return Date.UTC(yr, month, last.getUTCDate() - last.getUTCDay(), 1);
  };
  const t = date.getTime();
  const offsetH = t >= lastSunday(2) && t < lastSunday(9) ? 2 : 1;
  const local = new Date(t + offsetH * 3_600_000);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
}
