// "Dein Tag": the daily briefing and the suggestions derived from the personal wiki.
// Contract of /api/chat/persona/{briefing,suggestions,suggestions/:id,build}; pure helpers (tested).
import type { ChatRoutine, RoutineSchedule } from './api';

export interface Suggestion {
  id: string;
  kind: 'task' | 'routine';
  title: string;
  reason: string;
  prompt: string;
  schedule: RoutineSchedule | null;
  people: { name: string; slug: string }[];
  /** Done in minutes ("Schnell erledigt"). */
  quick?: boolean;
  /** Not in the previous set ("Neu"). */
  fresh?: boolean;
}

export interface SuggestionGroup {
  title: string;
  items: Suggestion[];
}

export interface SuggestionSection {
  key: string;
  title: string;
  groups: SuggestionGroup[];
}

export type PersonaState = 'empty' | 'building' | 'ready' | 'error';

export interface PersonaStatus {
  state: PersonaState;
  stageLabel: string | null;
  progress: number;
  error: string | null;
  builtAt: string | null;
  sources: { google: boolean; imports: number };
}

export interface SuggestionsResponse {
  sections?: SuggestionSection[] | null;
  groups?: SuggestionGroup[] | null;
  status?: Partial<PersonaStatus> | null;
}

export interface BriefingItem {
  label: string;
  text: string;
  /** The suggestion that tackles the point; null or absent when there is none. */
  task?: Suggestion | null;
}

export interface Briefing {
  name: string | null;
  date: string | null;
  items: BriefingItem[];
  suggestions: Suggestion[];
  /** The full briefing as Markdown; null when there is none. */
  doc: string | null;
  title: string | null;
}

export interface StartSuggestionResult {
  threadId: string;
  prompt: string;
  routine: ChatRoutine | null;
}

function cleanSuggestion(s: Suggestion | null | undefined): Suggestion | null {
  if (!s || typeof s.id !== 'string' || typeof s.title !== 'string') return null;
  return {
    ...s,
    kind: s.kind === 'routine' ? 'routine' : 'task',
    reason: s.reason ?? '',
    prompt: s.prompt ?? '',
    schedule: s.schedule ?? null,
    people: Array.isArray(s.people) ? s.people : [],
  };
}

function cleanList(list: Suggestion[] | null | undefined): Suggestion[] {
  if (!Array.isArray(list)) return [];
  const out: Suggestion[] = [];
  for (const s of list) {
    const c = cleanSuggestion(s);
    if (c) out.push(c);
  }
  return out;
}

/** Fills every missing field so the screens never touch undefined. */
export function normalizeBriefing(raw: Partial<Briefing> | null | undefined): Briefing {
  const items: BriefingItem[] = [];
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    if (!it || typeof it.text !== 'string' || !it.text.trim()) continue;
    items.push({ label: typeof it.label === 'string' ? it.label : '', text: it.text, task: cleanSuggestion(it.task) });
  }
  const doc = typeof raw?.doc === 'string' && raw.doc.trim() ? raw.doc.trim() : null;
  return {
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : null,
    date: typeof raw?.date === 'string' ? raw.date : null,
    items,
    suggestions: cleanList(raw?.suggestions),
    doc,
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
  };
}

export function normalizeStatus(raw: Partial<PersonaStatus> | null | undefined): PersonaStatus {
  const state = raw?.state;
  return {
    state: state === 'building' || state === 'ready' || state === 'error' ? state : 'empty',
    stageLabel: raw?.stageLabel ?? null,
    progress: typeof raw?.progress === 'number' && Number.isFinite(raw.progress) ? Math.min(1, Math.max(0, raw.progress)) : 0,
    error: raw?.error ?? null,
    builtAt: raw?.builtAt ?? null,
    sources: { google: Boolean(raw?.sources?.google), imports: Number(raw?.sources?.imports) || 0 },
  };
}

