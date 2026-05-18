import { useCallback, useEffect, useRef, useState } from 'react';
import { getContractEvents, prepareEvent } from 'thirdweb';
import { attesterNFTContract } from '@/constants/verification-contracts';
import { fetchAttesterProfiles, type AttesterProfile } from '@/lib/supabase-attesters';

// TODO: subtract AttesterNFTRevoked events once revocation is wired
const ATTESTER_MINTED_EVENT = prepareEvent({
  signature:
    'event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)',
});

export function useAttesters() {
  const [attesters, setAttesters] = useState<AttesterProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const events = await getContractEvents({
          contract: attesterNFTContract,
          events: [ATTESTER_MINTED_EVENT],
        });

        const wallets = Array.from(
          new Set(
            events
              .map((ev) => (ev as any).args?.attester as string | undefined)
              .filter((addr): addr is string => Boolean(addr))
              .map((addr) => addr.toLowerCase())
          )
        );

        const profiles = await fetchAttesterProfiles(wallets);
        setAttesters(profiles);
      } catch (err) {
        console.error('useAttesters error:', err);
        setError(err instanceof Error ? err : new Error('Failed to load attesters'));
      } finally {
        setIsLoading(false);
      }
    })();

    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { attesters, isLoading, error, refresh: load };
}
