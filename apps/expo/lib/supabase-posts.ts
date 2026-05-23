import { supabase } from './supabase';
import type {
  FeedType,
  PostRecord,
  PostCommentRecord,
  ServiceAlertRecord,
  CreatePostInput,
  CreateCommentInput,
  CreatePollInput,
  CreatePostLinkInput,
  PollVoteRecord,
} from './types/feed';

const PAGE_SIZE = 15;

/** Merge top-level `account` join into `author.account` for PostAuthorRow */
function mergeAccountIntoAuthor<T extends { author?: any; account?: any }>(row: T): T {
  if (row.account && row.author) {
    row.author = { ...row.author, account: row.account };
  }
  return row;
}

// ─── Posts ──────────────────────────────────────────────────

/**
 * Fetch paginated posts for a feed tab with author data joined
 */
export async function fetchFeedPosts(options: {
  feedType: FeedType;
  page: number;
  pageSize?: number;
}): Promise<{ data: PostRecord[]; hasMore: boolean }> {
  const size = options.pageSize || PAGE_SIZE;
  const from = options.page * size;
  const to = from + size - 1;

  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:users!posts_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      links:post_links(*),
      poll:post_polls(*),
      linked_event:events(id, title, date, time, location, image_url, category),
      linked_marketplace:marketplace_listings(id, title, price, price_type, category, condition, media_urls, neighborhood),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .eq('feed_type', options.feedType)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching feed posts:', error);
    return { data: [], hasMore: false };
  }

  return {
    data: (data as PostRecord[]).map(mergeAccountIntoAuthor),
    hasMore: data.length === size,
  };
}

/**
 * Fetch a user's own posts by wallet address, ordered newest first.
 * Used on the public profile's "Beiträge" tab.
 */
export async function fetchUserPosts(
  walletAddress: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: PostRecord[]; hasMore: boolean }> {
  const size = options?.pageSize || PAGE_SIZE;
  const page = options?.page || 0;
  const from = page * size;
  const to = from + size - 1;

  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:users!posts_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      links:post_links(*),
      poll:post_polls(*),
      linked_event:events(id, title, date, time, location, image_url, category),
      linked_marketplace:marketplace_listings(id, title, price, price_type, category, condition, media_urls, neighborhood),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching user posts:', error);
    return { data: [], hasMore: false };
  }

  return {
    data: (data as PostRecord[]).map(mergeAccountIntoAuthor),
    hasMore: data.length === size,
  };
}

/**
 * Fetch posts authored from a specific organisation account, newest first.
 */
export async function fetchAccountPosts(
  accountId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: PostRecord[]; hasMore: boolean }> {
  const size = options?.pageSize || PAGE_SIZE;
  const page = options?.page || 0;
  const from = page * size;
  const to = from + size - 1;

  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:users!posts_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      links:post_links(*),
      poll:post_polls(*),
      linked_event:events(id, title, date, time, location, image_url, category),
      linked_marketplace:marketplace_listings(id, title, price, price_type, category, condition, media_urls, neighborhood),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .eq('account_id', accountId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching account posts:', error);
    return { data: [], hasMore: false };
  }

  return {
    data: (data as PostRecord[]).map(mergeAccountIntoAuthor),
    hasMore: data.length === size,
  };
}

/**
 * Fetch a single post with all relations
 */
export async function fetchPostById(postId: string): Promise<PostRecord | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:users!posts_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      links:post_links(*),
      poll:post_polls(*),
      linked_event:events(id, title, date, time, location, image_url, category),
      linked_marketplace:marketplace_listings(id, title, price, price_type, category, condition, media_urls, neighborhood),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .eq('id', postId)
    .single();

  if (error) {
    console.error('Error fetching post:', error);
    return null;
  }

  return mergeAccountIntoAuthor(data as PostRecord);
}

/**
 * Posting denial codes raised by the `enforce_posting_rules` trigger when a
 * non-citizen attempts to post without meeting the tourist-tier requirements.
 * The trigger raises messages like `ACCOUNT_TOO_YOUNG:2026-05-24T15:00:00+00`
 * which `parsePostingDenial` turns into a structured value.
 */
export type PostingDenialCode =
  | 'LOCATION_REQUIRED'
  | 'ACCOUNT_TOO_YOUNG'
  | 'RATE_LIMIT_DAY'
  | 'RATE_LIMIT_WEEK'
  | 'USER_NOT_FOUND';

