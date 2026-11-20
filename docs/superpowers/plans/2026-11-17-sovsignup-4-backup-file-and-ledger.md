# Sovereign Sign-up 4 — Backup File, Update Test and Sovereignty Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 12-word account can be saved as a password-encrypted file and restored from it, in a format anyone can decrypt without our app; every store build is checked for "still logged in after the update"; and the repo carries an honest list of what the independent path depends on.

**Architecture:** The file is JSON: the phrase under AES-256-GCM with a key from PBKDF2-HMAC-SHA256, documented in the repo together with a zero-dependency decrypt script. Encryption and decryption are pure TypeScript and ship by OTA; sharing and picking the file need two native modules, so those two buttons appear only in a binary that has them (detected at runtime, not by version). The ledger is a Markdown table guarded by a small structure test.

**Tech Stack:** `@noble/ciphers` (AES-GCM), `react-native-quick-crypto` (native PBKDF2, already in the binary) with a `node:crypto` stand-in under jest, `expo-file-system`, new native modules `expo-sharing` and `expo-document-picker`, jest-expo, Node 20 for the standalone script.

**Spec:** `docs/superpowers/specs/2026-11-17-sovereign-signup-design.md` sections 5.2 (backup file), 5.4 (file as a way back), 5.9 (update test, restore reasons), 8 (file format documented), 9 (ledger), 10 (decision a).

**Depends on:** plans 1–3 merged (`PhraseStore`, `signInWithWords`, `my-words.tsx`, `words-signin.tsx`, `way-back.ts`, `RestoreReport.owner`).

**This plan adds native modules.** Spec 5.8: that means a store build and the never-log-out checks. Decision a) in spec 10 already approves it for this tranche. Tasks 1, 5 and 6 are OTA-safe and can merge first; Tasks 2–4 are the store-build part.

## Open questions for the owner

1. **Password rule.** *Default: at least 10 characters, typed twice, with the sentence "Wenn du das Passwort vergisst, kann niemand die Datei öffnen, auch wir nicht." No strength meter.*
2. **Does an exported file count as a way back** although the app cannot know the person kept it? Spec 5.4 says yes. *Default: yes, once the share sheet closed without an error.*
3. **Backup file for passkey accounts.** The spec describes it for the 12-word account only. *Default: expert accounts only.*
4. **Blocking screenshots of the words.** A store build could also add `expo-screen-capture`. *Default: not in this plan.*
5. **Which store build.** *Default: the next one you plan anyway; this plan does not bump the app version. Read the memory note "Next native build reminders" before building.*

## Global Constraints

- The file format and KDF are documented in the repo so a third party can decrypt a backup without our app. That is part of the sovereignty claim.
- The file holds the encrypted phrase and nothing that identifies the account: no wallet address, no name.
- Exporting the backup always requires the device unlock.
- The password and the phrase are never logged, never sent anywhere, never written to disk in the clear. The temporary export file holds ciphertext only and is deleted after sharing.
- An app update, store build or OTA, never ends a session. Every store build gets an update test before release, on each sign-in path, on Android with the store signing key (spec 5.9).
- Marketing copy in the app must not claim more independence than the ledger supports.
- Buttons that need the native modules render only when the modules exist in the running binary; an OTA to an older binary must not crash or show dead buttons.
- UI German, code and comments English, `StyleSheet.create()` + `useTheme()`. Never show wallet addresses. No vendor names in the app (the copy test from plan 1 stays green; the ledger is a document, not app copy, and names vendors on purpose).
- pnpm only. The two native modules are the only new dependencies; install them with `npx expo install` so the versions match SDK 56.
- No full `tsc` in `apps/expo`; eslint on touched files plus tests. Expo tests: `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`.
- Worktree `.worktrees/sovsignup-4` on branch `feat/sovsignup-4-backup-file` (`pnpm install --frozen-lockfile`). Stage by explicit path. Every task ends with commit + push. Never merge, never run EAS, never deploy.

## Review Focus

