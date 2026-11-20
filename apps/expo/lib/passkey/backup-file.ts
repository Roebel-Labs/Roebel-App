/**
 * Encrypted backup file of the 12 recovery words. Pure; the PBKDF2 implementation and the
 * randomness are injected (native in the app, node:crypto under jest).
 *
 * The format is public and documented in docs/ACCOUNT_BACKUP_FILE_FORMAT.md, so a backup
 * can be opened without this app (scripts/decrypt-account-backup.mjs). The file holds the
 * encrypted phrase and nothing that identifies the account: no address, no name.
 *
 * Key = PBKDF2-HMAC-SHA256(NFKC(password) as UTF-8, salt, iterations, 32 bytes).
 * AES-256-GCM, 12-byte IV, AAD = UTF-8 of "ortis-account-backup/v1", ciphertext ++ 16-byte tag.
 * Never log the password, the phrase or the derived key.
 */
import { gcm } from '@noble/ciphers/aes';
import { base64UrlDecode, base64UrlEncode, utf8Decode, utf8Encode } from './encoding';
import { validatePhrase } from './words';

export const BACKUP_FORMAT = 'ortis-account-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_KIND = 'bip39-12';
export const BACKUP_KDF = 'pbkdf2-hmac-sha256';
export const BACKUP_CIPHER = 'aes-256-gcm';
export const BACKUP_AAD = 'ortis-account-backup/v1';
export const BACKUP_ITERATIONS = 600_000;
export const BACKUP_MIN_ITERATIONS = 100_000;
export const BACKUP_MAX_ITERATIONS = 10_000_000;
export const BACKUP_MIN_PASSWORD_LENGTH = 10;
export const BACKUP_MAX_FILE_BYTES = 16 * 1024;

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export const BACKUP_FORMAT_MESSAGE = 'Das ist keine Backup-Datei aus dieser App.';
export const BACKUP_PASSWORD_MESSAGE = 'Das Passwort stimmt nicht.';

export type Pbkdf2 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
) => Promise<Uint8Array>;

/** The file is not a backup this app can open. `reason` is a non-secret hint for debugging. */
export class BackupFormatError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(BACKUP_FORMAT_MESSAGE);
    this.name = 'BackupFormatError';
    this.reason = reason;
  }
}

/** The file is well-formed but the GCM tag does not verify: wrong password (or a tampered file). */
export class BackupPasswordError extends Error {
  constructor() {
    super(BACKUP_PASSWORD_MESSAGE);
    this.name = 'BackupPasswordError';
  }
}

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  kind: typeof BACKUP_KIND;
  kdf: { name: typeof BACKUP_KDF; iterations: number; salt: string };
  cipher: { name: typeof BACKUP_CIPHER; iv: string; aad: typeof BACKUP_AAD };
  ciphertext: string;
  createdAt: string;
};

/** A parsed file with its binary fields decoded. */
export type ParsedBackupFile = BackupFile & {
  saltBytes: Uint8Array;
  ivBytes: Uint8Array;
  ciphertextBytes: Uint8Array;
};

function normalisePassword(password: string): string {
  return password.normalize('NFKC');
}

export function passwordProblem(password: string, repeat: string): string | null {
  const p = normalisePassword(password);
  if ([...p].length < BACKUP_MIN_PASSWORD_LENGTH) return 'Das Passwort braucht mindestens 10 Zeichen.';
  if (p !== normalisePassword(repeat)) return 'Die beiden Passwörter sind nicht gleich.';
  return null;
}

