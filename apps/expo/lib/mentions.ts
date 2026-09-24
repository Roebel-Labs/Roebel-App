/**
 * @-mentions in comments.
 *
 * Only Mecky is mentionable today: "@Mecky" in a comment makes the
 * `mecky-comment-reply` edge function answer under it (DB trigger
 * `trg_mecky_comment_mention`). People can be added to MENTIONABLES later.
 */

export type Mentionable = {
  /** Handle as inserted into the text, without the "@". */
  handle: string;
  subtitle: string;
};

export const MECKY_HANDLE = 'Mecky';
export const MECKY_WALLET = 'mecky_bot';

export const MENTIONABLES: Mentionable[] = [
  { handle: MECKY_HANDLE, subtitle: 'KI-Assistent · kennt Beitrag, Video & Links' },
];

export type MentionToken = { type: 'text' | 'mention'; value: string };

// "@Mecky" as a whole word: not preceded by a word char (skips e-mails),
// not followed by a letter/digit.
// Word chars incl. German/Latin-1 letters. Explicit ranges instead of \p{L}
// so the pattern doesn't depend on the engine's Unicode property support.
const WORD = 'A-Za-z0-9_\\u00C0-\\u024F';
const MENTION_RE = new RegExp(
  `(^|[^${WORD}])(@(?:${MENTIONABLES.map((m) => m.handle).join('|')}))(?![${WORD}])`,
  'gi',
);
const TRAILING_QUERY_RE = new RegExp(`(^|[\\s(])@([${WORD}]*)$`);
const LEADING_WORD_RE = new RegExp(`^[${WORD}]*`);

/** Split text into plain and mention tokens (case-insensitive). */
export function splitMentions(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) tokens.push({ type: 'text', value: text.slice(last, start) });
    tokens.push({ type: 'mention', value: m[2] });
    last = start + m[2].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

export function mentionsMecky(text: string): boolean {
  return splitMentions(text).some((t) => t.type === 'mention' && t.value.toLowerCase() === '@mecky');
}

/**
 * The "@query" being typed right before the cursor, if any. Returns the
 * index of the "@" and the query without it.
 */
export function activeMentionQuery(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const m = before.match(TRAILING_QUERY_RE);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

/** Mentionables matching a partial query ("" matches all). */
export function matchMentionables(query: string): Mentionable[] {
  const q = query.toLowerCase();
  return MENTIONABLES.filter(
    (m) => m.handle.toLowerCase().startsWith(q) && m.handle.toLowerCase() !== q,
  );
}

/**
 * Replace the "@query" at `start`..`cursor` with "@Handle " and return the
 * new text plus the cursor position after the inserted mention.
 */
export function applyMention(
  text: string,
  start: number,
  cursor: number,
  handle: string,
): { text: string; cursor: number } {
  const after = text.slice(cursor).replace(LEADING_WORD_RE, '');
  const insert = `@${handle}${after.startsWith(' ') ? '' : ' '}`;
  const next = text.slice(0, start) + insert + after;
  return { text: next, cursor: start + insert.length + (after.startsWith(' ') ? 1 : 0) };
}
