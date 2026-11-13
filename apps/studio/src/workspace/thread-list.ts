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
