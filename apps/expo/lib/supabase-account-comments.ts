/**
 * Comments on an organisation.
 *
 * Backed by `account_ratings`, which holds at most one row per (account,
 * wallet) — a user has a single take on a place and edits it rather than
 * posting again. `stars` is optional: the sheet composer asks "was denkst
 * du?", and a star only appears when the user explicitly rates.
 *
 * Replies and likes live in their own tables. See the migration for why they
 * are not `parent_id` rows on `account_ratings`.
 */
import { supabase } from './supabase';
import type { AccountComment, AccountCommentReply } from './types';

const AUTHOR_FIELDS = 'wallet_address, username, profile_picture_url, is_verified_citizen, tier';

/**
 * Every comment on an org, newest first, with author, replies and like state.
 *
 * `viewerWallet` decides `liked_by_me`; pass null for a logged-out viewer.
 */
export async function fetchAccountComments(
  accountId: string,
  viewerWallet: string | null
): Promise<AccountComment[]> {
  const { data, error } = await supabase
    .from('account_ratings')
    .select(
      `*, author:users!account_ratings_wallet_address_fkey(${AUTHOR_FIELDS})`
    )
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchAccountComments error:', error);
    return [];
  }

  const rows = (data as AccountComment[]) ?? [];
  // A rating with neither text nor stars carries nothing to show.
  const visible = rows.filter((r) => (r.comment && r.comment.trim()) || r.stars != null);
  if (!visible.length) return [];

  const ids = visible.map((r) => r.id);
  const [replies, likes] = await Promise.all([
    fetchRepliesFor(ids),
    fetchLikesFor(ids, viewerWallet),
  ]);

  return visible.map((row) => ({
    ...row,
    replies: replies[row.id] ?? [],
    like_count: likes.counts[row.id] ?? 0,
    liked_by_me: likes.mine.has(row.id),
  }));
}

async function fetchRepliesFor(
  ratingIds: string[]
): Promise<Record<string, AccountCommentReply[]>> {
  const { data, error } = await supabase
    .from('account_rating_replies')
    .select(
      `*, author:users!account_rating_replies_wallet_address_fkey(${AUTHOR_FIELDS})`
    )
    .in('rating_id', ratingIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchRepliesFor error:', error);
    return {};
  }

  const grouped: Record<string, AccountCommentReply[]> = {};
  for (const reply of (data as AccountCommentReply[]) ?? []) {
    (grouped[reply.rating_id] ??= []).push(reply);
  }
  return grouped;
}

async function fetchLikesFor(
  ratingIds: string[],
  viewerWallet: string | null
): Promise<{ counts: Record<string, number>; mine: Set<string> }> {
  const { data, error } = await supabase
    .from('account_rating_likes')
    .select('rating_id, wallet_address')
    .in('rating_id', ratingIds);

  if (error) {
    console.error('fetchLikesFor error:', error);
    return { counts: {}, mine: new Set() };
  }

  const counts: Record<string, number> = {};
  const mine = new Set<string>();
  const viewer = viewerWallet?.toLowerCase() ?? null;

  for (const like of (data as { rating_id: string; wallet_address: string }[]) ?? []) {
    counts[like.rating_id] = (counts[like.rating_id] ?? 0) + 1;
    if (viewer && like.wallet_address.toLowerCase() === viewer) mine.add(like.rating_id);
  }
  return { counts, mine };
}

/**
 * Write the viewer's comment. Upserts on (account_id, wallet_address), so
 * commenting twice edits the first one rather than adding a second.
 *
 * `stars` is left untouched when omitted — a user who rated 5 stars last month
 * and edits their text today keeps the rating.
 */
export async function submitAccountComment(input: {
  account_id: string;
  wallet_address: string;
  comment: string;
  stars?: number | null;
}): Promise<AccountComment | null> {
  const wallet = input.wallet_address.toLowerCase();

  const { data: existing } = await supabase
    .from('account_ratings')
    .select('id, stars')
    .eq('account_id', input.account_id)
    .eq('wallet_address', wallet)
    .maybeSingle();

  const stars =
    input.stars !== undefined
      ? input.stars
      : ((existing as { stars: number | null } | null)?.stars ?? null);

  const { data, error } = await supabase
    .from('account_ratings')
    .upsert(
      {
        account_id: input.account_id,
        wallet_address: wallet,
        comment: input.comment.trim(),
        stars,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,wallet_address' }
    )
    .select(`*, author:users!account_ratings_wallet_address_fkey(${AUTHOR_FIELDS})`)
    .single();

  if (error) {
    console.error('submitAccountComment error:', error);
    return null;
  }
  return { ...(data as AccountComment), replies: [], like_count: 0, liked_by_me: false };
}

export async function deleteAccountComment(commentId: string): Promise<boolean> {
  const { error } = await supabase.from('account_ratings').delete().eq('id', commentId);
  if (error) {
    console.error('deleteAccountComment error:', error);
    return false;
  }
  return true;
}

export async function submitCommentReply(input: {
  rating_id: string;
  wallet_address: string;
  content: string;
}): Promise<AccountCommentReply | null> {
  const { data, error } = await supabase
    .from('account_rating_replies')
    .insert({
      rating_id: input.rating_id,
      wallet_address: input.wallet_address.toLowerCase(),
      content: input.content.trim(),
    })
    .select(`*, author:users!account_rating_replies_wallet_address_fkey(${AUTHOR_FIELDS})`)
    .single();

  if (error) {
    console.error('submitCommentReply error:', error);
    return null;
  }
  return data as AccountCommentReply;
}

/**
 * Toggle the viewer's like. Returns the new state.
 * Read-then-write, mirroring `toggleCommentLike` in supabase-posts.ts.
 */
export async function toggleCommentLike(
  ratingId: string,
  walletAddress: string
): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();

  const { data: existing } = await supabase
    .from('account_rating_likes')
    .select('id')
    .eq('rating_id', ratingId)
    .eq('wallet_address', wallet)
    .maybeSingle();

  if (existing) {
    await supabase.from('account_rating_likes').delete().eq('id', (existing as { id: string }).id);
    return false;
  }

  await supabase.from('account_rating_likes').insert({ rating_id: ratingId, wallet_address: wallet });
  return true;
}
