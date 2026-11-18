/**
 * "Backup-Datei speichern" (expert account): the stored 12 words as an encrypted backup file.
 *
 * Order: password rules → ONE device unlock (`phrase.read`) → encrypt → share sheet → on 'shared'
 * remember the export (a way back, spec 5.4). A weak password never reaches the unlock; a cancelled
 * unlock or a dismissed sheet marks nothing. The share step (backup-file-native) writes ciphertext
 * only to a temp file and deletes it whatever the outcome.
 *
 * Pure: every native piece is injected, and backup-file-native is imported as a type only, so this
 * module loads on a binary without the share module. Never log the password or the phrase.
 */
import { isAddressEqual, type Address } from 'viem';
import { backupFileName, encryptBackup, passwordProblem, type Pbkdf2 } from './backup-file';
import type { shareBackupFile } from './backup-file-native';
import { PHRASE_MISMATCH_MESSAGE, PHRASE_PROMPT, PhraseCancelledError, PhraseUnavailableError, type PhraseStore } from './phrase-store';
import { validatePhrase, wordAccount } from './words';

export const BACKUP_EXPORT_FAILED_MESSAGE = 'Die Datei konnte nicht gespeichert werden. Bitte versuche es erneut.';

export type ExportBackupDeps = {
  phrase: Pick<PhraseStore, 'read' | 'markBackupExported'>;
  pbkdf2: Pbkdf2;
  random: (n: number) => Uint8Array;
  now: () => Date;
  share: typeof shareBackupFile;
  /** The session's owner: words of another account are never exported for this one. */
  owner?: Address | null;
  /** Called after the unlock, before the (slow) key derivation: "Datei wird verschlüsselt …". */
  onEncrypting?: () => void;
};

export type ExportBackupResult = { status: 'shared' } | { status: 'dismissed' } | { status: 'error'; message: string };

const isCancel = (e: unknown) => e instanceof PhraseCancelledError || /cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * Throws PhraseUnavailableError (the stored words are gone or invalidated: ask for them again);
 * every other failure is a result.
 */
export async function exportBackup(p: { password: string; repeat: string }, deps: ExportBackupDeps): Promise<ExportBackupResult> {
  const problem = passwordProblem(p.password, p.repeat);
  if (problem) return { status: 'error', message: problem };

  let phrase: string;
  try {
    phrase = await deps.phrase.read(PHRASE_PROMPT);
  } catch (e) {
    if (e instanceof PhraseUnavailableError) throw e;
    if (isCancel(e)) return { status: 'dismissed' };
    return { status: 'error', message: BACKUP_EXPORT_FAILED_MESSAGE };
  }

  const check = validatePhrase(phrase);
  if (!check.ok) throw new PhraseUnavailableError();
  if (deps.owner && !isAddressEqual(wordAccount(check.phrase, 0).address, deps.owner)) {
    return { status: 'error', message: PHRASE_MISMATCH_MESSAGE };
  }

  let outcome: 'shared' | 'dismissed';
  try {
    deps.onEncrypting?.();
    const content = await encryptBackup(check.phrase, p.password, { pbkdf2: deps.pbkdf2, random: deps.random, now: deps.now });
    outcome = await deps.share({ fileName: backupFileName(deps.now()), content });
  } catch {
    return { status: 'error', message: BACKUP_EXPORT_FAILED_MESSAGE };
  }
  if (outcome !== 'shared') return { status: 'dismissed' };

  try {
    await deps.phrase.markBackupExported();
  } catch {
    return { status: 'error', message: BACKUP_EXPORT_FAILED_MESSAGE };
  }
  return { status: 'shared' };
}
