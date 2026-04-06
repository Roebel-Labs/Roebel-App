import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { compressImageForVisionAPI } from './utils/image-compression';

/**
 * Upload a media file (image or video) to Supabase Storage.
 * Uses FileSystem → base64 → ArrayBuffer (proven reliable in RN).
 *
 * @param uri      Local file URI from image/video picker
 * @param walletAddress  User wallet (unused, kept for API compat)
 * @param type     'image' or 'video'
 * @param folder   Storage subfolder (e.g. 'posts', 'experiences')
 * @param mimeType Actual MIME type from the picker (e.g. 'image/heic')
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
    // Compress images before upload (converts HEIC→JPEG, resizes large photos)
    let fileUri = uri;
    if (type === 'image') {
      fileUri = await compressImageForVisionAPI(uri);
    }

    // Read file as base64, then convert to ArrayBuffer for reliable upload
    const base64Data = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64Data || base64Data.length === 0) {
      console.error('[upload-media] File is empty:', uri);
      return null;
    }

    const arrayBuffer = decode(base64Data);

    // Compression outputs JPEG for images; videos keep original extension
    const fileExtension = type === 'video' ? (uri.split('.').pop()?.toLowerCase() || 'mp4') : 'jpg';
    const fileName = `${folder}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExtension}`;
    const filePath = `${folder}/${fileName}`;
    const contentType = type === 'video' ? (mimeType || 'video/mp4') : 'image/jpeg';

    const { error } = await supabase.storage.from('images').upload(filePath, arrayBuffer, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      console.error('[upload-media] Upload error:', error);
      return null;
    }

    const { data } = supabase.storage.from('images').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.error('[upload-media] Upload failed:', err);
    return null;
  }
}
