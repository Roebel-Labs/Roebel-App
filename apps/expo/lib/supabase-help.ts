import { supabase } from './supabase';
import type { HelpCollection, HelpItem, HelpSection, HelpVideo } from './types-help';

export async function fetchHelpSections(): Promise<HelpSection[]> {
  const { data, error } = await supabase
    .from('help_sections')
    .select('*')
    .eq('is_published', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching help sections:', error);
    return [];
  }

  return data as HelpSection[];
}

export async function fetchHelpCollections(): Promise<HelpCollection[]> {
  const { data, error } = await supabase
    .from('help_collections')
    .select('*')
    .eq('is_published', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching help collections:', error);
    return [];
  }

  return data as HelpCollection[];
}

export async function fetchHelpCollection(id: string): Promise<HelpCollection | null> {
  const { data, error } = await supabase
    .from('help_collections')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching help collection:', error);
    return null;
  }

  return data as HelpCollection;
}

export async function fetchHelpItems(collectionId: string): Promise<HelpItem[]> {
  const { data, error } = await supabase
    .from('help_items')
    .select('*')
    .eq('collection_id', collectionId)
    .eq('is_published', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching help items:', error);
    return [];
  }

  return data as HelpItem[];
}

export async function fetchHelpVideos(): Promise<HelpVideo[]> {
  const { data, error } = await supabase
    .from('help_videos')
    .select('*')
    .eq('is_published', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching help videos:', error);
    return [];
  }

  return data as HelpVideo[];
}