1. **A wrong password** must read as "falsches Passwort", never as a damaged file, and must not reveal anything. Test in Task 1.
2. **A file that is not ours** (any other JSON, a photo, an empty file, a version-2 file from a future app) gets a clear refusal before any password prompt work. Test in Task 1.
3. **A password with umlauts or an emoji typed on a different keyboard** must open the file (Unicode normalisation). Test in Task 1.
4. **Sharing fails or is reported as dismissed.** Nothing is marked as exported, the temporary file is still deleted. Test in Tasks 2 and 3. (iOS does not report a dismissed sheet; that case is open question 2.)
5. **An OTA carrying this code onto a binary without the modules.** No button, no crash. Test in Task 2.

---

### Task 1: The file format, its vector, the public decrypt script

**Files:**
- Create: `apps/expo/lib/passkey/backup-file.ts`
- Create: `apps/expo/lib/passkey/__tests__/backup-file-vector.json`
- Create: `scripts/decrypt-account-backup.mjs`
- Create: `docs/ACCOUNT_BACKUP_FILE_FORMAT.md`
- Test: `apps/expo/lib/passkey/__tests__/backup-file.test.ts`

**Interfaces:**
- The file (UTF-8 JSON, one object, these keys exactly):

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

  Key = PBKDF2-HMAC-SHA256(password as UTF-8 after NFKC normalisation, salt, iterations, 32 bytes). Plaintext = the 12 words, lower-case, single spaces, UTF-8. AAD = the UTF-8 bytes of `cipher.aad`. File name: `roebel-konto-backup-YYYY-MM-DD.json`.
- Produces (`backup-file.ts`, pure; crypto injected):
  - `BACKUP_FORMAT = 'ortis-account-backup'`, `BACKUP_VERSION = 1`, `BACKUP_ITERATIONS = 600_000`, `BACKUP_MIN_PASSWORD_LENGTH = 10`
  - `type Pbkdf2 = (password: Uint8Array, salt: Uint8Array, iterations: number, length: number) => Promise<Uint8Array>`
  - `class BackupFormatError extends Error`, `class BackupPasswordError extends Error`
  - `passwordProblem(password: string, repeat: string): string | null` — `Das Passwort braucht mindestens 10 Zeichen.` / `Die beiden Passwörter sind nicht gleich.` / null
  - `encryptBackup(phrase: string, password: string, deps: { pbkdf2: Pbkdf2; random: (n: number) => Uint8Array; now: () => Date }): Promise<string>` — refuses a phrase that fails `validatePhrase`
  - `decryptBackup(fileText: string, password: string, deps: { pbkdf2: Pbkdf2 }): Promise<string>` — `BackupFormatError` for: not JSON, wrong `format`, `version !== 1`, `kind !== 'bip39-12'`, unknown KDF or cipher names, `cipher.aad` other than `ortis-account-backup/v1`, `iterations` outside 100 000…10 000 000, wrong salt / IV lengths, a file over 16 KB. `BackupPasswordError` when the GCM tag does not verify. A decrypted text that fails `validatePhrase` is a `BackupFormatError`.
  - `backupFileName(now: Date): string`
  - `BACKUP_FORMAT_MESSAGE = 'Das ist keine Backup-Datei aus dieser App.'`, `BACKUP_PASSWORD_MESSAGE = 'Das Passwort stimmt nicht.'`
- Produces: `scripts/decrypt-account-backup.mjs` — `node scripts/decrypt-account-backup.mjs <file> <password>` prints the 12 words; `node:crypto` only (`pbkdf2Sync`, `createDecipheriv('aes-256-gcm')`), no imports from this repo.
- Produces: `docs/ACCOUNT_BACKUP_FILE_FORMAT.md` — the format above, the script, a 15-line Python recipe (`hashlib.pbkdf2_hmac`, `cryptography` AESGCM) and a browser WebCrypto recipe, the test vector, and one sentence on what the words are (BIP-39, account key at `m/44'/60'/0'/0/0`, usable in any wallet).

- [ ] **Step 1: Create the vector independently.** In a scratch script (not committed) with `node:crypto` only: password `Müritz-Hecht-2026`, phrase `test test test test test test test test test test test junk`, salt = 16 bytes `0x01…0x10`, IV = 12 bytes `0xa0…0xab`, 600 000 iterations, AAD as above, `createdAt` `2026-11-17T10:00:00.000Z`. Commit `backup-file-vector.json` = `{ password, phrase, saltHex, ivHex, file: { …the JSON object… } }`.
- [ ] **Step 2: Write the failing test** (PBKDF2 stand-in: `node:crypto` `pbkdf2Sync`)

