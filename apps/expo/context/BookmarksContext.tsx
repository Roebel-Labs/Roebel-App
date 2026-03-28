import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadBookmarks, toggleBookmark as toggleBookmarkStorage } from '@/lib/bookmarks';

export type BookmarksContextValue = {
  bookmarkedIds: Set<string>;
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => Promise<'added' | 'removed'>;
};

const BookmarksContext = createContext<BookmarksContextValue | undefined>(undefined);

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBookmarks().then(setBookmarkedIds);
  }, []);

  const isBookmarked = useCallback((id: string) => bookmarkedIds.has(id), [bookmarkedIds]);

  const toggleBookmark = useCallback(async (id: string): Promise<'added' | 'removed'> => {
    const wasBookmarked = bookmarkedIds.has(id);
    const next = await toggleBookmarkStorage(bookmarkedIds, id);
    setBookmarkedIds(next);
    return wasBookmarked ? 'removed' : 'added';
  }, [bookmarkedIds]);

  const value = useMemo(() => ({ bookmarkedIds, isBookmarked, toggleBookmark }), [bookmarkedIds, isBookmarked, toggleBookmark]);

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks(): BookmarksContextValue {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error('useBookmarks must be used within BookmarksProvider');
  return ctx;
}
