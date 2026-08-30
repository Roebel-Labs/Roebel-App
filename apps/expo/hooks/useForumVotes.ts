import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { fetchMyForumVotes, type ForumVoteTarget } from '@/lib/supabase-forum';

/**
 * Batch-hydrates the viewer's own votes for a set of targets and overlays
 * optimistic local taps (written by ForumVoteCluster via setLocal/onVoted).
 */
export function useForumVotes(targets: Array<{ type: ForumVoteTarget; id: string }>) {
  const { user } = useUser();
  const wallet = user?.wallet_address ?? null;
  const [overlay, setOverlay] = useState<Map<string, 1 | -1 | null>>(new Map());

  const key = useMemo(() => targets.map((t) => `${t.type}:${t.id}`).sort().join(','), [targets]);

  const { data } = useQuery({
    queryKey: ['forum', 'myvotes', wallet, key],
    enabled: !!wallet && targets.length > 0,
    queryFn: () => fetchMyForumVotes(wallet!, targets),
    staleTime: 60_000,
  });

  const myVote = useCallback(
    (type: ForumVoteTarget, id: string): 1 | -1 | null => {
      const k = `${type}:${id}`;
      if (overlay.has(k)) return overlay.get(k) ?? null;
      return data?.get(k) ?? null;
    },
    [overlay, data],
  );

  const setLocal = useCallback((type: ForumVoteTarget, id: string, v: 1 | -1 | null) => {
    setOverlay((prev) => new Map(prev).set(`${type}:${id}`, v));
  }, []);

  return { myVote, setLocal };
}
