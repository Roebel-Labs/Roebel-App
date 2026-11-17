# Sovereign Sign-up 2 — Wiederherstellungswörter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A passkey account can switch on 12 recovery words that bring the account, its voting key and its Nostr identity back on a new phone after the 3-day wait; recoveries are announced by push; and no independent account can request citizenship without a way back.

**Architecture:** The words are guardians in the existing Candide SocialRecoveryModule: a fixed pool of 5 addresses derived from the phrase at `m/44'/60'/0'/0/0…4`, of which as many are on chain as the current threshold, so the words alone reach it. The app keeps the 5 public addresses and a vault key derived from the phrase, never the phrase. Recovery is one sponsored `multiConfirmRecovery` op signed by the word keys, riding the sponsor's existing recovery mode. Signature-derived keys get a second ciphertext copy under the vault key.

**Tech Stack:** viem 2.53 (`viem/accounts`: `mnemonicToAccount`, `english`), `@noble/hashes` (sha256, hkdf), `@noble/ciphers` (via the existing `prf-vault.ts`), Expo SecureStore, Foundry fork tests, node:test, Supabase migrations, Expo push API.

**Spec:** `docs/superpowers/specs/2026-11-17-sovereign-signup-design.md` sections 5.3, 5.4, 5.5 (passkey part), 5.8 (last bullet). Also read `docs/PASSKEY_SIGNIN_NOTES.md` §8f (key backup) and the header of `apps/expo/lib/passkey/guardians.ts` (recovery recipe).

**Depends on:** plan 1 (`2026-11-17-sovsignup-1-foundations.md`) merged: `isPasskeySurfaceAllowed('words')`, guest sponsoring of guardian management and recovery, `SovereignAccountSettings.tsx`, `identityModeFor` for guests, `findSafesByOwner`.

## Open questions for the owner

1. **Threshold with words.** *Default: the threshold keeps meaning "how many of my people must agree" (2, or fewer when there are fewer people, minimum 1). With words on, exactly that many word addresses are guardians. One word address plus one person also reaches the threshold on chain; that is accepted.*
2. **"Unabhängig werden" and word guardians.** Spec 5.8: words do not count as people. The server cannot tell a word guardian from a person (both are addresses). *Default: the app's checklist counts people only; the sponsor rule (≥ 2 guardians, threshold ≥ 2) is unchanged. A modified client could pass with words only; that person would be bypassing a protection of their own account.*
3. **Push alerts reach independent accounts only.** `push_tokens.wallet_address` is the identity; for a migrated account that is the old account, not the Safe the alert names. *Default: push for Safe identities; migrated accounts keep the email and the in-app banner.*
4. **Copying the words.** *Default: no copy button, no clipboard. The current binary cannot block screenshots (no `expo-screen-capture`); the screen says "Schreib sie auf Papier".*
5. **The vault key stays on the device** (SecureStore, device-only) so keys created later also get their second copy, and during a words recovery it is kept for the 3 days until the account is back. It opens ciphertext only; it cannot move the account. *Default: yes.*

## Global Constraints

- The words are a recovery key, not an instant key: using them starts the same 3-day wait as guardian recovery, and the owner can cancel. 12 words must never give a thief instant control.
- The app forgets the words after setup. It stores only the 5 public addresses and the vault key.
- In the UI the words are ONE entry, "Wiederherstellungswörter", never several people. Never show wallet addresses.
- BIP-39, English wordlist, 12 words, standard path `m/44'/60'/0'/0/i`, so any wallet tool can use the words to confirm a recovery without our app.
- The server only ever holds ciphertext.
- Everything in this plan sits behind `isPasskeySurfaceAllowed('words')` (plan 1), except the way-back rule (Task 8), which applies as soon as sign-up is open.
- UI German, code and comments English, `StyleSheet.create()` + `useTheme()`. No vendor names in the app (the copy test from plan 1 must stay green).
- No new native modules, no new dependencies, pnpm only. Import BIP-39 helpers from `viem/accounts`; `@scure/*` is not a direct dependency and must not be imported.
- Batch related calls into one sponsored op; never more fingerprint prompts than today for the same action.
- Supabase changes are migration files; applying them is an owner gate.
- No full `tsc` in `apps/expo`; eslint on touched files plus tests. Expo tests: `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`. Web: `cd apps/web && npx tsx --test <path>`. Fork: `cd contracts/passkey-accounts && forge test --match-contract <Name> -vvv`.
- Worktree `.worktrees/sovsignup-2` on branch `feat/sovsignup-2-recovery-words` (branched from `main` after plan 1 merged; `pnpm install --frozen-lockfile`). Stage by explicit path. Every task ends with commit + push. Never merge, never run EAS, never deploy.

## Review Focus

1. **A typo in one word at restore time.** The person gets told which word is not in the list or that the checksum fails, before any passkey is created. Test in Task 1 and Task 6.
2. **Words switched on, then a person added or the threshold changed.** The number of word guardians follows the threshold in the same op, or the words silently stop being enough. Test in Task 2.
3. **Keys created after the words were set up, or on a second phone.** They still get the second copy (through the stored vault key, or the `wvk` blob on a phone that has only the passkey). Test in Task 4.
4. **The owner cancels a words recovery, and the thief tries again.** The nonce moved, old approvals are dead, a new attempt alerts again. Test in Task 7 (alert per nonce) and the fork test in Task 6.
5. **Words entered for an account that removed them.** No account is found; the app says so and creates nothing. Test in Task 6.

---

### Task 1: Phrase primitives

**Files:**
- Create: `apps/expo/lib/passkey/words.ts`
- Create: `apps/expo/lib/passkey/__tests__/words-vector.json`
- Test: `apps/expo/lib/passkey/__tests__/words.test.ts`

**Interfaces:**
- Produces:
  - `WORD_COUNT = 12`, `WORDS_POOL_SIZE = 5`
  - `entropyToPhrase(entropy: Uint8Array /* 16 bytes */): string`
  - `generatePhrase(random: (n: number) => Uint8Array = randomBytes): string` (16 bytes from `./random`)
  - `normalizePhrase(input: string): string` (NFKD, lower-case, single spaces, trimmed)
  - `validatePhrase(input: string): { ok: true; phrase: string } | { ok: false; reason: 'count' | 'word' | 'checksum'; badWords: string[] }`
  - `wordAccount(phrase: string, index: number): HDAccount` (`mnemonicToAccount(phrase, { addressIndex: index })`)
  - `deriveWordAddresses(phrase: string, count: number = WORDS_POOL_SIZE): Address[]`
  - `WORDS_VAULT_SALT = 'id.ortis.app/words-vault/v1'`
  - `wordsVaultKey(phrase: string): Hex` — `HKDF-SHA256(ikm = the 32-byte private key at m/44'/60'/0'/1/0, salt = utf8(WORDS_VAULT_SALT), info = empty, length 32)`. The result is used wherever `prf-vault.ts` takes a PRF output. (`mnemonicToAccount(phrase, { changeIndex: 1 }).getHdKey().privateKey`.)
  - `pickConfirmPositions(random?: (n: number) => Uint8Array): [number, number, number]` (three distinct positions 0–11, ascending)
  - `confirmMatches(phrase: string, answers: Record<number, string>): boolean`
  - `phraseErrorMessage(r: { reason: 'count' | 'word' | 'checksum'; badWords: string[] }): string` — `count`: `Es müssen genau 12 Wörter sein.`; `word`: `Dieses Wort kennen wir nicht: ${badWords.join(', ')}`; `checksum`: `Die Wörter passen nicht zusammen. Prüfe die Reihenfolge und die Schreibweise.`

