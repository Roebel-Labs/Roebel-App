// Pure mapping between the studio's Tabelle and the app's rundown (live_rundown_items).

import type { Table } from '../state/types';
import type { RundownItem, RundownRowInput } from './types';

/** Which studio columns feed which rundown field. Subtitle may join several columns with " · ". */
export type ColumnMap = { title: string | null; subtitle: string[]; detail: string | null; time: string | null };

const TITLE_RE = /^(gruppe|titel|title|name|act|programmpunkt|formation|team)$/i;
const SUBTITLE_RE = /^(verein|club|kategorie|klasse|altersklasse|alter|ort|stadt|trainer(in)?)$/i;
const DETAIL_RE = /^(tanz|stil|tanzstil|detail|details|beschreibung|musik|titel ?musik|song)$/i;
const TIME_RE = /^(zeit|uhrzeit|start|beginn|time|auftritt|geplant)$/i;

export function guessColumnMap(columns: string[]): ColumnMap {
  const find = (re: RegExp, taken: Set<string>) => columns.find((c) => re.test(c.trim()) && !taken.has(c)) ?? null;
  const taken = new Set<string>();
  const title = find(TITLE_RE, taken) ?? columns[0] ?? null;
  if (title) taken.add(title);
  const time = find(TIME_RE, taken);
  if (time) taken.add(time);
  const subtitle = columns.filter((c) => !taken.has(c) && SUBTITLE_RE.test(c.trim()));
  subtitle.forEach((c) => taken.add(c));
  const detail = find(DETAIL_RE, taken);
  return { title, subtitle, detail, time };
}

/** Drops columns that no longer exist (renamed/removed in the Tabelle). */
export function sanitizeColumnMap(map: ColumnMap, columns: string[]): ColumnMap {
  const has = (c: string | null) => (c !== null && columns.includes(c) ? c : null);
  return { title: has(map.title), subtitle: map.subtitle.filter((c) => columns.includes(c)), detail: has(map.detail), time: has(map.time) };
}

/**
 * Planned time from a cell: "19:30", "19.30", "19:30 Uhr", "9 Uhr" (taken on `baseDate`'s day, local time),
 * or a full date/ISO string. Anything else → null.
 */
export function parsePlannedAt(value: string, baseDate: Date): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(uhr)?$/i.exec(v);
  if (m && (m[2] !== undefined || m[3] !== undefined)) {
    const h = Number(m[1]);
    const min = m[2] === undefined ? 0 : Number(m[2]);
    if (h > 23 || min > 59) return null;
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, min, 0, 0);
    return d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

const clean = (s: string | undefined) => (s ?? '').trim();

/** Rows without a title are skipped; `rowIds[i]` is the studio row behind `rows[i]` (= rundown position i). */
export function tableToRundown(table: Table, map: ColumnMap, baseDate: Date): { rows: RundownRowInput[]; rowIds: string[] } {
  const rows: RundownRowInput[] = [];
  const rowIds: string[] = [];
  if (!map.title) return { rows, rowIds };
  for (const r of table.rows) {
    const title = clean(r.values[map.title]);
    if (!title) continue;
    const subtitle = map.subtitle.map((c) => clean(r.values[c])).filter(Boolean).join(' · ');
    const detail = map.detail ? clean(r.values[map.detail]) : '';
    rows.push({
      title,
      subtitle: subtitle || null,
      detail: detail || null,
      planned_at: map.time ? parsePlannedAt(r.values[map.time] ?? '', baseDate) : null,
    });
    rowIds.push(r.id);
  }
  return { rows, rowIds };
}

/** Pairs the pushed studio rows with the items the server created (position i ↔ rowIds[i]). */
export function mapRowsToItems(rowIds: string[], items: Pick<RundownItem, 'id' | 'position'>[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) {
    const rowId = rowIds[it.position];
    if (rowId !== undefined) out[rowId] = it.id;
  }
  return out;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('de');

/**
 * The rundown item for a studio row: the stored mapping when that item still exists, else a unique
 * title match (so a rundown imported elsewhere, e.g. in the web console, still syncs).
 */
export function resolveItemForRow(
  rowId: string,
  rowMap: Record<string, string>,
  table: Table,
  map: ColumnMap,
  items: Pick<RundownItem, 'id' | 'title'>[],
): string | null {
  const mapped = rowMap[rowId];
  if (mapped && (items.length === 0 || items.some((i) => i.id === mapped))) return mapped;
  if (!map.title) return null;
  const row = table.rows.find((r) => r.id === rowId);
  const title = row ? norm(row.values[map.title] ?? '') : '';
  if (!title) return null;
  const hits = items.filter((i) => norm(i.title) === title);
  return hits.length === 1 ? hits[0].id : null;
}
