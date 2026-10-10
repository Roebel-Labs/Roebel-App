import { isAuthorHiddenInFeed, isAuthorMuted, type HiddenIndex } from './relations-state';

type Authored = { account_id?: string | null; wallet_address?: string | null };
// Structurally compatible with PostRecord (quoted_post: PostRecord | null).
export type PostLike = Authored & { id: string; quoted_post?: (Authored & { id: string }) | null };

/** Client-side twin of get_feed_page's exclusion: applies a mute instantly, before the refetch lands. */
export function filterVisiblePosts<T extends PostLike>(posts: T[], index: HiddenIndex): T[] {
  return posts.filter((p) => !isAuthorHiddenInFeed(index, p));
}

/** A repost of someone you muted shows "Beitrag ausgeblendet" instead of their content. */
export function isQuoteHidden(post: PostLike, index: HiddenIndex): boolean {
  return !!post.quoted_post && isAuthorMuted(index, post.quoted_post);
}
