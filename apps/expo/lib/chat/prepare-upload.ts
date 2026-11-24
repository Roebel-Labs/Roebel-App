import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Chat photos go to /api/chat/uploads on Vercel, which rejects any request body over
 * 4.5 MB with 413 before our function runs. A full-resolution phone photo (12–48 MP,
 * quality 0.8) is often 3–8 MB, so every image is scaled to ≤ MAX_EDGE and re-encoded
 * as JPEG here. 2048 px keeps text on photographed posters/menus readable for the model.
 */
export const CHAT_UPLOAD_MAX_EDGE = 2048;
const COMPRESS = 0.75;

export interface PreparedImage {
  uri: string;
  mimeType: 'image/jpeg';
}

export async function prepareChatImage(uri: string): Promise<PreparedImage> {
  const src = await ImageManipulator.manipulate(uri).renderAsync();
  const ctx = ImageManipulator.manipulate(src);
  const longest = Math.max(src.width, src.height);
  if (longest > CHAT_UPLOAD_MAX_EDGE) {
    ctx.resize(src.width >= src.height ? { width: CHAT_UPLOAD_MAX_EDGE } : { height: CHAT_UPLOAD_MAX_EDGE });
  }
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: COMPRESS });
  return { uri: saved.uri, mimeType: 'image/jpeg' };
}
