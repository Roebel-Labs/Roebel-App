import { supabase } from './supabase';
import type {
  CreateForumReplyInput,
  CreateForumThreadInput,
  ForumCategoryRecord,
  ForumReplyRecord,
  ForumThreadRecord,
} from './types/feed';

// PostgREST embed strings — FK names follow the table_column_fkey convention
// (same idiom as proposal_comments).
const THREAD_SELECT = `
  *,
  author:users!forum_threads_wallet_address_fkey(
    wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
  ),
  account:accounts(id, account_type, name, avatar_url),
  category:forum_categories(slug, name)
`;

const REPLY_SELECT = `
  *,
  author:users!forum_replies_wallet_address_fkey(
    wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
  ),
  account:accounts(id, account_type, name, avatar_url)
`;

function mergeAccountIntoAuthor<T extends { author?: any; account?: any }>(row: T): T {
  if (row.account && row.author) {
    row.author = { ...row.author, account: row.account };
  }
  return row;
}

export async function fetchForumCategories(): Promise<ForumCategoryRecord[]> {
  const { data, error } = await supabase
    .from('forum_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('Error fetching forum categories:', error);
    return [];
  }
  return (data ?? []) as ForumCategoryRecord[];
}

export async function fetchRecentForumThreads(
  limit: number = 30,
  categorySlug?: string,
): Promise<ForumThreadRecord[]> {
  let query = supabase
    .from('forum_threads')
    .select(THREAD_SELECT)
    .eq('status', 'published')
    .order('last_activity_at', { ascending: false })
    .limit(limit);
  if (categorySlug) query = query.eq('category_slug', categorySlug);
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching forum threads:', error);
    return [];
  }
  return (data as unknown as ForumThreadRecord[]).map(mergeAccountIntoAuthor);
}

export async function fetchForumThread(id: string): Promise<ForumThreadRecord | null> {
  const { data, error } = await supabase
    .from('forum_threads')
    .select(THREAD_SELECT)
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('Error fetching forum thread:', error);
    return null;
  }
  return mergeAccountIntoAuthor(data as unknown as ForumThreadRecord);
}

export async function fetchForumReplies(threadId: string): Promise<ForumReplyRecord[]> {
  const { data, error } = await supabase
    .from('forum_replies')
    .select(REPLY_SELECT)
    .eq('thread_id', threadId)
    .eq('status', 'published')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error fetching forum replies:', error);
    return [];
  }
  return (data as unknown as ForumReplyRecord[]).map(mergeAccountIntoAuthor);
}

/** Personal-account content mirrors to the relay; organisation words are the
 *  node's to publish under the org key (same rule as mirrorPostToNostr). */
async function isOrgAccount(accountId: string | null | undefined): Promise<boolean> {
  if (!accountId) return false;
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('account_type')
      .eq('id', accountId)
      .maybeSingle();
    // Fail closed: if we cannot positively confirm a personal account, do not
    // mirror — a person's key must never sign an organisation's words.
    if (error || !data) return true;
    return data.account_type === 'organisation';
  } catch {
    return true;
  }
}

export async function createForumThread(
  input: CreateForumThreadInput,
): Promise<ForumThreadRecord | null> {
  const { data, error } = await supabase
    .from('forum_threads')
    .insert({
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      title: input.title.trim(),
      body: input.body.trim(),
      category_slug: input.category_slug || null,
      status: 'published',
    })
    .select(THREAD_SELECT)
    .single();
  if (error) {
    console.error('Error creating forum thread:', error);
    return null;
  }
  const thread = mergeAccountIntoAuthor(data as unknown as ForumThreadRecord);
  void mirrorThreadToNostr(thread);
  return thread;
}

async function mirrorThreadToNostr(thread: ForumThreadRecord): Promise<void> {
  try {
    if (await isOrgAccount(thread.account_id)) return;
    const { publishForumThread } = await import('./nostr/publish');
    const createdSec = Math.floor(Date.parse(thread.created_at) / 1000);
    await publishForumThread(
      thread.id,
      thread.title,
      thread.body,
      thread.category_slug ?? undefined,
      Number.isFinite(createdSec) ? createdSec : undefined,
    );
  } catch (err) {
    console.warn('[nostr] forum thread mirror skipped', (err as Error)?.message);
  }
}

