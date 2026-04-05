import { supabase } from './supabase';

/**
 * Upload a media file (image or video) to Supabase Storage.
 *
 * @param uri      Local file URI from image/video picker
 * @param walletAddress  User wallet for path namespacing
 * @param type     'image' or 'video'
 * @param folder   Storage subfolder (e.g. 'posts', 'experiences')
 * @returns        Public URL on success, null on failure
 */
export async function uploadMediaFile(
  uri: string,
  walletAddress: string,
  type: 'image' | 'video',
  folder: string = 'posts'
): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const fileName = `${folder}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = `${folder}/${walletAddress}/${fileName}`;

    const { error } = await supabase.storage.from('images').upload(filePath, blob, {
      contentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
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
