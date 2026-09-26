// "Für dich" inspiration screen: response types (≡ apps/web/src/lib/chat/inspiration/load.ts)
// and pure helpers. No React, no I/O.
import type { BotAvatarSpec, ChatThread } from './types';

export type InspirationTier = 'free' | 'plus' | 'ultra' | 'business';

export interface InspirationAudience {
  /** "me" or "org:<id>". */
  key: string;
  label: string;
  orgId?: string;
  orgName?: string;
  audience: string;
}

export interface InspirationTask {
  id: string;
  title: string;
  pitch: string;
  value: { kind: 'money' | 'time' | 'good'; estimate: string };
  botSlug: string | null;
  /** {orgName} is already filled in by the server. */
  starterPrompt: string;
  tier: InspirationTier;
  recurring?: { suggestion: string };
  locked: boolean;
  bot: { id: string; name: string; avatar: BotAvatarSpec } | null;
}

export interface InspirationFeed {
  audiences: InspirationAudience[];
  audienceKey: string;
  tier: 'free' | 'plus' | 'ultra';
  tasks: InspirationTask[];
}

export const ME_AUDIENCE = 'me';

/** Query string for GET /api/chat/inspiration. */
export function inspirationQuery(audienceKey: string | null | undefined): string {
  const key = (audienceKey ?? '').trim();
  if (key.startsWith('org:') && key.length > 4) {
    return `?audience=org&orgId=${encodeURIComponent(key.slice(4))}`;
  }
  return `?audience=${ME_AUDIENCE}`;
}

/** Badge on locked cards. */
export function tierBadgeLabel(tier: InspirationTier): string | null {
  switch (tier) {
    case 'plus':
      return 'Plus';
    case 'ultra':
      return 'Ultra';
    case 'business':
      return 'Betrieb';
    default:
      return null;
  }
}

/** Starter prompt, optionally asking the bot to set the task up as a routine. */
export function starterText(task: Pick<InspirationTask, 'starterPrompt' | 'recurring'>, asRoutine: boolean): string {
  const base = task.starterPrompt.trim();
  if (!asRoutine || !task.recurring?.suggestion) return base;
  return `${base}\n\nRichte das bitte als Routine ein: ${task.recurring.suggestion}.`;
}

/** Most recent direct (single-bot) thread with this bot, or null. */
export function findDirectThread(threads: ChatThread[], botId: string): ChatThread | null {
  let best: ChatThread | null = null;
  for (const th of threads) {
    if (th.kind !== 'direct' || th.bots.length !== 1 || th.bots[0].id !== botId) continue;
    if (!best || th.lastMessageAt > best.lastMessageAt) best = th;
  }
  return best;
}

/** Label of the chat-list entry row. */
export function inspirationRowLabel(count: number): string {
  if (count <= 0) return 'Für dich';
  return `Für dich · ${count} ${count === 1 ? 'Idee' : 'Ideen'}`;
}

/** Drops a dismissed card locally (optimistic "Nicht relevant"). */
export function withoutTask(feed: InspirationFeed, taskId: string): InspirationFeed {
  return { ...feed, tasks: feed.tasks.filter((t) => t.id !== taskId) };
}
