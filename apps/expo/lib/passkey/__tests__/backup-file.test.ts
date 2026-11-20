import { execFileSync } from 'node:child_process';
import { createCipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_MESSAGE,
  BACKUP_ITERATIONS,
  BACKUP_MIN_PASSWORD_LENGTH,
  BACKUP_PASSWORD_MESSAGE,
  BACKUP_VERSION,
  BackupFormatError,
  BackupPasswordError,
  backupFileName,
  decryptBackup,
  encryptBackup,
  parseBackupFile,
  passwordProblem,
  type Pbkdf2,
} from '../backup-file';
import v from './backup-file-vector.json';

jest.setTimeout(60_000);

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const pbkdf2: Pbkdf2 = async (p, s, i, l) => new Uint8Array(pbkdf2Sync(p, s, i, l, 'sha256'));
const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));
/** Serves the salt on the first call (16 bytes) and the IV on the second (12 bytes). */
const fixed = (saltHex: string, ivHex: string) => {
  const queue = [hex(saltHex), hex(ivHex)];
  return (n: number) => {
    const next = queue.shift();
    if (!next || next.length !== n) throw new Error(`unexpected random(${n})`);
    return next;
  };
};
const fileText = JSON.stringify(v.file);

let tmpDir: string;
let VECTOR_FILE_PATH: string;
beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'backup-file-'));
  VECTOR_FILE_PATH = path.join(tmpDir, 'roebel-konto-backup-2026-11-17.json');
  writeFileSync(VECTOR_FILE_PATH, fileText);
});
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe('account backup file', () => {
  it('exposes the documented constants', () => {
    expect(BACKUP_FORMAT).toBe('ortis-account-backup');
    expect(BACKUP_VERSION).toBe(1);
    expect(BACKUP_ITERATIONS).toBe(600_000);
    expect(BACKUP_MIN_PASSWORD_LENGTH).toBe(10);
    expect(BACKUP_FORMAT_MESSAGE).toBe('Das ist keine Backup-Datei aus dieser App.');
    expect(BACKUP_PASSWORD_MESSAGE).toBe('Das Passwort stimmt nicht.');
  });

  it('reproduces the independent vector byte for byte', async () => {
    const text = await encryptBackup(v.phrase, v.password, {
      pbkdf2,
      random: fixed(v.saltHex, v.ivHex),
      now: () => new Date('2026-11-17T10:00:00.000Z'),
    });
    expect(JSON.parse(text)).toEqual(v.file);
  });

  it('opens the vector file', async () =>
    expect(await decryptBackup(fileText, v.password, { pbkdf2 })).toBe(v.phrase));

  it('a wrong password is a password error, not a format error', async () => {
    const err = await decryptBackup(fileText, 'Müritz-Hecht-2025', { pbkdf2 }).catch((e) => e);
    expect(err).toBeInstanceOf(BackupPasswordError);
    expect(err).not.toBeInstanceOf(BackupFormatError);
    expect(err.message).toBe(BACKUP_PASSWORD_MESSAGE);
    expect(err.message).not.toContain(v.phrase.split(' ')[11]);
  });

  it('the password is NFKC-normalised: composed and decomposed ü open the same file', async () => {
    const decomposed = 'Müritz-Hecht-2026';
    expect(decomposed).not.toBe(v.password);
    expect(decomposed.normalize('NFKC')).toBe(v.password);
    expect(await decryptBackup(fileText, decomposed, { pbkdf2 })).toBe(v.phrase);
  });

  it('refuses what is not ours, before deriving any key', async () => {
    const spy = jest.fn(pbkdf2);
    const photo = 'ÿØÿà\u0000\u0010JFIF\u0000\u0001';
    for (const text of [
      '',
      'not json',
      photo,
      '{}',
      '[]',
      'null',
      JSON.stringify({ name: 'some other app', data: 'x' }),
      JSON.stringify({ ...v.file, format: 'x' }),
      JSON.stringify({ ...v.file, version: 2 }),
      JSON.stringify({ ...v.file, kind: 'bip39-24' }),
      JSON.stringify({ ...v.file, kdf: { ...v.file.kdf, name: 'scrypt' } }),
      JSON.stringify({ ...v.file, cipher: { ...v.file.cipher, name: 'aes-128-gcm' } }),
      JSON.stringify({ ...v.file, kdf: { ...v.file.kdf, iterations: 10 } }),
      JSON.stringify({ ...v.file, kdf: { ...v.file.kdf, iterations: 1e9 } }),
      JSON.stringify({ ...v.file, kdf: { ...v.file.kdf, iterations: 600000.5 } }),
      JSON.stringify({ ...v.file, kdf: { ...v.file.kdf, salt: 'AQID' } }),
      JSON.stringify({ ...v.file, cipher: { ...v.file.cipher, iv: 'AQIDBAUGBwgJCgsMDQ4PEA' } }),
      JSON.stringify({ ...v.file, ciphertext: 'AQID' }),
      JSON.stringify({ ...v.file, ciphertext: 42 }),
      'x'.repeat(20_000),
      JSON.stringify({ ...v.file, padding: 'x'.repeat(17_000) }),
    ]) {
      const err = await decryptBackup(text, v.password, { pbkdf2: spy }).catch((e) => e);
      expect(err).toBeInstanceOf(BackupFormatError);
      expect(err.message).toBe(BACKUP_FORMAT_MESSAGE);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('parseBackupFile accepts the vector and refuses a future version', () => {
    expect(parseBackupFile(fileText)).toMatchObject({ format: BACKUP_FORMAT, version: 1 });
    expect(() => parseBackupFile(JSON.stringify({ ...v.file, version: 2 }))).toThrow(BackupFormatError);
  });

  it('a tampered ciphertext does not open; a changed AAD label is a format error', async () => {
    const flipped = {
      ...v.file,
      ciphertext: v.file.ciphertext.replace(/^./, (c: string) => (c === 'A' ? 'B' : 'A')),
    };
    await expect(decryptBackup(JSON.stringify(flipped), v.password, { pbkdf2 })).rejects.toBeInstanceOf(
      BackupPasswordError,
    );
    const relabelled = { ...v.file, cipher: { ...v.file.cipher, aad: 'something-else' } };
    await expect(decryptBackup(JSON.stringify(relabelled), v.password, { pbkdf2 })).rejects.toBeInstanceOf(
      BackupFormatError,
    );
  });

  it('a file that opens but holds no valid phrase is a format error', async () => {
    const random = fixed(v.saltHex, v.ivHex);
    // Build a well-formed file around non-phrase plaintext through the same KDF + cipher.
    const key = pbkdf2Sync(Buffer.from(v.password, 'utf8'), random(16), 600_000, 32, 'sha256');
    const c = createCipheriv('aes-256-gcm', key, random(12));
    c.setAAD(Buffer.from('ortis-account-backup/v1'));
    const ct = Buffer.concat([c.update(Buffer.from('hello world')), c.final(), c.getAuthTag()]);
    const bad = { ...v.file, ciphertext: ct.toString('base64url') };
    await expect(decryptBackup(JSON.stringify(bad), v.password, { pbkdf2 })).rejects.toBeInstanceOf(
      BackupFormatError,
    );
  });

  it('refuses to encrypt a phrase that is not 12 valid words', async () => {
    const deps = { pbkdf2: jest.fn(pbkdf2), random: fixed(v.saltHex, v.ivHex), now: () => new Date() };
    await expect(encryptBackup('test test test', v.password, deps)).rejects.toThrow();
    await expect(encryptBackup('test '.repeat(12).trim(), v.password, deps)).rejects.toThrow();
    expect(deps.pbkdf2).not.toHaveBeenCalled();
  });

  it('stores the phrase normalised: lower-case, single spaces', async () => {
    const text = await encryptBackup(`  ${v.phrase.toUpperCase().replace(/ /g, '   ')} `, v.password, {
      pbkdf2,
      random: fixed(v.saltHex, v.ivHex),
      now: () => new Date('2026-11-17T10:00:00.000Z'),
    });
    expect(JSON.parse(text)).toEqual(v.file);
  });

  it('the file names no account and holds no word in the clear', async () => {
    const text = await encryptBackup(v.phrase, v.password, {
      pbkdf2,
      random: fixed(v.saltHex, v.ivHex),
      now: () => new Date(),
    });
    expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(text).not.toContain('junk');
    expect(text).not.toContain('test test');
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(
      ['cipher', 'ciphertext', 'createdAt', 'format', 'kdf', 'kind', 'version'].sort(),
    );
  });

  it('password rules', () => {
    expect(passwordProblem('kurz', 'kurz')).toBe('Das Passwort braucht mindestens 10 Zeichen.');
    expect(passwordProblem('lang-genug-1', 'lang-genug-2')).toBe('Die beiden Passwörter sind nicht gleich.');
    expect(passwordProblem('lang-genug-1', 'lang-genug-1')).toBeNull();
    // Composed and decomposed forms are the same password.
    expect(passwordProblem('Müritz-Hecht', 'Müritz-Hecht')).toBeNull();
  });

  it('names the file by the UTC date', () => {
    expect(backupFileName(new Date('2026-11-17T10:00:00.000Z'))).toBe('roebel-konto-backup-2026-11-17.json');
    expect(backupFileName(new Date('2026-01-05T23:59:59.000Z'))).toBe('roebel-konto-backup-2026-01-05.json');
  });

  it('the standalone script opens the vector file', () => {
    const out = execFileSync(
      'node',
      [path.join(REPO_ROOT, 'scripts/decrypt-account-backup.mjs'), VECTOR_FILE_PATH, v.password],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe(v.phrase);
  });

  it('the standalone script normalises the password and refuses a wrong one', () => {
    const script = path.join(REPO_ROOT, 'scripts/decrypt-account-backup.mjs');
    const out = execFileSync('node', [script, VECTOR_FILE_PATH, 'Müritz-Hecht-2026'], { encoding: 'utf8' });
    expect(out.trim()).toBe(v.phrase);
    expect(() =>
      execFileSync('node', [script, VECTOR_FILE_PATH, 'Müritz-Hecht-2025'], { encoding: 'utf8', stdio: 'pipe' }),
    ).toThrow();
  });
});
