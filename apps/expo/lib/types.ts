export type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

// Event date entry for recurring events
export type EventDateRecord = {
  id: string;
  event_id: string;
  date: string; // YYYY-MM-DD
  is_cancelled: boolean;
  notes: string | null;
  created_at: string;
};

export type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM:SS
  end_time: string | null; // HH:MM:SS
  location: string;
  organizer_name: string;
  organizer_email: string;
  organizer_phone: string | null;
  category: string | null;
  status: 'pending' | 'approved' | 'rejected';
  image_url: string | null;
  website_url: string | null;
  ticket_price: number | null;
  max_attendees: number | null;
  created_at: string;
  updated_at: string;
  is_popular: boolean | null;
  is_recurring: boolean | null; // Whether event has multiple dates
  // Optional: populated when fetching with dates
  event_dates?: EventDateRecord[];
  // Google Maps location data
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  formatted_address: string | null;
  address_components: AddressComponent[] | null;
  // Livestream
  livestream_url: string | null;
  livestream_active: boolean | null;
  // Creator account
  account_id: string | null;
  account?: Account;
};

// Extended type for event with all dates loaded
export type EventWithDates = EventRecord & {
  event_dates: EventDateRecord[];
};

// Recurrence pattern type for date generation helpers
export type RecurrencePattern = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export type Filters = {
  query: string;
  category: string | 'all';
  freeOnly: boolean;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
};

export type NewsArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string; // Rich text HTML content
  cover_image_url: string | null;
  author_name: string;
  author_email: string | null;
  category: string | null;
  tags: string[] | null;
  status: 'draft' | 'published' | 'archived';
  is_featured: boolean | null;
  view_count: number;
  published_at: string | null; // ISO timestamp
  created_at: string;
  updated_at: string;
};

export type NewsFilters = {
  query: string;
  category: string | 'all';
  featured: boolean;
};

export type WeatherData = {
  temperature: {
    high: number;
    low: number;
  };
  condition: string;
  conditionCode: string;
  precipitationProbability: number;
  windSpeed: number;
  humidity: number;
  uvIndex: number;
};

export type DeviceInfo = {
  os?: string;
  appVersion?: string;
  deviceModel?: string;
};

export type FeedbackRecord = {
  id: string;
  user_wallet_address: string | null;
  feedback_type: 'bug_report' | 'feature_request' | 'general' | 'improvement';
  subject: string;
  message: string;
  contact_email: string | null;
  contact_phone: string | null;
  device_info: DeviceInfo;
  status: 'new' | 'in_review' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
};

export type MovieRecord = {
  id: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM:SS
  cover_image_url: string | null;
  trailer_youtube_url: string | null;
  fsk: string | null; // e.g., "FSK 0", "FSK 6", "FSK 12", "FSK 16", "FSK 18"
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
};

// Restaurant types
export type OpeningHoursDay = {
  open: string; // HH:MM
  close: string; // HH:MM
  closed?: boolean;
};

export type OpeningHours = {
  monday?: OpeningHoursDay;
  tuesday?: OpeningHoursDay;
  wednesday?: OpeningHoursDay;
  thursday?: OpeningHoursDay;
  friday?: OpeningHoursDay;
  saturday?: OpeningHoursDay;
  sunday?: OpeningHoursDay;
};

export type RestaurantRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  background_color: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  opening_hours: OpeningHours | null;
  latitude: number | null;
  longitude: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  account_id: string | null;
};

export type BusinessCategory =
  | 'gastronomie'
  | 'einzelhandel'
  | 'handwerk'
  | 'dienstleistung'
  | 'gesundheit'
  | 'bildung'
  | 'kultur'
  | 'sport'
  | 'tourismus'
  | 'immobilien'
  | 'sonstiges';

export type BusinessRecord = {
  id: string;
  owner_wallet_address: string | null;
  name: string;
  slug: string;
  description: string | null;
  category: BusinessCategory;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  opening_hours: OpeningHours | null;
  cover_image_url: string | null;
  logo_url: string | null;
  gallery_images: string[] | null;
  status: 'pending' | 'published' | 'rejected';
  admin_notes: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type MapEntityType = 'event' | 'restaurant' | 'business';

export type MenuCategoryRecord = {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type MenuItemRecord = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_available: boolean;
  sort_order: number;
  created_at: string;
};

export type SpecialMenuRecord = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  icon_image_url: string | null;
  price: number | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  status: 'draft' | 'published' | 'archived';
  sort_order: number;
  created_at: string;
};

export type SpecialMenuCategoryRecord = {
  id: string;
  special_menu_id: string;
  name: string;
  sort_order: number;
};

export type SpecialMenuItemRecord = {
  id: string;
  special_menu_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number | null;
  is_vegetarian: boolean;
  sort_order: number;
};

// Extended types with relations
export type MenuCategoryWithItems = MenuCategoryRecord & {
  menu_items: MenuItemRecord[];
};

export type RestaurantWithMenus = RestaurantRecord & {
  menu_categories: MenuCategoryWithItems[];
  special_menus: SpecialMenuRecord[];
};

export type SpecialMenuCategoryWithItems = SpecialMenuCategoryRecord & {
  special_menu_items: SpecialMenuItemRecord[];
};

export type SpecialMenuWithDetails = SpecialMenuRecord & {
  restaurant: RestaurantRecord;
  special_menu_categories: SpecialMenuCategoryWithItems[];
};

