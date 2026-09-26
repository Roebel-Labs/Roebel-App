// Display helpers shared by the chat screens.
import type { ChatThread } from './types';

/** List/header title: direct threads use their title, groups the comma-joined bot names. */
export function threadTitle(thread: ChatThread): string {
  if (thread.kind === 'group' || !thread.title) return thread.bots.map((b) => b.name).join(', ') || thread.title;
  return thread.title;
}

/** The `count` most recently active threads, newest first (profile banner). */
export function pickRecentThreads(threads: ChatThread[] | null | undefined, count = 2): ChatThread[] {
  if (!Array.isArray(threads) || count <= 0) return [];
  return [...threads]
    .filter((th) => th && typeof th.id === 'string')
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0))
    .slice(0, count);
}
