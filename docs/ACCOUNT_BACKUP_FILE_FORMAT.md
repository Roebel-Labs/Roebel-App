# Account backup file format (version 1)

The Röbel app can export the 12 recovery words of an account as a password-encrypted file
(`roebel-konto-backup-YYYY-MM-DD.json`). This document describes that file completely, so
anyone can open a backup **without our app**: with the script in this repository, with
15 lines of Python, or in a browser.

The 12 words are a standard BIP-39 English mnemonic (no passphrase). The account key is the
one at derivation path `m/44'/60'/0'/0/0`, so the words work in any wallet that accepts a
12-word recovery phrase.

The file contains only the encrypted words. It holds no wallet address, no name, no e-mail and
nothing else that identifies the account.

Implementation: [`apps/expo/lib/passkey/backup-file.ts`](../apps/expo/lib/passkey/backup-file.ts).

## The file

UTF-8 JSON, one object, these keys (others are ignored):

```json
{
  "format": "ortis-account-backup",
  "version": 1,
  "kind": "bip39-12",
  "kdf": { "name": "pbkdf2-hmac-sha256", "iterations": 600000, "salt": "<base64url, 16 bytes>" },
  "cipher": { "name": "aes-256-gcm", "iv": "<base64url, 12 bytes>", "aad": "ortis-account-backup/v1" },
  "ciphertext": "<base64url of ciphertext ++ 16-byte tag>",
  "createdAt": "<ISO 8601 UTC>"
}
```

- **base64url** is RFC 4648 §5 without padding.
- **Key** = PBKDF2-HMAC-SHA256(password, salt, iterations, 32 bytes). The password is first
  Unicode-normalised to **NFKC** and then encoded as UTF-8, so an `ü` typed as one character
  or as `u` + combining diaeresis gives the same key.
- **Cipher**: AES-256-GCM with the 12-byte IV, a 128-bit tag appended to the ciphertext, and
  additional authenticated data = the UTF-8 bytes of `cipher.aad` (`ortis-account-backup/v1`).
- **Plaintext** = the 12 words, lower-case, separated by single spaces, UTF-8.
- `createdAt` is informational only.

### What the app refuses

The app checks the file before it asks for the password and refuses it as
"Das ist keine Backup-Datei aus dieser App." when any of these hold: the file is larger than
16 KB, is not JSON, `format` / `version` / `kind` differ from the values above, the KDF or cipher
name is unknown, `cipher.aad` is not `ortis-account-backup/v1`, `iterations` is not an integer
between 100 000 and 10 000 000, the salt is not 16 bytes, the IV is not 12 bytes, or the
ciphertext is not longer than the tag. A tag that does not verify reads as
"Das Passwort stimmt nicht." A file that decrypts but does not contain 12 valid BIP-39 words is
refused as not ours.

A future format will use a new `version`; version-1 readers refuse it.

## Open it with Node.js (this repository)

```bash
node scripts/decrypt-account-backup.mjs roebel-konto-backup-2026-11-17.json 'your password'
```

[`scripts/decrypt-account-backup.mjs`](../scripts/decrypt-account-backup.mjs) uses `node:crypto`
only (`pbkdf2Sync`, `createDecipheriv('aes-256-gcm')`) and imports nothing from this repository,
so it can be copied out on its own. It prints the 12 words.

Tip: a password on the command line lands in your shell history. Prefix the command with a
space (bash/zsh with `HISTCONTROL=ignorespace` / `setopt HIST_IGNORE_SPACE`) or clear the history
afterwards.

## Open it with Python

Needs `pip install cryptography`.

```python
import base64, hashlib, json, sys, unicodedata
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def b64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

f = json.load(open(sys.argv[1], encoding="utf-8"))
assert f["format"] == "ortis-account-backup" and f["version"] == 1
password = unicodedata.normalize("NFKC", sys.argv[2]).encode("utf-8")
key = hashlib.pbkdf2_hmac("sha256", password, b64url(f["kdf"]["salt"]),
                          f["kdf"]["iterations"], 32)
words = AESGCM(key).decrypt(b64url(f["cipher"]["iv"]), b64url(f["ciphertext"]),
                            f["cipher"]["aad"].encode("utf-8"))
print(words.decode("utf-8"))
```

`python3 decrypt.py roebel-konto-backup-2026-11-17.json 'your password'`

## Open it in a browser (WebCrypto)

Paste into the developer console of any modern browser (works offline), then call
`openBackup(fileText, password)` with the file's text.

```js
async function openBackup(fileText, password) {
  const f = JSON.parse(fileText);
  if (f.format !== 'ortis-account-backup' || f.version !== 1) throw new Error('not a v1 backup');
  const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64url(f.kdf.salt), iterations: f.kdf.iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64url(f.cipher.iv), additionalData: enc.encode(f.cipher.aad), tagLength: 128 },
    key, b64url(f.ciphertext));
  return new TextDecoder().decode(plain);
}
```

## Test vector

Created independently with `node:crypto` and checked by the app's tests, the Node script, the
Python recipe and the WebCrypto recipe
([`backup-file-vector.json`](../apps/expo/lib/passkey/__tests__/backup-file-vector.json)).
The phrase is the well-known public test mnemonic; never use it for a real account.

| Input | Value |
|---|---|
| password | `Müritz-Hecht-2026` (`ü` = U+00FC) |
| phrase | `test test test test test test test test test test test junk` |
| salt | `0102030405060708090a0b0c0d0e0f10` (hex) |
| IV | `a0a1a2a3a4a5a6a7a8a9aaab` (hex) |
| iterations | 600 000 |

Resulting file:

```json
{
  "format": "ortis-account-backup",
  "version": 1,
  "kind": "bip39-12",
  "kdf": {
    "name": "pbkdf2-hmac-sha256",
    "iterations": 600000,
    "salt": "AQIDBAUGBwgJCgsMDQ4PEA"
  },
  "cipher": {
    "name": "aes-256-gcm",
    "iv": "oKGio6Slpqeoqaqr",
    "aad": "ortis-account-backup/v1"
  },
  "ciphertext": "9hgPKSXYSP2hujnVDEufDUMy35xG7W4Z2nic03ANR5jmbXLCXhXvtrOTkVDVLY5YFEgDfHfdTULJwSWj7goy6UvXgLp2jhmd66Hw",
  "createdAt": "2026-11-17T10:00:00.000Z"
}
```
