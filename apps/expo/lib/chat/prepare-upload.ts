import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { uploadImage, type UploadedImage } from '@/lib/chat/api';
import type { SigningAccount } from '@/lib/signed-request';

/**
 * Chat photos go to /api/chat/uploads on Vercel, which rejects any request body over
 * 4.5 MB with 413 before our function runs. A full-resolution phone photo (12–48 MP,
 * quality 0.8) is often 3–8 MB, so every image is scaled to ≤ MAX_EDGE and re-encoded
 * as JPEG here. 2048 px keeps text on photographed posters/menus readable for the model.
 *
 * Same manipulator call as the event submission (lib/utils/image-compression), which is
 * proven on every store binary.
 */
export const CHAT_UPLOAD_MAX_EDGE = 2048;
const COMPRESS = 0.75;

export interface PreparedImage {
  uri: string;
  mimeType: 'image/jpeg';
}

export async function prepareChatImage(uri: string): Promise<PreparedImage> {
  const probe = await ImageManipulator.manipulateAsync(uri, []);
  const longest = Math.max(probe.width, probe.height);
  const actions: ImageManipulator.Action[] =
    longest > CHAT_UPLOAD_MAX_EDGE
      ? [{ resize: probe.width >= probe.height ? { width: CHAT_UPLOAD_MAX_EDGE } : { height: CHAT_UPLOAD_MAX_EDGE } }]
      : [];
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: COMPRESS,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: out.uri, mimeType: 'image/jpeg' };
}

/** The event submission's path: base64 → public `images` bucket → public URL. */
async function uploadToPublicImages(uri: string): Promise<UploadedImage> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const path = `chat-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
  const { error } = await supabase.storage
    .from('images')
    .upload(path, decode(base64), { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('images').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Bild konnte nicht hochgeladen werden.');
  return { url: data.publicUrl, width: 0, height: 0 };
}

/**
 * Prepare + upload one chat photo. The chat API comes first (private chat-media, which the
 * agents' image tools need); if that fails, the event submission's direct storage upload.
 */
export async function uploadChatImage(account: SigningAccount, uri: string): Promise<UploadedImage> {
  let prepared: PreparedImage;
  try {
    prepared = await prepareChatImage(uri);
  } catch (err) {
    console.warn('[chat upload] prepare failed, sending the original:', err);
    prepared = { uri, mimeType: 'image/jpeg' };
  }
  try {
    return await uploadImage(account, prepared.uri, prepared.mimeType);
  } catch (err) {
    console.warn('[chat upload] API upload failed, using storage fallback:', err);
    return uploadToPublicImages(prepared.uri);
  }
}
