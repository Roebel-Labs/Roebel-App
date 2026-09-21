import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import {
  fetchAllUserInterests,
  fetchInterestPreviews,
  toggleInterest as toggleInterestApi,
  getInterestCount,
  getInterestedUsers as getInterestedUsersApi,
  InterestedUser,
} from '@/lib/supabase-interests';
import { INTEREST_PREVIEW_USER_LIMIT, type InterestPreview } from '@/lib/interest-previews';
import { useUser } from '@/context/UserContext';

export type InterestContextValue = {
  isInterested: (eventId: string) => boolean;
  toggleInterest: (eventId: string) => Promise<'added' | 'removed'>;
  getCount: (eventId: string) => number | undefined;
  getInterestedUsers: (eventId: string, limit?: number) => Promise<InterestedUser[]>;
  refreshCount: (eventId: string) => Promise<void>;
  /**
   * Cached count + the newest interested people for an event. `undefined`
   * until loadPreviews ran for it; a preview with count 0 means "loaded,
   * nobody yet". Updated optimistically by toggleInterest so avatar stacks
   * and the flyer orbs react the moment the button is pressed.
   */
  getPreview: (eventId: string) => InterestPreview | undefined;
  /** Batch-load previews for many events (one rail = one call). Cached
   *  ids are skipped unless `force` is set. */
  loadPreviews: (eventIds: string[], opts?: { force?: boolean }) => Promise<void>;
};

const InterestContext = createContext<InterestContextValue | undefined>(undefined);

export function InterestProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const walletAddress = account?.address;
  const { user } = useUser();

  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const countsRef = useRef<Map<string, number>>(new Map());
  const previewsRef = useRef<Map<string, InterestPreview>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  // One version counter for both ref-backed caches: bumping it re-renders
  // every consumer of getCount / getPreview.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Fetch all user interests on mount / wallet change
  useEffect(() => {
    if (!walletAddress) {
      setInterestedIds(new Set());
      return;
    }

    fetchAllUserInterests(walletAddress).then((ids) => {
      setInterestedIds(new Set(ids));
    });
  }, [walletAddress]);

  const isInterested = useCallback(
    (eventId: string) => interestedIds.has(eventId),
    [interestedIds]
  );

  const storePreviews = useCallback(
    (previews: Map<string, InterestPreview>) => {
      previews.forEach((preview, id) => {
        previewsRef.current.set(id, preview);
        countsRef.current.set(id, preview.count);
      });
      bump();
    },
    [bump]
  );

  const toggleInterest = useCallback(
    async (eventId: string): Promise<'added' | 'removed'> => {
      if (!walletAddress) throw new Error('Not connected');

      const wasInterested = interestedIds.has(eventId);

      // Optimistic update
      setInterestedIds((prev) => {
        const next = new Set(prev);
        if (wasInterested) {
          next.delete(eventId);
        } else {
          next.add(eventId);
        }
        return next;
      });

      // Optimistic count update
      const currentCount = countsRef.current.get(eventId) ?? 0;
      const nextCount = wasInterested ? Math.max(0, currentCount - 1) : currentCount + 1;
      countsRef.current.set(eventId, nextCount);

      // Optimistic preview update: the signed-in person's own avatar joins
      // (newest first) or leaves the list right away.
      const previousPreview = previewsRef.current.get(eventId);
      if (previousPreview) {
        const me = walletAddress.toLowerCase();
        const others = previousPreview.users.filter((u) => u.wallet_address.toLowerCase() !== me);
        const self: InterestedUser = {
          wallet_address: walletAddress,
          username: user?.username ?? null,
          profile_picture_url: user?.profile_picture_url ?? null,
        };
        previewsRef.current.set(eventId, {
          count: nextCount,
          users: wasInterested ? others : [self, ...others].slice(0, INTEREST_PREVIEW_USER_LIMIT),
        });
      }
      bump();

      try {
        const result = await toggleInterestApi(eventId, walletAddress);
        // Converge on the server's view in the background.
        fetchInterestPreviews([eventId]).then(storePreviews).catch(() => {});
        return result;
      } catch (error) {
        // Revert on failure
        setInterestedIds((prev) => {
          const next = new Set(prev);
          if (wasInterested) {
            next.add(eventId);
          } else {
            next.delete(eventId);
          }
          return next;
        });
        countsRef.current.set(eventId, currentCount);
        if (previousPreview) previewsRef.current.set(eventId, previousPreview);
        bump();
        throw error;
      }
    },
    [walletAddress, interestedIds, user?.username, user?.profile_picture_url, bump, storePreviews]
  );

  const getCount = useCallback(
    (eventId: string): number | undefined => {
      // Access version to subscribe to updates
      void version;
      return countsRef.current.get(eventId);
    },
    [version]
  );

  const getPreview = useCallback(
    (eventId: string): InterestPreview | undefined => {
      void version;
      return previewsRef.current.get(eventId);
    },
    [version]
  );

  const refreshCount = useCallback(async (eventId: string) => {
    const count = await getInterestCount(eventId);
    countsRef.current.set(eventId, count);
    bump();
  }, [bump]);

  const loadPreviews = useCallback(
    async (eventIds: string[], opts?: { force?: boolean }) => {
      const wanted = eventIds.filter(
        (id) => (opts?.force || !previewsRef.current.has(id)) && !inFlightRef.current.has(id)
      );
      if (wanted.length === 0) return;
      wanted.forEach((id) => inFlightRef.current.add(id));
      try {
        storePreviews(await fetchInterestPreviews(wanted));
      } catch {
        // Leave the ids unloaded; the next mount retries.
      } finally {
        wanted.forEach((id) => inFlightRef.current.delete(id));
      }
    },
    [storePreviews]
  );

  const getInterestedUsers = useCallback(
    async (eventId: string, limit?: number): Promise<InterestedUser[]> => {
      return getInterestedUsersApi(eventId, limit);
    },
    []
  );

  const value = useMemo(
    () => ({ isInterested, toggleInterest, getCount, getInterestedUsers, refreshCount, getPreview, loadPreviews }),
    [isInterested, toggleInterest, getCount, getInterestedUsers, refreshCount, getPreview, loadPreviews]
  );

  return <InterestContext.Provider value={value}>{children}</InterestContext.Provider>;
}

export function useInterest(): InterestContextValue {
  const ctx = useContext(InterestContext);
  if (!ctx) throw new Error('useInterest must be used within InterestProvider');
  return ctx;
}
