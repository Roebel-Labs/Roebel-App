import { supabase } from './supabase';

/**
 * Upload a media file (image or video) to Supabase Storage.
 *
 * @param uri      Local file URI from image/video picker
 * @param walletAddress  User wallet for path namespacing
 * @param type     'image' or 'video'
 * @param folder   Storage subfolder (e.g. 'posts', 'experiences')
 * @param mimeType Actual MIME type from the picker (important for HEIC on iOS)
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
    const response = await fetch(uri);
    const blob = await response.blob();

    // Use real extension from URI, fallback to type-based default
    const fileExtension = uri.split('.').pop()?.toLowerCase() || (type === 'video' ? 'mp4' : 'jpg');
    const fileName = `${folder}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExtension}`;
    const filePath = `${folder}/${walletAddress}/${fileName}`;

    // Use actual mimeType from picker when available (critical for HEIC on iOS)
    const contentType = mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg');

    const { error } = await supabase.storage.from('images').upload(filePath, blob, {
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
