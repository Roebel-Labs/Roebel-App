import { useEffect, useState } from 'react';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import type { BusinessRecord } from '@/lib/types';

export interface UseIsBusinessOwnerResult {
  /**
   * True when the user owns a shop/business — either via an `organisation`
   * account (current model) or a legacy row in the `businesses` table
   * (pre account-migration owners).
   */
  isBusinessOwner: boolean;
  /**
   * Raw legacy `businesses` rows owned by this wallet. Consumers pick their
   * own preferred record (profile prefers `published`, ProfileContent prefers
   * `approved`), so the hook returns the array rather than one record.
   */
  businesses: BusinessRecord[];
  /** True until the legacy businesses fetch resolves. */
  loading: boolean;
}

/**
 * Single source of truth for "does this user own a shop/business".
 *
 * The org-account signal is synchronous (from AccountContext), so a user who
 * owns an `organisation` account is flagged immediately; the legacy businesses
 * fetch resolves a beat later and can flip the flag on for pre-migration
 * owners who don't yet have an org account.
 */
export function useIsBusinessOwner(): UseIsBusinessOwnerResult {
  const { ownedAccounts } = useAccount();
  const { user } = useUser();
  const walletAddress = user?.wallet_address;

  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!walletAddress) {
      setBusinesses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBusinessesByOwner(walletAddress)
      .then((rows) => {
        if (!cancelled) setBusinesses(rows);
      })
      .catch(() => {
        if (!cancelled) setBusinesses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const orgOwner = ownedAccounts.some((a) => a.account_type === 'organisation');
  const isBusinessOwner = orgOwner || businesses.length > 0;

  return { isBusinessOwner, businesses, loading };
}
