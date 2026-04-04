import { supabase } from './supabase';
import type { EventExperience, CreateExperienceInput } from './types/feed';

const PAGE_SIZE = 10;

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
        wallet_address, username, profile_picture_url, is_verified_citizen, role
      )
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
    data: data as EventExperience[],
    hasMore: data.length === pageSize,
  };
}

/**
 * Create a new experience on an event
 */
export async function createExperience(
  input: CreateExperienceInput
): Promise<EventExperience | null> {
  const { data, error } = await supabase
    .from('event_experiences')
    .insert({
      event_id: input.event_id,
      wallet_address: input.wallet_address,
      content: input.content,
      media_urls: input.media_urls || [],
      video_url: input.video_url || null,
      emoji: input.emoji || null,
      status: 'published',
    })
    .select(`
      *,
      author:users!event_experiences_wallet_address_fkey(
        wallet_address, username, profile_picture_url, is_verified_citizen, role
      )
    `)
    .single();

  if (error) {
    console.error('Error creating experience:', error);
    return null;
  }

  return data as EventExperience;
}

/**
 * Soft-delete an experience by setting status to 'deleted'
 */
export async function deleteExperience(experienceId: string): Promise<void> {
  const { error } = await supabase
    .from('event_experiences')
    .update({ status: 'deleted' })
    .eq('id', experienceId);

  if (error) {
    console.error('Error deleting experience:', error);
    throw error;
  }
}
