// Display helpers shared by the chat screens.
import type { ChatThread } from './types';

/** List/header title: direct threads use their title, groups the comma-joined bot names. */
export function threadTitle(thread: ChatThread): string {
  if (thread.kind === 'group' || !thread.title) return thread.bots.map((b) => b.name).join(', ') || thread.title;
  return thread.title;
}
