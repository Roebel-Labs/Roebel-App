import type { PostAuthor } from '@/lib/types/feed';
import type { Account } from '@/lib/types';

// expo-router's Router type. Using ReturnType of the hook sidesteps having to
// keep our type in sync with the (typed-routes) union expo-router generates.
type Router = ReturnType<typeof import('expo-router').useRouter>;

export type AuthorRef = Pick<PostAuthor, 'username'> | null | undefined;
export type AccountRef = Pick<Account, 'id' | 'account_type'> | null | undefined;

export function openAuthorProfile(
  router: Router,
  { author, account }: { author?: AuthorRef; account?: AccountRef }
): void {
  if (account?.account_type === 'organisation' && account.id) {
    router.push({ pathname: '/account/[id]' as any, params: { id: account.id } });
    return;
  }
  if (author?.username) {
    router.push({ pathname: '/user/[username]', params: { username: author.username } });
  }
}

export function canOpenProfile({ author, account }: { author?: AuthorRef; account?: AccountRef }): boolean {
  if (account?.account_type === 'organisation' && account.id) return true;
  if (author?.username) return true;
  return false;
}
