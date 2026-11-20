import { pbkdf2Sync } from 'node:crypto';
import { BACKUP_FORMAT_MESSAGE, BACKUP_PASSWORD_MESSAGE, type Pbkdf2 } from '../backup-file';
import { checkBackupFile, signInFromBackup } from '../backup-import';
import type { PasskeySession } from '../session';
import { WORDS_FAILED_MESSAGE, type WordsResult } from '../words-account';
import v from './backup-file-vector.json';

jest.setTimeout(60_000);

const pbkdf2: Pbkdf2 = async (p, s, i, l) => new Uint8Array(pbkdf2Sync(p, s, i, l, 'sha256'));
const SIGNED_IN: WordsResult = { status: 'signedIn', session: { safe: '0x0000000000000000000000000000000000000001' } as unknown as PasskeySession };
const fileText = JSON.stringify(v.file);
const noop = async () => undefined;

describe('signInFromBackup', () => {
  it('opens the vector file and signs in with its words', async () => {
    const signIn = jest.fn(async () => SIGNED_IN);
    const markExported = jest.fn(noop);
    expect(await signInFromBackup({ content: fileText, password: v.password }, { pbkdf2, signIn, markExported })).toBe(SIGNED_IN);
    expect(signIn).toHaveBeenCalledWith(v.phrase);
    expect(markExported).toHaveBeenCalledTimes(1);
  });

  it('wrong password and foreign file read differently, and neither signs in', async () => {
    const signIn = jest.fn();
    const markExported = jest.fn(noop);
    expect(await signInFromBackup({ content: fileText, password: 'falsch-falsch' }, { pbkdf2, signIn, markExported })).toEqual({
      status: 'error',
      message: 'Das Passwort stimmt nicht.',
    });
    expect(await signInFromBackup({ content: '{"hello":1}', password: v.password }, { pbkdf2, signIn, markExported })).toEqual({
      status: 'error',
      message: 'Das ist keine Backup-Datei aus dieser App.',
    });
    expect(signIn).not.toHaveBeenCalled();
    expect(markExported).not.toHaveBeenCalled();
  });

  it('refuses a foreign file before any key derivation', async () => {
    const slow = jest.fn(pbkdf2);
    const onOpened = jest.fn();
    const r = await signInFromBackup({ content: '', password: v.password }, { pbkdf2: slow, signIn: jest.fn(), markExported: noop, onOpened });
    expect(r).toEqual({ status: 'error', message: BACKUP_FORMAT_MESSAGE });
    expect(slow).not.toHaveBeenCalled();
    expect(onOpened).not.toHaveBeenCalled();
  });

  it('marks the export only after a sign-in, never for any other result', async () => {
    const others: WordsResult[] = [
      { status: 'cancelled' },
      { status: 'recoveryWords', message: 'x', route: '/passkey/restore' },
      { status: 'error', message: 'x', reason: 'overwrite' },
      { status: 'error', message: 'x' },
    ];
    for (const result of others) {
      const markExported = jest.fn(noop);
      expect(await signInFromBackup({ content: fileText, password: v.password }, { pbkdf2, signIn: async () => result, markExported })).toBe(result);
      expect(markExported).not.toHaveBeenCalled();
    }
  });

  it('calls onOpened after decrypting, before the sign-in', async () => {
    const order: string[] = [];
    await signInFromBackup(
      { content: fileText, password: v.password },
      {
        pbkdf2,
        onOpened: () => order.push('opened'),
        signIn: async () => {
          order.push('signIn');
          return SIGNED_IN;
        },
        markExported: async () => {
          order.push('marked');
        },
      },
    );
    expect(order).toEqual(['opened', 'signIn', 'marked']);
  });

  it('a failing flag write does not undo the sign-in', async () => {
    const r = await signInFromBackup(
      { content: fileText, password: v.password },
      { pbkdf2, signIn: async () => SIGNED_IN, markExported: async () => Promise.reject(new Error('store')) },
    );
    expect(r).toBe(SIGNED_IN);
  });

  it('a failing key derivation or sign-in is a generic error, not a password or format message', async () => {
    const broken: Pbkdf2 = async () => Promise.reject(new Error('native'));
    expect(await signInFromBackup({ content: fileText, password: v.password }, { pbkdf2: broken, signIn: jest.fn(), markExported: noop })).toEqual({
      status: 'error',
      message: WORDS_FAILED_MESSAGE,
    });
    const throwing = async () => Promise.reject(new Error('boom'));
    expect(await signInFromBackup({ content: fileText, password: v.password }, { pbkdf2, signIn: throwing, markExported: noop })).toEqual({
      status: 'error',
      message: WORDS_FAILED_MESSAGE,
    });
  });
});

describe('checkBackupFile', () => {
  it('checkBackupFile refuses a foreign file without a password', () => {
    expect(checkBackupFile('{"hello":1}')).toEqual({ ok: false, message: 'Das ist keine Backup-Datei aus dieser App.' });
    expect(checkBackupFile(JSON.stringify(v.file))).toEqual({ ok: true });
  });

  it('refuses empty, non-JSON and future-version files', () => {
    for (const text of ['', 'PNG\u0000\u0001', 'null', JSON.stringify({ ...v.file, version: 2 })]) {
      expect(checkBackupFile(text)).toEqual({ ok: false, message: BACKUP_FORMAT_MESSAGE });
    }
  });

  it('never says "falsches Passwort" for a format problem', () => {
    const r = checkBackupFile(JSON.stringify({ ...v.file, ciphertext: 'AA' }));
    expect(r).toEqual({ ok: false, message: BACKUP_FORMAT_MESSAGE });
    expect(r).not.toEqual({ ok: false, message: BACKUP_PASSWORD_MESSAGE });
  });
});
