import { isAuthorMuted, type HiddenIndex } from './relations-state';

export function filterMutedNotifications<T extends { metadata?: unknown }>(items: T[], index: HiddenIndex): T[] {
  return items.filter((n) => {
    const actor = (n.metadata as { actor_wallet?: string } | null | undefined)?.actor_wallet;
    return !actor || !isAuthorMuted(index, { wallet_address: actor });
  });
}

type CommentLike = { account_id?: string | null; wallet_address?: string | null; replies?: CommentLike[] };

export function filterMutedComments<T extends CommentLike>(comments: T[], index: HiddenIndex): T[] {
  return comments
    .filter((c) => !isAuthorMuted(index, c))
    .map((c) => (c.replies ? { ...c, replies: c.replies.filter((r) => !isAuthorMuted(index, r)) } : c));
}
