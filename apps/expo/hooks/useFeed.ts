import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  FeedItem,
  FeedType,
  PostRecord,
  ServiceAlertRecord,
  BusinessDealWithBusiness,
  GovernanceNudgeData,
  MeckyTipData,
  ProposalFeedRecord,
  ProposalCommentFeedRecord,
} from '@/lib/types/feed';
import type { EventRecord, MarketplaceListingRecord, NewsArticle, MovieRecord, RestaurantRecord, SpecialMenuRecord } from '@/lib/types';
import { fetchFeedPosts, fetchActiveServiceAlerts, fetchUpcomingEventsForFeed } from '@/lib/supabase-posts';
import { fetchActiveDeals } from '@/lib/supabase-deals';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { fetchRecentNews } from '@/lib/supabase-news';
import { fetchUpcomingMovies } from '@/lib/supabase-cinema';
import { fetchFeaturedRestaurants, fetchActiveSpecialMenus } from '@/lib/supabase-restaurants';
import { fetchProposals, type SupabaseProposal } from '@/lib/supabase-proposals';
import {
  fetchRecentProposalComments,
  type ProposalCommentWithPreview,
} from '@/lib/supabase-proposal-comments';
import { assembleFeed } from '@/lib/feed-assembler';

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
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  // Fetch exactly once, the first time this list becomes enabled. Lists that
  // are never enabled (e.g. rathaus/app tabs for non-citizens) never query.
  const hasFetchedRef = useRef(false);

  // Cache non-paginated data across loadMore calls
  const alertsRef = useRef<ServiceAlertRecord[]>([]);
  const dealsRef = useRef<BusinessDealWithBusiness[]>([]);
  const marketplaceRef = useRef<MarketplaceListingRecord[]>([]);
  const eventsRef = useRef<EventRecord[]>([]);
  const newsRef = useRef<NewsArticle[]>([]);
  const moviesRef = useRef<MovieRecord[]>([]);
  const restaurantsRef = useRef<RestaurantRecord[]>([]);
  const specialMenusRef = useRef<SpecialMenuRecord[]>([]);
  const governanceRef = useRef<GovernanceNudgeData[]>([]);
  const meckyTipsRef = useRef<MeckyTipData[]>([]);
  const proposalsRef = useRef<ProposalFeedRecord[]>([]);
  const proposalCommentsRef = useRef<ProposalCommentFeedRecord[]>([]);
  const allPostsRef = useRef<PostRecord[]>([]);

  const buildFeed = useCallback(
    (posts: PostRecord[]) =>
      assembleFeed({
        posts,
        alerts: alertsRef.current,
        deals: dealsRef.current,
        marketplaceListings: marketplaceRef.current,
        upcomingEvents: eventsRef.current,
        newsArticles: newsRef.current,
        movies: moviesRef.current,
        restaurants: restaurantsRef.current,
        specialMenus: specialMenusRef.current,
        governanceNudges: governanceRef.current,
        meckyTips: meckyTipsRef.current,
        proposals: proposalsRef.current,
        proposalComments: proposalCommentsRef.current,
        feedType,
      }),
    [feedType]
  );

  const fetchAllData = useCallback(async () => {
    const isMain = feedType === 'main';
    const isRathaus = feedType === 'rathaus';
    const emptyArr = Promise.resolve([] as any[]);

    const [
      postsResult,
      alerts,
      deals,
      marketplace,
      events,
      news,
      movies,
      restaurants,
      specialMenus,
      proposals,
      proposalComments,
    ] = await Promise.all([
      fetchFeedPosts({ feedType, page: 0 }),
      fetchActiveServiceAlerts(),
      isMain ? fetchActiveDeals() : emptyArr,
      isMain ? fetchMarketplaceListings({ limit: 5 }) : emptyArr,
      isMain ? fetchUpcomingEventsForFeed(5) : emptyArr,
      isMain ? fetchRecentNews(5) : emptyArr,
      isMain ? fetchUpcomingMovies(6) : emptyArr,
      isMain ? fetchFeaturedRestaurants() : emptyArr,
      isMain ? fetchActiveSpecialMenus(3) : emptyArr,
      isMain || isRathaus ? fetchProposals().catch(() => []) : emptyArr,
      isRathaus ? fetchRecentProposalComments(50).catch(() => []) : emptyArr,
    ]);

    alertsRef.current = alerts;
    dealsRef.current = deals as BusinessDealWithBusiness[];
    marketplaceRef.current = marketplace as MarketplaceListingRecord[];
    eventsRef.current = events as EventRecord[];
    newsRef.current = news as NewsArticle[];
    moviesRef.current = movies as MovieRecord[];
    restaurantsRef.current = restaurants as RestaurantRecord[];
    specialMenusRef.current = specialMenus as SpecialMenuRecord[];
    governanceRef.current = buildGovernanceNudges(proposals as SupabaseProposal[]);
    meckyTipsRef.current = generateMeckyTips();
    proposalsRef.current = proposals as ProposalFeedRecord[];
    proposalCommentsRef.current = proposalComments as ProposalCommentFeedRecord[];
    allPostsRef.current = postsResult.data;

    return postsResult;
  }, [feedType]);

  const fetchInitial = useCallback(async () => {
    setIsLoading(true);
    pageRef.current = 0;

    try {
      const postsResult = await fetchAllData();
      setItems(buildFeed(postsResult.data));
      setHasMore(postsResult.hasMore);
    } catch (err) {
      console.error('Error fetching feed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllData, buildFeed]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    pageRef.current = 0;

    try {
      const postsResult = await fetchAllData();
      setItems(buildFeed(postsResult.data));
      setHasMore(postsResult.hasMore);
    } catch (err) {
      console.error('Error refreshing feed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAllData, buildFeed]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    try {
      const nextPage = pageRef.current + 1;
      const postsResult = await fetchFeedPosts({ feedType, page: nextPage });
      pageRef.current = nextPage;

      const updatedPosts = [...allPostsRef.current, ...postsResult.data];
      allPostsRef.current = updatedPosts;

      setItems(buildFeed(updatedPosts));
      setHasMore(postsResult.hasMore);
    } catch (err) {
      console.error('Error loading more:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [feedType, isLoadingMore, hasMore, buildFeed]);

  useEffect(() => {
    if (enabled && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchInitial();
    }
  }, [enabled, fetchInitial]);

  const removePost = useCallback((postId: string) => {
    setItems((prev) =>
      prev.filter((item) => {
        if (item.type !== 'post' && item.type !== 'mecky') return true;
        return (item.data as PostRecord).id !== postId;
      }),
    );
  }, []);

  return {
    items,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    refresh,
    loadMore,
    removePost,
  };
}
