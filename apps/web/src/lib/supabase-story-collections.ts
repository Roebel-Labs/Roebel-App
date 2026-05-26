/**
 * Story collections — admin-managed "Lerne mehr über die Röbel App" content.
 * Mirrors the shape of supabase-blog-articles.ts but with nested slides.
 */

import { supabase } from "./supabase";

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

export interface StoryCollectionWithSlides extends StoryCollection {
  slides: StorySlide[];
}

export async function listForAccount(
  accountId: string
): Promise<StoryCollection[]> {
  const { data, error } = await supabase
    .from("story_collections")
    .select("*")
    .eq("account_id", accountId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listForAccount story_collections error:", error);
    return [];
  }
  return (data || []) as StoryCollection[];
}

export async function getStoryCollectionById(
  id: string
): Promise<StoryCollectionWithSlides | null> {
  const { data: collection, error: cErr } = await supabase
    .from("story_collections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (cErr || !collection) return null;

  const { data: slides, error: sErr } = await supabase
    .from("story_slides")
    .select("*")
    .eq("collection_id", id)
    .order("display_order", { ascending: true });

  if (sErr) {
    console.error("getStoryCollectionById slides error:", sErr);
  }

  return {
    ...(collection as StoryCollection),
    slides: (slides || []) as StorySlide[],
  };
}