export async function createForumReply(
  input: CreateForumReplyInput,
): Promise<ForumReplyRecord | null> {
  const { data, error } = await supabase
    .from('forum_replies')
    .insert({
      thread_id: input.thread_id,
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      body: input.body.trim(),
      parent_reply_id: input.parent_reply_id || null,
      status: 'published',
    })
    .select(REPLY_SELECT)
    .single();
  if (error) {
    console.error('Error creating forum reply:', error);
    return null;
  }
  const reply = mergeAccountIntoAuthor(data as unknown as ForumReplyRecord);
  void mirrorReplyToNostr(reply);
  return reply;
}

async function mirrorReplyToNostr(reply: ForumReplyRecord): Promise<void> {
  try {
    if (await isOrgAccount(reply.account_id)) return;
    const { publishForumReply } = await import('./nostr/publish');
    await publishForumReply(reply.id, reply.thread_id, reply.body, reply.parent_reply_id);
  } catch (err) {
    console.warn('[nostr] forum reply mirror skipped', (err as Error)?.message);
  }
}

/** Best-effort NIP-09 retraction of a mirrored forum event (spec §8: author
 *  deletion = row soft-delete + kind-5 publish). Never blocks the delete. */
async function mirrorDeletionToNostr(sourceType: 'forum_thread' | 'forum_reply', sourceId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('nostr_publications')
      .select('event_id')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('status', 'published')
      .maybeSingle();
    if (!data?.event_id) return;
    const { publishDeletions } = await import('./nostr/publish');
    await publishDeletions([data.event_id as string], 'Beitrag gelöscht');
  } catch (err) {
    console.warn('[nostr] forum deletion mirror skipped', (err as Error)?.message);
  }
}

export async function deleteForumThread(id: string, walletAddress: string): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_forum_thread', {
    p_thread_id: id,
    p_wallet: walletAddress,
  });
  if (error) throw error;
  void mirrorDeletionToNostr('forum_thread', id);
}

export async function deleteForumReply(id: string, walletAddress: string): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_forum_reply', {
    p_reply_id: id,
    p_wallet: walletAddress,
  });
  if (error) throw error;
  void mirrorDeletionToNostr('forum_reply', id);
}

// ─── Votes (spec §A2.2) ─────────────────────────────────────

export type ForumVoteTarget = 'thread' | 'reply';

export function decideVoteTransition(
  current: 1 | -1 | null,
  tapped: 1 | -1,
): { action: 'insert' | 'delete' | 'flip'; value?: 1 | -1 } {
  if (current === tapped) return { action: 'delete' };
  if (current === null) return { action: 'insert', value: tapped };
  return { action: 'flip', value: tapped };
}

/** Apply a vote tap. Returns the new vote state for optimistic UI. */
export async function castForumVote(
  targetType: ForumVoteTarget,
  targetId: string,
  walletAddress: string,
  tapped: 1 | -1,
  current: 1 | -1 | null,
): Promise<1 | -1 | null> {
  const t = decideVoteTransition(current, tapped);
  if (t.action === 'delete') {
    const { error } = await supabase
      .from('forum_votes')
      .delete()
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('wallet_address', walletAddress);
    if (error) throw error;
    void mirrorUnvote(targetType, targetId);
    return null;
  }
  const { error } = await supabase.from('forum_votes').upsert(
    {
      target_type: targetType,
      target_id: targetId,
      wallet_address: walletAddress,
      value: t.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'target_type,target_id,wallet_address' },
  );
  if (error) throw error;
  void mirrorVote(targetType, targetId, t.value!, t.action === 'flip');
  return t.value!;
}

async function mirrorVote(
  targetType: ForumVoteTarget,
  targetId: string,
  value: 1 | -1,
  isFlip: boolean,
): Promise<void> {
  try {
    const { publishForumVote, publishForumUnvote } = await import('./nostr/publish');
    if (isFlip) await publishForumUnvote(targetType, targetId);
    await publishForumVote(targetType, targetId, value);
  } catch (err) {
    console.warn('[nostr] forum vote mirror skipped', (err as Error)?.message);
  }
}

