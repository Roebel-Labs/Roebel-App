// apps/expo/lib/feed-sections.ts
import type {
  FeedType,
  ServiceAlertRecord,
  BusinessDealWithBusiness,
  ProposalFeedRecord,
  ProposalCommentFeedRecord,
} from '@/lib/types/feed';
import type {
  EventRecord,
  MarketplaceListingRecord,
  NewsArticle,
  MovieRecord,
  RestaurantRecord,
  SpecialMenuRecord,
} from '@/lib/types';
import { fetchActiveServiceAlerts, fetchUpcomingEventsForFeed } from '@/lib/supabase-posts';
import { fetchActiveDeals } from '@/lib/supabase-deals';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { fetchRecentNews } from '@/lib/supabase-news';
import { fetchUpcomingMovies } from '@/lib/supabase-cinema';
import { fetchFeaturedRestaurants, fetchActiveSpecialMenus } from '@/lib/supabase-restaurants';
import { fetchProposals, type SupabaseProposal } from '@/lib/supabase-proposals';
import { fetchRecentProposalComments } from '@/lib/supabase-proposal-comments';

export type FeedSections = {
  alerts: ServiceAlertRecord[];
  deals: BusinessDealWithBusiness[];
  marketplace: MarketplaceListingRecord[];
  events: EventRecord[];
  news: NewsArticle[];
  movies: MovieRecord[];
  restaurants: RestaurantRecord[];
  specialMenus: SpecialMenuRecord[];
  proposals: SupabaseProposal[];
  proposalComments: ProposalCommentFeedRecord[];
};

/**
 * The non-post feed sections (alerts, deals, events, news, …) bundled into a
 * single cacheable unit. Runs its sub-fetches in parallel; failures inside a
 * sub-fetch resolve to [] (each lib fn already catches), so one slow/broken
 * section can never block or break the others — and, unlike before, none of
 * them block the posts from rendering.
 */
export async function fetchFeedSections(feedType: FeedType): Promise<FeedSections> {
  const isMain = feedType === 'main';
  const isRathaus = feedType === 'rathaus';
  const emptyArr = Promise.resolve([] as any[]);

  const [
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

  return {
    alerts,
    deals: deals as BusinessDealWithBusiness[],
    marketplace: marketplace as MarketplaceListingRecord[],
    events: events as EventRecord[],
    news: news as NewsArticle[],
    movies: movies as MovieRecord[],
    restaurants: restaurants as RestaurantRecord[],
    specialMenus: specialMenus as SpecialMenuRecord[],
    proposals: proposals as SupabaseProposal[],
    proposalComments: proposalComments as ProposalCommentFeedRecord[],
  };
}
