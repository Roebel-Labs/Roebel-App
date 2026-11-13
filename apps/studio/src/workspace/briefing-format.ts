// Pure helpers for the briefing panel, the day divider and reactions (tested).

export interface Chapter {
  title: string;
  /** Plain text to read aloud, heading included. */
  text: string;
}

/** Markdown reduced to what a voice should read: no marks, links as their text, list items as sentences. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, '$1.')
    .replace(/^\s*[-*+]\s+(.*)$/gm, '$1.')
    .replace(/^\s*\d+\.\s+(.*)$/gm, '$1.')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/([.!?:])\./g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chapters from the `##` headings of the briefing. Text before the first heading is its own opening
 * chapter; a document without headings is one chapter.
 */
export function docChapters(doc: string, opening = 'Einstieg'): Chapter[] {
  const lines = doc.replace(/\r\n?/g, '\n').split('\n');
  const out: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } = { title: opening, body: [] };
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const h = fenced ? null : /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      if (current.body.join('').trim() || out.length > 0) out.push(current);
      current = { title: plainText(h[1]), body: [line] };
    } else if (!(out.length === 0 && current.body.length === 0 && /^#\s+/.test(line))) {
      // The document's own H1 is the panel title, not something to read out.
      current.body.push(line);
    }
  }
  out.push(current);
  return out.map((c) => ({ title: c.title, text: plainText(c.body.join('\n')) })).filter((c) => c.text);
}

/** 75 → "1:15"; negative or NaN → "0:00". */
export function fmtClock(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const SPEEDS = [1, 1.25, 1.5] as const;
export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

/** Divider label between days of a conversation: "Heute", "Gestern" or the date. */
export function dayLabel(iso: string | Date, now = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

/** True when a message starts a new calendar day compared with the one before it. */
export function startsNewDay(prev: { createdAt: string } | undefined, current: { createdAt: string }): boolean {
  return !!prev && new Date(prev.createdAt).toDateString() !== new Date(current.createdAt).toDateString();
}

export const QUICK_REACTIONS = ['👍', '✅', '🎉'] as const;
export const MORE_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🔥', '✅', '🎉', '👀', '💡', '🤔', '👎'] as const;

/** Reactions to show as chips: every emoji with a count above zero, in a stable order. */
export function reactionChips(reactions: Record<string, number> | null | undefined): Array<{ emoji: string; count: number }> {
  return Object.entries(reactions ?? {})
    .filter(([, n]) => n > 0)
    .map(([emoji, count]) => ({ emoji, count }));
}

/** The text of a message for "Text kopieren": its text parts, in order. */
export function messageText(parts: Array<{ type: string; [k: string]: unknown }>): string {
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => String(p.text).trim())
    .filter(Boolean)
    .join('\n\n');
}
