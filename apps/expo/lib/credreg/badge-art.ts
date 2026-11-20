/**
 * Uploads a badge picture chosen with the image picker (local uri) to the public `images` bucket,
 * the same way the event form uploads its poster. Returns the public URL, or null on failure.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };

export async function uploadBadgeArt(uri: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `event-images/badge-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage
      .from('images')
      .upload(path, decode(base64), { contentType: TYPES[ext] ?? 'image/jpeg', cacheControl: '3600', upsert: false });
    if (error || !data) return null;
    return supabase.storage.from('images').getPublicUrl(data.path).data.publicUrl;
  } catch {
    return null;
  }
}
