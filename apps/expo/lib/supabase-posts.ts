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
 * Create a new post
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
    console.error('Error creating post:', error);
    return null;
  }

  return mergeAccountIntoAuthor(data as PostRecord);
}

/**
 * Delete (soft-delete) a post by setting status to 'deleted'
 */
export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({ status: 'deleted' })
    .eq('id', postId);

  if (error) {
    console.error('Error deleting post:', error);
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
 * Soft-delete a comment and decrement the post's comment count
 */
export async function deleteComment(commentId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('post_comments')
    .update({ status: 'deleted' })
    .eq('id', commentId);

  if (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }

  // Decrement comment count
  const { data: post } = await supabase
    .from('posts')
    .select('comments_count')
    .eq('id', postId)
    .single();

  if (post) {
    await supabase
      .from('posts')
      .update({ comments_count: Math.max(0, (post.comments_count || 0) - 1) })
      .eq('id', postId);
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

/**
 * Report a post
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