```ts
const pbkdf2: Pbkdf2 = async (p, s, i, l) => new Uint8Array(pbkdf2Sync(p, s, i, l, 'sha256'));
it('reproduces the independent vector byte for byte', async () => {
  const text = await encryptBackup(v.phrase, v.password, { pbkdf2, random: fixed(v.saltHex, v.ivHex), now: () => new Date('2026-11-17T10:00:00.000Z') });
  expect(JSON.parse(text)).toEqual(v.file);
});
it('opens the vector file', async () => expect(await decryptBackup(JSON.stringify(v.file), v.password, { pbkdf2 })).toBe(v.phrase));
it('a wrong password is a password error, not a format error', async () => {
  await expect(decryptBackup(JSON.stringify(v.file), 'Müritz-Hecht-2025', { pbkdf2 })).rejects.toBeInstanceOf(BackupPasswordError);
});
it('the password is NFKC-normalised: composed and decomposed ü open the same file', async () => {
  expect(await decryptBackup(JSON.stringify(v.file), 'Müritz-Hecht-2026', { pbkdf2 })).toBe(v.phrase);
});
it('refuses what is not ours, before deriving any key', async () => {
  const spy = jest.fn(pbkdf2);
  for (const text of ['', 'not json', '{}', JSON.stringify({ ...v.file, format: 'x' }), JSON.stringify({ ...v.file, version: 2 }),
    JSON.stringify({ ...v.file, kdf: { ...v.file.kdf, iterations: 10 } }), JSON.stringify({ ...v.file, kdf: { ...v.file.kdf, iterations: 1e9 } }), 'x'.repeat(20_000)]) {
    await expect(decryptBackup(text, v.password, { pbkdf2: spy })).rejects.toBeInstanceOf(BackupFormatError);
  }
  expect(spy).not.toHaveBeenCalled();
});
it('a tampered ciphertext does not open; a changed AAD label is a format error', async () => {
  const flipped = { ...v.file, ciphertext: v.file.ciphertext.replace(/^./, (c: string) => (c === 'A' ? 'B' : 'A')) };
  await expect(decryptBackup(JSON.stringify(flipped), v.password, { pbkdf2 })).rejects.toBeInstanceOf(BackupPasswordError);
  const relabelled = { ...v.file, cipher: { ...v.file.cipher, aad: 'something-else' } };
  await expect(decryptBackup(JSON.stringify(relabelled), v.password, { pbkdf2 })).rejects.toBeInstanceOf(BackupFormatError);
});
it('the file names no account and holds no word in the clear', async () => {
  const text = await encryptBackup(v.phrase, v.password, { pbkdf2, random: fixed(v.saltHex, v.ivHex), now: () => new Date() });
  expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
  expect(text).not.toContain('junk');
});
it('password rules', () => {
  expect(passwordProblem('kurz', 'kurz')).toBe('Das Passwort braucht mindestens 10 Zeichen.');
  expect(passwordProblem('lang-genug-1', 'lang-genug-2')).toBe('Die beiden Passwörter sind nicht gleich.');
  expect(passwordProblem('lang-genug-1', 'lang-genug-1')).toBeNull();
});
it('the standalone script opens the vector file', () => {
  const out = execFileSync('node', [path.join(REPO_ROOT, 'scripts/decrypt-account-backup.mjs'), VECTOR_FILE_PATH, v.password], { encoding: 'utf8' });
  expect(out.trim()).toBe(v.phrase);
});
```

(`VECTOR_FILE_PATH` = a temp file the test writes `JSON.stringify(v.file)` to.)