BIP-39 encoding (the tests pin it): 128 entropy bits + the first 4 bits of `sha256(entropy)` = 132 bits = 12 groups of 11 bits, each an index into viem's `english` list. Validation reverses it.

- [ ] **Step 1: Write the failing test**

```ts
const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));
it('encodes the BIP-39 reference vectors', () => {
  expect(entropyToPhrase(hex('00'.repeat(16)))).toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  expect(entropyToPhrase(hex('7f'.repeat(16)))).toBe('legal winner thank year wave sausage worth useful legal winner thank yellow');
  expect(entropyToPhrase(hex('ff'.repeat(16)))).toBe('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong');
});
it('validates: count, unknown word, checksum, and forgives case and spacing', () => {
  expect(validatePhrase('  Legal winner  thank year wave sausage worth useful legal winner thank YELLOW ')).toEqual({ ok: true, phrase: 'legal winner thank year wave sausage worth useful legal winner thank yellow' });
  expect(validatePhrase('abandon abandon')).toMatchObject({ ok: false, reason: 'count' });
  expect(validatePhrase('abandon '.repeat(11) + 'abuot')).toEqual({ ok: false, reason: 'word', badWords: ['abuot'] });
  expect(validatePhrase('abandon '.repeat(12))).toMatchObject({ ok: false, reason: 'checksum' });
});
it('derives the standard Ethereum addresses', () => {
  const junk = 'test test test test test test test test test test test junk';
  expect(deriveWordAddresses(junk, 3)).toEqual(['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC']);
  expect(deriveWordAddresses('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', 1)).toEqual(['0x9858EfFD232B4033E47d90003D41EC34EcaEda94']);
  expect(deriveWordAddresses(junk)).toHaveLength(5);
});
it('generatePhrase yields a valid 12-word phrase from the injected entropy', () => {
  expect(generatePhrase(() => hex('7f'.repeat(16)))).toBe('legal winner thank year wave sausage worth useful legal winner thank yellow');
  expect(validatePhrase(generatePhrase()).ok).toBe(true);
});
it('vault key matches the independent vector and differs from every pool key', () => {
  expect(wordsVaultKey(vector.phrase)).toBe(vector.vaultKey);
});
it('confirm positions are three distinct ascending indexes and matching is exact per position', () => {
  const p = pickConfirmPositions(() => Uint8Array.from([3, 3, 250, 7, 11, 0]));
  expect(new Set(p).size).toBe(3);
  expect([...p].sort((a, b) => a - b)).toEqual(p);
  const phrase = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  expect(confirmMatches(phrase, { 0: 'Legal ', 3: 'year', 11: 'yellow' })).toBe(true);
  expect(confirmMatches(phrase, { 0: 'legal', 3: 'wave', 11: 'yellow' })).toBe(false);
});
```