/** v2 `sections`, or the v1 `groups` wrapped as the untitled projects section. Broken entries are dropped. */
export function suggestionSections(data: SuggestionsResponse | null | undefined): SuggestionSection[] {
  const groupsOf = (groups: SuggestionGroup[] | null | undefined): SuggestionGroup[] =>
    (Array.isArray(groups) ? groups : [])
      .map((g) => ({ title: g?.title ?? '', items: cleanList(g?.items) }))
      .filter((g) => g.items.length > 0);
  if (Array.isArray(data?.sections)) {
    return data.sections
      .map((s, i) => ({ key: s?.key || `section-${i}`, title: s?.title ?? '', groups: groupsOf(s?.groups) }))
      .filter((s) => s.groups.length > 0);
  }
  const groups = groupsOf(data?.groups);
  return groups.length ? [{ key: 'projects', title: '', groups }] : [];
}

/** Every suggestion once, in order (a suggestion can sit in more than one section). */
export function allSuggestions(sections: SuggestionSection[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of sections) {
    for (const g of s.groups) {
      for (const i of g.items) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        out.push(i);
      }
    }
  }
  return out;
}

export type SuggestionFilter = 'all' | 'quick' | 'routine';

/** Drops hidden items (started or dismissed on this screen) and applies the filter chip; empty groups and sections go. */
export function visibleSections(
  sections: SuggestionSection[],
  hidden: ReadonlySet<string>,
  filter: SuggestionFilter = 'all',
): SuggestionSection[] {
  const keep = (i: Suggestion) => {
    if (hidden.has(i.id)) return false;
    if (filter === 'quick') return Boolean(i.quick) && i.kind === 'task';
    if (filter === 'routine') return i.kind === 'routine';
    return true;
  };
  return sections
    .map((s) => ({ ...s, groups: s.groups.map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length > 0) }))
    .filter((s) => s.groups.length > 0);
}

/** Flat render list for one screen: headings as in Ortis Studio, then the items. */
export type SuggestionRow =
  | { type: 'section'; key: string; title: string }
  | { type: 'group'; key: string; title: string; ids: string[] }
  | { type: 'item'; key: string; item: Suggestion };

export function suggestionRows(sections: SuggestionSection[]): SuggestionRow[] {
  const rows: SuggestionRow[] = [];
  sections.forEach((s, si) => {
    if (s.title) rows.push({ type: 'section', key: `s:${s.key}:${si}`, title: s.title });
    s.groups.forEach((g, gi) => {
      if (g.title) rows.push({ type: 'group', key: `g:${s.key}:${si}:${gi}`, title: g.title, ids: g.items.map((i) => i.id) });
      for (const item of g.items) rows.push({ type: 'item', key: `i:${s.key}:${si}:${gi}:${item.id}`, item });
    });
  });
  return rows;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const two = (n: number) => String(Math.max(0, Math.floor(n) || 0)).padStart(2, '0');

/** "Jeden Montag, 08:00" / "Täglich, 07:30". */
export function scheduleText(s: RoutineSchedule | null | undefined): string {
  if (!s) return '';
  const time = `${two(s.hour)}:${two(s.minute)}`;
  if (s.kind === 'weekly') return `Jeden ${WEEKDAYS[s.weekday ?? 1] ?? 'Montag'}, ${time}`;
  return `Täglich, ${time}`;
}

/** "Guten Morgen" before 11, "Guten Tag" before 18, "Guten Abend" after; "Hallo" at night. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Guten Morgen';
  if (hour >= 11 && hour < 18) return 'Guten Tag';
  if (hour >= 18 && hour < 23) return 'Guten Abend';
  return 'Hallo';
}

/** "Rechnungen:" → "Rechnungen" (the label is set in front of the point with its own colon). */
export function briefingLabel(label: string | null | undefined): string {
  return (label ?? '').replace(/:\s*$/, '').trim();
}

/** Briefing text for a plain Text node: links as their text, wiki links and emphasis marks removed. */
export function briefingPlainText(md: string | null | undefined): string {
  return (md ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** The full briefing for the Markdown viewer: wiki links (`wiki:slug`) become plain text, citations go. */
export function briefingDocForViewer(doc: string): string {
  return doc
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/\[([^\]]+)\]\(wiki:[^)]*\)/g, '$1');
}

/** "Montag, 16. November" for the head of the screen. */
export function dayLine(now: Date): string {
  return now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
