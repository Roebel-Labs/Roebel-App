import { useState, useEffect, useCallback, useRef } from 'react';
import type { FeedItem, FeedType, PostRecord, ServiceAlertRecord, BusinessDealWithBusiness } from '@/lib/types/feed';
import type { EventRecord, MarketplaceListingRecord, NewsArticle, MovieRecord, RestaurantRecord, SpecialMenuRecord } from '@/lib/types';
import { fetchFeedPosts, fetchActiveServiceAlerts, fetchUpcomingEventsForFeed } from '@/lib/supabase-posts';
import { fetchActiveDeals } from '@/lib/supabase-deals';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { fetchRecentNews } from '@/lib/supabase-news';
import { fetchUpcomingMovies } from '@/lib/supabase-cinema';
import { fetchFeaturedRestaurants, fetchActiveSpecialMenus } from '@/lib/supabase-restaurants';
import { assembleFeed } from '@/lib/feed-assembler';

export function useFeed(feedType: FeedType) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);

  // Cache non-paginated data across loadMore calls
  const alertsRef = useRef<ServiceAlertRecord[]>([]);
  const dealsRef = useRef<BusinessDealWithBusiness[]>([]);
  const marketplaceRef = useRef<MarketplaceListingRecord[]>([]);
  const eventsRef = useRef<EventRecord[]>([]);
  const newsRef = useRef<NewsArticle[]>([]);
  const moviesRef = useRef<MovieRecord[]>([]);
  const restaurantsRef = useRef<RestaurantRecord[]>([]);
  const specialMenusRef = useRef<SpecialMenuRecord[]>([]);
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
        feedType,
      }),
    [feedType]
  );

  const fetchAllData = useCallback(async () => {
    const isMain = feedType === 'main';
    const emptyArr = Promise.resolve([] as any[]);

    const [postsResult, alerts, deals, marketplace, events, news, movies, restaurants, specialMenus] =
      await Promise.all([
        fetchFeedPosts({ feedType, page: 0 }),
        fetchActiveServiceAlerts(),
        isMain ? fetchActiveDeals() : emptyArr,
        isMain ? fetchMarketplaceListings({ limit: 5 }) : emptyArr,
        isMain ? fetchUpcomingEventsForFeed(5) : emptyArr,
        isMain ? fetchRecentNews(5) : emptyArr,
        isMain ? fetchUpcomingMovies(6) : emptyArr,
        isMain ? fetchFeaturedRestaurants() : emptyArr,
        isMain ? fetchActiveSpecialMenus(3) : emptyArr,
      ]);

    alertsRef.current = alerts;
    dealsRef.current = deals as BusinessDealWithBusiness[];
    marketplaceRef.current = marketplace as MarketplaceListingRecord[];
    eventsRef.current = events as EventRecord[];
    newsRef.current = news as NewsArticle[];
    moviesRef.current = movies as MovieRecord[];
    restaurantsRef.current = restaurants as RestaurantRecord[];
    specialMenusRef.current = specialMenus as SpecialMenuRecord[];
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
    fetchInitial();
  }, [fetchInitial]);

  return {
    items,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    refresh,
    loadMore,
  };
}
