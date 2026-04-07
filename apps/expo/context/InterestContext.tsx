import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import {
  fetchAllUserInterests,
  toggleInterest as toggleInterestApi,
  getInterestCount,
  getInterestedUsers as getInterestedUsersApi,
  InterestedUser,
} from '@/lib/supabase-interests';

export type InterestContextValue = {
  isInterested: (eventId: string) => boolean;
  toggleInterest: (eventId: string) => Promise<'added' | 'removed'>;
  getCount: (eventId: string) => number | undefined;
  getInterestedUsers: (eventId: string, limit?: number) => Promise<InterestedUser[]>;
  refreshCount: (eventId: string) => Promise<void>;
};

const InterestContext = createContext<InterestContextValue | undefined>(undefined);

export function InterestProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const walletAddress = account?.address;

  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const countsRef = useRef<Map<string, number>>(new Map());
  const [countsVersion, setCountsVersion] = useState(0);

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
      countsRef.current.set(eventId, wasInterested ? Math.max(0, currentCount - 1) : currentCount + 1);
      setCountsVersion((v) => v + 1);

      try {
        const result = await toggleInterestApi(eventId, walletAddress);
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
        setCountsVersion((v) => v + 1);
        throw error;
      }
    },
    [walletAddress, interestedIds]
  );

  const getCount = useCallback(
    (eventId: string): number | undefined => {
      // Access countsVersion to subscribe to updates
      void countsVersion;
      return countsRef.current.get(eventId);
    },
    [countsVersion]
  );

  const refreshCount = useCallback(async (eventId: string) => {
    const count = await getInterestCount(eventId);
    countsRef.current.set(eventId, count);
    setCountsVersion((v) => v + 1);
  }, []);

  const getInterestedUsers = useCallback(
    async (eventId: string, limit?: number): Promise<InterestedUser[]> => {
      return getInterestedUsersApi(eventId, limit);
    },
    []
  );

  const value = useMemo(
    () => ({ isInterested, toggleInterest, getCount, getInterestedUsers, refreshCount }),
    [isInterested, toggleInterest, getCount, getInterestedUsers, refreshCount]
  );

  return <InterestContext.Provider value={value}>{children}</InterestContext.Provider>;
}

export function useInterest(): InterestContextValue {
  const ctx = useContext(InterestContext);
  if (!ctx) throw new Error('useInterest must be used within InterestProvider');
  return ctx;
}
