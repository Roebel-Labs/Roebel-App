/**
 * A passkey Safe WITHOUT a legacy account — what a family member creates to be someone's
 * guardian ("Mein Konto-Code"). Same record shape as the migration, just no `legacy`; if the
 * person later runs the migration with a thirdweb login, `runPasskeyMigration` reuses this record
 * (it never creates a second passkey). The Safe stays counterfactual until its first op.
 */
import { SAFE_WEBAUTHN_SHARED_SIGNER } from './constants';
import { MIGRATION_STORE_KEY, loadMigrationRecord, type KeyValueStorage, type MigrationRecord } from './migration';
import { predictSafeAddress } from './safe-address';
import type { PasskeyCredential } from './webauthn';

export type StandaloneResult =
  | { status: 'created' | 'existing'; record: MigrationRecord }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function ensureStandalonePasskey(
  name: string,
  deps: { storage: KeyValueStorage; createPasskey: (userName: string) => Promise<PasskeyCredential> },
): Promise<StandaloneResult> {
  const existing = await loadMigrationRecord(deps.storage).catch(() => null);
  if (existing) return { status: 'existing', record: existing };
  let cred: PasskeyCredential;
  try {
    cred = await deps.createPasskey(name);
  } catch (e) {
    const n = (e as { name?: string } | null)?.name;
    if (n === 'PasskeyCancelledError') return { status: 'cancelled' };
    if (n === 'PasskeyNotSupportedError') return { status: 'error', message: 'Dieses Gerät unterstützt keine Passkeys.' };
    return { status: 'error', message: 'Der Fingerabdruck konnte nicht eingerichtet werden.' };
  }
  const record: MigrationRecord = {
    credentialId: cred.credentialId,
    x: cred.x,
    y: cred.y,
    safe: predictSafeAddress({ x: cred.x, y: cred.y }),
    ownerType: 'sharedSigner',
    owner: SAFE_WEBAUTHN_SHARED_SIGNER,
    status: 'passkeyCreated',
  };
  try {
    await deps.storage.setItem(MIGRATION_STORE_KEY, JSON.stringify(record));
  } catch {
    return { status: 'error', message: 'Der Passkey konnte auf diesem Gerät nicht gespeichert werden.' };
  }
  return { status: 'created', record };
}
