// apps/expo/lib/event-radio-select.ts
// Pure helpers for the Wochen-Radio narration bundle. Mirrors
// apps/web/src/lib/event-radio/select.ts and window.ts; keep them in sync.

export type RadioSegment = { audioUrl: string; durationMs: number };

export type EventRadioBundle = {
  enabled: boolean;
  intro: RadioSegment | null;
  outro: RadioSegment | null;
  byEventId: Record<string, RadioSegment>;
};

export type RadioSegmentRow = {
  kind: 'intro' | 'event' | 'outro';
  scope_key: string;
  audio_url: string;
  duration_ms: number;
  created_at: string;
};

export const EMPTY_RADIO_BUNDLE: EventRadioBundle = {
  enabled: false,
  intro: null,
  outro: null,
  byEventId: {},
};

const DAY_MS = 86_400_000;

/** Device-local calendar date as YYYY-MM-DD (people in Röbel are in Europe/Berlin). */
export function localDateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isoWeekKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function pickLatestPerScope<T extends RadioSegmentRow>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.kind}:${row.scope_key}`;
    const current = out.get(key);
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) {
      out.set(key, row);
    }
  }
  return out;
}

function toSegment(row: RadioSegmentRow | undefined): RadioSegment | null {
  return row ? { audioUrl: row.audio_url, durationMs: row.duration_ms } : null;
}

export function assembleRadioBundle(
  rows: RadioSegmentRow[],
  eventIds: string[],
  todayKey: string,
  weekKey: string,
): EventRadioBundle {
  const latest = pickLatestPerScope(rows);
  const byEventId: Record<string, RadioSegment> = {};
  for (const id of eventIds) {
    const seg = toSegment(latest.get(`event:${id}`));
    if (seg) byEventId[id] = seg;
  }
  return {
    enabled: true,
    intro: toSegment(latest.get(`intro:${todayKey}`)),
    outro: toSegment(latest.get(`outro:${weekKey}`)),
    byEventId,
  };
}
