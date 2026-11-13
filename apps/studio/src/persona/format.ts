// Pure helpers for the personal-context sections (Für dich, Funktionen, Wiki, Bibliothek). Tested.
import type { LibraryFile, RoutineSchedule, Suggestion, SuggestionGroup, SuggestionSection } from '../workspace/api';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [1, 2, 3, 4, 5, 6, 0].map((value) => ({ value, label: WEEKDAYS[value] }));

const two = (n: number) => String(Math.max(0, Math.floor(n) || 0)).padStart(2, '0');

/** "Jeden Montag, 08:00" / "Täglich, 07:30". */
export function scheduleText(s: RoutineSchedule | null | undefined): string {
  if (!s) return '';
  const time = `${two(s.hour)}:${two(s.minute)}`;
  if (s.kind === 'weekly') return `Jeden ${WEEKDAYS[s.weekday ?? 1] ?? 'Montag'}, ${time}`;
  return `Täglich, ${time}`;
}

/** Builds a schedule from the create dialog ("HH:MM" from <input type="time">). */
export function makeSchedule(kind: 'weekly' | 'daily', weekday: number, time: string): RoutineSchedule {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const hour = m ? Math.min(23, Number(m[1])) : 8;
  const minute = m ? Math.min(59, Number(m[2])) : 0;
  return kind === 'weekly' ? { kind, weekday: Math.min(6, Math.max(0, weekday)), hour, minute, tz: 'Europe/Berlin' } : { kind, hour, minute, tz: 'Europe/Berlin' };
}

/** Reads a SKILL.md: optional YAML frontmatter with `name:` / `description:`, the rest is the instructions. */
export function parseSkillFile(text: string, fileName = ''): { name: string; description: string; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let name = '';
  let description = '';
  let body = src;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (fm) {
    body = src.slice(fm[0].length);
    for (const line of fm[1].split('\n')) {
      const m = /^(name|description)\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (m[1] === 'name') name = value;
      else description = value;
    }
  }
  body = body.trim();
  if (!name) {
    const h = /^#\s+(.+)$/m.exec(body);
    name = h ? h[1].trim() : fileName.replace(/\.(md|markdown|txt)$/i, '').replace(/^skill$/i, '');
  }
  return { name: name.slice(0, 60), description: description.slice(0, 300), body: body.slice(0, 20_000) };
}

const WIKI_ANCHOR = '#wiki-';

/** `[Text](wiki:slug)` becomes an in-page anchor the safe markdown parser keeps; other targets are untouched. */
export function prepareWikiMarkdown(body: string): string {
  return body.replace(/\]\(wiki:([\w-]+)\)/g, `](${WIKI_ANCHOR}$1)`);
}

export function wikiSlugOf(href: string): string | null {
  return href.startsWith(WIKI_ANCHOR) ? href.slice(WIKI_ANCHOR.length) : null;
}

