/**
 * "Mitglieder & Ausweise" (spec 5.6b, org management on the phone): filters, search and the phone
 * cap of the member list. A member's state is eingeladen / angenommen / abgelaufen / widerrufen;
 * public/private is never shown unless the member chose public (then a small "Öffentlich").
 */
import type { PersonRow, PersonState } from './types';

export type MemberFilter = 'alle' | 'eingeladen' | 'angenommen' | 'abgelaufen' | 'widerrufen';

export const MEMBER_FILTERS: { key: MemberFilter; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'eingeladen', label: 'Eingeladen' },
  { key: 'angenommen', label: 'Angenommen' },
  { key: 'abgelaufen', label: 'Abgelaufen' },
  { key: 'widerrufen', label: 'Widerrufen' },
];

export const MEMBER_LIST_PHONE_LIMIT = 100;
export const MEMBER_LIST_MORE = 'Für große Listen: roebel.app/dashboard/credentials';

const STATE_LABEL: Record<PersonState, string> = {
  eingeladen: 'Eingeladen',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  widerrufen: 'Widerrufen',
  abgelaufen: 'Abgelaufen',
};

export function memberRows(people: readonly PersonRow[], filter: MemberFilter, query: string): PersonRow[] {
  const q = query.trim().toLocaleLowerCase('de');
  return people.filter((p) => (filter === 'alle' || p.state === filter) && (!q || p.displayName.toLocaleLowerCase('de').includes(q)));
}

/** At most 100 rows on the phone; above that the line pointing to the dashboard. */
export function phoneList(rows: readonly PersonRow[]): { rows: PersonRow[]; more: string | null } {
  return rows.length > MEMBER_LIST_PHONE_LIMIT
    ? { rows: rows.slice(0, MEMBER_LIST_PHONE_LIMIT), more: MEMBER_LIST_MORE }
    : { rows: [...rows], more: null };
}

/** "Angenommen" or "Angenommen · Öffentlich"; never "privat". */
export function memberStateLabel(p: PersonRow): string {
  return p.public && p.state === 'angenommen' ? `${STATE_LABEL[p.state]} · Öffentlich` : STATE_LABEL[p.state];
}

/** "TT.MM.JJJJ" → "YYYY-MM-DD" (what batch_prepare's renewal expects), null when not a real date. */
export function parseGermanDate(input: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Suggested end date for "Für neues Jahr erneuern": 31.12. of next year. */
export function defaultRenewDate(now: Date): string {
  return `31.12.${now.getFullYear() + 1}`;
}