- [ ] **Step 2: Create `words-vector.json` independently of `words.ts`.** In a scratch script (not committed) compute, for the phrase `test test test test test test test test test test test junk`: the private key at `m/44'/60'/0'/1/0` with viem, then `crypto.hkdfSync('sha256', key, Buffer.from('id.ortis.app/words-vault/v1'), Buffer.alloc(0), 32)` from `node:crypto`. Commit `{ "phrase": "...", "ikmPath": "m/44'/60'/0'/1/0", "salt": "id.ortis.app/words-vault/v1", "vaultKey": "0x…" }`.
- [ ] **Step 3: Run** `./node_modules/.bin/jest lib/passkey/__tests__/words.test.ts --watchAll=false --no-watchman --ci` — Expected: FAIL, module not found.
- [ ] **Step 4: Implement `words.ts`** (pure; imports only viem, `viem/accounts`, `@noble/hashes`, `./random`, `./encoding`).
- [ ] **Step 5: Run** — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
cd apps/expo && ./node_modules/.bin/eslint lib/passkey/words.ts
git add apps/expo/lib/passkey/words.ts apps/expo/lib/passkey/__tests__/words.test.ts apps/expo/lib/passkey/__tests__/words-vector.json
git commit -m "feat(expo): BIP-39 phrase primitives for recovery words"
git push -u origin feat/sovsignup-2-recovery-words
```

---

### Task 2: Word guardians follow the threshold

**Files:**
- Create: `apps/expo/lib/passkey/words-guardians.ts`
- Modify: `apps/expo/components/passkey/useGuardianManager.ts` (every `planAddGuardians` / `planRemoveGuardian` / `planChangeThreshold` call site), `apps/expo/components/passkey/GuardiansSection.tsx` (list + threshold label), `apps/expo/app/settings/passkey-detach.tsx` (people count for checklist item 2)
- Test: `apps/expo/lib/passkey/__tests__/words-guardians.test.ts`

**Interfaces:**
- Consumes: `encodeAddGuardian`, `encodeRevokeGuardian`, `encodeChangeThreshold` (`guardians.ts`), `defaultThreshold`, `clampThreshold` (`guardian-plan.ts`), `WORDS_POOL_SIZE` (Task 1).
- Produces:
  - `WORDS_POOL_KEY = 'passkey_words_pool_v1'`
  - `type WordsPool = { addresses: Address[]; confirmedAt: number }` (exactly 5 addresses, in derivation order)
  - `loadWordsPool(storage: KeyValueStorage): Promise<WordsPool | null>`, `saveWordsPool(storage, pool): Promise<void>`, `clearWordsPool(storage): Promise<void>`
  - `splitGuardians(onChain: readonly Address[], pool: WordsPool | null): { people: Address[]; words: Address[] }`
  - `peopleThreshold(peopleCount: number, wanted?: number): number` — `clampThreshold(wanted ?? defaultThreshold(peopleCount), Math.max(peopleCount, 1))`, never below 1
  - `planGuardianSet(p: { wallet: Address; current: readonly Address[]; pool: WordsPool | null; people: readonly Address[]; words: boolean; threshold?: number }): { calls: SponsoredCall[]; threshold: number; wordCount: number }`
  - `WORDS_THRESHOLD_LIMIT_MESSAGE = 'Mit Wiederherstellungswörtern können höchstens 5 Personen zustimmen müssen.'`

`planGuardianSet` (the algorithm the tests pin): target threshold `t = peopleThreshold(people.length, threshold)`; with `words` true and `t > 5` throw `WORDS_THRESHOLD_LIMIT_MESSAGE`. Desired set = `people` ∪ (`words` ? the first `t` pool addresses : ∅). Simulate the module's list, which is head-first (`current` is in `getGuardians` order; an add puts the new guardian at index 0). Emit adds for desired-but-missing guardians first (people in the given order, then word addresses in pool order), each with threshold `min(t, countAfterThisAdd)`; then revokes for present-but-undesired ones, each with `prev` = the simulated predecessor (the sentinel for index 0) and threshold `min(t, countAfterThisRevoke)` (the stored threshold when the count reaches 0); if nothing was emitted or the last emitted threshold is not `t`, append `changeThreshold(t)` — unless the set is empty. With `pool: null` and `words: false` the result must equal what `planAddGuardians` / `planRemoveGuardian` / `planChangeThreshold` produce today for the same change.

UI: `GuardiansSection` lists `people` only; when `words.length > 0` it adds one row `Wiederherstellungswörter` with the subtext `Reichen allein aus. Wartezeit 3 Tage.`; `thresholdLabel(threshold, people.length)` is fed the people count. The detach checklist (`passkey-detach.tsx`) passes `{ count: people.length, threshold }` so words never count as people (open question 2).

- [ ] **Step 1: Write the failing test**

```ts
const POOL: WordsPool = { addresses: [W0, W1, W2, W3, W4], confirmedAt: 1 };
it('switching words on with no people: one word guardian, threshold 1', () => {
  const r = planGuardianSet({ wallet: SAFE, current: [], pool: POOL, people: [], words: true });
  expect(r).toMatchObject({ threshold: 1, wordCount: 1 });
  expect(r.calls).toEqual([encodeAddGuardian(W0, 1)]);
});
it('adding a second person raises the threshold to 2 and adds a second word guardian in the same batch', () => {
  const r = planGuardianSet({ wallet: SAFE, current: [P1, W0], pool: POOL, people: [P1, P2], words: true });
  expect(r).toMatchObject({ threshold: 2, wordCount: 2 });
  expect(r.calls).toEqual([encodeAddGuardian(P2, 2), encodeAddGuardian(W1, 2)]);
});
it('lowering the threshold removes the surplus word guardian with the right predecessor', () => {
  // list head-first: [W1, P2, P1, W0]
  const r = planGuardianSet({ wallet: SAFE, current: [W1, P2, P1, W0], pool: POOL, people: [P1, P2], words: true, threshold: 1 });
  expect(r.calls).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, W1, 1)]);
});
it('switching words off removes every word guardian and keeps the people threshold', () => {
  const r = planGuardianSet({ wallet: SAFE, current: [W1, P2, P1, W0], pool: POOL, people: [P1, P2], words: false });
  expect(r.wordCount).toBe(0);
  expect(r.calls).toEqual([encodeRevokeGuardian(SOCIAL_RECOVERY_SENTINEL, W1, 2), encodeRevokeGuardian(P1, W0, 2)]);
});
it('more than 5 required approvals with words on is refused', () => {
  expect(() => planGuardianSet({ wallet: SAFE, current: [], pool: POOL, people: [P1, P2, P3, P4, P5, P6], words: true, threshold: 6 })).toThrow(WORDS_THRESHOLD_LIMIT_MESSAGE);
});
it('without a pool it plans exactly like the old planners', () => {
  const old = planAddGuardians({ wallet: SAFE, current: [P1], currentThreshold: 1, add: [P2] });
  expect(planGuardianSet({ wallet: SAFE, current: [P1], pool: null, people: [P1, P2], words: false }).calls).toEqual(old.calls);
});
it('splitGuardians separates people from word addresses, case-insensitively', () => {
  expect(splitGuardians([P1, W0.toLowerCase() as Address], POOL)).toEqual({ people: [P1], words: [W0.toLowerCase()] });
});
```

- [ ] **Step 2: Run** — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `words-guardians.ts`**, then route `useGuardianManager` through `planGuardianSet` (load the pool once with the guardian state) and apply the UI rules above.
- [ ] **Step 4: Run** `./node_modules/.bin/jest lib/passkey/__tests__/words-guardians.test.ts lib/passkey/__tests__/guardian-plan.test.ts lib/passkey/__tests__/detach.test.ts --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): word guardians follow the recovery threshold and show as one entry` — staging the four files by path; push.

---

### Task 3: Fork proof and vector for a words recovery

**Files:**
- Create: `contracts/passkey-accounts/test/WordsRecovery.t.sol`
- Create: `contracts/passkey-accounts/test/fixtures/words-recovery-vector.json` (written by the test), copied to `apps/expo/lib/passkey/__tests__/words-recovery-vector.json`
- Modify: `contracts/passkey-accounts/test/utils/Interfaces.sol` (SRM events, `multiConfirmRecovery` if missing), `contracts/passkey-accounts/README.md` (table row + vector section)

**Interfaces:**
- Produces a proof, on the real SRM `0x38275826E1933303E508433dD5f289315Da2541c`, that:
  1. a passkey Safe adds the word addresses 0 and 1 of the phrase `test test test test test test test test test test test junk` (`vm.deriveKey(mnemonic, i)`) with threshold 2, and each add emits `GuardianAdded(address indexed wallet, address indexed newGuardian, uint256 threshold)` (assert with `vm.expectEmit(true, true, false, true, SRM)`);
  2. a fresh passkey Safe sends ONE userOp `[createSigner(x2, y2), multiConfirmRecovery(wallet, [signer2], 1, [sig0, sig1] sorted by signer, true)]` where each signature is a plain 65-byte ECDSA signature (`vm.sign`) over `srm.getRecoveryHash(wallet, [signer2], 1, nonce)`, and the recovery request exists afterwards with `executeAfter == block.timestamp + 259200`;
  3. `cancelRecovery` from the wallet clears it and bumps the nonce, and the same two signatures then revert;
  4. without a cancel, `finalizeRecovery` after 3 days makes `getOwners() == [signer2]`.
- Produces the vector (`test_writeVector`, deterministic): `phrase`, `wallet`, `newOwner`, `nonce`, `recoveryHash`, `guardians[2]` (`index`, `address`, `signature`), and the full `multiConfirmRecovery` calldata.

- [ ] **Step 1: Write the test contract** with tests `test_wordGuardiansAdded_emitGuardianAdded`, `test_wordsAloneStartRecovery_oneOp`, `test_ownerCancels_oldApprovalsDie`, `test_finalizeAfterDelay`, `test_writeVector`. Reuse `PasskeySafeBase` for Safes and userOps.
- [ ] **Step 2: Run** `forge test --match-contract WordsRecovery -vvv` — Expected: PASS. If the `GuardianAdded` signature differs from the one above, use the real one here and in Task 6 and say so in the commit message.
- [ ] **Step 3: Copy the vector** to the Expo tests folder and add the README rows.
- [ ] **Step 4: Commit** — `test(contracts): recovery words start a guardian recovery in one op (fork proof + vector)` — staging the four files; push.

---

### Task 4: Second wrapped copy of the derived keys

**Files:**
- Modify: `apps/expo/lib/passkey/key-backup.ts:22-38` and `apps/web/src/lib/passkey/key-backup-proof.ts` (same slot list and content order, byte-exact)
- Modify: `apps/web/src/lib/passkey/key-backup-handler.ts`, `key-backup-store.ts`, `key-backup-store-supabase.ts` (accept the new slots)
- Create: `supabase/migrations/20261117c_passkey_key_backup_words_slots.sql`
- Create: `apps/expo/lib/passkey/words-vault.ts`
- Modify: `apps/expo/lib/passkey/derived-keys.ts:82-180,202-260`, `derived-keys-runtime.ts:109-163`
- Modify: both `__tests__/key-backup-vector.json` (add a second case; the first stays byte-identical)
- Test: `apps/expo/lib/passkey/__tests__/words-vault.test.ts`, `derived-keys.test.ts`, `key-backup.test.ts`; `apps/web/src/lib/passkey/__tests__/key-backup.test.ts`

**Interfaces:**
- Produces (both apps): `KEY_BACKUP_WORDS_SLOTS = ['maci_w', 'nostr_w', 'salt_w'] as const`; `KEY_BACKUP_VAULT_SLOT = 'wvk'`; `type KeyBackupBlobKey = KeyBackupSlot | (typeof KEY_BACKUP_WORDS_SLOTS)[number] | 'wvk'`; `KeyBackupBlobs = Partial<Record<KeyBackupBlobKey, string>>`. `KeyBackupSlot` and `KEY_BACKUP_SLOTS` (the three secrets) are unchanged. `keyBackupContent` lists present blobs in the order `maci, nostr, salt, maci_w, nostr_w, salt_w, wvk`, then `replace=…`.
- Produces (`words-vault.ts`):
  - `WORDS_VAULT_KEY_STORE = 'passkey_words_vault_key_v1'`, `WORDS_VAULT_KEY_LABEL = 'roebel/words-vault-key/v1'`
  - `wordsSlot(slot: KeyBackupSlot): 'maci_w' | 'nostr_w' | 'salt_w'`
  - `type VaultKeyStorage = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; deleteItem(k: string): Promise<void> }`
  - `loadVaultKey(storage): Promise<Hex | null>`, `saveVaultKey(storage, key: Hex): Promise<void>`, `clearVaultKey(storage): Promise<void>` (the runtime wiring stores with `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`)
  - `resolveVaultKey(d: { storage: VaultKeyStorage; wvkBlob?: string; prf?: Hex | null; unwrap }): Promise<Hex | null>` — the device copy, else the `wvk` blob unwrapped with the PRF (and then saved), else null
  - `writeWordsCopies(d: { vaultKey: Hex; secrets: Array<{ slot: KeyBackupSlot; secret: Uint8Array }>; remote: RemoteBackup; wrap; replace?: boolean }): Promise<{ stored: KeyBackupSlot[]; failed: KeyBackupSlot[] }>` — blob = `wrap(vaultKey, SLOT_LABEL[slot], secret)` in slot `wordsSlot(slot)`; never throws
- Produces (`derived-keys.ts`): `ResolveDeps.wordsCopy?: (slot: KeyBackupSlot, secret: Uint8Array, ctx: { prf: Hex | null; wvkBlob?: string }) => Promise<void>` — called after a generated key was stored and backed up (case c) and for every secret `backupDeviceSecrets` uploads. A failure never fails the resolve; `BackupReport` gains `wordsCopies: { stored: KeyBackupSlot[]; failed: KeyBackupSlot[] }`.
- Migration: additive on top of the unapplied `20260927_passkey_key_backup.sql` (do not edit it): replace the `slot` check with the seven values.

- [ ] **Step 1: Failing tests.** `words-vault.test.ts`:

```ts
it('writes one _w blob per secret, readable with the vault key and not with another', async () => {
  const written: KeyBackupBlobs[] = [];
  const remote = { read: async () => ({ status: 'none' as const }), write: async (b: KeyBackupBlobs) => (written.push(b), 'stored' as const) };
  const r = await writeWordsCopies({ vaultKey: KEY_A, secrets: [{ slot: 'maci', secret: utf8Encode('m') }, { slot: 'nostr', secret: utf8Encode('n') }], remote, wrap: wrapSecret });
  expect(r).toEqual({ stored: ['maci', 'nostr'], failed: [] });
  expect(Object.keys(written[0])).toEqual(['maci_w', 'nostr_w']);
  expect(await unwrapSecret(KEY_A, SLOT_LABEL.maci, written[0].maci_w!)).toEqual(utf8Encode('m'));
  await expect(unwrapSecret(KEY_B, SLOT_LABEL.maci, written[0].maci_w!)).rejects.toThrow();
});
it('a backup error is reported, never thrown', async () => {
  const remote = { read: async () => ({ status: 'none' as const }), write: async () => { throw new Error('offline'); } };
  expect(await writeWordsCopies({ vaultKey: KEY_A, secrets: [{ slot: 'salt', secret: utf8Encode('s') }], remote, wrap: wrapSecret })).toEqual({ stored: [], failed: ['salt'] });
});
it('a phone with only the passkey gets the vault key from the wvk blob', async () => {
  const storage = mem();
  const wvk = await wrapSecret(PRF, WORDS_VAULT_KEY_LABEL, hexToBytes(KEY_A));
  expect(await resolveVaultKey({ storage, wvkBlob: wvk, prf: PRF, unwrap: unwrapSecret })).toBe(KEY_A);
  expect(await loadVaultKey(storage)).toBe(KEY_A);
  expect(await resolveVaultKey({ storage: mem(), prf: PRF, unwrap: unwrapSecret })).toBeNull();
});
```

`derived-keys.test.ts`: in the existing "(c) generated" case pass `wordsCopy: jest.fn()` and expect it called once with the slot and the generated secret; a `wordsCopy` that rejects still resolves the secret. `key-backup.test.ts` (both apps): the content of `{ maci: 'pkv1:a', maci_w: 'pkv1:b', wvk: 'pkv1:c' }` is `maci=pkv1:a\nmaci_w=pkv1:b\nwvk=pkv1:c\nreplace=0` and its hash equals the new vector case; the server refuses an unknown slot `maci_x` with 400.

- [ ] **Step 2: Run** the four files — Expected: FAIL.
- [ ] **Step 3: Implement** the slot lists in both apps, the vector's second case (hash computed once with `node:crypto` in a scratch script), `words-vault.ts`, the `wordsCopy` hook, the runtime wiring in `derived-keys-runtime.ts` (`wordsCopy` = `resolveVaultKey` then `writeWordsCopies`; no vault key → no-op) and the migration (PGlite check: the seven slots pass, an eighth fails).
- [ ] **Step 4: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` and `npx tsx --test src/lib/passkey/__tests__/*.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: second ciphertext copy of voting, Nostr and salt keys under the recovery words` — staging by path; push.

