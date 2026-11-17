/**
 * Which passkey settings screen applies to this device (see lib/passkey/settings-kind.ts). Shared by
 * the Settings row and the chooser screen so both always agree.
 */
import { useEffect, useState } from 'react';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { isAddressEqual } from 'viem';

import { isPasskeyWallet, passkeySessionOf } from '@/lib/passkey/active';
import { passkeyChannelAllowed, passkeySurfacesAllowed } from '@/lib/passkey/gate';
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
      // One app-settings fetch for all three surfaces.
      const [surfaces, record] = await Promise.all([
        passkeySurfacesAllowed(['signup', 'migration', 'detach'] as const).catch(() => ({ signup: false, migration: false, detach: false })),
        loadMigrationRecord(secureKeyValueStorage).catch(() => null),
      ]);
      if (!cancelled) {
        setLoaded({ signupOpen: surfaces.signup, migrationOpen: surfaces.migration, detachOpen: surfaces.detach, record });
      }
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
    // An existing account (session / connected record) is fenced by the channel only.
    channelAllowed: passkeyChannelAllowed(),
    signupOpen: loaded.signupOpen,
    migrationOpen: loaded.migrationOpen,
  });
  return { kind, record: loaded.record, migrationOpen: loaded.migrationOpen, detachOpen: loaded.detachOpen };
}
