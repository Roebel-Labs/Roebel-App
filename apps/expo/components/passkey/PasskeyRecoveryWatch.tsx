/**
 * Root-layout mount point for the "someone is recovering your account" banner.
 *
 * Production safety: this file imports only the light gates. `isRecoverySurfaceAllowed` returns false
 * without any network or storage access where passkeyChannelAllowed() is closed (a production binary
 * < 3.8.0). For an EXISTING account (passkey session or connected record on this device) the channel
 * alone decides, so turning sign-up or the kill switch off never hides the banner from it; anyone
 * else needs the sign-up surface open. Only when the gate is open is the banner module (viem
 * clients, Supabase, SecureStore) required, and it then renders only if this device holds a
 * connected passkey record.
 */
import React, { useEffect, useState } from 'react';
import { isRecoverySurfaceAllowed } from '@/lib/passkey/existing-account';

type WatchComponent = React.ComponentType<Record<string, never>>;

export default function PasskeyRecoveryWatch() {
  const [Watch, setWatch] = useState<WatchComponent | null>(null);
  useEffect(() => {
    let cancelled = false;
    isRecoverySurfaceAllowed('signup', 'account')
      .catch(() => false)
      .then((ok) => {
        if (!ok || cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('./RecoveryBanner') as { RecordRecoveryWatch: WatchComponent };
        setWatch(() => mod.RecordRecoveryWatch);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return Watch ? <Watch /> : null;
}