---

### Task 5: Setting the words up (and removing or replacing them)

**Files:**
- Create: `apps/expo/lib/passkey/words-setup.ts`
- Create: `apps/expo/app/settings/recovery-words.tsx`
- Create: `apps/expo/components/passkey/WordsGrid.tsx`, `WordsConfirm.tsx`, `WordsInput.tsx`
- Modify: `apps/expo/components/passkey/SovereignAccountSettings.tsx` and `MigrationSettings.tsx` (the entry, in the slot plan 1 left)
- Test: `apps/expo/lib/passkey/__tests__/words-setup.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4; `sendOwnSafeOp`, `readGuardianState`, `readIdentityMode` (`guardians-runtime.ts`); `backupKeysForSession`, `deviceSecretSources`, `keyBackupFor` (`derived-keys-runtime.ts`); `getPrfSecret` (`webauthn.ts`).
- Produces (`words-setup.ts`, every side effect injected):
  - `type WordsSetupDeps = { storage: KeyValueStorage; vaultStorage: VaultKeyStorage; readState: (safe: Address) => Promise<{ guardians: Address[]; threshold: number }>; sendOp: (calls: SponsoredCall[]) => Promise<Hex>; deviceSecrets: () => Promise<Array<{ slot: KeyBackupSlot; secret: Uint8Array }>>; remote: RemoteBackup; getPrf: () => Promise<Hex | null>; wrap: typeof wrapSecret; now: () => number }`
  - `enableRecoveryWords(p: { safe: Address; phrase: string; replace?: boolean }, deps): Promise<{ status: 'done'; wordCount: number; copies: { stored: KeyBackupSlot[]; failed: KeyBackupSlot[] } } | { status: 'error'; message: string }>` — order: (1) ONE sponsored op from `planGuardianSet` with `people = splitGuardians(current, oldPool).people` and `threshold` = the current on-chain threshold when it is ≥ 1 (so a person's own choice, e.g. "Alle 3", survives), else the default; with `replace`, the old pool's guardians are revoked in the same op; (2) save the pool; (3) save the vault key; (4) write the `_w` copies of every key on the device and the `wvk` blob (`wrap(prf, WORDS_VAULT_KEY_LABEL, vaultKey)`; no PRF → skipped). The phrase is not stored anywhere and not returned.
  - `disableRecoveryWords(p: { safe: Address }, deps): Promise<{ status: 'done' } | { status: 'error'; message: string }>` — one op revoking the word guardians, then `clearWordsPool`, `clearVaultKey`. The `_w` blobs stay (useless without the words).
- Screen states (`recovery-words.tsx`, gated by `usePasskeyGate('words')`): **intro** → **show** (`WordsGrid`, numbered 1–12, two columns, large type; the screen keeps the phrase in a ref and clears it on unmount and when the app goes to the background) → **confirm** (`WordsConfirm` asks for the three words from `pickConfirmPositions`) → **saving** (one fingerprint for the op; a second one only if the PRF is needed for `wvk`) → **done**. When words are already on, the screen shows the status and two actions: `Neue Wörter erzeugen` (runs the flow with `replace: true`) and `Wörter entfernen`.
- Copy (exact):
  - Entry row: `Wiederherstellungswörter einrichten` / when on: `Wiederherstellungswörter` with the subtext `Eingerichtet. Reichen allein aus, Wartezeit 3 Tage.`
  - Intro: `12 Wörter, mit denen du dein Konto auf einem neuen Handy zurückholst. Ohne Apple, ohne Google, ohne Vertrauenspersonen und ohne uns.` and `Wer die Wörter hat, kann dein Konto nach 3 Tagen übernehmen. In dieser Zeit wirst du gewarnt und kannst es abbrechen.`
  - Show: `Schreib die Wörter auf Papier, in dieser Reihenfolge. Wir zeigen sie nur dieses eine Mal.`
  - Confirm: `Gib Wort ${n} ein`
  - Done: `Fertig. Wir haben die Wörter nicht gespeichert.`
  - Copies incomplete: `Dein Konto ist gesichert. Abstimmungs- und Nachrichtenschlüssel sichern wir beim nächsten Mal mit.`
- `WordsInput` (used here? no — by Task 6 and plan 3): props `{ onValid: (phrase: string) => void; busy?: boolean }`; one multiline field, `autoCapitalize="none"`, `autoCorrect={false}`, `secureTextEntry={false}`; shows `phraseErrorMessage` under the field once 12 tokens are present.

- [ ] **Step 1: Write the failing test**

```ts
it('enable: one op, then pool, vault key and copies; the phrase is stored nowhere', async () => {
  const d = deps({ state: { guardians: [P1], threshold: 1 }, secrets: [{ slot: 'maci', secret: utf8Encode('m') }] });
  const r = await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps);
  expect(r).toMatchObject({ status: 'done', wordCount: 1, copies: { stored: ['maci'], failed: [] } });
  expect(d.sendOp).toHaveBeenCalledTimes(1);
  expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(deriveWordAddresses(JUNK)[0], 1)]);
  expect((await loadWordsPool(d.storage))!.addresses).toEqual(deriveWordAddresses(JUNK));
  expect(await loadVaultKey(d.vaultStorage)).toBe(wordsVaultKey(JUNK));
  expect(JSON.stringify([...d.storageDump(), ...d.vaultDump(), ...d.written])).not.toContain('junk');
  expect(Object.keys(d.written[0])).toEqual(['maci_w', 'wvk']);
});
it('a failed op stores nothing', async () => {
  const d = deps({ state: { guardians: [], threshold: 0 }, sendOp: async () => { throw new Error('userOp reverted'); } });
  expect((await enableRecoveryWords({ safe: SAFE, phrase: JUNK }, d.deps)).status).toBe('error');
  expect(await loadWordsPool(d.storage)).toBeNull();
  expect(await loadVaultKey(d.vaultStorage)).toBeNull();
});
it('replace revokes the old word guardians and adds the new ones in the same op', async () => {
  const old = deriveWordAddresses(ABOUT);
  const d = deps({ state: { guardians: [old[0]], threshold: 1 }, pool: { addresses: old, confirmedAt: 1 } });
  await enableRecoveryWords({ safe: SAFE, phrase: JUNK, replace: true }, d.deps);
  expect(d.sendOp.mock.calls[0][0]).toEqual([encodeAddGuardian(deriveWordAddresses(JUNK)[0], 1), encodeRevokeGuardian(deriveWordAddresses(JUNK)[0], old[0], 1)]);
});
it('disable revokes the word guardians and forgets pool and vault key', async () => {
  const pool = { addresses: deriveWordAddresses(JUNK), confirmedAt: 1 };
  const d = deps({ state: { guardians: [pool.addresses[0], P1], threshold: 1 }, pool, vaultKey: wordsVaultKey(JUNK) });
  expect((await disableRecoveryWords({ safe: SAFE }, d.deps)).status).toBe('done');
  expect(await loadWordsPool(d.storage)).toBeNull();
  expect(await loadVaultKey(d.vaultStorage)).toBeNull();
});
```

(`deps()` is a local test helper over in-memory storages with `storageDump()` / `vaultDump()` and a `written` array of blob maps.)

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `words-setup.ts`.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Build the three components and the screen**, wire the entry into both settings components (visible only when `isPasskeySurfaceAllowed('words')`), and run eslint on the new files plus the copy test `lib/__tests__/copy-no-vendor-names.test.ts` — Expected: no errors, PASS.
- [ ] **Step 6: Commit** — `feat(expo): set up, replace and remove Wiederherstellungswörter` — staging by path; push.

---

### Task 6: Restoring with the words

**Files:**
- Create: `apps/expo/lib/passkey/words-recovery.ts`
- Modify: `apps/expo/lib/passkey/recovery-lookup.ts` (`LookupChain.guardianLogsFor`), `recovery-flow.ts` (`RecoveryState`, new start function), `guardians-runtime.ts` (`createRecoveryDeps`)
- Modify: `apps/expo/app/passkey/restore.tsx` (method choice, words path, key restore after finalize)
- Modify: `apps/web/src/lib/passkey/__tests__/sponsor-policy-guest.test.ts` (regression: the words op shape)
- Test: `apps/expo/lib/passkey/__tests__/words-recovery.test.ts`, `recovery-flow.test.ts`

**Interfaces:**
- Consumes: `words-recovery-vector.json` (Task 3), `recoveryApprovalTypedData`, `encodeMultiConfirmRecovery`, `encodeCreateSigner`, `readRecoveryNonce` (`guardians.ts`), Tasks 1 and 4.
- Produces (`recovery-lookup.ts`): `guardianAddedEvent = parseAbiItem('event GuardianAdded(address indexed wallet, address indexed newGuardian, uint256 threshold)')`; `LookupChain.guardianLogsFor: (guardians: readonly Address[]) => Promise<Array<{ wallet: Address; guardian: Address }>>` (address = the SRM, topic 2 = any of `guardians`, from `PASSKEY_EPOCH_BLOCK`).
- Produces (`words-recovery.ts`):
  - `findWalletsByWords(pool: readonly Address[], chain: { guardianLogsFor; readGuardians: (w: Address) => Promise<Address[]>; readThreshold: (w: Address) => Promise<bigint> }): Promise<Array<{ wallet: Address; wordGuardians: Address[]; threshold: number }>>` — wallets where, right now, at least `threshold` of their guardians are pool addresses
  - `signWordApprovals(p: { phrase: string; wallet: Address; newOwner: Address; nonce: bigint; guardians: readonly Address[]; threshold: number }): Promise<GuardianApproval[]>` — the first `threshold` pool indexes whose address is a guardian sign `recoveryApprovalTypedData(wallet, [newOwner], 1, nonce)` with `wordAccount(phrase, i).signTypedData`
  - `NO_WORDS_ACCOUNT_MESSAGE = 'Zu diesen Wörtern haben wir kein Konto gefunden. Vielleicht wurden sie ersetzt oder entfernt.'`
  - `restoreKeysWithVaultKey(d: { vaultKey: Hex; remote: RemoteBackup; getPrf: () => Promise<Hex | null>; wrap; unwrap; saveLocal: (slot: KeyBackupSlot, secret: Uint8Array) => Promise<void> }): Promise<{ restored: KeyBackupSlot[]; missing: KeyBackupSlot[] }>` — reads the backup as the recovered identity, unwraps each `_w` blob, saves it locally, re-wraps it under the new passkey's PRF and writes the primary slots and a new `wvk` with `replace: true`
- Produces (`recovery-flow.ts`): `RecoveryState.method?: 'guardians' | 'words'`, `RecoveryState.wordsPool?: Address[]`; `startWordsRecovery(args: { wallet: Address; name: string; phrase: string; recoveryLegacy?: Address | null }, deps: RecoveryDeps & { readGuardians: (w: Address) => Promise<Address[]>; readNonce: (w: Address) => Promise<bigint>; saveVaultKey: (k: Hex) => Promise<void> }): Promise<RecoveryState>` — new passkey → `getSigner` → `signWordApprovals` → ONE op `[encodeCreateSigner(x, y), encodeMultiConfirmRecovery(wallet, [signer], 1, approvals, true)]` from the fresh Safe (`deployed: false`) → `readRequest` → state `waitingDelay` with `executeAfter`. The vault key is saved before the op; the phrase is dropped when the function returns. `finalizeRecoveryStep` is unchanged; after it reports `done` and `method === 'words'`, the screen calls `restoreKeysWithVaultKey` and `saveWordsPool`.
- Screen: `restore.tsx` starts with two choices, `Mit Vertrauenspersonen` (today's flow, unchanged) and `Mit 12 Wörtern` (only when the `words` surface is open). Words path: `WordsInput` → `findWalletsByWords(deriveWordAddresses(phrase))` → none: `NO_WORDS_ACCOUNT_MESSAGE`; one: continue; several: pick by profile name (`resolvePeopleNow`; an account without a name is listed as `Konto 1`, `Konto 2`, never by address) → `startWordsRecovery` → the existing countdown and finish. Under the countdown: `Der Besitzer des Kontos wird jetzt gewarnt und kann das abbrechen.`

- [ ] **Step 1: Write the failing tests**

```ts
it('reproduces the fork vector: same signers, same signatures, same calldata', async () => {
  const approvals = await signWordApprovals({ phrase: v.phrase, wallet: v.wallet, newOwner: v.newOwner, nonce: BigInt(v.nonce),
    guardians: v.guardians.map((g) => g.address), threshold: 2 });
  expect(approvals).toEqual(v.guardians.map((g) => ({ signer: g.address, signature: g.signature })));
  expect(encodeMultiConfirmRecovery(v.wallet, [v.newOwner], 1, approvals, true).data).toBe(v.multiConfirmCalldata);
});
it('fewer word guardians than the threshold: no account', async () => {
  const chain = { guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }], readGuardians: async () => [POOL[0], P1], readThreshold: async () => 2n };
  expect(await findWalletsByWords(POOL, chain)).toEqual([]);
});
it('words that were removed find nothing even though the log exists', async () => {
  const chain = { guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }], readGuardians: async () => [P1], readThreshold: async () => 1n };
  expect(await findWalletsByWords(POOL, chain)).toEqual([]);
});
it('restoreKeysWithVaultKey brings back each _w blob and rewraps it under the new passkey', async () => { /* blobs written with KEY_A; expects saveLocal(maci, bytes) and a write of { maci: <pkv1 under PRF2>, wvk } with replace true */ });
```

`recovery-flow.test.ts`: `startWordsRecovery` sends exactly one op with two calls and `deployed: false`, ends in `waitingDelay`, `saveVaultKey` was called with `wordsVaultKey(phrase)`, and the persisted state JSON does not contain any of the 12 words; a cancelled passkey sheet returns `idle` and sends nothing.

Web regression in `sponsor-policy-guest.test.ts`: an op `[createSigner(KEY), multiConfirmRecovery(WALLET, [RECOVERED_SIGNER], 1, [{ signer: W0, signature: 65 bytes }], true)]` for a guest wallet with guardian `W0` → `{ ok: true, mode: 'recovery', budgetKey: WALLET, guest: true }`.

- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement** the lookup, `words-recovery.ts`, `startWordsRecovery` and the deps wiring.
- [ ] **Step 4: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` and the web file — Expected: PASS.
- [ ] **Step 5: Build the screen changes**; eslint on `app/passkey/restore.tsx` and the new lib files.
- [ ] **Step 6: Commit** — `feat(expo): restore an account with the recovery words` — staging by path; push.