export class PostingDeniedError extends Error {
  code: PostingDenialCode;
  unlockAt?: Date;
  constructor(code: PostingDenialCode, unlockAt?: Date) {
    super(code);
    this.name = 'PostingDeniedError';
    this.code = code;
    this.unlockAt = unlockAt;
  }
}

function parsePostingDenial(message: string | undefined): PostingDeniedError | null {
  if (!message) return null;
  const m = message.match(
    /\b(LOCATION_REQUIRED|ACCOUNT_TOO_YOUNG|RATE_LIMIT_DAY|RATE_LIMIT_WEEK|USER_NOT_FOUND)(?::(\S+))?/,
  );
  if (!m) return null;
  const code = m[1] as PostingDenialCode;
  const ts = m[2];
  const unlockAt = ts ? new Date(ts) : undefined;
  return new PostingDeniedError(code, Number.isNaN(unlockAt?.getTime()) ? undefined : unlockAt);
}

/**
 * Create a new post.
 *
 * Throws `PostingDeniedError` when the `enforce_posting_rules` trigger blocks
 * a non-citizen post (location/age/rate-limit gate). Returns null on generic
 * failures, matching the historical contract — callers may keep their old
 * `if (!post)` branch and just add a `catch (PostingDeniedError)` for the new
 * gated path.
 */
export async function createPost(input: CreatePostInput): Promise<PostRecord | null> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      content: input.content,
      category: input.category || 'generell',
      feed_type: input.feed_type || 'main',
      post_type: input.post_type || 'user',
      media_urls: input.media_urls || [],
      video_url: input.video_url || null,
      linked_event_id: input.linked_event_id || null,
      linked_marketplace_id: input.linked_marketplace_id || null,
      linked_mecky_draft_id: input.linked_mecky_draft_id || null,
      sticker_reward_id: input.sticker_reward_id || null,
      status: 'published',
    })
    .select(`
      *,
      author:users!posts_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .single();

  if (error) {
    const denied = parsePostingDenial(error.message);
    if (denied) throw denied;
    console.error('Error creating post:', error);
    return null;
  }

  const post = mergeAccountIntoAuthor(data as PostRecord);

  // Fire background Claude moderation for non-citizen freeform posts only.
  // Citizens are trusted (CitizenNFT signal); other post_types are auto-generated.
  const isCitizen = !!post.author?.is_verified_citizen;
  if (!isCitizen && post.post_type === 'user') {
    supabase.functions
      .invoke('moderate-post', { body: { post_id: post.id } })
      .catch((err) => console.warn('[moderate-post] invoke failed', err?.message));
  }

  return post;
}

/**
 * Hard-delete a post owned by the given wallet via the SECURITY DEFINER RPC
 * `delete_owned_post`. The RPC handles wallet-case normalization, bypasses RLS,
 * and raises a clear error if no row matched.
 *
 * NOTE: account-managed posts (where the deleter is an account manager, not the
 * original author) are not supported — the RPC accepts a single wallet only.
 * Tracked as a follow-up.
 */
export async function deletePost(postId: string, walletAddress: string): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_post', {
    p_post_id: postId,
    p_wallet: walletAddress,
  });

  if (error) {
    console.error('[deletePost] rpc error', error);
    throw error;
  }
}

/**
 * Update a post's content and/or category
 */
export async function updatePost(
  postId: string,
  updates: { content?: string; category?: string }
): Promise<PostRecord | null> {
  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId)
    .select(`
      *,
      author:users!posts_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      links:post_links(*),
      poll:post_polls(*),
      linked_event:events(id, title, date, time, location, image_url, category),
      linked_marketplace:marketplace_listings(id, title, price, price_type, category, condition, media_urls, neighborhood),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .single();

  if (error) {
    console.error('Error updating post:', error);
    throw error;
  }

  return mergeAccountIntoAuthor(data as PostRecord);
}

// ─── Likes ──────────────────────────────────────────────────

/**
 * Toggle like on a post. Returns true if now liked, false if unliked.
 */
export async function togglePostLike(postId: string, walletAddress: string): Promise<boolean> {
  // Check if already liked
  const { data: existing } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing) {
    // Unlike
    await supabase.from('post_likes').delete().eq('id', existing.id);
    // Decrement count
    const { data: post } = await supabase
      .from('posts')
      .select('likes_count')
      .eq('id', postId)
      .single();
    if (post) {
      await supabase
        .from('posts')
        .update({ likes_count: Math.max(0, (post.likes_count || 0) - 1) })
        .eq('id', postId);
    }
    return false;
  } else {
    // Like
    await supabase.from('post_likes').insert({ post_id: postId, wallet_address: walletAddress });
    // Increment count
    const { data: post } = await supabase
      .from('posts')
      .select('likes_count')
      .eq('id', postId)
      .single();
    if (post) {
      await supabase
        .from('posts')
        .update({ likes_count: (post.likes_count || 0) + 1 })
        .eq('id', postId);
    }
    return true;
  }
}