- [ ] **Step 3: Run** `./node_modules/.bin/jest lib/passkey/__tests__/backup-file.test.ts --watchAll=false --no-watchman --ci` — Expected: FAIL, module not found.
- [ ] **Step 4: Implement** `backup-file.ts` (AES-GCM through `@noble/ciphers/aes` `gcm`, as in `prf-vault.ts`), the script and the format document.
- [ ] **Step 5: Run** — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
cd apps/expo && ./node_modules/.bin/eslint lib/passkey/backup-file.ts
git add apps/expo/lib/passkey/backup-file.ts apps/expo/lib/passkey/__tests__/backup-file.test.ts apps/expo/lib/passkey/__tests__/backup-file-vector.json scripts/decrypt-account-backup.mjs docs/ACCOUNT_BACKUP_FILE_FORMAT.md
git commit -m "feat(expo): documented account backup file format with a standalone decrypt script"
git push -u origin feat/sovsignup-4-backup-file
```

---

### Task 2: Native modules, detected at runtime

**Files:**
- Modify: `apps/expo/package.json`, `pnpm-lock.yaml` (through `npx expo install`)
- Create: `apps/expo/lib/passkey/backup-file-native.ts`
- Test: `apps/expo/lib/passkey/__tests__/backup-file-native.test.ts`

**Interfaces:**
- Produces:
  - `backupFileSupport(): { share: boolean; pick: boolean }` — `requireOptionalNativeModule('ExpoSharing') !== null` and `requireOptionalNativeModule('ExpoDocumentPicker') !== null` (`expo-modules-core`); never imports the two packages at module top level
  - `shareBackupFile(p: { fileName: string; content: string }, deps?: { fs; sharing }): Promise<'shared' | 'dismissed'>` — writes `content` to the cache directory, calls `Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Backup-Datei speichern' })`, deletes the file in a `finally`. On iOS a dismissed sheet resolves like a completed one; treat a resolved promise as `'shared'` and a rejection as `'dismissed'`.
  - `pickBackupFile(deps?: { fs; picker }): Promise<{ status: 'picked'; content: string } | { status: 'cancelled' } | { status: 'error'; message: string }>` — `DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false })`, reads at most 16 KB, deletes the cached copy.
  - `pbkdf2Native: Pbkdf2` — `react-native-quick-crypto` `pbkdf2` (asynchronous, off the JS thread) with SHA-256.

- [ ] **Step 1: Install.** `cd apps/expo && npx expo install expo-sharing expo-document-picker`. Check `git diff --stat pnpm-lock.yaml`: the change should be limited to the two packages and their direct dependencies; unrelated re-resolutions are a reason to stop and report (the state doc records that lockfile churn bit this project before).
- [ ] **Step 2: Write the failing test**

```ts
it('reports no support when the native modules are missing, without throwing (OTA on an older binary)', () => {
  jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));
  expect(require('../backup-file-native').backupFileSupport()).toEqual({ share: false, pick: false });
});
it('share writes ciphertext only and always deletes the temporary file', async () => {
  const fs = fakeFs();
  await expect(shareBackupFile({ fileName: 'a.json', content: '{"x":1}' }, { fs, sharing: { shareAsync: async () => { throw new Error('dismissed'); } } })).resolves.toBe('dismissed');
  expect(fs.files.size).toBe(0);
  expect(await shareBackupFile({ fileName: 'a.json', content: '{"x":1}' }, { fs, sharing: { shareAsync: async () => undefined } })).toBe('shared');
  expect(fs.files.size).toBe(0);
});
it('pick: cancel, an oversized file and a readable file', async () => {
  expect(await pickBackupFile({ fs: fakeFs(), picker: { getDocumentAsync: async () => ({ canceled: true, assets: null }) } })).toEqual({ status: 'cancelled' });
  expect((await pickBackupFile({ fs: fakeFs({ 'c/big': 'x'.repeat(20_000) }), picker: pickerFor('c/big', 20_000) })).status).toBe('error');
  expect(await pickBackupFile({ fs: fakeFs({ 'c/ok': '{"a":1}' }), picker: pickerFor('c/ok', 7) })).toEqual({ status: 'picked', content: '{"a":1}' });
});
```

- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Implement** `backup-file-native.ts` (the two packages are loaded with `require` inside the functions).
- [ ] **Step 5: Run** the test and the whole `lib/passkey` folder — Expected: PASS.
- [ ] **Step 6: Commit** — `feat(expo): share and pick the backup file where the binary supports it` — staging `apps/expo/package.json`, `pnpm-lock.yaml`, the module and its test; push.