---

### Task 7: Recovery alerts by push; a session that was replaced elsewhere ends cleanly

The in-app banner already exists (`components/passkey/RecoveryBanner.tsx`, mounted at the root through `PasskeyRecoveryWatch`): it shows a pending foreign recovery and cancels it with one fingerprint. Missing: the push, and the banner's wording.

**Files:**
- Modify: `apps/web/src/lib/passkey/recovery-alerts.ts`, `email-store.ts` + `email-store-supabase.ts` (`claimAlert` / `releaseAlert` per channel), `apps/web/src/app/api/passkey/recovery-alerts/route.ts`
- Create: `apps/web/src/lib/passkey/alert-push.ts`
- Create: `supabase/migrations/20261117d_passkey_alert_channels.sql`
- Create: `apps/expo/lib/passkey/session-health.ts`
- Modify: `apps/expo/components/passkey/RecoveryBanner.tsx` (copy; the replaced-session notice in `RecordRecoveryWatch`)
- Test: `apps/web/src/lib/passkey/__tests__/recovery-alerts.test.ts`, create `apps/expo/lib/passkey/__tests__/session-health.test.ts`

**Interfaces:**
- Produces (`alert-push.ts`): `type AlertPush = { tokensFor(wallet: string): Promise<string[]>; send(tokens: string[], message: { title: string; body: string; data: Record<string, string> }): Promise<void> }`; `createSupabaseAlertPush(db): AlertPush` (active rows of `push_tokens` where `lower(wallet_address) = wallet`; POST to `https://exp.host/--/api/v2/push/send` in chunks of 100, as `apps/web/src/app/actions/push-notifications.ts` does); `recoveryAlertPush(executeAfter: bigint)` → title `Jemand stellt dein Konto wieder her`, body `Warst du das nicht? Öffne die App und brich es ab. Du hast bis ${date} Zeit.` (date formatted `de-DE`, Europe/Berlin), data `{ type: 'passkey_recovery' }`.
- Produces (`recovery-alerts.ts`): `runRecoveryAlerts` deps gain `push?: AlertPush` and `mailer` becomes optional; each channel claims separately (`claimAlert(wallet, nonce, executeAfter, 'push')`); a wallet with no email still gets the push; `RecoveryAlertResult` gains `pushed: number` and `skipped.noDevice: number`. A failed push releases its claim and holds the cursor, like a failed mail.
- Produces (store): `claimAlert(wallet, nonce, executeAfter, channel?: 'email' | 'push')`, `releaseAlert(wallet, nonce, channel?)`, default `'email'`.
- Migration: `passkey_recovery_alerts` gets `channel text not null default 'email' check (channel in ('email', 'push'))` and the primary key `(wallet_address, recovery_nonce, channel)`.
- Route: runs when `PASSKEY_EMAIL_ENABLED=1` or `PASSKEY_PUSH_ALERTS_ENABLED=1`; still refuses a non-persistent store.
- Produces (`session-health.ts`): `sessionOwnerState(session: Pick<PasskeySession, 'safe' | 'owner'>, deps: { isDeployed: (s: Address) => Promise<boolean>; readOwners: (s: Address) => Promise<Address[]>; readRequest: (s: Address) => Promise<RecoveryRequest | null> }): Promise<'ok' | 'recovering' | 'replaced' | 'unknown'>` — not deployed → `ok`; owner still in `getOwners()` and a foreign request pending → `recovering`; owner no longer an owner → `replaced`; any read error → `unknown` (never a logout).
- App: on `replaced`, `RecordRecoveryWatch` shows a blocking notice `Dieses Konto wurde auf einem anderen Gerät wiederhergestellt. Auf diesem Gerät bist du jetzt abgemeldet.` with one button `Verstanden`, which disconnects the wallet (`useDisconnect`, the existing logout path). Banner copy: headline `Jemand stellt dein Konto wieder her`, button `Das war ich nicht – abbrechen`.

