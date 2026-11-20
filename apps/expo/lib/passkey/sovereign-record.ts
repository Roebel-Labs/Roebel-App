/**
 * The local migration record of an independent (passkey-only) account. The Settings screen needs
 * one (guardians, recovery banner); a passkey session without a record gets a fresh one built from
 * the session — but ONLY when the read succeeded and found nothing. A failing read (transient
 * SecureStore error) must never overwrite an existing record (legacy, status 'done', rewrap state
 * would be lost): the caller shows a retry instead.
 */
import { MIGRATION_STORE_KEY, loadMigrationRecord, type KeyValueStorage, type MigrationRecord } from './migration';
import type { PasskeySession } from './session';

/** The same record shape `finish()` in signin.ts writes for a Safe-only account. */
export function recordFromSession(s: PasskeySession): MigrationRecord {
  return {
    credentialId: s.credentialId,
    x: s.x,
    y: s.y,
    safe: s.safe,
    ownerType: s.ownerType,
    owner: s.owner,
    status: 'passkeyCreated',
  };
}

export type SovereignRecordResult =
  | { status: 'ok'; record: MigrationRecord }
  /** No record and no passkey session to build one from. */
  | { status: 'none' }
  /** The stored record could not be read: nothing was written, offer a retry. */
  | { status: 'error' };

export async function ensureSovereignRecord(storage: KeyValueStorage, session: PasskeySession | null): Promise<SovereignRecordResult> {
  let existing: MigrationRecord | null;
  try {
    existing = await loadMigrationRecord(storage);
  } catch {
    return { status: 'error' };
  }
  if (existing) return { status: 'ok', record: existing };
  if (!session) return { status: 'none' };
  const record = recordFromSession(session);
  // A failed write still shows the screen (the next visit writes again).
  await storage.setItem(MIGRATION_STORE_KEY, JSON.stringify(record)).catch(() => undefined);
  return { status: 'ok', record };
}
