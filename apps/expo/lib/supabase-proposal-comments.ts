import { supabase } from './supabase';
import type { ProposalCommentFeedRecord, ProposalPreviewRef } from './types/feed';

const PAGE_SIZE = 10;

export type ProposalCommentRecord = ProposalCommentFeedRecord & {
  likes_count?: number;
  is_liked?: boolean;
};

export type ProposalPreview = ProposalPreviewRef;

export type ProposalCommentWithPreview = ProposalCommentFeedRecord;

export type CreateProposalCommentInput = {
  proposal_id: string;
  wallet_address: string;
  account_id?: string;
  content: string;
  media_urls?: string[];
  video_url?: string;
  emoji?: string;
};

function mergeAccountIntoAuthor<T extends { author?: any; account?: any }>(row: T): T {
  if (row.account && row.author) {
    row.author = { ...row.author, account: row.account };
  }
  return row;
}

async function decorateWithLikes(
  rows: ProposalCommentRecord[],
  walletAddress?: string,
): Promise<ProposalCommentRecord[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);

  const { data: countRows } = await supabase
    .from('proposal_comment_likes')
    .select('comment_id')
    .in('comment_id', ids);

  const counts = new Map<string, number>();
  (countRows ?? []).forEach((r: { comment_id: string }) => {
    counts.set(r.comment_id, (counts.get(r.comment_id) ?? 0) + 1);
  });

  let liked = new Set<string>();
  if (walletAddress) {
    const { data: likedRows } = await supabase
      .from('proposal_comment_likes')
      .select('comment_id')
      .in('comment_id', ids)
      .eq('wallet_address', walletAddress);
    liked = new Set((likedRows ?? []).map((r: { comment_id: string }) => r.comment_id));
  }

  return rows.map((r) => ({
    ...r,
    likes_count: counts.get(r.id) ?? 0,
    is_liked: liked.has(r.id),
  }));
}

export async function fetchProposalComments(
  proposalId: string,
  page: number,
  walletAddress?: string,
  pageSize: number = PAGE_SIZE,
): Promise<{ data: ProposalCommentRecord[]; hasMore: boolean }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from('proposal_comments')
    .select(`
      *,
      author:users!proposal_comments_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url)
    `)
    .eq('proposal_id', proposalId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching proposal comments:', error);
    return { data: [], hasMore: false };
  }

  const rows = (data as ProposalCommentRecord[]).map(mergeAccountIntoAuthor);
  const decorated = await decorateWithLikes(rows, walletAddress);
  return { data: decorated, hasMore: data.length === pageSize };
}

export async function createProposalComment(
  input: CreateProposalCommentInput,
): Promise<ProposalCommentRecord | null> {
  const { data, error } = await supabase
    .from('proposal_comments')
    .insert({
      proposal_id: input.proposal_id,
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      content: input.content,
      media_urls: input.media_urls || [],
      video_url: input.video_url || null,
      emoji: input.emoji || null,
      status: 'published',
    })
    .select(`
      *,
      author:users!proposal_comments_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url)
    `)
    .single();

  if (error) {
    console.error('Error creating proposal comment:', error);
    return null;
  }

  return mergeAccountIntoAuthor(data as ProposalCommentRecord);
}

export async function deleteProposalComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('proposal_comments')
    .update({ status: 'deleted' })
    .eq('id', commentId);

  if (error) {
    console.error('Error deleting proposal comment:', error);
    throw error;
  }
}

export async function toggleProposalCommentLike(
  commentId: string,
  walletAddress: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('proposal_comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing) {
    await supabase.from('proposal_comment_likes').delete().eq('id', existing.id);
    return false;
  }

  await supabase
    .from('proposal_comment_likes')
    .insert({ comment_id: commentId, wallet_address: walletAddress });
  return true;
}

/**
 * Fetch the latest proposal comments across all proposals, with the parent
 * proposal joined for the embedded preview card. Used by the Stadt feed.
 */
export async function fetchRecentProposalComments(
  limit: number = 50,
): Promise<ProposalCommentWithPreview[]> {
  const { data, error } = await supabase
    .from('proposal_comments')
    .select(`
      *,
      author:users!proposal_comments_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      proposal:proposals!proposal_comments_proposal_id_fkey(
        proposal_id, title, state, for_votes, against_votes, abstain_votes
      )
    `)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent proposal comments:', error);
    return [];
  }

  return (data as ProposalCommentWithPreview[]).map(mergeAccountIntoAuthor);
}
