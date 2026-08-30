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
