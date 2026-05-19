import { supabase } from './supabase';
import type { EventExperience, CreateExperienceInput } from './types/feed';

const PAGE_SIZE = 10;

function mergeAccountIntoAuthor<T extends { author?: any; account?: any }>(row: T): T {
  if (row.account && row.author) {
    row.author = { ...row.author, account: row.account };
  }
  return row;
}

/**
 * Fetch paginated experiences for an event with author data joined
 */
export async function fetchEventExperiences(
  eventId: string,
  page: number,
  pageSize: number = PAGE_SIZE
): Promise<{ data: EventExperience[]; hasMore: boolean }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from('event_experiences')
    .select(`
      *,
      author:users!event_experiences_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .eq('event_id', eventId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching event experiences:', error);
    return { data: [], hasMore: false };
  }

  return {
    data: (data as EventExperience[]).map(mergeAccountIntoAuthor),
    hasMore: data.length === pageSize,
  };
}

/**
 * Create a new experience on an event.
 *
 * Also mirrors the experience into `posts` so it surfaces in the main home
 * feed via the existing fetchFeedPosts query. The mirror is best-effort: if
 * it fails the experience itself is still returned successfully.
 */
export async function createExperience(
  input: CreateExperienceInput
): Promise<EventExperience | null> {
  const { data, error } = await supabase
    .from('event_experiences')
    .insert({
      event_id: input.event_id,
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      content: input.content,
      media_urls: input.media_urls || [],
      video_url: input.video_url || null,
      emoji: input.emoji || null,
      sticker_reward_id: input.sticker_reward_id || null,
      status: 'published',
    })
    .select(`
      *,
      author:users!event_experiences_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
      ),
      account:accounts(id, account_type, name, avatar_url),
      sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
    `)
    .single();

  if (error) {
    console.error('Error creating experience:', error);
    return null;
  }

  const experience = data as EventExperience;

  const { error: postError } = await supabase.from('posts').insert({
    wallet_address: experience.wallet_address,
    account_id: experience.account_id ?? null,
    content: experience.content,
    media_urls: experience.media_urls ?? [],
    video_url: experience.video_url ?? null,
    sticker_reward_id: experience.sticker_reward_id ?? null,
    category: 'generell',
    feed_type: 'main',
    post_type: 'event_experience',
    linked_event_id: experience.event_id,
    linked_experience_id: experience.id,
    status: 'published',
  });

  if (postError) {
    console.error('Error mirroring experience to feed:', postError);
  }

  return mergeAccountIntoAuthor(experience);
}

/**
 * Hard-delete an experience owned by the given wallet via the SECURITY DEFINER
 * RPC `delete_owned_experience`. The RPC also removes the paired feed post
 * (linked_experience_id) atomically.
 */
export async function deleteExperience(
  experienceId: string,
  walletAddress: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_experience', {
    p_experience_id: experienceId,
    p_wallet: walletAddress,
  });

  if (error) {
    console.error('[deleteExperience] rpc error', error);
    throw error;
  }
}
