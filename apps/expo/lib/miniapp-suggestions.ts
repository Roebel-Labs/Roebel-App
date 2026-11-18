/**
 * Suggest one fitting mini app on Erkunden. Matching runs on the device (lib/miniapp-audience.ts);
 * nothing here is logged, tracked or sent — a private membership must not leak through a
 * recommendation. A suggestion only suggests: the layout changes when the person taps
 * "Übernehmen". Each app is suggested at most once (marked on either button, not on display).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audienceState, isForYou } from './miniapp-audience';
import type { MatchCredential } from './miniapp-credentials';
import type { MiniApp } from './miniapps';

/** JSON array of slugs that were suggested (accepted or dismissed). */
export const SUGGESTED_KEY = 'miniapps.suggested.v1';
/** JSON array of org account ids whose credential was just accepted. */
export const QUEUE_KEY = 'miniapps.suggestQueue.v1';

export interface PickSuggestionInput {
  apps: readonly MiniApp[];
  held: readonly MatchCredential[];
  myOrgIds: readonly string[];
  /** Slugs already pinned on Erkunden. */
  pinned: readonly string[];
  alreadySuggested: readonly string[];
  queuedOrgIds: readonly string[];
}

/** For me, not locked, not pinned, not suggested before; a queued org's app first, then manifest order. */
export function pickSuggestion(p: PickSuggestionInput): MiniApp | null {
  const pinned = new Set(p.pinned);
  const seen = new Set(p.alreadySuggested);
  const candidates = p.apps.filter(
    (a) =>
      !pinned.has(a.slug) &&
      !seen.has(a.slug) &&
      audienceState(a, p.held) !== 'locked' &&
      isForYou(a, p.held, p.myOrgIds),
  );
  if (candidates.length === 0) return null;
  const queued = new Set(p.queuedOrgIds.map((id) => id.toLowerCase()));
  const fromQueue = candidates.find((a) => !!a.orgAccountId && queued.has(a.orgAccountId.toLowerCase()));
  return fromQueue ?? candidates[0];
}

async function readList(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

async function addToList(key: string, value: string): Promise<void> {
  const list = await readList(key);
  if (list.includes(value)) return;
  try {
    await AsyncStorage.setItem(key, JSON.stringify([...list, value]));
  } catch {
    // Best effort: worst case the same app is suggested again.
  }
}

export function readSuggested(): Promise<string[]> {
  return readList(SUGGESTED_KEY);
}

export function readSuggestQueue(): Promise<string[]> {
  return readList(QUEUE_KEY);
}

export function markSuggested(slug: string): Promise<void> {
  return addToList(SUGGESTED_KEY, slug);
}

/** After a credential of this org was accepted: its mini app is suggested first, once. */
export function queueMiniAppSuggestion(orgAccountId: string): Promise<void> {
  return addToList(QUEUE_KEY, orgAccountId.toLowerCase());
}
