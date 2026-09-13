import { SUB_TYPE_LABELS, type Account } from '@/lib/types';

/** Header title of the profile screen: "Profil", or the org type in org mode. */
export function profileHeaderTitle(account: Pick<Account, 'account_type' | 'sub_type'> | null): string {
  if (!account || account.account_type !== 'organisation') return 'Profil';
  return (account.sub_type && SUB_TYPE_LABELS[account.sub_type]) || 'Organisation';
}
