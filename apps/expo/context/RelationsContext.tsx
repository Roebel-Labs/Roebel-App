import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { useQueryClient } from '@tanstack/react-query';
import { callRelations, loadCachedSnapshot, saveCachedSnapshot } from '@/lib/account-relations';
import { canSignSilently } from '@/lib/passkey/api-session-runtime';
import {
  EMPTY_SNAPSHOT, applyRelationChange, buildHiddenIndex, hiddenAccountIds,
  type HiddenIndex, type RelationChange, type RelationsSnapshot,
} from '@/lib/relations-state';
import { useSnackbar } from '@/context/SnackbarContext';
import { createSerialRunner } from '@/lib/serial-runner';

type FollowSource = 'onboarding' | 'manual' | 'intro';
type Ctx = {
  ready: boolean; snapshot: RelationsSnapshot; index: HiddenIndex; hiddenIds: string[];
  isFollowing: (id: string) => boolean; isMuted: (id: string) => boolean;
  follow: (ids: string[], source: FollowSource) => Promise<boolean>;
  unfollow: (ids: string[]) => Promise<boolean>;
  mute: (id: string, wallet?: string | null) => Promise<boolean>;
  unmute: (id: string, wallet?: string | null) => Promise<boolean>;
};

const RelationsContext = createContext<Ctx | null>(null);

export function RelationsProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const wallet = account?.address?.toLowerCase() ?? null;
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();
  const [snapshot, setSnapshot] = useState<RelationsSnapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const snapRef = useRef(snapshot);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const enqueue = useRef(createSerialRunner()).current;

  // Cache first (no flash of muted posts), then a silent server refresh. Never prompts a passkey at launch.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setSnapshot(EMPTY_SNAPSHOT);
    snapRef.current = EMPTY_SNAPSHOT;
    if (!wallet || !account) { setReady(true); return; }
    void (async () => {
      const cached = await loadCachedSnapshot(wallet);
      if (cancelled) return;
      if (cached) { snapRef.current = cached; setSnapshot(cached); }
      setReady(true);
      try {
        if (!(await canSignSilently(account))) return;
        const res = await callRelations(account, 'list', {});
        if (cancelled || !res.ok) return;
        snapRef.current = res.data;
        setSnapshot(res.data);
        void saveCachedSnapshot(wallet, res.data);
      } catch { /* keep the cached snapshot */ }
    })();
    return () => { cancelled = true; };
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback((change: RelationChange, action: 'follow' | 'unfollow' | 'mute' | 'unmute', payload: Record<string, unknown>) => {
    if (!account || !wallet) return Promise.resolve(false);
    return enqueue(async () => {
      if (walletRef.current !== wallet) return false;
      const before = snapRef.current;
      const optimistic = applyRelationChange(before, change);
      snapRef.current = optimistic;
      setSnapshot(optimistic);
      let res: Awaited<ReturnType<typeof callRelations>> | null = null;
      try { res = await callRelations(account, action, payload); } catch { res = null; }
      if (walletRef.current !== wallet) return false; // account switched meanwhile; the effect already reset state
      if (!res || !res.ok) {
        snapRef.current = before;
        setSnapshot(before);
        showSnackbar({ message: 'Das hat nicht geklappt. Bitte versuche es erneut.' });
        return false;
      }
      snapRef.current = res.data;
      setSnapshot(res.data);
      void saveCachedSnapshot(wallet, res.data);
      void queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] });
      return true;
    });
  }, [account, wallet, queryClient, showSnackbar, enqueue]);

  const value = useMemo<Ctx>(() => {
    const index = buildHiddenIndex(snapshot);
    const followingSet = new Set(snapshot.following);
    return {
      ready, snapshot, index, hiddenIds: hiddenAccountIds(snapshot),
      isFollowing: (id) => followingSet.has(id),
      isMuted: (id) => index.mutedIds.has(id),
      follow: (ids, source) => run({ kind: 'follow', ids }, 'follow', { targets: ids, source }),
      unfollow: (ids) => run({ kind: 'unfollow', ids }, 'unfollow', { targets: ids }),
      mute: (id, w) => run({ kind: 'mute', id, wallet: w }, 'mute', { target: id }),
      unmute: (id, w) => run({ kind: 'unmute', id, wallet: w }, 'unmute', { target: id }),
    };
  }, [snapshot, ready, run]);

  return <RelationsContext.Provider value={value}>{children}</RelationsContext.Provider>;
}

export function useRelations(): Ctx {
  const ctx = useContext(RelationsContext);
  if (!ctx) throw new Error('useRelations must be used inside RelationsProvider');
  return ctx;
}
