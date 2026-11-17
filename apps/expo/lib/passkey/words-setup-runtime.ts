/**
 * Real-world wiring for words-setup.ts (Settings → Wiederherstellungswörter). Load DYNAMICALLY:
 * it pulls in the native passkey module.
 *
 * Fingerprints: the op's own assertion also evaluates the PRF (webauthn.ts), and that PRF is kept
 * for this one flow, so the `wvk` wrap costs no extra prompt; the backup write's proof is the
 * second (and last) one.
 */
import type { Address, Hex } from 'viem';
import { deviceSecretSources, keyBackupFor, wordsVaultKeyStorage } from './derived-keys-runtime';
import type { IdentityMode } from './guardian-plan';
import { readGuardianState, readIdentityMode, recoveryStorage, sendOwnSafeOp } from './guardians-runtime';
import type { KeyBackupSlot } from './key-backup';
import type { MigrationRecord } from './migration';
import { unwrapSecret, wrapSecret } from './prf-vault';
import type { PasskeySession } from './session';
import { getPrfSecret, signWithPasskey } from './webauthn';
import type { WordsSetupDeps } from './words-setup';

/** The sponsor mode for the words op (null = not possible right now, e.g. not yet connected). */
export const wordsIdentityMode = (record: MigrationRecord): Promise<IdentityMode | null> => readIdentityMode(record).catch(() => null);

export function createWordsSetupDeps(record: MigrationRecord, session: PasskeySession, mode: IdentityMode): WordsSetupDeps {
  let prf: Hex | null | undefined;
  const capture = async (credentialId: string, challenge: Hex) => {
    const a = await signWithPasskey(credentialId, challenge);
    // The same passkey always answers the same way: no PRF here = no PRF on this authenticator
    // (null, so the words backup writes the off marker instead of asking again).
    prf = a.prf ?? null;
    return a;
  };
  return {
    storage: recoveryStorage,
    vaultStorage: wordsVaultKeyStorage,
    readState: (safe: Address) => readGuardianState(safe),
    sendOp: (calls) => sendOwnSafeOp(record, mode, calls, { sign: capture }),
    deviceSecrets: async () => {
      const out: { slot: KeyBackupSlot; secret: Uint8Array }[] = [];
      for (const s of deviceSecretSources(session.identity)) {
        const secret = await s.loadLocal().catch(() => null);
        if (secret && secret.length > 0) out.push({ slot: s.slot, secret });
      }
      return out;
    },
    remote: keyBackupFor(session),
    getPrf: async () => {
      if (prf === undefined) prf = await getPrfSecret(session.credentialId);
      return prf;
    },
    wrap: wrapSecret,
    unwrap: unwrapSecret,
    now: () => Date.now(),
  };
}
