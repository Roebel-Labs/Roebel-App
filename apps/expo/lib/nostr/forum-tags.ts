import type { ForumThreadRecord } from '@/lib/types/feed';

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
