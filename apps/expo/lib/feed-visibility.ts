import { isAuthorHiddenInFeed, isAuthorMuted, type HiddenIndex } from './relations-state';

type Authored = { account_id?: string | null; wallet_address?: string | null };
// Structurally compatible with PostRecord (quoted_post: PostRecord | null).
export type PostLike = Authored & { id: string; post_type?: string | null; quoted_post?: (Authored & { id: string }) | null };

/** Client-side twin of get_feed_page's exclusion: applies a mute instantly, before the refetch lands. */
export function filterVisiblePosts<T extends PostLike>(posts: T[], index: HiddenIndex): T[] {
  return posts.filter((p) => {
    if (isAuthorHiddenInFeed(index, p)) return false;
    // A pure repost of a muted author's post is dropped entirely; quote-reposts
    // stay and render the "Beitrag ausgeblendet" placeholder instead.
    if (p.post_type === 'repost' && isQuoteHidden(p, index)) return false;
    return true;
  });
}

/** A repost of someone you muted shows "Beitrag ausgeblendet" instead of their content. */
export function isQuoteHidden(post: PostLike, index: HiddenIndex): boolean {
  return !!post.quoted_post && isAuthorMuted(index, post.quoted_post);
}
