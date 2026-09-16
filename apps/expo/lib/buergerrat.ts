import type { BuergerratSummary, ForumStage } from './types/feed';

/** Copy + constants for the Bürgerrat Röbel/Müritz 2026 recommendation set. */
export const BUERGERRAT_TITLE = '11 Empfehlungen für eine lebenswerte Innenstadt';
export const BUERGERRAT_YEAR_LABEL = 'Bürgerrat 2026';
export const BUERGERRAT_TOTAL = 11;
export const BUERGERRAT_NDR_URL =
  'https://www.ndr.de/nachrichten/mecklenburg-vorpommern/haff-mueritz/roebel-buergerrat-macht-vorschlaege-fuer-lebenswertere-innenstadt,mvregioneubrandenburg-5162.html';
export const BUERGERRAT_CITATION =
  'Bürgerräte für MV · Bürgerrat Röbel/Müritz · Broschüre 2026 (Abstimmung in der 4. Sitzung)';

/** The feed card wears its "NEU" pill this long after the newest thread. */
export const BUERGERRAT_NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isBuergerratNew(newestCreatedAt: string | null, nowMs: number = Date.now()): boolean {
  if (!newestCreatedAt) return false;
  const t = Date.parse(newestCreatedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < BUERGERRAT_NEW_WINDOW_MS;
}

export function summarizeBuergerrat(
  rows: Array<{ created_at: string; stage: ForumStage | string | null }>,
): BuergerratSummary {
  let newest: string | null = null;
  let beschlossen = 0;
  let umgesetzt = 0;
  for (const r of rows) {
    if (!newest || r.created_at > newest) newest = r.created_at;
    if (r.stage === 'beschlossen') beschlossen++;
    if (r.stage === 'umgesetzt') umgesetzt++;
  }
  return { count: rows.length, newestCreatedAt: newest, beschlossen, umgesetzt };
}
