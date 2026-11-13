// Pure helpers for the Start sidebar (tested).
import type { ChatThread } from './types';

/** The default assistant's main conversation: its most recent direct thread, else the most recent thread. */
export function mainThreadOf(threads: ChatThread[], agentId: string | undefined): ChatThread | null {
  const byRecency = [...threads].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0));
  return byRecency.find((t) => t.kind === 'direct' && t.bots[0]?.id === agentId) ?? byRecency.find((t) => t.bots[0]?.id === agentId) ?? byRecency[0] ?? null;
}

/** How far (px) an overflowing title has to slide to show its end; 0 when it fits. */
export function marqueeShift(contentWidth: number, boxWidth: number, pad = 12): number {
  const over = Math.ceil(contentWidth - boxWidth);
  return over > 1 ? over + pad : 0;
}

/** Markdown marks and whitespace runs removed, cut at a word where possible. */
function clip(text: string, max: number): string {
  const t = text.replace(/[#*_`>\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()} …`;
}

/**
 * What a conversation is called in the list and the header: its own title; when the title is empty or
 * just repeats the assistant's name, the start of the latest message; the assistant's name as a last resort.
 */
export function threadLabel(t: Pick<ChatThread, 'title' | 'bots' | 'lastMessagePreview'>, max = 64): string {
  const bot = t.bots[0]?.name?.trim() ?? '';
  const title = (t.title ?? '').trim();
  if (title && title.toLowerCase() !== bot.toLowerCase()) return title;
  const preview = clip(t.lastMessagePreview ?? '', max);
  return preview || title || bot || 'Unterhaltung';
}

/** "Aufgaben" = conversations that belong to a routine; everything else is "Zuletzt verwendet". */
export function splitThreads<T extends { id: string }>(threads: T[], routineThreadIds: ReadonlySet<string>): { tasks: T[]; recent: T[] } {
  return { tasks: threads.filter((t) => routineThreadIds.has(t.id)), recent: threads.filter((t) => !routineThreadIds.has(t.id)) };
}

/** The assistants that lead at least one conversation, in list order (for the filter menu). */
export function agentsOf(threads: ChatThread[]): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const t of threads) {
    const b = t.bots[0];
    if (b && !out.some((o) => o.id === b.id)) out.push({ id: b.id, name: b.name });
  }
  return out;
}

export function greeting(hour: number): string {
  return hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
}

/** "Max Brych" → "Max"; handles and e-mail-like names are not first names. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first && !/[@\d_]/.test(first) ? first : null;
}

/** The start block shows when the conversation has nothing from today yet. */
export function needsBriefing(messages: Array<{ createdAt: string }>, now = new Date()): boolean {
  const last = messages[messages.length - 1];
  return !last || new Date(last.createdAt).toDateString() !== now.toDateString();
}
