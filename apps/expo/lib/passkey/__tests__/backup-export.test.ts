import { pbkdf2Sync } from 'node:crypto';
import { getAddress } from 'viem';
import { decryptBackup, type Pbkdf2 } from '../backup-file';
import { BACKUP_EXPORT_FAILED_MESSAGE, exportBackup, type ExportBackupDeps } from '../backup-export';
import { shareBackupFile, type BackupFs } from '../backup-file-native';
import { PHRASE_MISMATCH_MESSAGE, PHRASE_PROMPT, PhraseCancelledError, PhraseUnavailableError } from '../phrase-store';

jest.setTimeout(60_000);

const JUNK = 'test test test test test test test test test test test junk';
const JUNK_OWNER = getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
const OTHER_OWNER = getAddress('0x1111111111111111111111111111111111111111');
const pbkdf2: Pbkdf2 = async (p, s, i, l) => new Uint8Array(pbkdf2Sync(p, s, i, l, 'sha256'));
const random = (n: number) => {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
};

type TestDeps = ExportBackupDeps & {
  phrase: { read: jest.Mock; markBackupExported: jest.Mock };
  share: jest.Mock;
};

function deps(o: Partial<ExportBackupDeps> = {}): TestDeps {
  return {
    phrase: { read: jest.fn(async () => JUNK), markBackupExported: jest.fn(async () => undefined) },
    pbkdf2,
    random,
    now: () => new Date('2026-11-17T10:00:00Z'),
    share: jest.fn(async () => 'shared' as const),
    ...o,
  } as TestDeps;
}

const GOOD = { password: 'lang-genug-1', repeat: 'lang-genug-1' };