/** Splits text at `[[n]]` citation markers. */
export function splitCitations(text: string): Array<string | { n: number }> {
  const out: Array<string | { n: number }> = [];
  const re = /\[\[(\d{1,3})\]\]/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push({ n: Number(m[1]) });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/**
 * Like `splitCitations`, but adjacent markers (separated by nothing, spaces or commas) form one run with
 * unique numbers in order, and the whitespace before a run is dropped so the marks sit on the word.
 */
export function citationRuns(text: string): Array<string | { ns: number[] }> {
  const out: Array<string | { ns: number[] }> = [];
  for (const part of splitCitations(text)) {
    const last = out[out.length - 1];
    if (typeof part === 'string') {
      // A separator between two markers is swallowed once the next marker arrives (see below).
      out.push(part);
      continue;
    }
    const before = out[out.length - 2];
    if (typeof last === 'string' && /^[\s,;]*$/.test(last) && before && typeof before !== 'string') {
      out.pop();
      if (!before.ns.includes(part.n)) before.ns.push(part.n);
    } else if (last && typeof last !== 'string') {
      if (!last.ns.includes(part.n)) last.ns.push(part.n);
    } else {
      if (typeof last === 'string') {
        const trimmed = last.replace(/\s+$/, '');
        if (trimmed) out[out.length - 1] = trimmed;
        else out.pop();
      }
      out.push({ ns: [part.n] });
    }
  }
  return out;
}

/** How a run is shown: up to `max` marks; a longer run shows its first mark and folds the rest into "+N". */
export function foldCitations(ns: number[], max = 2): { shown: number[]; folded: number[] } {
  return ns.length <= max ? { shown: ns, folded: [] } : { shown: ns.slice(0, 1), folded: ns.slice(1) };
}

// ---- Für dich -------------------------------------------------------------------------

/** v2 `sections`, or the v1 `groups` wrapped as the untitled projects section. */
export function suggestionSections(data: { sections?: SuggestionSection[] | null; groups?: SuggestionGroup[] | null } | null | undefined): SuggestionSection[] {
  if (data?.sections && Array.isArray(data.sections)) return data.sections.map((s) => ({ ...s, title: s.title ?? '', groups: s.groups ?? [] }));
  return data?.groups?.length ? [{ key: 'projects', title: '', groups: data.groups }] : [];
}

/** Left filter list: v2 = Alle, Schnell erledigt, Routinen, one per titled section; v1 = Alle, Aufgaben, Routinen. */
export function suggestionFilters(sections: SuggestionSection[], v2: boolean): Array<{ id: string; label: string }> {
  if (!v2) return [{ id: 'all', label: 'Alle' }, { id: 'task', label: 'Aufgaben' }, { id: 'routine', label: 'Routinen' }];
  const out = [{ id: 'all', label: 'Alle' }, { id: 'quick', label: 'Schnell erledigt' }, { id: 'routine', label: 'Routinen' }];
  for (const s of sections) if (s.key !== 'projects' && s.title && !out.some((o) => o.id === `section:${s.key}`)) out.push({ id: `section:${s.key}`, label: s.title });
  return out;
}

export function filterSuggestionSections(
  sections: SuggestionSection[],
  filter: string,
  opts: { hidden?: ReadonlySet<string>; onlyFresh?: boolean } = {},
): SuggestionSection[] {
  const keep = (i: Suggestion) => {
    if (opts.hidden?.has(i.id)) return false;
    if (opts.onlyFresh && !i.fresh) return false;
    if (filter === 'quick') return !!i.quick && i.kind === 'task';
    if (filter === 'task' || filter === 'routine') return i.kind === filter;
    return true;
  };
  return sections
    .filter((s) => !filter.startsWith('section:') || filter === `section:${s.key}`)
    .map((s) => ({ ...s, groups: s.groups.map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length > 0) }))
    .filter((s) => s.groups.length > 0);
}

/** Every suggestion once, in order (a suggestion can sit in more than one section). */
export function allSuggestions(sections: SuggestionSection[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of sections) for (const g of s.groups) for (const i of g.items) if (!seen.has(i.id)) (seen.add(i.id), out.push(i));
  return out;
}

/** Case-insensitive "all words appear somewhere" match for the client-side search fields. */
export function matchesQuery(query: string, ...fields: Array<string | null | undefined>): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function initials(name: string): string {
  const t = name.trim();
  return t ? t.slice(0, 1).toUpperCase() : '·';
}

/** Stable index into a small palette, so a person keeps the same badge colour everywhere. */
export function hueIndex(key: string, size: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return size > 0 ? h % size : 0;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

/** Collection ids: 'recent' = all, 'thread:<threadId>', 'routine:<title>'. */
export function filterLibrary(files: LibraryFile[], collectionId: string, kind: 'all' | 'document' | 'image', query: string): LibraryFile[] {
  const q = query.trim().toLowerCase();
  return files.filter((f) => {
    if (collectionId.startsWith('thread:') && f.threadId !== collectionId.slice(7)) return false;
    if (collectionId.startsWith('routine:') && f.routineTitle !== collectionId.slice(8)) return false;
    if (kind !== 'all' && f.kind !== kind) return false;
    return !q || `${f.name} ${f.threadTitle} ${f.routineTitle ?? ''}`.toLowerCase().includes(q);
  });
}

/** A not-yet-deployed endpoint (404) or a dropped connection reads as a friendly sentence, never a raw code. */
export function friendlyError(e: unknown): string {
  const err = e as { status?: number; code?: string; message?: string } | null;
  if (err?.status === 404 && err.code !== 'not_found') return 'Diese Funktion ist auf dem Server noch nicht verfügbar. Versuch es später noch einmal.';
  if (err?.status === 404) return err.message && !/^Fehler \d+$/.test(err.message) ? err.message : 'Das wurde nicht gefunden.';
  if (err?.status && err.status >= 500) return 'Der Server hat gerade ein Problem. Versuch es gleich noch einmal.';
  return err?.message || 'Das hat nicht geklappt.';
}
