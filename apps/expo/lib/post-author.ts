import type { PostRecord } from './types/feed';

export type ResolvedPostAuthor = {
  accountId: string | null;
  /** Wallet to mute/unmute alongside the account id; null for org/non-personal authors. */
  wallet: string | null;
  name: string;
  isPersonal: boolean;
};

type PostLike = Pick<PostRecord, 'account_id' | 'wallet_address' | 'author'>;

/** True for anything that starts like a wallet address ("0x12…ab" or a full 0x…). */
export function isWalletLike(value: string | null | undefined): boolean {
  return !!value && /^0x[0-9a-f]/i.test(value.trim());
}

/** First non-empty, non-wallet-shaped candidate. */
export function pickDisplayName(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const t = c?.trim();
    if (t && !isWalletLike(t)) return t;
  }
  return null;
}

/** Who a post is by, as the follow/mute rows need it. Never returns a wallet as a display name. */
export function resolvePostAuthor(post: PostLike): ResolvedPostAuthor {
  const account = post.author?.account ?? null;
  const accountId = post.account_id ?? account?.id ?? null;
  // No account_id on the row means a legacy post by a person; otherwise the account decides.
  const isPersonal = !accountId || account?.account_type === 'personal';
  // accounts.name is trusted only for organisations: a personal account's name is mostly a wallet string.
  const isOrg = account?.account_type === 'organisation';
  const displayName = (post.author as { display_name?: string | null } | undefined)?.display_name;
  const name = pickDisplayName(isOrg ? account?.name : null, displayName, post.author?.username) ?? 'Konto';
  return {
    accountId,
    wallet: isPersonal ? post.wallet_address?.toLowerCase() ?? null : null,
    name,
    isPersonal,
  };
}