/**
 * Batch check which posts the user has liked
 */
export async function getUserLikedPostIds(
  postIds: string[],
  walletAddress: string
): Promise<Set<string>> {
  if (postIds.length === 0 || !walletAddress) return new Set();

  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .in('post_id', postIds)
    .eq('wallet_address', walletAddress);

  if (error) {
    console.error('Error checking liked posts:', error);
    return new Set();
  }

  return new Set(data.map((d) => d.post_id));
}

// ─── Comments ───────────────────────────────────────────────

/**
 * Fetch paginated comments for a post
 */
export async function fetchPostComments(
  postId: string,
  page: number,
  pageSize: number = 20
): Promise<{ data: PostCommentRecord[]; hasMore: boolean }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from('post_comments')
    .select(`
      *,
      author:users!post_comments_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .eq('post_id', postId)
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .range(from, to);

  if (error) {
    console.error('Error fetching comments:', error);
    return { data: [], hasMore: false };
  }

  return {
    data: (data as PostCommentRecord[]).map(mergeAccountIntoAuthor),
    hasMore: data.length === pageSize,
  };
}

/**
 * Create a comment on a post
 */
export async function createComment(input: CreateCommentInput): Promise<PostCommentRecord | null> {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: input.post_id,
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      content: input.content,
      media_urls: input.media_urls || [],
      video_url: input.video_url || null,
      sticker_reward_id: input.sticker_reward_id || null,
    })
    .select(`
      *,
      author:users!post_comments_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .single();

  if (error) {
    console.error('Error creating comment:', error);
    return null;
  }

  // Increment comment count
  const { data: post } = await supabase
    .from('posts')
    .select('comments_count')
    .eq('id', input.post_id)
    .single();

  if (post) {
    await supabase
      .from('posts')
      .update({ comments_count: (post.comments_count || 0) + 1 })
      .eq('id', input.post_id);
  }

  return mergeAccountIntoAuthor(data as PostCommentRecord);
}

/**
 * Hard-delete a comment owned by the given wallet via the SECURITY DEFINER RPC
 * `delete_owned_post_comment`. The RPC also decrements the parent post's
 * comments_count atomically.
 *
 * The `postId` arg is kept for backwards compatibility with callers — the RPC
 * derives it from the comment row.
 */
export async function deleteComment(
  commentId: string,
  _postId: string,
  walletAddress: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_post_comment', {
    p_comment_id: commentId,
    p_wallet: walletAddress,
  });

  if (error) {
    console.error('[deleteComment] rpc error', error);
    throw error;
  }
}

/**
 * Update a comment's content
 */
