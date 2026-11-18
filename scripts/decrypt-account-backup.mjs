#!/usr/bin/env node
// Opens a Röbel/Ortis account backup file without the app.
//
//   node scripts/decrypt-account-backup.mjs <file> <password>
//
// Prints the 12 recovery words. Uses node:crypto only and imports nothing from this repo,
// so it can be copied out and run anywhere with Node.js >= 16.
// Format: docs/ACCOUNT_BACKUP_FILE_FORMAT.md
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [, , filePath, password] = process.argv;
if (!filePath || password === undefined) fail('usage: node decrypt-account-backup.mjs <file> <password>');

let file;
try {
  file = JSON.parse(readFileSync(filePath, 'utf8'));
} catch {
  fail('not a backup file: cannot read it as JSON');
}
if (
  !file ||
  file.format !== 'ortis-account-backup' ||
  file.version !== 1 ||
  file.kind !== 'bip39-12' ||
  file.kdf?.name !== 'pbkdf2-hmac-sha256' ||
  file.cipher?.name !== 'aes-256-gcm' ||
  file.cipher?.aad !== 'ortis-account-backup/v1'
) {
  fail('not a version-1 account backup file');
}
const iterations = file.kdf.iterations;
if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 10_000_000) {
  fail('not a version-1 account backup file: iterations out of range');
}
const salt = Buffer.from(file.kdf.salt, 'base64url');
const iv = Buffer.from(file.cipher.iv, 'base64url');
const data = Buffer.from(file.ciphertext, 'base64url');
if (salt.length !== 16 || iv.length !== 12 || data.length <= 16) {
  fail('not a version-1 account backup file: bad salt, IV or ciphertext length');
}

const key = pbkdf2Sync(Buffer.from(password.normalize('NFKC'), 'utf8'), salt, iterations, 32, 'sha256');
let words;
try {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(file.cipher.aad, 'utf8'));
  decipher.setAuthTag(data.subarray(data.length - 16));
  words = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8');
} catch {
  fail('wrong password (or the file was changed)');
}
process.stdout.write(`${words}\n`);
