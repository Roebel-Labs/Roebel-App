import type { ForumThreadRecord, PendingAttachment } from '@/lib/types/feed';

export type OfficialThreadFields = Pick<
  ForumThreadRecord,
  'source' | 'source_url' | 'source_citation' | 'source_score' | 'source_rank'
>;

/**
 * Kind-11 tags that mark a thread as quoted from an official source. Empty for
 * ordinary citizen threads so the event grammar of the forum spec is unchanged.
 */
export function officialThreadTags(thread: OfficialThreadFields): string[][] {
  if (thread.source !== 'buergerrat') return [];
  const tags: string[][] = [['t', 'buergerrat']];
  if (thread.source_url) tags.push(['r', thread.source_url]);
  if (thread.source_citation) tags.push(['source', thread.source_citation]);
  if (thread.source_score != null) tags.push(['score', String(thread.source_score)]);
  if (thread.source_rank != null) tags.push(['rank', String(thread.source_rank)]);
  return tags;
}

type AttachmentRef = Pick<PendingAttachment, 'url' | 'mime_type' | 'file_name'>;

/** NIP-92: one imeta tag per attachment whose URL appears in the content. */
export function attachmentTags(items: AttachmentRef[]): string[][] {
  return items.map((a) => ['imeta', `url ${a.url}`, `m ${a.mime_type}`, `alt ${a.file_name}`]);
}

/** The URLs the imeta tags describe, appended to the event content. */
export function attachmentContentSuffix(items: Array<Pick<PendingAttachment, 'url'>>): string {
  return items.length ? '\n\n' + items.map((a) => a.url).join('\n') : '';
}
