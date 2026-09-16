import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { uploadMediaFile } from './upload-media';
import type { ForumAttachmentKind, PendingAttachment } from './types/feed';

export const FORUM_ATTACHMENTS_BUCKET = 'forum-attachments';
/** The WebView file input hands the bytes over as one base64 string. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const;

const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export function isAllowedAttachmentMime(mime: string): boolean {
  return (ALLOWED_ATTACHMENT_MIMES as readonly string[]).includes(mime.toLowerCase());
}

export function kindForMime(mime: string): ForumAttachmentKind {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'pdf';
  return 'file';
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  return cleaned.slice(0, 120) || 'datei';
}

function extensionFor(name: string, mime: string): string {
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return EXTENSION_FOR_MIME[mime.toLowerCase()] ?? 'bin';
}

/** Image from expo-image-picker → compressed JPEG in the forum bucket. */
export async function uploadForumImage(
  uri: string,
  walletAddress: string,
  mimeType?: string,
  opts: { fileName?: string | null; width?: number | null; height?: number | null } = {},
): Promise<PendingAttachment | null> {
  const url = await uploadMediaFile(uri, walletAddress, 'image', 'images', mimeType, FORUM_ATTACHMENTS_BUCKET);
  if (!url) return null;
  return {
    kind: 'image',
    url,
    mime_type: 'image/jpeg',
    file_name: safeFileName(opts.fileName ?? 'bild.jpg'),
    width: opts.width ?? null,
    height: opts.height ?? null,
    size_bytes: null,
  };
}

/** Any allowed file, delivered as base64 by the WebView picker. */
export async function uploadForumFileFromBase64(
  base64: string,
  mimeType: string,
  fileName: string,
  sizeBytes: number | null,
): Promise<PendingAttachment | null> {
  try {
    const mime = mimeType.toLowerCase();
    if (!isAllowedAttachmentMime(mime)) return null;
    const bytes = decode(base64);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) return null;
    const path = `files/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFor(fileName, mime)}`;
    const { error } = await supabase.storage.from(FORUM_ATTACHMENTS_BUCKET).upload(path, bytes, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) {
      console.error('[forum-attachments] upload error', error);
      return null;
    }
    const { data } = supabase.storage.from(FORUM_ATTACHMENTS_BUCKET).getPublicUrl(path);
    return {
      kind: kindForMime(mime),
      url: data.publicUrl,
      mime_type: mime,
      file_name: safeFileName(fileName),
      size_bytes: sizeBytes ?? bytes.byteLength,
      width: null,
      height: null,
    };
  } catch (err) {
    console.error('[forum-attachments] upload failed', err);
    return null;
  }
}