- [ ] **Step 1: Failing tests.** `recovery-alerts.test.ts`:

```ts
test("a wallet without an email still gets a push, once per recovery nonce", async () => {
  const push = fakePush({ [WALLET]: ["ExponentPushToken[a]"] });
  const r1 = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 1n)]), store, push, nowSec });
  assert.equal(r1.pushed, 1);
  const r2 = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 1n)]), store: freshCursor(store), push, nowSec });
  assert.equal(r2.pushed, 0);
  const r3 = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 2n)]), store: freshCursor(store), push, nowSec });
  assert.equal(r3.pushed, 1); // a second attempt after a cancel alerts again
});
test("email and push are claimed separately; a failed push is retried without a second email", async () => { /* mailer ok, push throws → sent 1, failed 1, cursor held; next run: sent 0, pushed 1 */ });
test("no device and no email: skipped, cursor advances", async () => { /* skipped.noDevice 1, skipped.noContact 1 */ });
```

`session-health.test.ts`: the four states, plus `readOwners` throwing → `unknown`.

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the server parts and the migration (PGlite check: the same `(wallet, nonce)` can be claimed once per channel).
- [ ] **Step 4: Implement** `session-health.ts`, the watch notice and the banner copy.
- [ ] **Step 5: Run** the web folder and `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 6: Commit** — `feat: push alert when a recovery starts; a session replaced elsewhere ends with an explanation` — staging by path; push.

---

### Task 8: A way back before the Bürgerkarte

**Files:**
- Create: `apps/expo/lib/passkey/way-back.ts`
- Create: `apps/expo/components/passkey/WayBackSheet.tsx`
- Modify: `apps/expo/app/verification/request-citizen/form.tsx:80`, `apps/expo/app/welcome/consent.tsx:148` (the two places that call `createRequest` for citizenship)
- Modify: `docs/PASSKEY_ACCOUNTS_STATE.md`, `docs/PASSKEY_SIGNIN_NOTES.md`
- Test: `apps/expo/lib/passkey/__tests__/way-back.test.ts`

**Interfaces:**
- Consumes: `passkeySessionOf`, `identityKind` (`session.ts`), `readGuardianState`, `loadWordsPool`, `splitGuardians`.
- Produces (`way-back.ts`):
  - `type AccountKind = 'provider' | 'passkey' | 'words'` (`provider` = Google, Apple or email login; a passkey session on a legacy identity counts as `provider`)
  - `type WayBackFacts = { people: number; wordsOn: boolean; phraseConfirmed?: boolean; backupFileExported?: boolean }`
  - `hasWayBack(kind: AccountKind, f: WayBackFacts): boolean` — `provider`: true. `passkey`: `people >= 1 || wordsOn`. `words`: `phraseConfirmed === true || backupFileExported === true || people >= 1` (the `words` branch is used by plan 3).
  - `fastestWayBack(kind: AccountKind, wordsSurfaceOpen: boolean): { label: string; route: string }` — passkey + words open: `{ label: 'Wiederherstellungswörter einrichten', route: '/settings/recovery-words' }`; otherwise `{ label: 'Vertrauensperson hinzufügen', route: '/settings/passkey' }`.
  - `readWayBack(account: unknown, deps): Promise<{ kind: AccountKind; ok: boolean } | { kind: AccountKind; ok: null }>` — `ok: null` when the chain read failed.
  - `WAY_BACK_REASON = 'Bevor du Bürger wirst, braucht dein Konto einen Weg zurück. Sonst wäre deine Bürgerkarte weg, wenn du dein Handy verlierst.'`
- Behaviour: both call sites run `readWayBack` first. `ok === false` → `WayBackSheet` (the reason, the fastest option as the primary button, `Vertrauensperson hinzufügen` as the secondary one when it is not already the primary) and `createRequest` is not called. `ok === null` → `Keine Verbindung. Bitte versuche es erneut.` and no request. Provider accounts never see the sheet.

- [ ] **Step 1: Write the failing test**

```ts
it('provider logins are exempt', () => expect(hasWayBack('provider', { people: 0, wordsOn: false })).toBe(true));
it('a passkey account needs one person or the words', () => {
  expect(hasWayBack('passkey', { people: 0, wordsOn: false })).toBe(false);
  expect(hasWayBack('passkey', { people: 1, wordsOn: false })).toBe(true);
  expect(hasWayBack('passkey', { people: 0, wordsOn: true })).toBe(true);
});
it('an expert account needs confirmed words, an exported file or one person', () => {
  expect(hasWayBack('words', { people: 0, wordsOn: false })).toBe(false);
  expect(hasWayBack('words', { people: 0, wordsOn: false, phraseConfirmed: true })).toBe(true);
  expect(hasWayBack('words', { people: 0, wordsOn: false, backupFileExported: true })).toBe(true);
  expect(hasWayBack('words', { people: 1, wordsOn: false })).toBe(true);
});
it('the fastest option follows the words surface', () => {
  expect(fastestWayBack('passkey', true).route).toBe('/settings/recovery-words');
  expect(fastestWayBack('passkey', false).route).toBe('/settings/passkey');
});
it('a failed chain read is "unknown", never "ok"', async () => {
  const r = await readWayBack(passkeyAccount, { readState: async () => { throw new Error('rpc'); }, loadPool: async () => null });
  expect(r).toEqual({ kind: 'passkey', ok: null });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `way-back.ts`, the sheet and the two call sites.
- [ ] **Step 4: Update the docs.** `PASSKEY_ACCOUNTS_STATE.md`: a section "Wiederherstellungswörter (2026-11-17)" with the pool rule, the derivation paths, the vault key recipe (so a third party can decrypt the `_w` blobs: HKDF inputs from Task 1, blob format `pkv1` from `prf-vault.ts`), the alert channels and the way-back rule. `PASSKEY_SIGNIN_NOTES.md` §8f: the seven backup slots.
- [ ] **Step 5: Run** `./node_modules/.bin/jest lib/passkey lib/__tests__/copy-no-vendor-names.test.ts --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 6: Commit** — `feat(expo): an independent account needs a way back before the citizenship request` — staging by path; push.

---

## Owner gates (Max — not agent steps)

1. Merge `feat/sovsignup-2-recovery-words` after review.
2. Apply through the Supabase MCP: `20261117c_passkey_key_backup_words_slots.sql`, `20261117d_passkey_alert_channels.sql` (after the plan 1 list).
3. Vercel env: `PASSKEY_PUSH_ALERTS_ENABLED=1` (preview first). The alert cron from plan 1 must be live.
4. EAS update to the preview channel and your device pass on two phones: set the words up, add and remove a person (the words entry stays one row), restore on the second phone with the words, watch the push and the banner on the first, cancel once, then let a second attempt run the 3 days and check that voting and Nostr identity are back.
5. Production: `passkey_words_enabled_production = 'true'` only after that pass. The way-back rule (Task 8) goes live with the app update itself.

## Self-review (done while writing)

- Spec coverage: 5.3 setup → Tasks 1, 2, 5; "enough on their own" and threshold changes → Task 2; restore → Tasks 3, 6; alerts → Task 7; 5.4 → Task 8; 5.5 passkey part → Tasks 4, 6; 5.8 last bullet (words are not people for "Unabhängig werden") → Task 2. The expert-path half of 5.5 and the `words` branch of the way-back rule are consumed by plan 3.
- Names used across tasks: `deriveWordAddresses`, `wordsVaultKey`, `wordAccount`, `WordsPool`, `planGuardianSet`, `splitGuardians`, `writeWordsCopies`, `resolveVaultKey`, `enableRecoveryWords`, `findWalletsByWords`, `signWordApprovals`, `startWordsRecovery`, `restoreKeysWithVaultKey`, `sessionOwnerState`, `hasWayBack`.