async function mirrorUnvote(targetType: ForumVoteTarget, targetId: string): Promise<void> {
  try {
    const { publishForumUnvote } = await import('./nostr/publish');
    await publishForumUnvote(targetType, targetId);
  } catch (err) {
    console.warn('[nostr] forum unvote mirror skipped', (err as Error)?.message);
  }
}

/** The viewer's own votes for a batch of targets, keyed `${type}:${id}`. */
export async function fetchMyForumVotes(
  walletAddress: string,
  targets: Array<{ type: ForumVoteTarget; id: string }>,
): Promise<Map<string, 1 | -1>> {
  const map = new Map<string, 1 | -1>();
  if (!walletAddress || targets.length === 0) return map;
  const ids = [...new Set(targets.map((t) => t.id))];
  const { data, error } = await supabase
    .from('forum_votes')
    .select('target_type, target_id, value')
    .eq('wallet_address', walletAddress)
    .in('target_id', ids);
  if (error) {
    console.error('Error fetching own forum votes:', error);
    return map;
  }
  for (const row of (data ?? []) as Array<{ target_type: string; target_id: string; value: number }>) {
    map.set(`${row.target_type}:${row.target_id}`, row.value === 1 ? 1 : -1);
  }
  return map;
}

// ─── Edit (owner-checked RPCs — direct-UPDATE policies were removed in the
// Task 1 review fix; forum_threads_update/forum_replies_update no longer
// exist, so edits route through the same SECURITY DEFINER pattern as the
// delete RPCs) ────────────────────────────────────────────────────────────

export async function updateForumThread(
  id: string,
  walletAddress: string,
  updates: { title: string; body: string; category_slug?: string | null },
): Promise<ForumThreadRecord | null> {
  const { error } = await supabase.rpc('update_owned_forum_thread', {
    p_thread_id: id,
    p_wallet: walletAddress,
    p_title: updates.title,
    p_body: updates.body,
    p_category_slug: updates.category_slug ?? null,
  });
  if (error) {
    console.error('[updateForumThread] rpc error', error);
    return null;
  }
  return fetchForumThread(id);
}

export async function updateForumReply(
  id: string,
  walletAddress: string,
  body: string,
): Promise<ForumReplyRecord | null> {
  const { error } = await supabase.rpc('update_owned_forum_reply', {
    p_reply_id: id,
    p_wallet: walletAddress,
    p_body: body,
  });
  if (error) {
    console.error('[updateForumReply] rpc error', error);
    return null;
  }
  const { data, error: fetchError } = await supabase
    .from('forum_replies')
    .select(REPLY_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (fetchError || !data) return null;
  return mergeAccountIntoAuthor(data as unknown as ForumReplyRecord);
}

// ─── Subscriptions + reports (spec §A2.5/A2.6) ─────────────────────────────

export async function fetchThreadSubscription(
  threadId: string,
  walletAddress: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('forum_thread_subscriptions')
    .select('id')
    .eq('thread_id', threadId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  return !!data;
}

export async function toggleThreadSubscription(
  threadId: string,
  walletAddress: string,
  subscribe: boolean,
): Promise<void> {
  if (subscribe) {
    const { error } = await supabase
      .from('forum_thread_subscriptions')
      .upsert(
        { thread_id: threadId, wallet_address: walletAddress },
        { onConflict: 'thread_id,wallet_address' },
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('forum_thread_subscriptions')
      .delete()
      .eq('thread_id', threadId)
      .eq('wallet_address', walletAddress);
    if (error) throw error;
  }
}

export async function reportForumContent(
  targetType: ForumVoteTarget,
  targetId: string,
  reporterWallet: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.from('forum_reports').insert({
    target_type: targetType,
    target_id: targetId,
    reporter_wallet: reporterWallet,
    reason: reason || null,
  });
  // Unique-reporter constraint: a duplicate report is a no-op, not an error worth surfacing.
  if (error && !`${error.message}`.includes('duplicate')) throw error;
}
