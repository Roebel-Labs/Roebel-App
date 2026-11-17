/**
 * Which passkey settings screen applies to this device (see lib/passkey/settings-kind.ts). Shared by
 * the Settings row and the chooser screen so both always agree.
 */
import { useEffect, useState } from 'react';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { isAddressEqual } from 'viem';

import { isPasskeyWallet, passkeySessionOf } from '@/lib/passkey/active';
import { isPasskeySurfaceAllowed } from '@/lib/passkey/gate';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import { settingsKind, type SettingsKind } from '@/lib/passkey/settings-kind';

export type SettingsKindState = {
  /** null while loading. */
  kind: SettingsKind | null;
  record: MigrationRecord | null;
  migrationOpen: boolean;
  detachOpen: boolean;
};

export function useSettingsKind(): SettingsKindState {
  const wallet = useActiveWallet();
  const account = useActiveAccount();
  const [loaded, setLoaded] = useState<{
    signupOpen: boolean;
    migrationOpen: boolean;
    detachOpen: boolean;
    record: MigrationRecord | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [signupOpen, migrationOpen, detachOpen, record] = await Promise.all([
        isPasskeySurfaceAllowed('signup').catch(() => false),
        isPasskeySurfaceAllowed('migration').catch(() => false),
        isPasskeySurfaceAllowed('detach').catch(() => false),
        loadMigrationRecord(secureKeyValueStorage).catch(() => null),
      ]);
      if (!cancelled) setLoaded({ signupOpen, migrationOpen, detachOpen, record });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return { kind: null, record: null, migrationOpen: false, detachOpen: false };

  const session = passkeySessionOf(account);
  const passkeySession = isPasskeyWallet(wallet);
  const identityIsSafe = !!session && isAddressEqual(session.identity as `0x${string}`, session.safe as `0x${string}`);
  const kind = settingsKind({
    passkeySession,
    identityIsSafe,
    hasRecord: !!loaded.record,
    recordConnected: loaded.record?.status === 'done',
    signupOpen: loaded.signupOpen,
    migrationOpen: loaded.migrationOpen,
  });
  return { kind, record: loaded.record, migrationOpen: loaded.migrationOpen, detachOpen: loaded.detachOpen };
}
