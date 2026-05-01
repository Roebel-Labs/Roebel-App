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
} from './types/feed';
import type { EventRecord, MarketplaceListingRecord, NewsArticle, MovieRecord, RestaurantRecord, SpecialMenuRecord } from './types';

const FIRST_SPONSORED_POSITION = 3;
const SPONSORED_INTERVAL = 5;
const EVENT_POSITIONS = [2, 7, 14];
const MARKETPLACE_INTERVAL = 10;
const MAX_MARKETPLACE_ITEMS = 3;
const GOVERNANCE_NUDGE_POSITION = 4;
const MECKY_TIP_POSITION = 8;

// Positions for section cards (injected once)
const SPECIAL_MENU_POSITION = 1;
const NEWS_POSITION = 5;
const CINEMA_POSITION = 9;
const RESTAURANT_POSITION = 13;

/**
 * Assembles a unified feed from multiple data sources.
 *
 * Order:
 * 1. Pinned service alerts (critical > warning > info)
 * 2. User/mecky posts in chronological order
 * 3. Sponsored deals injected at intervals (main feed only)
 * 4. Upcoming events injected at specific positions (main feed only)
 * 5. Marketplace service requests injected periodically (main feed only)
 * 6. Section cards: special menus, news, cinema, restaurants (main feed only)
 *
 * Rathaus tab: Only posts + alerts. No sponsored/marketplace/event injection.
 */
