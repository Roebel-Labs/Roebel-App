import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import type { ClaimNowResult } from '@/context/RoebelTalerProvider';
import { claimWithDeviceSessionOffer, type OfferChoice } from '@/lib/passkey/session-keys/ui-state';

/** Let the sheet's modal close before the passkey prompt opens (SHEET_CLOSE_TIMING + margin). */
const SHEET_CLOSED_MS = 320;

/**
 * Passkey Münzen claim with the first-claim device-session offer. `claim()` asks the provider
 * for the claim path; 'offer' opens DeviceSessionOfferSheet (spread `sheet` onto it) and waits
 * for the answer. Resolves with the claim result, or null when the sheet was dismissed.
 */
export function useDeviceSessionOffer(opts: { closeDelayMs?: number } = {}) {
  const { claimNow, deviceSessionClaimPath, declineDeviceSession } = useRoebelTaler();
  const [visible, setVisible] = useState(false);
  const resolver = useRef<((c: OfferChoice) => void) | null>(null);
  const delay = opts.closeDelayMs ?? SHEET_CLOSED_MS;

  const answer = useCallback(
    (c: OfferChoice) => {
      const resolve = resolver.current;
      if (!resolve) return; // the drawer's onClose after a button tap
      resolver.current = null;
      setVisible(false);
      if (c === 'dismiss' || delay <= 0) resolve(c);
      else setTimeout(() => resolve(c), delay);
    },
    [delay],
  );

  // Unmounted with the sheet open: settle the pending claim as dismissed.
  useEffect(() => () => resolver.current?.('dismiss'), []);

  const claim = useCallback(
    (): Promise<ClaimNowResult | null> =>
      claimWithDeviceSessionOffer<ClaimNowResult>({
        claimPath: deviceSessionClaimPath,
        claimNow,
        decline: declineDeviceSession,
        askOffer: () =>
          new Promise<OfferChoice>((resolve) => {
            resolver.current?.('dismiss'); // a second tap while the sheet is open: settle the first
            resolver.current = resolve;
            setVisible(true);
          }),
      }),
    [claimNow, deviceSessionClaimPath, declineDeviceSession],
  );

  return {
    claim,
    sheet: {
      visible,
      onAllow: () => answer('grant'),
      onLater: () => answer('decline'),
      onClose: () => answer('dismiss'),
    },
  };
}
