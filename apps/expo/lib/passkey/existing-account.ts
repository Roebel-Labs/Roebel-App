/**
 * Recovery surfaces for an EXISTING passkey account.
 *
 * Turning sign-up off (its production flag or the `passkey_accounts_enabled` kill switch) closes
 * new sign-up entry points only. Someone whose device already holds a passkey session or a
 * connected migration record must keep their guardians, warning email, recovery banner and the
 * recovery screens: for them only passkeyChannelAllowed() decides (the same fence that restores
 * their session at boot). Everyone else stays behind the ordinary surface gate.
 *
 * Light on purpose (SecureStore + key names only): it runs in the root layout.
 */
import { hasStoredPasskeySession, secureKeyReader, type KeyReader } from './boot-source';
import { isPasskeySurfaceAllowed, passkeyChannelAllowed, type PasskeySurface } from './gate';

/** = MIGRATION_STORE_KEY in migration.ts (not imported: that module is heavy). */
export const MIGRATION_RECORD_KEY = 'passkey_migration_v1';
/** = RECOVERY_STORE_KEY in recovery-flow.ts (not imported: that module is heavy). */
export const RECOVERY_STATE_KEY = 'passkey_recovery_v1';

/** A stored migration record whose migration finished (status 'done'). */
export function isConnectedRecord(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const r = JSON.parse(raw) as { status?: unknown; safe?: unknown } | null;
    return !!r && r.status === 'done' && typeof r.safe === 'string' && r.safe.length > 0;
  } catch {
    return false;
  }
}

export type ExistingAccountScope = 'account' | 'account-or-recovery';

/**
 * true when this device holds a passkey session or a connected migration record; with
 * 'account-or-recovery' also an account recovery in progress (someone who started recovering must
 * be able to finish). A failing read counts as "not found" for that key only.
 */
export async function hasExistingPasskeyAccount(
  scope: ExistingAccountScope = 'account',
  storage: KeyReader = secureKeyReader,
): Promise<boolean> {
  const reads: Promise<boolean>[] = [
    hasStoredPasskeySession(storage).catch(() => false),
    storage
      .getItem(MIGRATION_RECORD_KEY)
      .then(isConnectedRecord)
      .catch(() => false),
  ];
  if (scope === 'account-or-recovery') {
    reads.push(
      storage
        .getItem(RECOVERY_STATE_KEY)
        .then((raw) => !!raw)
        .catch(() => false),
    );
  }
  return (await Promise.all(reads)).some(Boolean);
}

/**
 * The gate for recovery surfaces: closed channel -> false without any read; an existing account ->
 * open (flags are not asked); otherwise the ordinary surface gate.
 */
export async function isRecoverySurfaceAllowed(
  surface: PasskeySurface = 'signup',
  scope: ExistingAccountScope = 'account',
  deps: {
    channelAllowed?: () => boolean;
    hasExisting?: (scope: ExistingAccountScope) => Promise<boolean>;
    surfaceAllowed?: (surface: PasskeySurface) => Promise<boolean>;
  } = {},
): Promise<boolean> {
  const channelAllowed = deps.channelAllowed ?? (() => passkeyChannelAllowed());
  const hasExisting = deps.hasExisting ?? ((s: ExistingAccountScope) => hasExistingPasskeyAccount(s));
  const surfaceAllowed = deps.surfaceAllowed ?? isPasskeySurfaceAllowed;
  if (!channelAllowed()) return false;
  if (await hasExisting(scope).catch(() => false)) return true;
  return surfaceAllowed(surface).catch(() => false);
}
