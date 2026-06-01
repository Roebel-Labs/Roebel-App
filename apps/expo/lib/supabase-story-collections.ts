import { supabase } from './supabase';

export interface StorySlide {
  id: string;
  collection_id: string;
  background_image_url: string | null;
  background_video_url: string | null;
  overlay_text: string;
  text_color: string | null;
  display_order: number;
  created_at: string;
}

export interface StoryCollection {
  id: string;
  account_id: string | null;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  audio_url: string | null;
  show_on_profile: boolean;
  show_on_home_feed: boolean;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

async function fetchByFlag(
  flag: 'show_on_profile' | 'show_on_home_feed',
): Promise<StoryCollection[]> {
  const { data, error } = await supabase
    .from('story_collections')
    .select('*')
    .eq('is_published', true)
    .eq(flag, true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`fetch story_collections (${flag}) error:`, error);
    return [];
  }
  return (data || []) as unknown as StoryCollection[];
}

export function fetchProfileStoryCollections(): Promise<StoryCollection[]> {
  return fetchByFlag('show_on_profile');
}

export function fetchHomeFeedStoryCollections(): Promise<StoryCollection[]> {
  return fetchByFlag('show_on_home_feed');
}

export async function fetchSlidesForCollection(
  collectionId: string,
): Promise<StorySlide[]> {
  const { data, error } = await supabase
    .from('story_slides')
    .select('*')
    .eq('collection_id', collectionId)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('fetch story_slides error:', error);
    return [];
  }
  return (data || []) as unknown as StorySlide[];
}

/**
 * Fetch slides for many collections in a single round-trip and group them by
 * `collection_id` (preserving display_order). Returns a map keyed by id; any
 * collection without slides is simply absent from the map. Used by the home
 * feed to avoid an N+1 query per collection.
 */
export async function fetchSlidesForCollections(
  collectionIds: string[],
): Promise<Record<string, StorySlide[]>> {
  if (collectionIds.length === 0) return {};

  const { data, error } = await supabase
    .from('story_slides')
    .select('*')
    .in('collection_id', collectionIds)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('fetch story_slides (batch) error:', error);
    return {};
  }

  const map: Record<string, StorySlide[]> = {};
  for (const slide of (data || []) as unknown as StorySlide[]) {
    (map[slide.collection_id] ??= []).push(slide);
  }
  return map;
}
