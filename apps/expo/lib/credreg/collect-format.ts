/** Event days in German for stamps and the collection (no Intl: plain month names). */
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "2026-12-05" → "5. Dezember 2026"; anything else unchanged. */
export function formatEventDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return date ?? '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])}. ${month} ${m[1]}` : date;
}