---

### Task 3: "Backup-Datei speichern"

**Files:**
- Create: `apps/expo/lib/passkey/backup-export.ts`
- Modify: `apps/expo/app/settings/my-words.tsx` (the entry and the password step), `apps/expo/lib/passkey/phrase-store.ts` (the exported flag), `apps/expo/lib/passkey/way-back.ts` (`readWayBack` passes the flag)
- Test: `apps/expo/lib/passkey/__tests__/backup-export.test.ts`, `way-back.test.ts`

**Interfaces:**
- Consumes: `encryptBackup`, `passwordProblem`, `backupFileName` (Task 1); `shareBackupFile`, `pbkdf2Native`, `backupFileSupport` (Task 2); `PhraseStore.read`, `PHRASE_PROMPT` (plan 3).
- Produces (`phrase-store.ts`): `WORDS_BACKUP_EXPORTED_KEY = 'words_backup_exported_v1'`; `PhraseStore.isBackupExported(): Promise<boolean>`, `markBackupExported(): Promise<void>`.
- Produces (`backup-export.ts`): `exportBackup(p: { password: string; repeat: string }, deps: { phrase: Pick<PhraseStore, 'read' | 'markBackupExported'>; pbkdf2: Pbkdf2; random; now: () => Date; share: typeof shareBackupFile }): Promise<{ status: 'shared' } | { status: 'dismissed' } | { status: 'error'; message: string }>` — order: password rules → ONE device unlock (`phrase.read`) → encrypt → share → on `'shared'` mark exported. A cancelled unlock returns `dismissed`.
- Screen (`my-words.tsx`): row `Backup-Datei speichern`, rendered only when `backupFileSupport().share`. Step text: `Wähle ein Passwort für die Datei. Wenn du das Passwort vergisst, kann niemand die Datei öffnen, auch wir nicht.` After sharing: `Gespeichert. Lege die Datei an einen Ort, an den du auch ohne dieses Handy kommst.` While the key is derived: `Datei wird verschlüsselt …`.
- `readWayBack` (words session): `backupFileExported = await phrase.isBackupExported()`.

- [ ] **Step 1: Write the failing test**

```ts
it('one device unlock, an encrypted file is shared, the export is remembered', async () => {
  const d = deps();
  expect(await exportBackup({ password: 'lang-genug-1', repeat: 'lang-genug-1' }, d)).toEqual({ status: 'shared' });
  expect(d.phrase.read).toHaveBeenCalledTimes(1);
  expect(d.share.mock.calls[0][0].fileName).toMatch(/^roebel-konto-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(await decryptBackup(d.share.mock.calls[0][0].content, 'lang-genug-1', { pbkdf2 })).toBe(JUNK);
  expect(d.phrase.markBackupExported).toHaveBeenCalledTimes(1);
});
it('a weak password never reaches the device unlock', async () => {
  const d = deps();
  expect(await exportBackup({ password: 'kurz', repeat: 'kurz' }, d)).toEqual({ status: 'error', message: 'Das Passwort braucht mindestens 10 Zeichen.' });
  expect(d.phrase.read).not.toHaveBeenCalled();
});
it('a dismissed share sheet marks nothing', async () => {
  const d = deps({ share: jest.fn(async () => 'dismissed' as const) });
  expect(await exportBackup({ password: 'lang-genug-1', repeat: 'lang-genug-1' }, d)).toEqual({ status: 'dismissed' });
  expect(d.phrase.markBackupExported).not.toHaveBeenCalled();
});
```

