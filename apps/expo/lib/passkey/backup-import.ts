/**
 * "Backup-Datei öffnen" (expert path): sign in with the 12 words inside an encrypted backup file.
 *
 * Order: `checkBackupFile` right after the pick (format only, no password, no key derivation), so
 * a file that is not ours is refused before the password field even appears → password →
 * `signInFromBackup`: decrypt (decryptBackup re-runs the same `parseBackupFile` checks before any
 * PBKDF2 work) → `signIn` with the words (words-account `signInWithWords`, which validates them
 * again and stores them behind the device unlock) → on `signedIn` the backup counts as exported:
 * the file exists, so it is a way back for the words now stored (ruling B1).
 *
 * The decrypted phrase lives only in this call's scope and is handed to `signIn`, never returned,
 * stored elsewhere or logged. Pure: PBKDF2 and the sign-in are injected.
 */
import {
  BACKUP_FORMAT_MESSAGE,
  BACKUP_PASSWORD_MESSAGE,
  BackupFormatError,
  BackupPasswordError,
  decryptBackup,
  parseBackupFile,
  type Pbkdf2,
} from './backup-file';
import { WORDS_FAILED_MESSAGE, type WordsResult } from './words-account';

export type BackupCheck = { ok: true } | { ok: false; message: string };

/** The format checks of `decryptBackup`, without a password: the password field appears only for a real backup file. */
export function checkBackupFile(content: string): BackupCheck {
  try {
    parseBackupFile(content);
    return { ok: true };
  } catch {
    return { ok: false, message: BACKUP_FORMAT_MESSAGE };
  }
}

export type BackupImportDeps = {
  pbkdf2: Pbkdf2;
  /** words-account `signInWithWords` with its deps bound. */
  signIn: (phrase: string) => Promise<WordsResult>;
  /** PhraseStore.markBackupExported: called only after `signIn` returned `signedIn` (the words are stored by then). */
  markExported: () => Promise<void>;
  /** Called after the file is decrypted, before the (network) sign-in: "Konto wird gesucht …". */
  onOpened?: () => void;
};

export async function signInFromBackup(p: { content: string; password: string }, deps: BackupImportDeps): Promise<WordsResult> {
  let result: WordsResult;
  try {
    let phrase: string | null = await decryptBackup(p.content, p.password, { pbkdf2: deps.pbkdf2 });
    deps.onOpened?.();
    try {
      result = await deps.signIn(phrase);
    } finally {
      phrase = null;
    }
  } catch (e) {
    if (e instanceof BackupFormatError) return { status: 'error', message: BACKUP_FORMAT_MESSAGE };
    if (e instanceof BackupPasswordError) return { status: 'error', message: BACKUP_PASSWORD_MESSAGE };
    return { status: 'error', message: WORDS_FAILED_MESSAGE };
  }
  if (result.status === 'signedIn') {
    // Best effort: a failed flag write only means the app may remind about a backup again.
    await deps.markExported().catch(() => undefined);
  }
  return result;
}
