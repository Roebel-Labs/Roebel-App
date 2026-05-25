import { supabase } from './supabase';

/**
 * Reads a single global key from the `app_settings` table. Returns null on
 * any error or when the key is unset.
 */
async function fetchAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`fetch app_settings (${key}) error:`, error);
    return null;
  }
  return ((data as { value: string | null } | null)?.value ?? null) || null;
}

/**
 * Shared background audio track that loops under ALL event stories. Set by
 * admins in the web events dashboard. Falls back to null (no track).
 */
export function fetchEventStoriesAudioUrl(): Promise<string | null> {
  return fetchAppSetting('event_stories_audio_url');
}
