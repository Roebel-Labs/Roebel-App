// Rows of the Veranstaltungen tab: ordering, the count line and the primary button, with the same
// labels as the dashboard's event badge panel (plan 4 Task 7).
import { t, locale } from '../i18n';
import type { EventBadgeListItem } from './types';

export interface EventRow {
  eventId: string;
  title: string;
  when: string;
  line: string;
  primary: { label: string; disabled: boolean };
}

/** Calendar day in Röbel (yyyy-mm-dd) of a timestamp or a date string. */
function berlinDay(v: number | string): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

function primaryOf(e: EventBadgeListItem): EventRow['primary'] {
  if (!e.badge) return { label: t('Abzeichen für Teilnehmende einrichten'), disabled: false };
  const n = Math.max(0, e.attendees - e.issued);
  if (n > 0) return { label: t('Abzeichen vergeben ({n})', { n }), disabled: false };
  return { label: t('Alle haben ihr Abzeichen'), disabled: true };
}

export function eventRows(items: EventBadgeListItem[], nowMs: number): EventRow[] {
  const today = berlinDay(nowMs);
  const withDay = items.map((e) => ({ e, day: berlinDay(e.date) }));
  const upcoming = withDay.filter((x) => x.day >= today).sort((a, b) => a.day.localeCompare(b.day));
  const past = withDay.filter((x) => x.day < today).sort((a, b) => b.day.localeCompare(a.day));
  return [...upcoming, ...past].map(({ e, day }) => ({
    eventId: e.eventId,
    title: e.title,
    when: day ? new Date(`${day}T12:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '',
    line: t('{a} Teilnehmende · {i} eingeladen · {c} angenommen', { a: e.attendees, i: e.issued, c: e.accepted }),
    primary: primaryOf(e),
  }));
}
