import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';

export type ActiveProfileImage = {
  url: string | null;
  fallbackInitial: string;
  isOrg: boolean;
  displayName: string;
};

/**
 * Returns the avatar to show for the *currently active* profile — the org
 * the user has switched into via the profile header, falling back to their
 * personal user record. Mirrors the precedence used in app/profile.tsx so
 * composers (post bar, create post, event experiences, proposal comments)
 * stay in sync when the user switches accounts.
 */
export function useActiveProfileImage(): ActiveProfileImage {
  const { user } = useUser();
  const { activeAccount } = useAccount();
  const isOrg = activeAccount?.account_type === 'organisation';

  if (isOrg && activeAccount) {
    const name = activeAccount.name ?? '';
    return {
      url: activeAccount.avatar_url ?? activeAccount.cover_url ?? null,
      fallbackInitial: (name.charAt(0) || '?').toUpperCase(),
      isOrg: true,
      displayName: name || 'Organisation',
    };
  }

  const username = user?.username ?? '';
  return {
    url: user?.profile_picture_url ?? null,
    fallbackInitial: (username.charAt(0) || '?').toUpperCase(),
    isOrg: false,
    displayName: username || 'Unbekannt',
  };
}
