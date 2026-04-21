import type { UserRecord, Account, EventRecord, BusinessDealRecord, BusinessRecord, MarketplaceListingRecord, NewsArticle, MovieRecord, RestaurantRecord, SpecialMenuRecord } from '../types';

// ─── Post Types ─────────────────────────────────────────────

export type PostCategory =
  | 'frage'
  | 'empfehlungen'
  | 'verloren_gefunden'
  | 'hilfe_gebraucht'
  | 'im_angebot'
  | 'generell';

export type FeedType = 'main' | 'rathaus' | 'app';
export type PostType = 'user' | 'mecky' | 'event_share' | 'marketplace_share';

export type PostAuthor = Pick<
  UserRecord,
  'wallet_address' | 'username' | 'profile_picture_url' | 'is_verified_citizen' | 'tier' | 'equipped_frame_asset_url'
> & {
  account?: Pick<Account, 'id' | 'account_type' | 'name' | 'avatar_url'> | null;
};

/** Lightweight sticker payload joined onto sticker-bearing records. */
export type StickerRewardRef = {
  id: string;
  type: 'sticker' | 'animated_sticker';
  name: string;
  asset_url: string;
};

export type PostLinkRecord = {
  id: string;
  post_id: string;
  url: string;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  fetched_at: string;
};

export type PostPollRecord = {
  id: string;
  post_id: string;
  poll_type: 'single' | 'multi';
  options: string[];
  expires_at: string;
  created_at: string;
};

export type PollVoteRecord = {
  id: string;
  poll_id: string;
  wallet_address: string;
  selected_options: number[];
  created_at: string;
};

export type PostRecord = {
  id: string;
  wallet_address: string;
  account_id: string | null;
  content: string;
  media_urls: string[] | null;
  video_url: string | null;
  status: 'published' | 'deleted' | 'flagged';
  category: PostCategory;
  feed_type: FeedType;
  post_type: PostType;
  linked_event_id: string | null;
  linked_marketplace_id: string | null;
  linked_mecky_draft_id: string | null;
  sticker_reward_id: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  // Joined data
  author?: PostAuthor;
  links?: PostLinkRecord[];
  poll?: PostPollRecord;
  sticker?: StickerRewardRef | null;
  linked_event?: Pick<EventRecord, 'id' | 'title' | 'date' | 'time' | 'location' | 'image_url' | 'category'>;
  linked_marketplace?: Pick<MarketplaceListingRecord, 'id' | 'title' | 'price' | 'price_type' | 'category' | 'condition' | 'media_urls' | 'neighborhood'>;
};

export type PostCommentRecord = {
  id: string;
  post_id: string;
  wallet_address: string;
  account_id: string | null;
  content: string;
  media_urls: string[] | null;
  video_url: string | null;
  sticker_reward_id: string | null;
  status: 'published' | 'deleted';
  created_at: string;
  // Joined data
  author?: PostAuthor;
  sticker?: StickerRewardRef | null;
};

// ─── Event Experience Types ─────────────────────────────────

export type EventExperience = {
  id: string;
  event_id: string;
  wallet_address: string;
  content: string;
  media_urls: string[] | null;
  video_url: string | null;
  emoji: string | null;
  sticker_reward_id: string | null;
  status: 'published' | 'deleted';
  created_at: string;
  author?: PostAuthor;
  sticker?: StickerRewardRef | null;
};

export type CreateExperienceInput = {
  event_id: string;
  wallet_address: string;
  account_id?: string;
  content: string;
  media_urls?: string[];
  video_url?: string;
  emoji?: string;
  sticker_reward_id?: string;
};

// ─── Create Inputs ──────────────────────────────────────────

export type CreatePostInput = {
  wallet_address: string;
  account_id?: string;
  content: string;
  category?: PostCategory;
  feed_type?: FeedType;
  post_type?: PostType;
  media_urls?: string[];
  video_url?: string;
  linked_event_id?: string;
  linked_marketplace_id?: string;
  linked_mecky_draft_id?: string;
  sticker_reward_id?: string | null;
};

export type CreateCommentInput = {
  post_id: string;
  wallet_address: string;
  account_id?: string;
  content: string;
  media_urls?: string[];
  video_url?: string;
  sticker_reward_id?: string | null;
};

export type CreatePollInput = {
  post_id: string;
  poll_type: 'single' | 'multi';
  options: string[];
  expires_at: string;
};

export type CreatePostLinkInput = {
  post_id: string;
  url: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  og_site_name?: string;
};

// ─── Service Alert Types ────────────────────────────────────

export type AlertType = 'water_outage' | 'road_closure' | 'storm_warning' | 'fire_department' | 'general';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export type ServiceAlertRecord = {
  id: string;
  title: string;
  description: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  status: 'active' | 'resolved' | 'draft';
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

// ─── Feed Item (Discriminated Union) ────────────────────────

export type BusinessDealWithBusiness = BusinessDealRecord & {
  business?: Pick<BusinessRecord, 'id' | 'name' | 'slug' | 'logo_url' | 'category'>;
};

export type FeedItem =
  | { type: 'post'; data: PostRecord; id: string }
  | { type: 'mecky'; data: PostRecord; id: string }
  | { type: 'event'; data: EventRecord; id: string }
  | { type: 'alert'; data: ServiceAlertRecord; id: string }
  | { type: 'sponsored'; data: BusinessDealWithBusiness; id: string }
  | { type: 'marketplace'; data: MarketplaceListingRecord; id: string }
  | { type: 'news_section'; data: NewsArticle[]; id: string }
  | { type: 'cinema_section'; data: MovieRecord[]; id: string }
  | { type: 'restaurant_section'; data: RestaurantRecord[]; id: string }
  | { type: 'special_menu_section'; data: SpecialMenuRecord[]; id: string }
  | { type: 'governance_nudge'; data: GovernanceNudgeData; id: string }
  | { type: 'mecky_tip'; data: MeckyTipData; id: string };

export type GovernanceNudgeData = {
  proposalId: string;
  title: string;
  forPercentage: number;
  againstPercentage: number;
  daysRemaining: number;
};

export type MeckyTipData = {
  text: string;
  actionLabel?: string;
  actionRoute?: string;
};

// ─── Poll With Votes (computed client-side) ─────────────────

export type PollWithVotes = PostPollRecord & {
  voteCounts: number[];
  totalVotes: number;
  userVote: number[] | null;
};

// ─── Category Labels (German) ───────────────────────────────

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  frage: 'Frage',
  empfehlungen: 'Empfehlungen',
  verloren_gefunden: 'Verloren & Gefunden',
  hilfe_gebraucht: 'Hilfe gebraucht',
  im_angebot: 'Im Angebot',
  generell: 'Generell',
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  water_outage: 'Wasserausfall',
  road_closure: 'Straßensperrung',
  storm_warning: 'Sturmwarnung',
  fire_department: 'Feuerwehr',
  general: 'Hinweis',
};