describe('exportBackup', () => {
  it('one device unlock, an encrypted file is shared, the export is remembered', async () => {
    const d = deps();
    expect(await exportBackup(GOOD, d)).toEqual({ status: 'shared' });
    expect(d.phrase.read).toHaveBeenCalledTimes(1);
    expect(d.phrase.read).toHaveBeenCalledWith(PHRASE_PROMPT);
    expect(d.share.mock.calls[0][0].fileName).toMatch(/^roebel-konto-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await decryptBackup(d.share.mock.calls[0][0].content, 'lang-genug-1', { pbkdf2 })).toBe(JUNK);
    expect(d.phrase.markBackupExported).toHaveBeenCalledTimes(1);
  });

  it('the shared file holds ciphertext only: no phrase, no password, no address', async () => {
    const d = deps({ owner: JUNK_OWNER });
    await exportBackup(GOOD, d);
    const content: string = d.share.mock.calls[0][0].content;
    expect(content).not.toContain('junk');
    expect(content).not.toContain('lang-genug-1');
    expect(content.toLowerCase()).not.toContain(JUNK_OWNER.slice(2).toLowerCase());
  });

  it('a weak password never reaches the device unlock', async () => {
    const d = deps();
    expect(await exportBackup({ password: 'kurz', repeat: 'kurz' }, d)).toEqual({
      status: 'error',
      message: 'Das Passwort braucht mindestens 10 Zeichen.',
    });
    expect(d.phrase.read).not.toHaveBeenCalled();
  });

  it('two different passwords never reach the device unlock', async () => {
    const d = deps();
    expect(await exportBackup({ password: 'lang-genug-1', repeat: 'lang-genug-2' }, d)).toEqual({
      status: 'error',
      message: 'Die beiden Passwörter sind nicht gleich.',
    });
    expect(d.phrase.read).not.toHaveBeenCalled();
  });

  it('a dismissed share sheet marks nothing', async () => {
    const d = deps({ share: jest.fn(async () => 'dismissed' as const) });
    expect(await exportBackup(GOOD, d)).toEqual({ status: 'dismissed' });
    expect(d.phrase.markBackupExported).not.toHaveBeenCalled();
  });

  it('a cancelled device unlock is "dismissed": nothing encrypted, shared or marked', async () => {
    const d = deps({ pbkdf2: jest.fn(pbkdf2) });
    d.phrase.read.mockRejectedValueOnce(new PhraseCancelledError());
    expect(await exportBackup(GOOD, d)).toEqual({ status: 'dismissed' });
    expect(d.pbkdf2).not.toHaveBeenCalled();
    expect(d.share).not.toHaveBeenCalled();
    expect(d.phrase.markBackupExported).not.toHaveBeenCalled();
  });

  it('unreadable words are rethrown (the screen asks for them again); nothing shared', async () => {
    const d = deps();
    d.phrase.read.mockRejectedValueOnce(new PhraseUnavailableError());
    await expect(exportBackup(GOOD, d)).rejects.toBeInstanceOf(PhraseUnavailableError);
    expect(d.share).not.toHaveBeenCalled();
  });

  it('words of another account are never exported for this one', async () => {
    const d = deps({ owner: OTHER_OWNER });
    expect(await exportBackup(GOOD, d)).toEqual({ status: 'error', message: PHRASE_MISMATCH_MESSAGE });
    expect(d.share).not.toHaveBeenCalled();
    expect(d.phrase.markBackupExported).not.toHaveBeenCalled();
    expect(await exportBackup(GOOD, deps({ owner: JUNK_OWNER }))).toEqual({ status: 'shared' });
  });

  it('a failing share is an error and marks nothing', async () => {
    const d = deps({ share: jest.fn(async () => { throw new Error('no cache directory'); }) });
    expect(await exportBackup(GOOD, d)).toEqual({ status: 'error', message: BACKUP_EXPORT_FAILED_MESSAGE });
    expect(d.phrase.markBackupExported).not.toHaveBeenCalled();
  });

  it('a flag that cannot be stored is reported, never a silent "shared"', async () => {
    const d = deps();
    d.phrase.markBackupExported.mockRejectedValueOnce(new Error('store'));
    expect(await exportBackup(GOOD, d)).toEqual({ status: 'error', message: BACKUP_EXPORT_FAILED_MESSAGE });
  });

  it('announces the slow key derivation only after the unlock', async () => {
    const order: string[] = [];
    const d = deps({ onEncrypting: () => order.push('encrypting') });
    d.phrase.read.mockImplementationOnce(async () => {
      order.push('unlock');
      return JUNK;
    });
    await exportBackup(GOOD, d);
    expect(order).toEqual(['unlock', 'encrypting']);
  });

  describe('Review Focus 4: with the real share step, the temp file is always deleted', () => {
    function nativeFakes(shareOutcome: 'ok' | 'reject' | 'writeFails') {
      const files = new Map<string, string>();
      const fs: BackupFs = {
        cacheDirectory: 'file:///cache/',
        writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
          if (shareOutcome === 'writeFails') throw new Error('disk full');
          files.set(uri, content);
        }),
        readAsStringAsync: jest.fn(async (uri: string) => files.get(uri) ?? ''),
        deleteAsync: jest.fn(async (uri: string) => {
          files.delete(uri);
        }),
        getInfoAsync: jest.fn(async () => ({ exists: false })),
      };
      const sharing = {
        shareAsync: jest.fn(async () => {
          if (shareOutcome === 'reject') throw new Error('User did not share');
        }),
      };
      const share = ((p: { fileName: string; content: string }) => shareBackupFile(p, { fs, sharing })) as typeof shareBackupFile;
      return { files, fs, sharing, share };
    }

    it('shared: marked once, the temp file is gone', async () => {
      const n = nativeFakes('ok');
      const d = deps({ share: n.share });
      expect(await exportBackup(GOOD, d)).toEqual({ status: 'shared' });
      expect(d.phrase.markBackupExported).toHaveBeenCalledTimes(1);
      expect(n.fs.deleteAsync).toHaveBeenCalledTimes(1);
      expect(n.files.size).toBe(0);
    });

    it('reported as dismissed: nothing marked, the temp file is gone', async () => {
      const n = nativeFakes('reject');
      const d = deps({ share: n.share });
      expect(await exportBackup(GOOD, d)).toEqual({ status: 'dismissed' });
      expect(d.phrase.markBackupExported).not.toHaveBeenCalled();
      expect(n.fs.deleteAsync).toHaveBeenCalledTimes(1);
      expect(n.files.size).toBe(0);
    });

    it('sharing fails: nothing marked, the temp file is still deleted', async () => {
      const n = nativeFakes('writeFails');
      const d = deps({ share: n.share });
      expect(await exportBackup(GOOD, d)).toEqual({ status: 'error', message: BACKUP_EXPORT_FAILED_MESSAGE });
      expect(d.phrase.markBackupExported).not.toHaveBeenCalled();
      expect(n.sharing.shareAsync).not.toHaveBeenCalled();
      expect(n.fs.deleteAsync).toHaveBeenCalledTimes(1);
      expect(n.files.size).toBe(0);
    });
  });
});