export function assembleFeed(params: {
  posts: PostRecord[];
  alerts: ServiceAlertRecord[];
  deals: BusinessDealWithBusiness[];
  marketplaceListings: MarketplaceListingRecord[];
  upcomingEvents: EventRecord[];
  newsArticles?: NewsArticle[];
  movies?: MovieRecord[];
  restaurants?: RestaurantRecord[];
  specialMenus?: SpecialMenuRecord[];
  governanceNudges?: GovernanceNudgeData[];
  meckyTips?: MeckyTipData[];
  proposals?: ProposalFeedRecord[];
  proposalComments?: ProposalCommentFeedRecord[];
  feedType: FeedType;
}): FeedItem[] {
  const {
    posts,
    alerts,
    deals,
    marketplaceListings,
    upcomingEvents,
    newsArticles = [],
    movies = [],
    restaurants = [],
    specialMenus = [],
    governanceNudges = [],
    meckyTips = [],
    proposals = [],
    proposalComments = [],
    feedType,
  } = params;
  const items: FeedItem[] = [];

  // 1. Active alerts go first (all tabs)
  const activeAlerts = alerts.filter((a) => a.status === 'active');
  for (const alert of activeAlerts) {
    items.push({ type: 'alert', data: alert, id: `alert-${alert.id}` });
  }

  // 2. Convert posts into feed items
  const postItems: FeedItem[] = posts.map((post) => ({
    type: post.post_type === 'mecky' ? ('mecky' as const) : ('post' as const),
    data: post,
    id: `post-${post.id}`,
  }));

  // For Rathaus (Stadt) tab: merge posts + proposals + proposal comments
  // sorted by created_at desc.
  if (feedType === 'rathaus') {
    type Sortable = { item: FeedItem; ts: number };
    const sortable: Sortable[] = [];

    for (const item of postItems) {
      const post = item.data as PostRecord;
      sortable.push({ item, ts: new Date(post.created_at).getTime() });
    }
    for (const proposal of proposals) {
      sortable.push({
        item: { type: 'proposal', data: proposal, id: `proposal-${proposal.proposal_id}` },
        ts: new Date(proposal.created_at).getTime(),
      });
    }
    for (const comment of proposalComments) {
      sortable.push({
        item: {
          type: 'proposal_comment',
          data: comment,
          id: `proposal-comment-${comment.id}`,
        },
        ts: new Date(comment.created_at).getTime(),
      });
    }

    sortable.sort((a, b) => b.ts - a.ts);
    items.push(...sortable.map((s) => s.item));
    return items;
  }

  // 3. Main feed: interleave all content types
  // Track which section cards have been injected
  const sectionInjected = {
    specialMenus: false,
    news: false,
    cinema: false,
    restaurants: false,
    governance: false,
    meckyTip: false,
  };

  let postPointer = 0;
  let dealIndex = 0;
  let eventIndex = 0;
  let marketplaceIndex = 0;
  let marketplaceCount = 0;
  let feedPosition = 0;

  while (
    postPointer < postItems.length ||
    dealIndex < deals.length ||
    eventIndex < upcomingEvents.length
  ) {
    // Inject special menus section near top
    if (
      !sectionInjected.specialMenus &&
      specialMenus.length > 0 &&
      feedPosition >= SPECIAL_MENU_POSITION
    ) {
      items.push({ type: 'special_menu_section', data: specialMenus, id: 'section-special-menus' });
      sectionInjected.specialMenus = true;
      feedPosition++;
      continue;
    }

    // Inject news section
    if (
      !sectionInjected.news &&
      newsArticles.length > 0 &&
      feedPosition >= NEWS_POSITION
    ) {
      items.push({ type: 'news_section', data: newsArticles, id: 'section-news' });
      sectionInjected.news = true;
      feedPosition++;
      continue;
    }

    // Inject cinema section
    if (
      !sectionInjected.cinema &&
      movies.length > 0 &&
      feedPosition >= CINEMA_POSITION
    ) {
      items.push({ type: 'cinema_section', data: movies, id: 'section-cinema' });
      sectionInjected.cinema = true;
      feedPosition++;
      continue;
    }

    // Inject restaurant section
    if (
      !sectionInjected.restaurants &&
      restaurants.length > 0 &&
      feedPosition >= RESTAURANT_POSITION
    ) {
      items.push({ type: 'restaurant_section', data: restaurants, id: 'section-restaurants' });
      sectionInjected.restaurants = true;
      feedPosition++;
      continue;
    }

    // Inject governance nudge (active proposals)
    if (
      !sectionInjected.governance &&
      governanceNudges.length > 0 &&
      feedPosition >= GOVERNANCE_NUDGE_POSITION
    ) {
      items.push({ type: 'governance_nudge', data: governanceNudges[0], id: 'governance-nudge-0' });
      sectionInjected.governance = true;
      feedPosition++;
      continue;
    }

    // Inject Mecky tip
    if (
      !sectionInjected.meckyTip &&
      meckyTips.length > 0 &&
      feedPosition >= MECKY_TIP_POSITION
    ) {
      items.push({ type: 'mecky_tip', data: meckyTips[0], id: 'mecky-tip-0' });
      sectionInjected.meckyTip = true;
      feedPosition++;
      continue;
    }

    // Check if this position should be an event
    if (eventIndex < upcomingEvents.length && EVENT_POSITIONS.includes(feedPosition)) {
      items.push({
        type: 'event',
        data: upcomingEvents[eventIndex],
        id: `event-${upcomingEvents[eventIndex].id}`,
      });
      eventIndex++;
      feedPosition++;
      continue;
    }

    // Check if this position should be a sponsored deal
    if (
      dealIndex < deals.length &&
      feedPosition >= FIRST_SPONSORED_POSITION &&
      (feedPosition - FIRST_SPONSORED_POSITION) % SPONSORED_INTERVAL === 0
    ) {
      items.push({
        type: 'sponsored',
        data: deals[dealIndex],
        id: `deal-${deals[dealIndex].id}`,
      });
      dealIndex++;
      feedPosition++;
      continue;
    }

    // Check if this position should be a marketplace listing
    if (
      marketplaceIndex < marketplaceListings.length &&
      marketplaceCount < MAX_MARKETPLACE_ITEMS &&
      feedPosition > 0 &&
      feedPosition % MARKETPLACE_INTERVAL === 0
    ) {
      items.push({
        type: 'marketplace',
        data: marketplaceListings[marketplaceIndex],
        id: `marketplace-${marketplaceListings[marketplaceIndex].id}`,
      });
      marketplaceIndex++;
      marketplaceCount++;
      feedPosition++;
      continue;
    }

    // Otherwise, add next post
    if (postPointer < postItems.length) {
      items.push(postItems[postPointer]);
      postPointer++;
      feedPosition++;
    } else {
      break;
    }
  }

  return items;
}
