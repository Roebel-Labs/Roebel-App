import { useCallback, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FeedItem,
  FeedType,
  PostRecord,
  GovernanceNudgeData,
  MeckyTipData,
  ProposalFeedRecord,
} from '@/lib/types/feed';
import { fetchFeedPosts } from '@/lib/supabase-posts';
import { fetchFeedSections } from '@/lib/feed-sections';
import { assembleFeed } from '@/lib/feed-assembler';
import { useUser } from '@/context/UserContext';
import type { SupabaseProposal } from '@/lib/supabase-proposals';

function buildGovernanceNudges(proposals: SupabaseProposal[]): GovernanceNudgeData[] {
  // Filter to active proposals (state === 1)
  const active = proposals.filter(p => p.state === 1);
  return active.map(p => {
    const forVotes = parseInt(p.for_votes) || 0;
    const againstVotes = parseInt(p.against_votes) || 0;
    const total = forVotes + againstVotes || 1;
    return {
      proposalId: p.proposal_id,
      title: p.title,
      forPercentage: Math.round((forVotes / total) * 100),
      againstPercentage: Math.round((againstVotes / total) * 100),
      daysRemaining: 7, // TODO: calculate from deadline_block
    };
  });
}

function generateMeckyTips(): MeckyTipData[] {
  const hour = new Date().getHours();
  const tips: MeckyTipData[] = [];

  if (hour >= 6 && hour < 10) {
    tips.push({ text: 'Guten Morgen! Wie wäre es mit einem Spaziergang am Müritzufer? 🌅', actionLabel: 'Karte öffnen', actionRoute: '/location' });
  } else if (hour >= 11 && hour < 14) {
    tips.push({ text: 'Mittagszeit! Schau dir die Restaurants in Röbel an. 🍽️', actionLabel: 'Restaurants', actionRoute: '/restaurant' });
  } else if (hour >= 14 && hour < 18) {
    tips.push({ text: 'Perfekte Zeit für den Röbel Explorer! Entdecke Checkpoints und sammle Punkte. 🧭', actionLabel: 'Explorer starten', actionRoute: '/explorer' });
  } else if (hour >= 18) {
    tips.push({ text: 'Schau was heute Abend in Röbel los ist! 🌙', actionLabel: 'Events', actionRoute: '/(tabs)/explore' });
  }

  return tips;
}

export function useFeed(feedType: FeedType, enabled: boolean = true) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Latest wallet without putting it in the query key: the feed CONTENT is
  // wallet-independent, so keying on the wallet would refetch the whole feed
  // when the cached user hydrates a tick after mount.
  const walletRef = useRef<string | null>(null);
  walletRef.current = user?.wallet_address ?? null;

  const postsKey = ['feed', 'posts', feedType] as const;

  const postsQuery = useInfiniteQuery({
    queryKey: postsKey,
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchFeedPosts({
        feedType,
        page: pageParam as number,
        walletAddress: walletRef.current ?? undefined,
      }),
    getNextPageParam: (last, _pages, lastPageParam) =>
      last.hasMore ? (lastPageParam as number) + 1 : undefined,
    staleTime: 30_000,
    meta: { persist: true },
  });

  const sectionsQuery = useQuery({
    queryKey: ['feed', 'sections', feedType],
    enabled,
    queryFn: () => fetchFeedSections(feedType),
    meta: { persist: true },
  });

  const posts = useMemo(() => {
    // De-dupe by id: a pinned post prepended on page 0 can reappear at its
    // natural chronological position on a later page.
    const seen = new Set<string>();
    return (postsQuery.data?.pages ?? [])
      .flatMap((p) => p.data)
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [postsQuery.data]);

  const items: FeedItem[] = useMemo(() => {
    const s = sectionsQuery.data;
    return assembleFeed({
      posts,
      alerts: s?.alerts ?? [],
      deals: s?.deals ?? [],
      marketplaceListings: s?.marketplace ?? [],
      upcomingEvents: s?.events ?? [],
      newsArticles: s?.news ?? [],
      movies: s?.movies ?? [],
      restaurants: s?.restaurants ?? [],
      specialMenus: s?.specialMenus ?? [],
      governanceNudges: s ? buildGovernanceNudges(s.proposals) : [],
      meckyTips: generateMeckyTips(),
      proposals: (s?.proposals ?? []) as unknown as ProposalFeedRecord[],
      proposalComments: s?.proposalComments ?? [],
      feedType,
    });
  }, [posts, sectionsQuery.data, feedType]);

  // Union of the per-page liked/reposted id arrays returned by the
  // get_feed_page RPC. null (not empty) when the RPC isn't serving yet, so
  // FeedList knows to fall back to its own queries.
  const likedPostIds = useMemo(() => {
    const pages = postsQuery.data?.pages ?? [];
    if (!pages.some((p) => p.likedPostIds != null)) return null;
    const set = new Set<string>();
    pages.forEach((p) => p.likedPostIds?.forEach((id) => set.add(id)));
    return set;
  }, [postsQuery.data]);

  const repostedPostIds = useMemo(() => {
    const pages = postsQuery.data?.pages ?? [];
    if (!pages.some((p) => p.repostedPostIds != null)) return null;
    const set = new Set<string>();
    pages.forEach((p) => p.repostedPostIds?.forEach((id) => set.add(id)));
    return set;
  }, [postsQuery.data]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Fresh page 0 + fresh sections in parallel. The cache is replaced with
      // just the new first page — mirroring the old hook's refresh, bounding
      // how many pages accumulate (and persist), and keeping pageParams
      // anchored at 0 so background refetches always include the newest posts.
      const [firstPage] = await Promise.all([
        fetchFeedPosts({
          feedType,
          page: 0,
          walletAddress: walletRef.current ?? undefined,
        }),
        sectionsQuery.refetch(),
      ]);
      queryClient.setQueryData(postsKey, {
        pages: [firstPage],
        pageParams: [0],
      });
    } catch (err) {
      console.error('Error refreshing feed:', err);
    } finally {
      setIsRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedType, queryClient, sectionsQuery.refetch]);

  const loadMore = useCallback(async () => {
    if (postsQuery.isFetchingNextPage || !postsQuery.hasNextPage) return;
    await postsQuery.fetchNextPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postsQuery.isFetchingNextPage, postsQuery.hasNextPage, postsQuery.fetchNextPage]);

  const removePost = useCallback(
    (postId: string) => {
      queryClient.setQueryData(postsKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.filter((p: PostRecord) => p.id !== postId),
          })),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, feedType]
  );

  return {
    items,
    // Progressive: only the posts gate first paint; sections stream in.
    isLoading: postsQuery.isPending,
    isRefreshing,
    isLoadingMore: postsQuery.isFetchingNextPage,
    hasMore: postsQuery.hasNextPage ?? false,
    refresh,
    loadMore,
    removePost,
    likedPostIds,
    repostedPostIds,
  };
}
