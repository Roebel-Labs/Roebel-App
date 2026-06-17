/**
 * Citizen enrollment status.
 *
 * A "verified citizen who hasn't stored their commitment preimage on this device
 * yet" — i.e. one bulk-minted during the Gnosis migration who never ran the
 * request form. Re-checks each time the screen regains focus, so the banner
 * clears right after the citizen completes the "Angaben vervollständigen" flow.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useVerificationContext } from '@/context/VerificationContext';
import { loadCitizenPreimage } from '@/lib/citizen-commitment';

export function useCitizenEnrollment() {
  const account = useActiveAccount();
  const { hasCitizenNFT } = useVerificationContext();
  const [hasPreimage, setHasPreimage] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!account) {
          setHasPreimage(null);
          return;
        }
        const pre = await loadCitizenPreimage(account.address);
        if (!cancelled) setHasPreimage(!!pre);
      })();
      return () => {
        cancelled = true;
      };
    }, [account])
  );

  const isLoading = hasCitizenNFT && hasPreimage === null;
  const needsEnrollment = hasCitizenNFT && hasPreimage === false;

  return { needsEnrollment, isLoading };
}
