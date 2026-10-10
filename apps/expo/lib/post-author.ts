import type { PostRecord } from './types/feed';

export type ResolvedPostAuthor = {
  accountId: string | null;
  /** Wallet to mute/unmute alongside the account id; null for org/non-personal authors. */
  wallet: string | null;
  name: string;
  isPersonal: boolean;
};

type PostLike = Pick<PostRecord, 'account_id' | 'wallet_address' | 'author'>;

/** Who a post is by, as the follow/mute rows need it. Never returns a wallet as a display name. */
export function resolvePostAuthor(post: PostLike): ResolvedPostAuthor {
  const account = post.author?.account ?? null;
  const accountId = post.account_id ?? account?.id ?? null;
  // No account_id on the row means a legacy post by a person; otherwise the account decides.
  const isPersonal = !accountId || account?.account_type === 'personal';
  const name = account?.name?.trim() || post.author?.username?.trim() || 'Konto';
  return {
    accountId,
    wallet: isPersonal ? post.wallet_address?.toLowerCase() ?? null : null,
    name,
    isPersonal,
  };
}