`way-back.test.ts`: a words account with unconfirmed words but an exported file → `ok: true`.

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the module, the flag and the screen step.
- [ ] **Step 4: Run** the two tests, the copy test and eslint on touched files — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(expo): save a 12-word account as an encrypted backup file` — staging by path; push.

---

### Task 4: "Backup-Datei öffnen"

**Files:**
- Create: `apps/expo/lib/passkey/backup-import.ts`
- Modify: `apps/expo/app/passkey/words-signin.tsx`
- Test: `apps/expo/lib/passkey/__tests__/backup-import.test.ts`

**Interfaces:**
- Consumes: `pickBackupFile`, `decryptBackup`, `BackupFormatError`, `BackupPasswordError`, `signInWithWords` (plan 3 Task 7).
- Produces: `checkBackupFile(content: string): { ok: true } | { ok: false; message: string }` (the format checks of `decryptBackup` without a password, so the password field appears only for a real backup file); `signInFromBackup(p: { content: string; password: string }, deps: { pbkdf2: Pbkdf2; signIn: (phrase: string) => Promise<WordsResult> }): Promise<WordsResult>` — maps `BackupFormatError` → `BACKUP_FORMAT_MESSAGE`, `BackupPasswordError` → `BACKUP_PASSWORD_MESSAGE`; on success the result of `signIn`, and it marks the backup as exported (the file exists).
- Screen: on `words-signin.tsx`, under the words field, a text button `Backup-Datei öffnen`, rendered only when `backupFileSupport().pick` → pick → `checkBackupFile` → password field → `signInFromBackup` → activate the session as the words path does.

- [ ] **Step 1: Write the failing test**

```ts
it('opens the vector file and signs in with its words', async () => {
  const signIn = jest.fn(async () => SIGNED_IN);
  expect(await signInFromBackup({ content: JSON.stringify(v.file), password: v.password }, { pbkdf2, signIn })).toBe(SIGNED_IN);
  expect(signIn).toHaveBeenCalledWith(v.phrase);
});
it('wrong password and foreign file read differently, and neither signs in', async () => {
  const signIn = jest.fn();
  expect(await signInFromBackup({ content: JSON.stringify(v.file), password: 'falsch-falsch' }, { pbkdf2, signIn })).toEqual({ status: 'error', message: 'Das Passwort stimmt nicht.' });
  expect(await signInFromBackup({ content: '{"hello":1}', password: v.password }, { pbkdf2, signIn })).toEqual({ status: 'error', message: 'Das ist keine Backup-Datei aus dieser App.' });
  expect(signIn).not.toHaveBeenCalled();
});
it('checkBackupFile refuses a foreign file without a password', () => {
  expect(checkBackupFile('{"hello":1}')).toEqual({ ok: false, message: 'Das ist keine Backup-Datei aus dieser App.' });
  expect(checkBackupFile(JSON.stringify(v.file))).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the module and the screen entry.
- [ ] **Step 4: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci`, the copy test and eslint — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(expo): sign in from an encrypted backup file` — staging by path; push.

---

### Task 5: The update test and a readable restore log (spec 5.9)

`lib/wallet-restore.ts` already writes the last 10 restore outcomes to AsyncStorage (`wallet.restore.reports.v1`), but nothing shows them. The update test needs to read them on the test phone.

**Files:**
- Create: `apps/expo/lib/restore-log-format.ts`
- Create: `apps/expo/app/settings/restore-log.tsx`
- Modify: `apps/expo/app/settings.tsx` (a row at the very bottom, under the version line)
- Create: `docs/STORE_BUILD_UPDATE_TEST.md`
- Test: `apps/expo/lib/__tests__/restore-log-format.test.ts`

**Interfaces:**
- Consumes: `readRestoreReports`, `RestoreReport` (`lib/wallet-restore.ts`, with `owner` from plan 1).
- Produces: `formatRestoreReport(r: RestoreReport): { title: string; lines: string[] }` — title `${date de-DE} · ${ownerLabel} · ${outcomeLabel}`; owner labels `Passkey` / `12 Wörter` / `Google, Apple oder E-Mail` (missing owner → the last one); outcome labels `wiederhergestellt` / `später wiederhergestellt` / `fehlgeschlagen` / `keine Anmeldung gespeichert` / `abgebrochen`; lines: app version, `Store-Version` or `Update` (from `embeddedLaunch`), attempts, and each error message cut to 120 characters with anything that looks like a URL query string or a 40-hex address removed.
- Screen `restore-log.tsx`: title `Anmelde-Protokoll`, the reports newest first, an empty state `Keine Einträge. Das ist gut.`, no network, no sharing. Row in Settings: `Anmelde-Protokoll`.
- `docs/STORE_BUILD_UPDATE_TEST.md` — the procedure, to be run before every store release:
  1. Install the previous store version on a test phone (Android: from the Play internal track so the signing key is the store's; iOS: TestFlight previous build).
  2. Create or log in to one account per path: Google/Apple/email, passkey, 12 words. Use each once (one sponsored action or one signed request).
  3. Install the new build over it (never uninstall). Open the app online: still logged in on all three, without a prompt.
  4. Repeat step 3 from a cold start in airplane mode: still logged in, cached profile shown; back online the session works.
  5. Open Settings → Anmelde-Protokoll: no `fehlgeschlagen` entry. Any entry is copied into the release notes with its reason.
  6. Passkey and 12 words: one action after the update (the fingerprint or device unlock appears once and the action succeeds).
  7. Record date, versions (from → to), devices and result in a table at the bottom of the file.
  A build that fails any step does not ship. The file also states the standing rule from spec 5.9: this project does not go to production before the cause of today's logouts is fixed and confirmed on a real update.

- [ ] **Step 1: Write the failing test**

```ts
it('formats a failed passkey restore after a store update', () => {
  const f = formatRestoreReport({ outcome: 'failed', attempts: 4, errors: ['fetch failed https://rpc.example/?key=SECRET', 'no account restored'], hadStoredSession: true,
    at: '2026-11-20T08:00:00.000Z', appVersion: '3.10.0', platform: 'android', embeddedLaunch: true, owner: 'passkey' });
  expect(f.title).toContain('Passkey');
  expect(f.title).toContain('fehlgeschlagen');
  expect(f.lines).toContain('Store-Version');
  expect(f.lines.join('\n')).not.toContain('SECRET');
});
it('labels the three owners and never prints an address', () => {
  expect(formatRestoreReport({ ...base, owner: 'words' }).title).toContain('12 Wörter');
  expect(formatRestoreReport({ ...base, owner: 'thirdweb' }).title).toContain('Google, Apple oder E-Mail');
  expect(formatRestoreReport({ ...base, errors: ['bad 0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5'] }).lines.join(' ')).not.toMatch(/0x[0-9a-fA-F]{40}/);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the formatter, the screen, the Settings row and the document.
- [ ] **Step 4: Run** the test, the copy test (the label for the thirdweb owner must not name the vendor) and eslint — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(expo): readable sign-in restore log; docs: store-build update test` — staging by path; push.

---

### Task 6: `docs/SOVEREIGNTY_LEDGER.md`

**Files:**
- Create: `docs/SOVEREIGNTY_LEDGER.md`
- Create: `apps/expo/lib/__tests__/sovereignty-ledger.test.ts`
- Modify: `CLAUDE.md` (root; one line under "Development Notes" pointing to the ledger as the check for independence claims)

**Interfaces:**
- Produces the ledger: one table per sign-in path (`Passkey`, `12 Wörter`, `Google, Apple oder E-Mail`), each with the nine rows of spec 9 in this order — `Key custody`, `Key backup`, `Recovery`, `Gas`, `Bundler`, `RPC`, `App distribution`, `Database`, `Hosting` — and three columns: `Depends on`, `If that party disappears`, `If that party turns hostile`. Under the tables: `What no party can do` (move or seize an independent account) and `What we may say in the app` (the allowed claims, each tied to a row).
- Facts to write, each verified against the code named in brackets before it goes in (a fact you cannot verify is written as "not verified" with the reason, never guessed):
  - Passkey / key custody: the passkey lives in the device's passkey provider and syncs through the Apple or Google keychain unless the person adds the Wiederherstellungswörter [`lib/passkey/webauthn.ts`, rpId `id.ortis.app`].
  - Passkey / the relying-party domain `id.ortis.app`: what happens to existing passkeys if the domain or its association files go away [`apps/roebel-id/src/well-known/app-associations.ts`, `PASSKEY_ACCOUNTS_STATE.md` gates].
  - 12 Wörter / key custody: the phone's secure store, device-only; nothing in a cloud keychain [`lib/passkey/phrase-store.ts`].
  - Key backup: ciphertext of voting, Nostr and salt keys on our server (Supabase); the passkey PRF or the phrase opens them; what is lost after a guardian recovery to a new key [`key-backup.ts`, plan 3 open question 4].
  - Recovery: guardians and the 3-day module on chain; the optional "E-Mail oder Google als Helfer" option uses thirdweb [`recovery-helper-runtime.ts`]; push and email warnings depend on Expo push, Resend and our cron [`recovery-alerts.ts`].
  - Gas: our paymaster and sponsor route; without it the account still exists and can pay its own gas with any Safe-compatible tool, which the app does not offer [`sponsor-handler.ts`].
  - Bundler and RPC: the URLs in `lib/passkey/constants.ts` / `userop.ts` and who runs them.
  - App distribution: the Apple and Google stores; updates through Expo (EAS Update).
  - Database and hosting: Supabase, Vercel, Fly; what stops working (profiles, feed, sponsoring) and what does not (the account, its Bürgerkarte, its Röbel Münzen, on Gnosis).
  - Google/Apple/E-Mail path: the key is held by the sign-in provider (thirdweb) until "Unabhängig werden".
- Produces the guard test: parses the Markdown, asserts the three path headings exist, each followed by a table with exactly the nine row labels in order and three non-empty cells per row, and that the section `What we may say in the app` exists.

- [ ] **Step 1: Write the failing test**

```ts
const ROWS = ['Key custody', 'Key backup', 'Recovery', 'Gas', 'Bundler', 'RPC', 'App distribution', 'Database', 'Hosting'];
it.each(['Passkey', '12 Wörter', 'Google, Apple oder E-Mail'])('ledger has all nine rows for %s, none empty', (path) => {
  const rows = tableUnder(ledger, `## ${path}`);
  expect(rows.map((r) => r[0])).toEqual(ROWS);
  for (const r of rows) expect(r.slice(1).every((cell) => cell.trim().length > 0)).toBe(true);
});
it('states what may be claimed in the app', () => expect(ledger).toContain('## What we may say in the app'));
```

- [ ] **Step 2: Run** `./node_modules/.bin/jest lib/__tests__/sovereignty-ledger.test.ts --watchAll=false --no-watchman --ci` — Expected: FAIL (file missing).
- [ ] **Step 3: Write the ledger**, reading each named file first. Then compare the app's independence copy against it: `grep -rn "Nur du hast den Schlüssel\|Ohne Apple\|ohne uns\|unabhängig" apps/expo/app apps/expo/components --include='*.tsx'` — every hit must be covered by a line in `What we may say in the app`; a claim the ledger does not support is changed in the app in this task (name each change in the commit message).
- [ ] **Step 4: Run** the ledger test and the copy test — Expected: PASS.
- [ ] **Step 5: Commit** — `docs: sovereignty ledger with a structure guard; app copy checked against it` — staging by path; push.

---

## Owner gates (Max — not agent steps)

1. Merge order: Tasks 1, 5 and 6 can merge and go out by OTA at any time. Tasks 2–4 add native modules: merge them when you are ready to cut the store build.
2. Store build (EAS) on your schedule; before building, read the memory note "Next native build reminders".
3. Run `docs/STORE_BUILD_UPDATE_TEST.md` on the new build before it goes to review, on iOS and on Android with the store signing key, and fill in the result table. This is the release blocker from spec 5.9.
4. Device pass for the file: save it to Files / Drive / a USB stick, open it on a second phone, open it on a laptop with `node scripts/decrypt-account-backup.mjs`.
5. Read `docs/SOVEREIGNTY_LEDGER.md` once and correct anything you know better (who runs the bundler and RPC in production, the paymaster owner Safe). Marketing copy outside the app is checked against it by you.

## Self-review (done while writing)

- Spec coverage: 5.2 backup file → Tasks 1–4; "Backup-Datei öffnen" in 5.1 / 5.2 → Task 4; 5.4 file as a way back → Task 3; 5.9 update test and recorded reasons → Task 5; 8 documented format → Task 1; 9 ledger → Task 6; 10 decision a) → the task split and Owner gates.
- Names used across tasks: `encryptBackup`, `decryptBackup`, `Pbkdf2`, `BackupFormatError`, `BackupPasswordError`, `backupFileSupport`, `shareBackupFile`, `pickBackupFile`, `pbkdf2Native`, `exportBackup`, `signInFromBackup`, `checkBackupFile`, `formatRestoreReport`.
