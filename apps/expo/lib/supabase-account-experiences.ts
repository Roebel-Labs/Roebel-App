/**
 * Community experiences about an organisation — a visitor's photo and a line
 * about the place, shown under the comment thread in the map sheet.
 *
 * Distinct from `event_experiences`: that table's `account_id` means "posted
 * as this org", whereas here the org is the subject. Like event experiences,
 * each one mirrors into `posts` so it also reaches the home feed.
 */
import { supabase } from './supabase';
import type { AccountExperience } from './types';

const AUTHOR_FIELDS =
  'wallet_address, username, profile_picture_url, is_verified_citizen, tier';

/** posts.content carries a CHECK (char_length <= 500). */
export const EXPERIENCE_MAX_LENGTH = 500;

export async function fetchAccountExperiences(
  accountId: string,
  limit = 20
): Promise<AccountExperience[]> {
  const { data, error } = await supabase
    .from('account_experiences')
    .select(
      `*, author:users!account_experiences_wallet_address_fkey(${AUTHOR_FIELDS})`
    )
    .eq('account_id', accountId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('fetchAccountExperiences error:', error);
    return [];
  }
  return (data as AccountExperience[]) ?? [];
}

/**
 * Post an experience and mirror it to the home feed.
 *
 * The mirror is best-effort: a failed post insert still returns the
 * experience, matching how createExperience behaves for events. Note the
 * mirror sets `linked_account_id`, not `linked_experience_id` — the latter
 * has an FK to `event_experiences` and would reject this row's id.
 */
export async function createAccountExperience(input: {
  account_id: string;
  wallet_address: string;
  content: string;
  media_urls?: string[];
  video_url?: string | null;
}): Promise<AccountExperience | null> {
  const content = input.content.trim().slice(0, EXPERIENCE_MAX_LENGTH);

  const { data, error } = await supabase
    .from('account_experiences')
    .insert({
      account_id: input.account_id,
      wallet_address: input.wallet_address.toLowerCase(),
      content,
      media_urls: input.media_urls ?? [],
      video_url: input.video_url ?? null,
      status: 'published',
    })
    .select(`*, author:users!account_experiences_wallet_address_fkey(${AUTHOR_FIELDS})`)
    .single();

  if (error) {
    console.error('createAccountExperience error:', error);
    return null;
  }

  const experience = data as AccountExperience;

  const { error: postError } = await supabase.from('posts').insert({
    wallet_address: experience.wallet_address,
    content: experience.content,
    media_urls: experience.media_urls ?? [],
    video_url: experience.video_url ?? null,
    category: 'generell',
    feed_type: 'main',
    post_type: 'org_experience',
    linked_account_id: experience.account_id,
    status: 'published',
  });

  if (postError) {
    console.error('Error mirroring org experience to feed:', postError);
  }

  return experience;
}

/** Soft-delete, so the paired feed post can be reconciled separately. */
export async function deleteAccountExperience(
  experienceId: string,
  wallet: string
): Promise<boolean> {
  const { error } = await supabase
    .from('account_experiences')
    .update({ status: 'deleted' })
    .eq('id', experienceId)
    .eq('wallet_address', wallet.toLowerCase());

  if (error) {
    console.error('deleteAccountExperience error:', error);
    return false;
  }
  return true;
}