export function backupFileName(now: Date): string {
  return `roebel-konto-backup-${now.toISOString().slice(0, 10)}.json`;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function decodeField(value: unknown, field: string): Uint8Array {
  if (typeof value !== 'string' || !BASE64URL.test(value)) throw new BackupFormatError(`${field} not base64url`);
  try {
    return base64UrlDecode(value);
  } catch {
    throw new BackupFormatError(`${field} not base64url`);
  }
}

/**
 * Every format check, without a password and without any key derivation. Used by
 * `decryptBackup` and by the pre-check before the password prompt, so the two never drift.
 */
export function parseBackupFile(text: string): ParsedBackupFile {
  if (typeof text !== 'string' || text.length === 0) throw new BackupFormatError('empty');
  if (text.length > BACKUP_MAX_FILE_BYTES || utf8Encode(text).length > BACKUP_MAX_FILE_BYTES) {
    throw new BackupFormatError('too large');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFormatError('not json');
  }
  if (!isObject(raw)) throw new BackupFormatError('not an object');
  if (raw.format !== BACKUP_FORMAT) throw new BackupFormatError('format');
  if (raw.version !== BACKUP_VERSION) throw new BackupFormatError('version');
  if (raw.kind !== BACKUP_KIND) throw new BackupFormatError('kind');
  const { kdf, cipher } = raw;
  if (!isObject(kdf) || kdf.name !== BACKUP_KDF) throw new BackupFormatError('kdf');
  const iterations = kdf.iterations;
  if (
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < BACKUP_MIN_ITERATIONS ||
    iterations > BACKUP_MAX_ITERATIONS
  ) {
    throw new BackupFormatError('iterations');
  }
  if (!isObject(cipher) || cipher.name !== BACKUP_CIPHER) throw new BackupFormatError('cipher');
  if (cipher.aad !== BACKUP_AAD) throw new BackupFormatError('aad');
  const saltBytes = decodeField(kdf.salt, 'salt');
  if (saltBytes.length !== SALT_LENGTH) throw new BackupFormatError('salt length');
  const ivBytes = decodeField(cipher.iv, 'iv');
  if (ivBytes.length !== IV_LENGTH) throw new BackupFormatError('iv length');
  const ciphertextBytes = decodeField(raw.ciphertext, 'ciphertext');
  if (ciphertextBytes.length <= TAG_LENGTH) throw new BackupFormatError('ciphertext length');
  if (typeof raw.createdAt !== 'string') throw new BackupFormatError('createdAt');
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind: BACKUP_KIND,
    kdf: { name: BACKUP_KDF, iterations, salt: kdf.salt as string },
    cipher: { name: BACKUP_CIPHER, iv: cipher.iv as string, aad: BACKUP_AAD },
    ciphertext: raw.ciphertext as string,
    createdAt: raw.createdAt,
    saltBytes,
    ivBytes,
    ciphertextBytes,
  };
}

export async function encryptBackup(
  phrase: string,
  password: string,
  deps: { pbkdf2: Pbkdf2; random: (n: number) => Uint8Array; now: () => Date },
): Promise<string> {
  const check = validatePhrase(phrase);
  if (!check.ok) throw new Error('backup: phrase is not 12 valid words');
  // Order is part of the test vector: salt first, then IV.
  const salt = deps.random(SALT_LENGTH);
  const iv = deps.random(IV_LENGTH);
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH) throw new Error('backup: bad random length');
  const key = await deps.pbkdf2(utf8Encode(normalisePassword(password)), salt, BACKUP_ITERATIONS, KEY_LENGTH);
  let ct: Uint8Array;
  try {
    ct = gcm(key, iv, utf8Encode(BACKUP_AAD)).encrypt(utf8Encode(check.phrase));
  } finally {
    key.fill(0);
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind: BACKUP_KIND,
    kdf: { name: BACKUP_KDF, iterations: BACKUP_ITERATIONS, salt: base64UrlEncode(salt) },
    cipher: { name: BACKUP_CIPHER, iv: base64UrlEncode(iv), aad: BACKUP_AAD },
    ciphertext: base64UrlEncode(ct),
    createdAt: deps.now().toISOString(),
  };
  return JSON.stringify(file, null, 2);
}

export async function decryptBackup(
  fileText: string,
  password: string,
  deps: { pbkdf2: Pbkdf2 },
): Promise<string> {
  const file = parseBackupFile(fileText);
  const key = await deps.pbkdf2(
    utf8Encode(normalisePassword(password)),
    file.saltBytes,
    file.kdf.iterations,
    KEY_LENGTH,
  );
  let plain: Uint8Array;
  try {
    plain = gcm(key, file.ivBytes, utf8Encode(BACKUP_AAD)).decrypt(file.ciphertextBytes);
  } catch {
    throw new BackupPasswordError();
  } finally {
    key.fill(0);
  }
  const check = validatePhrase(utf8Decode(plain));
  plain.fill(0);
  if (!check.ok) throw new BackupFormatError('content');
  return check.phrase;
}
