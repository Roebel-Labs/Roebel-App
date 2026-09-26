/**
 * Root-layout mount point for the "someone is recovering your account" banner.
 *
 * Production safety: this file imports only the gate. `isPasskeyPreviewAllowed()` returns false on
 * the production channel without any network or storage access; only when the gate is open is the
 * banner module (viem clients, Supabase, SecureStore) required, and it then renders only if this
 * device holds a connected passkey record.
 */
import React, { useEffect, useState } from 'react';
import { isPasskeyPreviewAllowed } from '@/lib/passkey/gate';

type WatchComponent = React.ComponentType<Record<string, never>>;

export default function PasskeyRecoveryWatch() {
  const [Watch, setWatch] = useState<WatchComponent | null>(null);
  useEffect(() => {
    let cancelled = false;
    isPasskeyPreviewAllowed()
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
