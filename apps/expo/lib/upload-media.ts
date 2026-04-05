import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

/**
 * Upload a media file (image or video) to Supabase Storage.
 * Uses FileSystem.readAsStringAsync → base64 → ArrayBuffer for reliable uploads
 * (fetch-based blob approach produces 0-byte files on iOS HEIC images).
 *
 * @param uri      Local file URI from image/video picker
 * @param walletAddress  User wallet for path namespacing
 * @param type     'image' or 'video'
 * @param folder   Storage subfolder (e.g. 'posts', 'experiences')
 * @param mimeType Actual MIME type from the picker
 * @returns        Public URL on success, null on failure
 */
export async function uploadMediaFile(
  uri: string,
  walletAddress: string,
  type: 'image' | 'video',
  folder: string = 'posts',
  mimeType?: string
): Promise<string | null> {
  try {
    // Read file as base64 using FileSystem (reliable on iOS, unlike fetch → blob)
    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64Data || base64Data.length === 0) {
      console.error('Upload error: empty base64 data');
      return null;
    }

    // Convert base64 to ArrayBuffer for Supabase upload
    const arrayBuffer = decode(base64Data);

    const fileExtension = uri.split('.').pop()?.toLowerCase() || (type === 'video' ? 'mp4' : 'jpg');
    const fileName = `${folder}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExtension}`;
    const filePath = `${folder}/${walletAddress}/${fileName}`;
    const contentType = mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg');

    const { error } = await supabase.storage.from('images').upload(filePath, arrayBuffer, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.error('Upload failed:', err);
    return null;
  }
}