export type NotificationLogEntry = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  data: { type?: 'event' | 'news'; eventId?: string; slug?: string; [key: string]: unknown } | null;
  status: string;
  created_at: string;
};

// User tiers — unified role system
export type UserTier = 'guest' | 'tourist' | 'citizen';

// Account types
export type AccountType = 'personal' | 'organisation';
export type OrgSubType = 'restaurant' | 'unternehmen' | 'verein' | 'partei' | 'fraktion';
/** @deprecated Use OrgSubType instead */
export type OrgType = OrgSubType;

export type Account = {
  id: string;
  account_type: AccountType;
  sub_type: OrgSubType | null;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountOwner = {
  account_id: string;
  wallet_address: string;
  role: 'owner' | 'admin' | 'member';
  invited_by: string | null;
  joined_at: string;
};

// Backward compatibility aliases
export type UserRole = UserTier;
export type AppMode = 'tourist' | 'citizen' | 'org';

export type UserRecord = {
  id: string;
  wallet_address: string;
  tier: UserTier;
  username: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  cover_image_url: string | null;
  phone_number: string | null;
  phone_verified: boolean;
  email: string | null;
  email_verified: boolean;
  auth_provider: string | null;
  nft_balance: number;
  has_delegated: boolean;
  delegate_address: string | null;
  is_verified_citizen: boolean;
  citizen_verification_date: string | null;
  verification_status: 'pending' | 'approved' | 'rejected';
  neighborhood: string | null;
  interests: string[];
  vereine: string[];
  gamification_points: number;
  total_votes_cast: number;
  voting_streak: number;
  last_vote_date: string | null;
  achievements: unknown[];
  active_account_id: string | null;
  privacy_settings: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_login_at: string;
};

// Business deal types
export type DealType = 'discount' | 'special' | 'event' | 'new_product';
export type DealStatus = 'draft' | 'active' | 'paused' | 'expired';

export type BusinessDealRecord = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  deal_type: DealType;
  deal_value: string | null;
  image_url: string | null;
  media_urls: string[] | null;
  video_url: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  status: DealStatus;
  is_boosted: boolean;
  boost_expires_at: string | null;
  views_count: number;
  clicks_count: number;
  created_at: string;
  updated_at: string;
};

export type CreateDealInput = Pick<BusinessDealRecord, 'business_id' | 'title' | 'deal_type'> &
  Partial<Pick<BusinessDealRecord, 'description' | 'deal_value' | 'image_url' | 'start_date' | 'end_date' | 'status'>>;

export type CreateBusinessInput = Pick<BusinessRecord, 'name' | 'category'> &
  Partial<Pick<BusinessRecord, 'description' | 'phone' | 'email' | 'website_url' | 'address' | 'cover_image_url' | 'logo_url'>> & {
  owner_wallet_address: string;
};

export type DealAnalytics = {
  totalDeals: number;
  activeDeals: number;
  totalViews: number;
  totalClicks: number;
  boostedDeals: number;
  dealsByType: Record<DealType, number>;
};

export type AccountMode = 'personal' | 'business'; // deprecated — use Account system

// ── Org member management & invites ─────────────────────────────────

export type OrgRole = 'owner' | 'admin' | 'member';

export type InviteTokenStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export type InviteToken = {
  id: string;
  account_id: string;
  role: 'admin' | 'member';
  invited_by: string;
  invited_wallet: string | null;
  token: string;
  status: InviteTokenStatus;
  expires_at: string;
  created_at: string;
};

export type InviteTokenWithUser = InviteToken & {
  invited_user?: Pick<UserRecord, 'username' | 'profile_picture_url' | 'tier'>;
};

export type InviteTokenWithAccount = InviteToken & {
  account: Account;
  inviter?: Pick<UserRecord, 'username' | 'profile_picture_url'>;
};

export type UserNotification = {
  id: string;
  recipient_wallet: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

export type MemberWithProfile = AccountOwner & {
  user: Pick<UserRecord, 'username' | 'profile_picture_url' | 'tier'>;
};

// Marketplace listing types
export type MarketplacePriceType = 'fixed' | 'negotiable' | 'free';
export type MarketplaceCondition = 'neu' | 'wie_neu' | 'gut' | 'akzeptabel';
export type MarketplaceListingType = 'product' | 'service';

export type MarketplaceListingRecord = {
  id: string;
  seller_wallet_address: string;
  account_id: string | null;
  title: string;
  description: string | null;
  price: number;
  price_type: MarketplacePriceType;
  category: string;
  condition: MarketplaceCondition | null;
  neighborhood: string | null;
  media_urls: string[] | null;
  listing_type: MarketplaceListingType;
  status: 'active' | 'sold' | 'reserved' | 'deleted';
  views_count: number;
  created_at: string;
  updated_at: string;
};

// Extended deal record with joined business info
export type BusinessDealWithBusiness = BusinessDealRecord & {
  business?: Pick<BusinessRecord, 'id' | 'name' | 'slug' | 'logo_url' | 'category'>;
};

// Announcement (generic full-screen modal for promotions, updates, etc.)
export type AnnouncementRecord = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_link: string | null;
  cta_type: 'deep_link' | 'external_url';
  is_active: boolean;
  priority: number;
  show_once: boolean;
  starts_at: string | null;
  ends_at: string | null;
  min_app_version: string | null;
  max_app_version: string | null;
  created_at: string;
  updated_at: string;
};
