// Unread state (spec §5 phase 2): the "NEU" divider and thread-list patches. Pure — no React.
import type { ChatMessage, ChatThread } from './types';

/**
 * Id of the first non-user message created after `lastReadAt` (the "NEU" divider
 * sits right before it), or null when everything was read. Optimistic temp
 * messages never count; server timestamps are compared as instants.
 */
export function firstNewMessageId(messages: ChatMessage[], lastReadAt: string | null | undefined): string | null {
  if (!lastReadAt) return null;
  const readAt = Date.parse(lastReadAt);
  if (Number.isNaN(readAt)) return null;
  const hit = messages.find((m) => m.role !== 'user' && Date.parse(m.createdAt) > readAt);
  return hit ? hit.id : null;
}

/** Marks a thread read in the list (unread false, lastReadAt = the server's value or now). */
export function markThreadReadIn(threads: ChatThread[], threadId: string, lastReadAt?: string): ChatThread[] {
  const at = lastReadAt ?? new Date().toISOString();
  return threads.map((t) => {
    if (t.id !== threadId) return t;
    // Never move lastReadAt backwards (a late response must not resurrect "unread").
    const next = t.lastReadAt && Date.parse(t.lastReadAt) > Date.parse(at) ? t.lastReadAt : at;
    return { ...t, unread: false, lastReadAt: next };
  });
}

/** Replaces a thread in place (keeps list order); appends it when unknown. */
export function mergeThreadIn(threads: ChatThread[], thread: ChatThread): ChatThread[] {
  const idx = threads.findIndex((t) => t.id === thread.id);
  if (idx === -1) return [...threads, thread];
  const next = threads.slice();
  next[idx] = thread;
  return next;
}
