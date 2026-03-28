import * as SecureStore from 'expo-secure-store';

const BOOKMARK_KEY = 'bookmarked_event_ids_v1';

export async function loadBookmarks(): Promise<Set<string>> {
  try {
    const stored = await SecureStore.getItemAsync(BOOKMARK_KEY);
    if (!stored) return new Set();
    const parsed: string[] = JSON.parse(stored);
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export async function saveBookmarks(ids: Set<string>): Promise<void> {
  const arr = Array.from(ids);
  await SecureStore.setItemAsync(BOOKMARK_KEY, JSON.stringify(arr));
}

export async function toggleBookmark(current: Set<string>, id: string): Promise<Set<string>> {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  await saveBookmarks(next);
  return next;
}