export async function updateComment(
  commentId: string,
  content: string
): Promise<PostCommentRecord | null> {
  const { data, error } = await supabase
    .from('post_comments')
    .update({ content })
    .eq('id', commentId)
    .select(`
      *,
      author:users!post_comments_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .single();

  if (error) {
    console.error('Error updating comment:', error);
    throw error;
  }

  return mergeAccountIntoAuthor(data as PostCommentRecord);
}

// ─── Polls ──────────────────────────────────────────────────

/**
 * Create a poll for a post
 */
export async function createPoll(input: CreatePollInput): Promise<void> {
  const { error } = await supabase.from('post_polls').insert({
    post_id: input.post_id,
    poll_type: input.poll_type,
    options: input.options,
    expires_at: input.expires_at,
  });

  if (error) {
    console.error('Error creating poll:', error);
    throw error;
  }
}

/**
 * Submit a vote on a poll
 */
export async function submitPollVote(
  pollId: string,
  walletAddress: string,
  selectedOptions: number[]
): Promise<void> {
  const { error } = await supabase.from('poll_votes').insert({
    poll_id: pollId,
    wallet_address: walletAddress,
    selected_options: selectedOptions,
  });

  if (error) {
    console.error('Error submitting poll vote:', error);
    throw error;
  }
}

/**
 * Fetch all votes for a poll
 */
export async function fetchPollVotes(pollId: string): Promise<PollVoteRecord[]> {
  const { data, error } = await supabase
    .from('poll_votes')
    .select('*')
    .eq('poll_id', pollId);

  if (error) {
    console.error('Error fetching poll votes:', error);
    return [];
  }

  return data as PollVoteRecord[];
}

/**
 * Check if user has voted on a poll
 */
export async function getUserPollVote(
  pollId: string,
  walletAddress: string
): Promise<number[] | null> {
  const { data } = await supabase
    .from('poll_votes')
    .select('selected_options')
    .eq('poll_id', pollId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  return data?.selected_options || null;
}

// ─── Links ──────────────────────────────────────────────────

/**
 * Create a link preview for a post
 */
export async function createPostLink(input: CreatePostLinkInput): Promise<void> {
  const { error } = await supabase.from('post_links').insert({
    post_id: input.post_id,
    url: input.url,
    og_title: input.og_title || null,
    og_description: input.og_description || null,
    og_image: input.og_image || null,
    og_site_name: input.og_site_name || null,
  });

  if (error) {
    console.error('Error creating post link:', error);
    throw error;
  }
}

// ─── Service Alerts ─────────────────────────────────────────

/**
 * Fetch active service alerts ordered by severity
 */
export async function fetchActiveServiceAlerts(): Promise<ServiceAlertRecord[]> {
  const { data, error } = await supabase
    .from('service_alerts')
    .select('*')
    .eq('status', 'active')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching service alerts:', error);
    return [];
  }

  // Sort by severity client-side (critical > warning > info)
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  return (data as ServiceAlertRecord[]).sort(
    (a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2)
  );
}

// ─── Reports ────────────────────────────────────────────────

export class DuplicateReportError extends Error {
  constructor() {
    super('DUPLICATE_REPORT');
    this.name = 'DuplicateReportError';
  }
}

/**
 * Report a post. A user may only report a given post once — the unique index
 * `post_reports_unique_reporter` (added in 20260523_posting_rules) raises a
 * 23505 unique_violation that this function turns into `DuplicateReportError`.
 */
export async function reportPost(
  postId: string,
  reporterWalletAddress: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.from('post_reports').insert({
    post_id: postId,
    reporter_wallet_address: reporterWalletAddress,
    reason,
  });

  if (error) {
    if (error.code === '23505') {
      throw new DuplicateReportError();
    }
    console.error('Error reporting post:', error);
    throw error;
  }
}

// ─── Upcoming Events for Feed ───────────────────────────────

/**
 * Fetch upcoming approved events for feed injection (next 7 days)
 */
export async function fetchUpcomingEventsForFeed(limit: number = 5): Promise<any[]> {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'approved')
    .gte('date', today)
    .lte('date', nextWeek)
    .order('date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching upcoming events:', error);
    return [];
  }

  return data || [];
}

// ─── Events for an Org Account ──────────────────────────────

/**
 * Fetch approved events authored by an organisation account.
 * Upcoming events first (date >= today, ascending), then past (date < today, descending).
 */
export async function fetchEventsByAccount(accountId: string, limit: number = 20): Promise<any[]> {
  const today = new Date().toISOString().split('T')[0];

  const [upcoming, past] = await Promise.all([
    supabase
      .from('events')
      .select('*, account:accounts(id, name, avatar_url)')
      .eq('status', 'approved')
      .eq('account_id', accountId)
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(limit),
    supabase
      .from('events')
      .select('*, account:accounts(id, name, avatar_url)')
      .eq('status', 'approved')
      .eq('account_id', accountId)
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(limit),
  ]);

  if (upcoming.error) {
    console.error('Error fetching upcoming account events:', upcoming.error);
  }
  if (past.error) {
    console.error('Error fetching past account events:', past.error);
  }

  return [...(upcoming.data ?? []), ...(past.data ?? [])];
}

// ─── This Week's Events for Story Bar ───────────────────────

/**
 * Fetch approved events from today through end of this week (Sunday),
 * with account data joined for the story bar avatar.
 */
export async function fetchThisWeekEvents(): Promise<any[]> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // End of this ISO week: next Sunday (day 0) or this Sunday
  const endOfWeek = new Date(today);
  const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
  endOfWeek.setDate(today.getDate() + daysUntilSunday);
  const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('events')
    .select('*, account:accounts(id, name, avatar_url)')
    .eq('status', 'approved')
    .gte('date', todayStr)
    .lte('date', endOfWeekStr)
    .order('date', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error fetching this week events:', error);
    return [];
  }

  return data ?? [];
}
