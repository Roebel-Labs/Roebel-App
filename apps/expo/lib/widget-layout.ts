/**
 * Pure size logic for the home-screen widgets (Android widgets in widgets/, mirrored
 * by the iOS WidgetKit views in targets/widget/*.swift). Sizes are in dp (Android
 * widgetInfo.width/height) or pt (iOS) — both work, the thresholds match either.
 */

// ── Shared ────────────────────────────────────────────────────────────────

/** Rows of `rowHeight` (gap between rows) that fit completely into `available`. */
export function rowsThatFit(available: number, rowHeight: number, gap = 0): number {
  if (available <= 0 || rowHeight <= 0) return 0;
  return Math.max(0, Math.floor((available + gap) / (rowHeight + gap)));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Events ────────────────────────────────────────────────────────────────

/**
 * - row:     4×1 — one event row (date tile, red date line, title, venue)
 * - compact: 2×2 — photo of the next event, date line, two-line title
 * - list:    3×2 / 4×2 — header + rows
 * - hero:    3×3 / 4×4 — header + photo card of the next event + rows
 */
export type EventsLayoutKind = 'row' | 'compact' | 'list' | 'hero';

export const EVENTS_PADDING = 14;
export const EVENTS_HEADER_H = 22;
export const EVENTS_HEADER_GAP = 8;
export const EVENT_ROW_H = 44;
export const EVENT_ROW_GAP = 8;

export function eventsLayoutKind(width: number, height: number): EventsLayoutKind {
  if (height < 100) return 'row';
  if (width < 200) return 'compact';
  if (height < 230) return 'list';
  return 'hero';
}

/** Hero photo height for the inner widget width (≈ the reference design's 16:10). */
export function eventsHeroHeight(innerWidth: number): number {
  return Math.round(clamp(innerWidth * 0.56, 110, 180));
}

/**
 * How many event rows are visible without scrolling (the whole list scrolls on
 * Android; iOS shows exactly this many — never a half row).
 */
export function eventsRowsVisible(width: number, height: number): number {
  const kind = eventsLayoutKind(width, height);
  if (kind === 'row') return 1;
  if (kind === 'compact') return 0;
  let available = height - EVENTS_PADDING * 2 - EVENTS_HEADER_H - EVENTS_HEADER_GAP;
  if (kind === 'hero') available -= eventsHeroHeight(width - EVENTS_PADDING * 2) + EVENT_ROW_GAP;
  return rowsThatFit(available, EVENT_ROW_H, EVENT_ROW_GAP);
}

type DateLineEvent = { weekday: string; day: string; month?: string | null; time: string | null };

/** "Mo. 12.10 · 19:00"; without a month (payload of an older app) "Mo. 12". */
export function eventDateLine(e: DateLineEvent): string {
  const date = e.month ? `${e.weekday}. ${e.day}.${e.month}` : `${e.weekday}. ${e.day}.`;
  return e.time ? `${date} · ${e.time}` : date;
}

/** "19:00 · Marienkirche" */
export function eventMetaLine(e: { time: string | null; location: string }): string {
  return [e.time ?? '', e.location].filter(Boolean).join(' · ');
}

/** "Stadtbibliothek Röbel/Müritz, Kirchplatz 18, 17207 Röbel" → "Stadtbibliothek Röbel/Müritz". */
export function shortVenue(location: string | null | undefined): string {
  const first = (location ?? '').split(',')[0].trim();
  return first || (location ?? '').trim();
}

// ── Mini Apps ─────────────────────────────────────────────────────────────

export const MINI_PADDING = 12;
const MINI_LABEL_H = 18;
const MINI_MAX_ICON = 84;
const MINI_MIN_ICON = 24;

export type MiniAppsGrid = {
  cols: number;
  rows: number;
  /** Icon edge length. */
  icon: number;
  tileW: number;
  rowH: number;
  /** Names under the icons (off when only one short row fits, e.g. 4×1). */
  labels: boolean;
  labelSize: number;
  /** Apps shown; the store tile ("Mini-Apps entdecken") always follows as the last item. */
  apps: number;
  /** apps + 1 store tile. */
  items: number;
};

/**
 * Grid for `appCount` apps plus the store tile in a widget of `width × height`.
 * The tiles grow to fill the widget when there are few (two items on a wide widget =
 * two big tiles side by side) and shrink into a grid as the count grows, capped by
 * what fits at a readable minimum size.
 */
export function miniAppsGrid(appCount: number, width: number, height: number): MiniAppsGrid {
  const innerW = Math.max(0, width - MINI_PADDING * 2);
  const innerH = Math.max(0, height - MINI_PADDING * 2);
  const labels = innerH >= 58;
  const maxCols = clamp(Math.floor(innerW / (labels ? 60 : 52)), 1, 6);
  const maxRows = clamp(Math.floor(innerH / (labels ? 60 : 44)), 1, 4);
  const apps = clamp(Math.floor(appCount), 0, maxCols * maxRows - 1);
  const items = apps + 1;
  const below = labels ? MINI_LABEL_H + 6 : 6;

  let best = { cols: 1, rows: 1, icon: -1 };
  for (let cols = 1; cols <= Math.min(items, maxCols); cols++) {
    const rows = Math.ceil(items / cols);
    if (rows > maxRows) continue;
    const icon = Math.min(innerW / cols - 12, innerH / rows - below);
    if (icon > best.icon + 0.5) best = { cols, rows, icon };
  }
  const icon = Math.floor(clamp(best.icon, MINI_MIN_ICON, MINI_MAX_ICON));
  return {
    cols: best.cols,
    rows: best.rows,
    icon,
    tileW: Math.floor(innerW / best.cols),
    rowH: Math.floor(innerH / best.rows),
    labels,
    labelSize: icon >= 64 ? 13 : 11,
    apps,
    items,
  };
}

/** Store tile label: the long one only when it is alone or its tile is wide. */
export function storeTileLabel(apps: number, tileW: number): string {
  return apps === 0 || tileW >= 120 ? 'Mini-Apps entdecken' : 'Entdecken';
}

// ── Mittagstisch ──────────────────────────────────────────────────────────

/**
 * - row:    4×1 — one dish: thumbnail, name, price, ‹ › on the right
 * - single: 2×2 — one dish photo with name
 * - grid:   cols × rows dish photos (medium: one row, large: 2 × 2)
 */
export type LunchLayout = { kind: 'row' | 'single' | 'grid'; cols: number; rows: number };

export function lunchLayout(width: number, height: number): LunchLayout {
  if (height < 100) return { kind: 'row', cols: 1, rows: 1 };
  if (width < 200) return { kind: 'single', cols: 1, rows: 1 };
  const cols = width >= 420 ? 3 : 2;
  return { kind: 'grid', cols, rows: height >= 280 ? 2 : 1 };
}
