import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventRecord } from '@/lib/types';
import type {
  StoryCollection,
  StorySlide,
} from '@/lib/supabase-story-collections';

const CACHED_STORIES_KEY = '@cached_stories';

/**
 * Last successfully-loaded home-feed story bundle, persisted locally so the
 * stories rail renders instantly on cold start instead of flashing skeletons
 * while the supabase queries re-run. Reconciled with fresh data on every
 * launch (the persisted copy may be stale); see HomeStoryBar.
 *
 * Whole `EventRecord`s are stored so the already-resolved `event.author`
 * (display name / avatar) survives — the rail shows correct identities, never
 * a wallet, straight from cache.
 */
export type CachedStories = {
  events: EventRecord[];
  collections: StoryCollection[];
  collectionSlides: Record<string, StorySlide[]>;
  audioUrl: string | null;
  savedAt: number; // Date.now() at save time
};

export async function loadCachedStories(): Promise<CachedStories | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_STORIES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.events) &&
      Array.isArray(parsed.collections) &&
      typeof parsed.savedAt === 'number'
    ) {
      return parsed as CachedStories;
    }
    return null;
  } catch {
    // Missing or malformed value — treat as no cache.
    return null;
  }
}

export async function saveCachedStories(bundle: CachedStories): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHED_STORIES_KEY, JSON.stringify(bundle));
  } catch {
    // Non-fatal: optimistic hydration just won't be available next launch.
  }
}
