# Sovereign Sign-up 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing passkey "Unabhängiges Konto" shippable to production for new sign-ups: split the gate, sponsor guests for their way back and for Röbel Münzen, find a recovered Safe from its new owner, never log a passkey session out on a failed restore, and remove vendor names from the app.

**Architecture:** No new account type. The Expo gate becomes per-surface (sign-up, migration, "Unabhängig werden", words). The sponsor route grows a guest tier (non-citizen Safe: guardian management, recovery, Circles onboarding) under the existing per-account onboarding budget plus a new global guest cap. Sign-in learns "owner → Safe" from Safe `AddedOwner` logs. Boot restore becomes a list of session sources that share the retry rules of `lib/wallet-restore.ts`.

**Tech Stack:** Expo SDK 56 / React Native (StyleSheet + `useTheme()`), thirdweb v5 wallet adapter, viem 2.53 (Expo) / 2.47 (web), Next.js 15 route handlers, Supabase Postgres (migrations as files, applied through the Supabase MCP), Foundry fork tests on Gnosis, jest-expo, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-11-17-sovereign-signup-design.md` (sections 5.6, 5.8, 5.9, 6, 7; the owner → Safe part of 5.2). Read it, then `docs/PASSKEY_ACCOUNTS_STATE.md` and `docs/PASSKEY_SIGNIN_NOTES.md` (the contract between app and server).

**Plan series:** 1 foundations (this) → 2 recovery words → 3 expert path → 4 backup file and ledger. Plans 2 and 3 build on this one.

## Open questions for the owner

Tasks are written against the recommended default. Change the default and the named task changes with it.

1. **Guest budget numbers.** The onboarding budget is 0.002 xDAI per Safe per UTC day (`DEFAULT_ONBOARDING_DAILY_WEI`). The budget reserves the EntryPoint prefund (all gas limits × `maxFeePerGas`). A guest's first op deploys the Safe: at the 1.5 gwei bundler floor an op with about 0.9M total gas limit reserves about 0.00135 xDAI, so 0.002 covers roughly one op per day. A guest now needs several (sign-up request, guardians, joining Röbel Münzen, daily collect). *Default: the code constant stays; the plan adds `PASSKEY_SPONSOR_GUEST_GLOBAL_DAILY_WEI` (code default 0.02 xDAI) and lists env values under Owner gates (suggested: onboarding 0.006, guest global 0.03, overall global raised to match expected sign-ups). These are estimates, not measurements; Task 5 Step 6 prints real prefunds for you.*
2. **Guests sending Röbel Münzen.** Spec 5.6 names collecting and the profile sync. Sending (`safeTransferFrom`) stays citizen-only. *Default: not sponsored for guests.*
3. **The confirm word on "Unabhängig werden".** Today the person types `TRENNEN`. *Default: `UNABHÄNGIG`, compared case-insensitively, `UNABHAENGIG` accepted too.*
4. **Server index for owner → Safe.** Spec 5.2 allows one. *Default: none; a chain scan of Safe `AddedOwner` logs, run only when the per-key signer contract exists. Revisit when the scan passes about 300 windows (about 6 months of blocks).*

## Global Constraints

- The app is live. thirdweb login keeps working untouched; a production binary below runtime 3.8.0 must boot exactly as before.
- An app update or flag flip never logs anyone out. A failed restore is not a logout (spec 5.9).
- Nothing user-facing says "thirdweb". "thirdweb trennen" is shown as **"Unabhängig werden"** (spec 6). Describe what changes for the person, not which company is involved.
- UI text German, code and comments English. `StyleSheet.create()` + `useTheme()`, no NativeWind. Never show wallet addresses.
- "Röbel Münzen" by name, never "Währung" or CRC.
- Guest sponsoring: no value transfers, no arbitrary targets, fails closed.
- No new native modules, no new dependencies. pnpm only.
- Supabase changes are migration files under `supabase/migrations/`; applying them is an owner gate (through the Supabase MCP), never an agent step.
- Do not run a full `tsc` in `apps/expo` (it runs out of memory). Verify with eslint on touched files plus the tests.
- Expo tests: `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`. Web tests: `cd apps/web && npx tsx --test <path>`. Fork tests: `cd contracts/passkey-accounts && forge test --match-contract <Name> -vvv`.
- Other agents work in this repo. Work in a git worktree on `feat/sovsignup-1-foundations` (`git worktree add .worktrees/sovsignup-1 -b feat/sovsignup-1-foundations`, then `pnpm install --frozen-lockfile`). Stage files by explicit path, never `git add .` or `-A`. Every task ends with commit + `git push -u origin feat/sovsignup-1-foundations`. Never merge to `main`, never run EAS, never deploy.
- Commit convention: `feat(expo): …`, `feat(web): …`, `test(contracts): …`, `docs: …`.

## Review Focus

1. **A recovered account signs in to the wrong Safe.** The phone that ran a recovery deployed a throwaway Safe for its new key, so that Safe "is known". Sign-in must prefer the Safe whose owner is the per-key signer. Test in Task 6.
2. **A storage error at boot behind a dormant thirdweb login.** If the passkey session cannot be read, the app must not silently come up as a different (thirdweb) account. Test in Task 2.
3. **A guest op that mixes a guest-allowed call with a citizen-only one** (for example `addGuardianWithThreshold` + `groupMint`) must be refused as a whole. Test in Task 3.
4. **The guest cap being reached** must stop guests only; a citizen's op in the same second still passes. Test in Task 5.
5. **A preview user who already moved to a passkey** must still reach guardians and the warning email in Settings when the migration surface is closed in production. Test in Task 7.

---

### Task 1: Per-surface gate

**Files:**
- Modify: `apps/expo/lib/passkey/gate.ts`
- Modify: `apps/expo/lib/supabase-app-settings.ts` (after line 130)
- Modify: `apps/expo/components/passkey/PasskeyUi.tsx:17-34` (`usePasskeyGate`)
- Modify callers: `apps/expo/app/consent.tsx:49`, `apps/expo/components/passkey/PasskeySignInOption.tsx`, `PasskeyEntryLinks.tsx`, `PasskeyRecoveryWatch.tsx`, `apps/expo/app/settings/passkey-detach.tsx`
- Test: `apps/expo/lib/passkey/__tests__/gate.test.ts`, `signin-ui.test.tsx`, `boot.test.ts` (mocks only)

**Interfaces:**
- Produces (`gate.ts`):
  - `type PasskeySurface = 'signup' | 'migration' | 'detach' | 'words'`
  - `const SURFACE_PRODUCTION_FLAG: Record<PasskeySurface, string>` = `signup: 'passkey_accounts_enabled_production'`, `migration: 'passkey_migration_enabled_production'`, `detach: 'passkey_detach_enabled_production'`, `words: 'passkey_words_enabled_production'`
  - `passkeySurfaceAllowed(p: { surface: PasskeySurface; flag: boolean; channel: string | null | undefined; dev: boolean; productionFlags?: Partial<Record<PasskeySurface, boolean>>; runtimeVersion?: string | null }): boolean`
  - `isPasskeySurfaceAllowed(surface: PasskeySurface): Promise<boolean>`
  - `passkeyChannelAllowed` and `runtimeSupportsPasskeys` unchanged.
  - `passkeyPreviewAllowed` and `isPasskeyPreviewAllowed` are **deleted**, so no caller stays on the wide gate by accident.
- Produces (`supabase-app-settings.ts`): `fetchPasskeyFlags(): Promise<Record<string, boolean>>` — one query (`.in('key', [...])`) for `passkey_accounts_enabled` and the four production keys; a missing key or any error is `false`.
- Produces (`PasskeyUi.tsx`): `usePasskeyGate(surface: PasskeySurface = 'signup', redirectHome = true): boolean | null`.

Rules: the kill switch `passkey_accounts_enabled` off closes everything. Dev builds and non-production channels: every surface open (preview behaves as today). Production: runtime ≥ 3.8.0 AND the `signup` production flag AND, for any other surface, that surface's own production flag. Surface per caller: consent, sign-in option, entry links, recovery watch and the four `app/passkey/*` screens → `signup`; `passkey-detach.tsx` → `detach`. `app/settings.tsx` and `app/settings/passkey.tsx` are handled in Task 7.

- [ ] **Step 1: Replace the `passkeyPreviewAllowed` describe block in `gate.test.ts` with failing tests**

```ts
const base = { flag: true, dev: false, runtimeVersion: '3.8.0' } as const;
it('kill switch off closes every surface on every channel', () => {
  for (const surface of ['signup', 'migration', 'detach', 'words'] as const) {
    expect(passkeySurfaceAllowed({ ...base, flag: false, surface, channel: 'preview' })).toBe(false);
    expect(passkeySurfaceAllowed({ ...base, flag: false, surface, channel: null, dev: true })).toBe(false);
  }
});
it('preview and dev open every surface with the kill switch on', () => {
  for (const surface of ['signup', 'migration', 'detach', 'words'] as const) {
    expect(passkeySurfaceAllowed({ ...base, surface, channel: 'preview' })).toBe(true);
    expect(passkeySurfaceAllowed({ ...base, surface, channel: null, dev: true })).toBe(true);
  }
});
it('production: signup opens alone; the others need signup AND their own flag', () => {
  const p = { ...base, channel: 'production' };
  expect(passkeySurfaceAllowed({ ...p, surface: 'signup', productionFlags: { signup: true } })).toBe(true);
  expect(passkeySurfaceAllowed({ ...p, surface: 'migration', productionFlags: { signup: true } })).toBe(false);
  expect(passkeySurfaceAllowed({ ...p, surface: 'detach', productionFlags: { signup: true, migration: true } })).toBe(false);
  expect(passkeySurfaceAllowed({ ...p, surface: 'words', productionFlags: { words: true } })).toBe(false);
  expect(passkeySurfaceAllowed({ ...p, surface: 'words', productionFlags: { signup: true, words: true } })).toBe(true);
});
it('production below runtime 3.8.0 and a release build without a channel stay closed', () => {
  expect(passkeySurfaceAllowed({ ...base, surface: 'signup', channel: 'production', runtimeVersion: '3.7.0', productionFlags: { signup: true } })).toBe(false);
  expect(passkeySurfaceAllowed({ ...base, surface: 'signup', channel: null })).toBe(false);
});
```

Add one async test: with `expo-updates` mocked to `production` / `3.7.0`, `isPasskeySurfaceAllowed('signup')` resolves `false` and `fetchPasskeyFlags` was not called.

- [ ] **Step 2: Run** `./node_modules/.bin/jest lib/passkey/__tests__/gate.test.ts --watchAll=false --no-watchman --ci` — Expected: FAIL, `passkeySurfaceAllowed` is not exported.
- [ ] **Step 3: Implement** `fetchPasskeyFlags` and the gate functions; delete the two old exports; switch every caller listed under Files. Update the `@/lib/supabase-app-settings` jest mocks in `gate.test.ts`, `signin-ui.test.tsx` and `boot.test.ts` to `fetchPasskeyFlags`.
- [ ] **Step 4: Run** the three test files and `grep -rn "isPasskeyPreviewAllowed\|passkeyPreviewAllowed" apps/expo --include='*.ts' --include='*.tsx' -l | grep -v node_modules` — Expected: tests PASS; the grep prints only `app/settings.tsx` and `app/settings/passkey.tsx` (Task 7 removes them; until then keep a one-line local alias `const isPasskeyPreviewAllowed = () => isPasskeySurfaceAllowed('signup')` in those two files).
- [ ] **Step 5: Lint and commit**

```bash
cd apps/expo && ./node_modules/.bin/eslint lib/passkey/gate.ts lib/supabase-app-settings.ts components/passkey app/consent.tsx app/settings/passkey-detach.tsx
git add apps/expo/lib/passkey/gate.ts apps/expo/lib/supabase-app-settings.ts apps/expo/components/passkey/PasskeyUi.tsx apps/expo/components/passkey/PasskeySignInOption.tsx apps/expo/components/passkey/PasskeyEntryLinks.tsx apps/expo/components/passkey/PasskeyRecoveryWatch.tsx apps/expo/app/consent.tsx apps/expo/app/settings.tsx apps/expo/app/settings/passkey.tsx apps/expo/app/settings/passkey-detach.tsx apps/expo/lib/passkey/__tests__/gate.test.ts apps/expo/lib/passkey/__tests__/signin-ui.test.tsx apps/expo/lib/passkey/__tests__/boot.test.ts
git commit -m "feat(expo): split the passkey gate into sign-up, migration, detach and words surfaces"
git push -u origin feat/sovsignup-1-foundations
```

---

### Task 2: A failed passkey restore is not a logout

Today `bootWallets` (`lib/passkey/boot.ts`) swallows a failed `loadSession` / `connectPasskey` and falls through to thirdweb. With no thirdweb login the app shows the logged-out state; with a dormant thirdweb login of another account it comes up as that account. `lib/wallet-restore.ts` (commit `8a95cae4`) already has the right rules for thirdweb; this task puts sovereign sessions under the same rules. The boot takes a list of session sources; plan 3 reuses the passkey source for the 12-word owner type (same stored session shape, `owner: 'words'` in the restore report).

**Files:**
- Modify: `apps/expo/lib/wallet-restore.ts` (`RestoreDeps`, `RestoreReport`)
- Modify: `apps/expo/lib/passkey/boot.ts` (rewrite, 45 lines today)
- Modify: `apps/expo/context/WalletBootContext.tsx:92-202`
- Modify: `apps/expo/lib/passkey/signin-runtime.ts` (export the passkey source)
- Test: `apps/expo/lib/__tests__/wallet-restore.test.ts`, `apps/expo/lib/passkey/__tests__/boot.test.ts`

**Interfaces:**
- Produces (`wallet-restore.ts`): `RestoreDeps.isFatal?: (e: unknown) => boolean` (a fatal error ends the attempts at once with outcome `'failed'`); `RestoreReport.owner?: 'thirdweb' | 'passkey' | 'words'`.
- Produces (`boot.ts`):
  - `class SessionCorruptError extends Error` (name `'SessionCorruptError'`)
  - `type SessionSource<S = unknown> = { owner: 'passkey' | 'words'; hasStored: () => Promise<boolean>; load: () => Promise<S | null>; connect: (session: S) => Promise<void> }` — `hasStored` is the raw presence of the session key; `load` returns null when the key is present but unparsable and may throw on a storage error.
  - `type BootDeps = { channelAllowed: () => boolean; sources: SessionSource[]; restoreThirdweb: () => Promise<RestoreResult>; delaysMs: readonly number[]; sleep: (ms: number) => Promise<void>; isCancelled?: () => boolean }`
  - `type BootResult = { owner: 'passkey' | 'words' | 'thirdweb'; result: RestoreResult }`
  - `bootWallets(deps: BootDeps): Promise<BootResult>`
  - `retrySource(source: SessionSource, deps: Pick<BootDeps, 'sleep' | 'isCancelled'>): Promise<RestoreResult>` (one attempt, for the background timer)
- Produces (`signin-runtime.ts`): `passkeySessionSource(setActiveWallet: (w: Wallet) => Promise<void>): SessionSource<PasskeySession>`.

Rules for `bootWallets`: channel not allowed → thirdweb, no storage read. Otherwise the first source whose `hasStored()` is true (a throw counts as true) owns the boot and runs through `restoreWithRetry` (attempt = load, throw `SessionCorruptError` on null, connect). `'restored'` → done. All errors `SessionCorruptError` (fatal, no retries) → fall through to thirdweb. Any other `'failed'` → return it with that owner and **do not** try thirdweb. No source has a stored session → thirdweb.

- [ ] **Step 1: Write failing tests.** In `wallet-restore.test.ts`:

```ts
it('a fatal error stops retrying and is a failure, not a logout', async () => {
  const attempt = jest.fn(async () => { throw new Error('corrupt'); });
  const r = await restoreWithRetry({ attempt, hasStoredSession: async () => true, delaysMs: [1, 1, 1], sleep: async () => undefined, isFatal: () => true });
  expect(r.outcome).toBe('failed');
  expect(attempt).toHaveBeenCalledTimes(1);
});
```

In `boot.test.ts` replace the `deps()` helper with one that builds a `passkey` source over `spyStorage` and a `restoreThirdweb` mock resolving `{ outcome: 'no-session', attempts: 1, errors: [], hadStoredSession: false }`, keep the three existing cases adapted to the new result shape, and add:

```ts
it('stored session, connect keeps failing → failed for passkey, thirdweb is never tried', async () => {
  const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION) });
  const { d } = deps({ storage, connect: jest.fn(async () => { throw new Error('rpc down'); }) });
  const r = await bootWallets(d);
  expect(r).toMatchObject({ owner: 'passkey', result: { outcome: 'failed', hadStoredSession: true, attempts: 4 } });
  expect(d.restoreThirdweb).not.toHaveBeenCalled();
});
it('storage throws while reading the session → failed, not logged out', async () => {
  const { d } = deps({ hasStored: async () => { throw new Error('keychain locked'); }, load: async () => { throw new Error('keychain locked'); } });
  expect((await bootWallets(d)).result.outcome).toBe('failed');
  expect(d.restoreThirdweb).not.toHaveBeenCalled();
});
it('a corrupt session falls through to thirdweb after ONE attempt', async () => {
  const storage = spyStorage({ [PASSKEY_SESSION_KEY]: '{"broken":true}' });
  const { d } = deps({ storage });
  expect((await bootWallets(d)).owner).toBe('thirdweb');
  expect(d.restoreThirdweb).toHaveBeenCalledTimes(1);
});
it('a second attempt that succeeds restores the passkey session', async () => {
  const storage = spyStorage({ [PASSKEY_SESSION_KEY]: JSON.stringify(SESSION) });
  let n = 0;
  const { d } = deps({ storage, connect: jest.fn(async () => { if (n++ === 0) throw new Error('once'); }) });
  expect(await bootWallets(d)).toMatchObject({ owner: 'passkey', result: { outcome: 'restored', attempts: 2 } });
});
```

(`deps` passes `delaysMs: [1, 1, 1]` and a no-op `sleep`.)

- [ ] **Step 2: Run both test files** — Expected: FAIL (`isFatal` ignored; `bootWallets` returns a string).
- [ ] **Step 3: Implement** `isFatal` in `restoreWithRetry`, the new `boot.ts`, and `passkeySessionSource` (`hasStored` = `SecureStore.getItemAsync(PASSKEY_SESSION_KEY) !== null`).
- [ ] **Step 4: Rewire `WalletBootContext.tsx`.** `autoConnectThirdweb` becomes `restoreThirdweb` returning its `RestoreResult`; the effect calls `bootWallets({ sources: [passkeySessionSource(setActiveWallet)], delaysMs: RESTORE_RETRY_DELAYS_MS, … })`, records the result with `owner`, and on `'failed'` sets `restoreFailed` and starts the existing background timer, whose retry calls `retrySource(...)` for a sovereign owner and the existing thirdweb attempt otherwise. `recordRestore` gains the `owner` field. `signin-runtime` stays a dynamic import, loaded only when `passkeyChannelAllowed()` is true.
- [ ] **Step 5: Run** both test files plus `lib/passkey/__tests__/signin-ui.test.tsx` — Expected: PASS.
- [ ] **Step 6: Lint and commit**

```bash
cd apps/expo && ./node_modules/.bin/eslint lib/wallet-restore.ts lib/passkey/boot.ts lib/passkey/signin-runtime.ts context/WalletBootContext.tsx
git add apps/expo/lib/wallet-restore.ts apps/expo/lib/passkey/boot.ts apps/expo/lib/passkey/signin-runtime.ts apps/expo/context/WalletBootContext.tsx apps/expo/lib/__tests__/wallet-restore.test.ts apps/expo/lib/passkey/__tests__/boot.test.ts
git commit -m "fix(expo): a failed passkey session restore is retried, never treated as a logout"
git push
```

---

### Task 3: Sponsor — guests manage guardians and join Röbel Münzen

**Files:**
- Modify: `apps/web/src/lib/passkey/everyday-allowlist.ts:200-225` (tiers)
- Modify: `apps/web/src/lib/passkey/sponsor-policy.ts` (`PolicyResult`, `ScanState`, `evaluateSafeEveryday` at 857, the tail of `evaluateSponsorPolicy` at 1010-1021, header comment)
- Test: Create `apps/web/src/lib/passkey/__tests__/sponsor-policy-guest.test.ts`; modify `everyday-policy.test.ts:249-262` and `sponsor-policy-recovery-helper.test.ts:60` (both assert today's refusal)

**Interfaces:**
- Produces: `PolicyResult` ok-variant gains `guest?: true` — set whenever the budget identity is a non-citizen Safe. `tier: "onboarding"` stays on everyday results.
- Produces: `ScanState.legacyShapes: boolean` — true for a handover, `createAccount`, `moveTo`, or any `legacy.execute` / `executeBatch`. (`migration` stays as it is: it is also set by SRM calls.)
- Onboarding tier (allowed for a non-citizen Safe) becomes: `CitizenNFTv2.createAttestationRequest`, `Hub.registerHuman`, `Hub.personalMint`, `NameRegistry.updateMetadataDigest`. `groupMint`, `trust`, `safeTransferFrom` and everything else stay citizen-tier.
- A non-citizen sender Safe (no `legacy` in the body) is sponsored when every call is onboarding-tier everyday or SRM guardian management (`addGuardianWithThreshold`, `revokeGuardianWithThreshold`, `changeThreshold`, `cancelRecovery`), and `legacyShapes` is false. Result: `{ ok: true, mode: 'everyday' | 'safe', budgetKey: sender, guest: true }` (`mode: 'safe'` when the op holds no everyday call). A `confirmRecovery` may ride along with guardian management, as in mode B today; an op that is ONLY `confirmRecovery` calls keeps going to recovery mode (budget = the wallet, Task 4).

- [ ] **Step 1: Write the failing tests** in `sponsor-policy-guest.test.ts` (helpers from `./fake-chain` and `./policy-helpers`; `NO_LEGACY = { ...KEY, nowSeconds: NOW }`; `GUARDIAN` from fake-chain):

```ts
const add = encodeFunctionData({ abi: srm, functionName: "addGuardianWithThreshold", args: [GUARDIAN, 1n] });
const revoke = encodeFunctionData({ abi: srm, functionName: "revokeGuardianWithThreshold", args: [SENTINEL, GUARDIAN, 1n] });
const threshold = encodeFunctionData({ abi: srm, functionName: "changeThreshold", args: [1n] });
const cancel = encodeFunctionData({ abi: srm, functionName: "cancelRecovery" });

test("guest Safe: each guardian-management call is sponsored as a guest", async () => {
  for (const data of [add, revoke, threshold, cancel]) {
    const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, data)), NO_LEGACY, fakeChain());
    assert.deepEqual(r, { ok: true, mode: "safe", budgetKey: SAFE, guest: true });
  }
});
test("guest Safe: sign-up batch = guardian + citizenship request, one op, deploy included", async () => {
  const fresh = { x: `0x${"aa".repeat(32)}` as Hex, y: `0x${"bb".repeat(32)}` as Hex };
  const r = await evaluateSponsorPolicy(
    deployOp(fresh, predictSafeAddress(fresh), viaMultiSend([{ to: ADDRESSES.socialRecoveryModule, data: add }, { to: C.citizenNft, data: askCitizen }])),
    { ...fresh, nowSeconds: NOW }, fakeChain());
  assert.ok(r.ok && r.guest === true && r.budgetKey.toLowerCase() === predictSafeAddress(fresh).toLowerCase());
});
test("guest Safe: registerHuman, personalMint and the profile sync are onboarding tier", async () => {
  for (const [to, data] of [[C.circlesHub, registerHuman], [C.circlesHub, personalMint], [C.circlesNameRegistry, metadata]] as const) {
    const r = await evaluateSponsorPolicy(op(outer(to, data)), NO_LEGACY, fakeChain());
    assert.ok(r.ok && r.mode === "everyday" && r.tier === "onboarding" && r.guest === true, JSON.stringify(r));
  }
});
test("guest Safe: groupMint, trust and sending Münzen stay citizen-only, alone or mixed in", async () => {
  for (const data of [groupMint(), trust, send(SAFE)]) {
    const alone = await evaluateSponsorPolicy(op(outer(C.circlesHub, data)), NO_LEGACY, fakeChain());
    assert.ok(!alone.ok && /citizen/.test(alone.reason));
    const mixed = await evaluateSponsorPolicy(op(viaMultiSend([{ to: ADDRESSES.socialRecoveryModule, data: add }, { to: C.circlesHub, data }])), NO_LEGACY, fakeChain());
    assert.equal(mixed.ok, false);
  }
});
test("a citizen Safe is not a guest", async () => {
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add)), NO_LEGACY, fakeChain((w) => w.citizens.add(SAFE.toLowerCase())));
  assert.deepEqual(r, { ok: true, mode: "safe", budgetKey: SAFE });
});
test("an arbitrary sender that is not a genuine passkey Safe gets nothing", async () => {
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: RECIPIENT }), NO_LEGACY, fakeChain());
  assert.equal(r.ok, false);
});
```

Copy the calldata constants (`registerHuman`, `personalMint`, `metadata`, `groupMint`, `trust`, `send`, `askCitizen`, `C`) from the top of `everyday-policy.test.ts`. `SENTINEL = "0x0000000000000000000000000000000000000001"`.

- [ ] **Step 2: Run** `cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-policy-guest.test.ts` — Expected: FAIL ("sender holds no CitizenNFT…", "requires a citizen identity").
- [ ] **Step 3: Implement.** Tiers in `classifyEverydayCall`; `legacyShapes` set next to the existing `st.migration = true` lines for non-SRM shapes; in `evaluateSafeEveryday` the non-citizen branch refuses on `st.legacyShapes || !st.onboardingOnly` and returns `guest: true`; in the tail of `evaluateSponsorPolicy` a non-citizen sender with only SRM identity calls runs `checkSender` and returns the guest result. `checkSender` is never skipped.
- [ ] **Step 4: Update the two older tests** to the new rule (the non-citizen everyday test now expects `registerHuman` / `personalMint` to pass and `trust` to be refused; the recovery-helper test at line 60 now expects a guest result) and rewrite modes B and D in the header comment of `sponsor-policy.ts` and the tier list in `everyday-allowlist.ts`.
- [ ] **Step 5: Run the whole folder** `npx tsx --test src/lib/passkey/__tests__/*.test.ts` — Expected: PASS (the live tests skip without `PASSKEY_LIVE_TEST=1`).
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/passkey/everyday-allowlist.ts apps/web/src/lib/passkey/sponsor-policy.ts apps/web/src/lib/passkey/__tests__/sponsor-policy-guest.test.ts apps/web/src/lib/passkey/__tests__/everyday-policy.test.ts apps/web/src/lib/passkey/__tests__/sponsor-policy-recovery-helper.test.ts
git commit -m "feat(web): sponsor guardian management and Röbel Münzen onboarding for guest Safes"
git push
```

---

### Task 4: Sponsor — recovering a guest's Safe

**Files:**
- Modify: `apps/web/src/lib/passkey/sponsor-policy.ts:678-711` (factor the shape check) and `881-931` (`evaluateRecoveryMode`)
- Test: `apps/web/src/lib/passkey/__tests__/sponsor-policy-guest.test.ts`

**Interfaces:**
- Produces: `checkDeployedSafeShape(safe: Hex, chain: ChainReader): Promise<Check>` — SafeProxy 1.4.1 runtime, singleton Safe L2 1.4.1, fallback handler Safe4337Module, Safe4337Module **and** SocialRecoveryModule enabled, exactly one owner. `checkDeployedPasskeySafe` calls it, then binds the owner to (x, y) as today.
- Recovery mode: when the wallet is not a citizen identity (directly or through `recoveryLegacy`), it is still sponsored if `checkDeployedSafeShape(wallet)` passes and it has ≥ 1 guardian. Result `{ ok: true, mode: 'recovery', budgetKey: wallet, guest: true }`. All other recovery rules stay (new owner = the submitter's signer, threshold 1, delay over for finalize, sender is a guardian for `confirmRecovery`).

- [ ] **Step 1: Add failing tests**

```ts
const WALLET = "0x9999999999999999999999999999999999999999" as Hex;
const guestWallet = (w: FakeWorld) => { makePasskeySafe(w, WALLET, OTHER_KEY); w.guardians.set(WALLET.toLowerCase(), new Set([SAFE.toLowerCase()])); w.webauthnSigners.set(signerKey(KEY), RECOVERED_SIGNER); };

test("recovering a guest Safe: confirmRecovery by a guardian Safe is sponsored as a guest", async () => {
  const confirm = encodeFunctionData({ abi: srm, functionName: "confirmRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n, false] });
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, confirm)), NO_LEGACY, fakeChain(guestWallet));
  assert.deepEqual(r, { ok: true, mode: "recovery", budgetKey: WALLET, guest: true });
});
test("recovering a guest Safe: executeRecovery to the submitter's own signer", async () => {
  const exec = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n] });
  const r = await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec)), NO_LEGACY, fakeChain(guestWallet));
  assert.ok(r.ok && r.guest === true);
});
test("a wallet that is not a sovereign Safe, or has no guardian, is refused", async () => {
  const exec = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [RECIPIENT, [RECOVERED_SIGNER], 1n] });
  assert.equal((await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec)), NO_LEGACY, fakeChain(guestWallet))).ok, false);
  const noGuardian = (w: FakeWorld) => { guestWallet(w); w.guardians.delete(WALLET.toLowerCase()); };
  const exec2 = encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [RECOVERED_SIGNER], 1n] });
  assert.equal((await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, exec2)), NO_LEGACY, fakeChain(noGuardian))).ok, false);
});
```

`OTHER_KEY` is any second 32-byte pair; `signerKey` is the key format `fake-chain.ts` uses for `webauthnSigners` (read `getWebAuthnSigner` there).

- [ ] **Step 2: Run** the file — Expected: FAIL ("not a citizen identity").
- [ ] **Step 3: Implement** the factored shape check and the guest branch. A citizen wallet keeps returning no `guest` field.
- [ ] **Step 4: Run the whole folder** — Expected: PASS.
- [ ] **Step 5: Commit** (`sponsor-policy.ts`, the test file) — `feat(web): sponsor recovery of a guest Safe that has guardians` — and push.

---

### Task 5: Global guest cap

**Files:**
- Modify: `apps/web/src/lib/passkey/sponsor-budget.ts`
- Modify: `apps/web/src/lib/passkey/sponsor-handler.ts:126-152`
- Modify: `apps/web/src/app/api/passkey/sponsor/route.ts` (env comment only)
- Create: `supabase/migrations/20261117a_passkey_sponsor_guest_cap.sql`
- Test: `apps/web/src/lib/passkey/__tests__/sponsor-budget.test.ts`, `sponsor-budget-supabase.test.ts`, `sponsor-route.test.ts`

**Interfaces:**
- Produces: `ReserveLimits` gains `group?: { key: string; dailyWei: bigint }`; `GUEST_GROUP_KEY = "guests"`; `DEFAULT_GUEST_GLOBAL_DAILY_WEI = 2n * 10n ** 16n`; `SPONSOR_RESERVE_RPC = "passkey_sponsor_reserve_v2"`.
- A reservation with a group is counted against three totals atomically: the key, the group and the global total. Any cap reached → `false`, nothing counted.
- Handler: for `verdict.guest`, `limits = { perKeyDailyWei: onboarding cap, group: { key: GUEST_GROUP_KEY, dailyWei: weiFromEnv(PASSKEY_SPONSOR_GUEST_GLOBAL_DAILY_WEI, DEFAULT_GUEST_GLOBAL_DAILY_WEI) } }`. The old `verdict.tier === "onboarding"` branch is replaced by `verdict.guest`.
- Migration: additive on top of `20260927_passkey_sponsor_budget.sql` (still unapplied; do not edit it). Widens the `budget_key` check to allow `'guests'`; creates `passkey_sponsor_reserve_v2(p_budget_key text, p_cost_wei numeric, p_key_cap_wei numeric, p_global_cap_wei numeric, p_group_key text, p_group_cap_wei numeric) returns boolean`, `security definer`, `set search_path = ''`, EXECUTE revoked from `public, anon, authenticated`, granted to `service_role`. Lock order: `global`, then the group row (when given), then the key row. `p_group_key` must be null or `'guests'`.

- [ ] **Step 1: Failing tests** in `sponsor-budget.test.ts`:

```ts
test("guest cap: guests share one daily total, citizens are not touched by it", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 1000n, globalDailyWei: 10_000n });
  const guest = { perKeyDailyWei: 100n, group: { key: "guests", dailyWei: 150n } };
  assert.equal(await b.reserve("0xa", 100n, guest), true);
  assert.equal(await b.reserve("0xb", 100n, guest), false); // group would reach 200 > 150
  assert.equal(await b.reserve("0xb", 50n, guest), true);
  assert.equal(await b.reserve("0xc", 1n, guest), false);   // guests are full
  assert.equal(await b.reserve("0xd", 900n), true);         // a citizen still passes
});
test("a refused guest reservation counts nowhere", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 1000n, globalDailyWei: 120n });
  assert.equal(await b.reserve("0xa", 130n, { group: { key: "guests", dailyWei: 500n } }), false);
  assert.equal(await b.reserve("0xa", 120n, { group: { key: "guests", dailyWei: 500n } }), true);
});
```

In `sponsor-budget-supabase.test.ts`: the store calls `passkey_sponsor_reserve_v2` with `p_group_key: "guests"`, `p_group_cap_wei: "150"` for a guest and `p_group_key: null` otherwise. In `sponsor-route.test.ts`: a guest verdict (non-citizen Safe adding a guardian) reaches `budget.reserve` with a `group` limit; with a budget stub that returns `false` the route answers 429 `budget_exhausted`; with one that throws, 503.

- [ ] **Step 2: Run** the three files — Expected: FAIL.
- [ ] **Step 3: Implement** the in-memory group counter, the Supabase call, the handler branch and the migration file. Check the SQL the way the earlier migrations were checked: load both budget migrations into PGlite in a throwaway script under your scratch directory (not committed) and assert caps, grants and the `'guests'` key.
- [ ] **Step 4: Run the whole folder** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(web): global daily cap for guest sponsoring` — staging the three source files, the migration and the three tests; push.
- [ ] **Step 6: Give the owner real numbers.** Add a node:test case `prints the prefund of typical guest ops` in `sponsor-route.test.ts` that logs `requiredPrefund(toPackedUserOperation(op))` for (a) deploy + guardian + citizenship request and (b) a deployed Safe's `personalMint`, with the gas limits from `policy-helpers.ts` `op()` at `maxFeePerGas` 1.5 gwei and 3 gwei. Copy the four numbers into the "Owner gates" list of this plan (item 3) in the same commit as Task 10.

---

### Task 6: Find the Safe of a changed owner

A Safe recovered to a new passkey keeps its address, but the new key no longer derives it (`PASSKEY_SIGNIN_NOTES.md` §7). The recovery installs the owner `SafeWebAuthnSignerFactory.getSigner(x, y)`, a contract that only exists once `createSigner` ran, and the Safe emits `AddedOwner(address indexed owner)`.

**Files:**
- Modify: `contracts/passkey-accounts/test/SocialRecovery.t.sol` (assert the event)
- Modify: `apps/expo/lib/passkey/recovery-lookup.ts` (`LookupChain`, `createLookupChain`, new finder)
- Modify: `apps/expo/lib/passkey/signin.ts:63-135` (`KeyChain`, `resolveCredentialKey`)
- Modify: `apps/expo/lib/passkey/signin-runtime.ts:71-78` (`keyChain`)
- Test: `apps/expo/lib/passkey/__tests__/recovery-lookup.test.ts`, `signin.test.ts`

**Interfaces:**
- Produces (`recovery-lookup.ts`):
  - `safeAddedOwnerEvent = parseAbiItem('event AddedOwner(address indexed owner)')`
  - `LookupChain.ownerLogsFor: (owner: Address) => Promise<Array<{ emitter: Address; blockNumber: bigint }>>` (no address filter, topic = owner, from `PASSKEY_EPOCH_BLOCK`, backward windows, stops at the first window with a hit)
  - `LookupChain.readOwners: (safe: Address) => Promise<Address[]>`
  - `findSafesByOwner(owner: Address, chain: Pick<LookupChain, 'ownerLogsFor' | 'readOwners'>): Promise<Address[]>` — emitters whose `getOwners()` is exactly `[owner]` right now, newest first, de-duplicated. A stale log (owner changed again) is dropped.
- Produces (`signin.ts`): `KeyChain` gains `getSigner: (x: Hex, y: Hex) => Promise<Address>` and `findSafesByOwner: (owner: Address) => Promise<Address[]>`.
- `resolveCredentialKey` order for a credential with no local record, per candidate key: (1) `signer = getSigner(x, y)`; if `hasCode(signer)` and `findSafesByOwner(signer)` returns exactly one Safe → `{ x, y, safe, owner: signer, ownerType: 'webauthnSigner' }`; more than one → the existing "passt zu mehreren Konten" error. (2) Only when no candidate matched in (1): today's SharedSigner logic, unchanged.

- [ ] **Step 1: Prove the event on the fork.** In `SocialRecovery.t.sol`, in the test that finalizes a recovery, add before the `finalizeRecovery` call: `vm.expectEmit(true, false, false, false, address(safe)); emit AddedOwner(newOwner);` with `event AddedOwner(address indexed owner);` declared in the test contract. Run `forge test --match-contract SocialRecovery -vvv` — Expected: PASS. If the Safe emits a different event for this path, stop and report: the lookup design depends on it.
- [ ] **Step 2: Failing tests.** `recovery-lookup.test.ts`:

```ts
it('findSafesByOwner keeps only emitters whose single owner is still that owner', async () => {
  const chain = { ownerLogsFor: async () => [{ emitter: A, blockNumber: 5n }, { emitter: B, blockNumber: 9n }, { emitter: B, blockNumber: 7n }],
                  readOwners: async (s: Address) => (s === B ? [OWNER] : [OTHER]) };
  expect(await findSafesByOwner(OWNER, chain)).toEqual([B]);
});
```

`signin.test.ts` (Review Focus 1):

```ts
it('a recovered Safe wins over the throwaway Safe the recovery phone deployed', async () => {
  // Both exist for the same key: the SharedSigner Safe has code, and RECOVERED has owner = the per-key signer.
  const key = await resolveCredentialKey(assertion, { local: [], signAgain,
    chain: { ...knownChain({ hasCode: [predictSafeAddress(KEY), SIGNER] }), getSigner: async () => SIGNER, findSafesByOwner: async () => [RECOVERED] } });
  expect(key).toMatchObject({ safe: RECOVERED, owner: SIGNER, ownerType: 'webauthnSigner' });
});
it('no signer contract → no log scan, today\'s behaviour', async () => {
  const findSafesByOwner = jest.fn(async () => []);
  await resolveCredentialKey(assertion, { local: [], signAgain, chain: { ...knownChain({ hasCode: [predictSafeAddress(KEY)] }), getSigner: async () => SIGNER, findSafesByOwner } });
  expect(findSafesByOwner).not.toHaveBeenCalled();
});
```

Build `assertion`, `KEY` and `knownChain` from the helpers `signin.test.ts` already uses (`__testutils__/signin-helpers`).

- [ ] **Step 3: Run** both files — Expected: FAIL.
- [ ] **Step 4: Implement** the finder, the `createLookupChain` wiring (`client.getLogs({ event: safeAddedOwnerEvent, args: { owner }, ...window })`, `readOwners` via the `getOwners` ABI already in `guardians-runtime.ts`), the new order in `resolveCredentialKey`, and the runtime wiring (`getSigner` = `readWebAuthnSigner`).
- [ ] **Step 5: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 6: Commit** — `feat(expo): sign in to a recovered Safe from its new passkey on any device` — staging the four source files, the Solidity test and the two jest files; push.

---

### Task 7: Settings for an independent account; guests reach their guardians

Today `app/settings/passkey.tsx` is the migration screen for thirdweb users and shows an error to a passkey-only person; guardian changes are refused in the app unless the identity is a citizen.

**Files:**
- Create: `apps/expo/lib/passkey/settings-kind.ts`
- Create: `apps/expo/components/passkey/MigrationSettings.tsx` (today's screen body, moved)
- Create: `apps/expo/components/passkey/SovereignAccountSettings.tsx`
- Modify: `apps/expo/app/settings/passkey.tsx` (becomes a thin chooser), `apps/expo/app/settings.tsx:125-137,294-310`
- Modify: `apps/expo/lib/passkey/guardian-plan.ts:140-148` (`identityModeFor`)
- Modify: `apps/expo/components/passkey/GuardiansSection.tsx:166-220`, `useGuardianManager.ts:121-123,178-180` (copy only)
- Test: Create `apps/expo/lib/passkey/__tests__/settings-kind.test.ts`; modify `guardian-plan.test.ts`

**Interfaces:**
- Produces: `settingsKind(p: { passkeySession: boolean; identityIsSafe: boolean; hasRecord: boolean; recordConnected: boolean; signupOpen: boolean; migrationOpen: boolean }): 'sovereign' | 'migration' | 'hidden'`
  - `signupOpen` false → `'hidden'`.
  - Passkey session whose identity is the Safe → `'sovereign'`.
  - A connected migration record (a preview user who already moved), or a passkey session on a legacy identity → `'migration'` even when `migrationOpen` is false (Review Focus 5). `MigrationSettings` then hides the "Passkey einrichten" start button and the detach row unless their own surface is open.
  - thirdweb session without a record → `'migration'` only when `migrationOpen`, else `'hidden'`.
- Produces: `identityModeFor` returns `{ mode: 'safe' }` when `record.legacy` is undefined, citizen or not (the server now sponsors guests); the two legacy rules are unchanged.
- `SovereignAccountSettings` shows, top to bottom: `RecoveryBanner`; lede "Dein unabhängiges Konto" with one line "Nur du hast den Schlüssel. Richte einen Weg zurück ein, falls du dein Handy verlierst."; section WIEDERHERSTELLUNG with `GuardiansSection` (and a marked slot `{/* recovery words: plan 2 */}`), the links "Mein Konto-Code" and "Konto wiederherstellen"; `EmailRow`; section SCHLÜSSEL & NACHRICHTEN with `KeysAndMessagesSection`. No migration steps, no session switch, no detach row. It loads the device's migration record; when there is none it builds one from the active passkey session (`saveRecoveredRecord` is not used; write the same shape `finish()` in `signin.ts` writes).
- Settings row (`app/settings.tsx`): shown when `settingsKind(...) !== 'hidden'`; label "Passkey & Wiederherstellung"; description "Dein unabhängiges Konto absichern." for `'sovereign'`, "Passkey als zusätzlichen Verwalter deines Kontos einrichten." for `'migration'` (the word "Vorschau:" goes).

- [ ] **Step 1: Failing tests** — `settings-kind.test.ts`:

```ts
const base = { passkeySession: false, identityIsSafe: false, hasRecord: false, recordConnected: false, signupOpen: true, migrationOpen: false };
it('closed sign-up surface hides everything', () => expect(settingsKind({ ...base, signupOpen: false, passkeySession: true, identityIsSafe: true })).toBe('hidden'));
it('a passkey-only person sees the sovereign settings', () => expect(settingsKind({ ...base, passkeySession: true, identityIsSafe: true })).toBe('sovereign'));
it('a thirdweb user sees nothing while migration is closed', () => expect(settingsKind(base)).toBe('hidden'));
it('a thirdweb user sees the migration when it is open', () => expect(settingsKind({ ...base, migrationOpen: true })).toBe('migration'));
it('someone who already moved keeps their screen with migration closed', () => {
  expect(settingsKind({ ...base, hasRecord: true, recordConnected: true })).toBe('migration');
  expect(settingsKind({ ...base, passkeySession: true, identityIsSafe: false })).toBe('migration');
});
```

`guardian-plan.test.ts`: `identityModeFor({ record: { status: 'passkeyCreated' }, safeIsCitizen: false, legacyIsCitizen: false })` equals `{ mode: 'safe' }`; a record with `legacy` and `status: 'passkeyCreated'` still gives `null`.

- [ ] **Step 2: Run** both — Expected: FAIL.
- [ ] **Step 3: Implement** `settings-kind.ts`, the `identityModeFor` rule, then move the current body of `passkey.tsx` into `MigrationSettings.tsx` unchanged apart from the two visibility props (`canStart`, `canDetach`), write `SovereignAccountSettings.tsx`, and make `passkey.tsx` read `isPasskeySurfaceAllowed('signup' | 'migration' | 'detach')`, the active wallet (`isPasskeyWallet`, `passkeySessionOf`) and the record, then render by `settingsKind`. Remove the Task 1 alias from both settings files.
- [ ] **Step 4: Replace the guest refusals.** The three notices "…sobald dein Passkey mit deinem Bürgerkonto verbunden ist" stay only for the case `mode === null` with a `legacy` record (an unfinished migration); a sovereign account never sees them.
- [ ] **Step 5: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` and eslint on the touched files — Expected: PASS, no new lint errors; `grep -rn "isPasskeyPreviewAllowed" apps/expo/app apps/expo/components apps/expo/lib` prints nothing.
- [ ] **Step 6: Commit** — `feat(expo): settings for an independent account, guardians for guests` — staging the files above by path; push.

---

### Task 8: Röbel Münzen for a Safe identity

`PASSKEY_SIGNIN_NOTES.md` §7 lists Circles for a Safe identity as an open gap. The server side is closed by Task 3 (a guest's `registerHuman`, `personalMint` and profile sync; a citizen Safe was already allowlisted). This task proves the chain accepts a Safe as a Circles human and closes what the app still assumes.

**Files:**
- Create: `contracts/passkey-accounts/test/SafeCircles.t.sol`
- Modify: `contracts/passkey-accounts/test/utils/Interfaces.sol` (Hub + NameRegistry subset), `contracts/passkey-accounts/README.md` (table row)
- Modify (only if Step 3 finds a blocker): `apps/expo/lib/roebel-taler.ts`, `apps/expo/context/RoebelTalerContext.tsx`, `apps/expo/lib/muenzen-claim.ts`, `apps/expo/hooks/useCirclesProfileSync.ts`
- Test: `apps/expo/lib/__tests__/muenzen-claim.test.ts` (or the nearest existing test of `lib/muenzen-claim.ts`)

**Interfaces:**
- Consumes: Hub `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8` (`trust(address,uint96)`, `registerHuman(address,bytes32)`, `personalMint()`, `isHuman(address)`), NameRegistry `0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474` (`updateMetadataDigest(bytes32)`), `PasskeySafeBase` helpers for a sponsored passkey-Safe userOp.
- Produces: fork proof `SafeCirclesTest` — an existing Circles human with ≥ 96 own CRC (pick one from chain state at the fork block and pin the block; the README names the address) trusts a fresh passkey Safe; the Safe's userOp `registerHuman(inviter, digest)` makes `isHuman(safe)` true; after `vm.warp(+1 days)` a second userOp `[personalMint(), updateMetadataDigest(d)]` succeeds.

- [ ] **Step 1: Write `SafeCircles.t.sol`** with the three assertions above (`assertTrue(hub.isHuman(safe))`, the mint raising `hub.balanceOf(safe, uint256(uint160(safe)))`, the registry call not reverting).
- [ ] **Step 2: Run** `forge test --match-contract SafeCircles -vvv` — Expected: PASS. A revert here is a finding for the owner, not something to work around: stop and report it.
- [ ] **Step 3: Walk the app path with a guest passkey session in mind** and write down, in the commit message, what you found for each: `RoebelTalerProvider.onboard` / `findMyInvitation` (does it read anything keyed to a thirdweb account?), `lib/muenzen-claim.ts` (a guest must send `personalMint` only, never `groupMint`: assert it in a unit test with `isGroupMember: false`), `useCirclesProfileSync` (its two `sendTransaction` calls use `gnosisAccount`, which is the adapter on a passkey session), `app/edit-profile.tsx:147`. Fix only real blockers; each fix gets a unit test next to the module.
- [ ] **Step 4: Run** the fork test and the touched jest files — Expected: PASS.
- [ ] **Step 5: Commit** — `test(contracts): a passkey Safe joins Circles; feat(expo): guest claim sends personalMint only` — staging by path; push.

---

### Task 9: No vendor names; "Unabhängig werden"; welcome copy

**Files:**
- Create: `apps/expo/lib/__tests__/copy-no-vendor-names.test.ts`
- Modify: `apps/expo/app/settings/reveal-key.tsx:144`, `apps/expo/lib/passkey/detach.ts:26-34,192`, `apps/expo/app/settings/passkey-detach.tsx:187,286`, `apps/expo/components/passkey/MigrationSettings.tsx` (the row moved from `passkey.tsx:225`), `apps/expo/app/welcome/index.tsx:93-100`, `apps/expo/components/LoginDrawer.tsx:27-30`
- Test: `apps/expo/lib/passkey/__tests__/detach.test.ts`

**Interfaces:**
- Produces: the copy test. It parses every `.ts` / `.tsx` under `apps/expo/{app,components,context,hooks,lib,constants}` (skipping `__tests__`, `__mocks__`, `__testutils__`) with the TypeScript compiler API (`ts.createSourceFile`) and collects (a) every `JsxText` node and (b) every string literal, no-substitution template and template part whose trimmed text contains whitespace, except those inside an import/export declaration or inside the arguments of a `console.*` call. It fails, listing `file:line: text`, when one of them matches `/thirdweb/i`. Baseline today: exactly two hits, `app/settings/reveal-key.tsx:144` and `lib/passkey/detach.ts:192`.
- Produces: `DETACH_CONFIRM_WORD = 'UNABHÄNGIG'`; `isDetachConfirmed(input: string): boolean` (trim, upper-case, accepts `UNABHÄNGIG` and `UNABHAENGIG`).
- Copy (exact):
  - Row and screen title: `Unabhängig werden`
  - `DETACH_EXPLANATION`: `Nach diesem Schritt hältst nur noch du den Schlüssel zu deinem Konto. Dein Anmelde-Anbieter (Google, Apple oder E-Mail) kann es dann nicht mehr öffnen. Das kann man nicht rückgängig machen.`
  - Row subtext: `Endgültig. Erst möglich, wenn alle Punkte der Checkliste erfüllt sind.` (unchanged)
  - Final button: `Endgültig unabhängig werden`
  - `reveal-key.tsx:144`: `Der Export erfolgt über die offizielle Seite deines Anmelde-Anbieters im Browser.`
  - `detach.ts:192` (developer error, may surface): `refusing to sign anything but the removal of the sign-in provider's admin key`
  - Welcome, secondary button: `Mit Google, Apple oder E-Mail anmelden`, with a line under it in `colors.textSecondary`: `Bequem, aber dein Schlüssel liegt bei einem Anbieter.`
  - Login drawer subtitle stays; the "Sie" form there is existing copy and is not touched.

- [ ] **Step 1: Write the copy test and the detach test** (`isDetachConfirmed('unabhängig ')` true, `'UNABHAENGIG'` true, `'TRENNEN'` false).
- [ ] **Step 2: Run** both — Expected: the copy test FAILS listing exactly the two baseline lines; the detach test FAILS.
- [ ] **Step 3: Apply the copy above**; `passkey-detach.tsx` uses `isDetachConfirmed`.
- [ ] **Step 4: Run** both tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(expo): "Unabhängig werden", no vendor names in the app, honest welcome copy` — staging by path; push.

---

### Task 10: Shared rate limit for the warning email, alert cron, state docs

**Files:**
- Modify: `apps/web/src/lib/passkey/email-rate-limit.ts`, `email-handler.ts` (await the limiter), `email-runtime.ts` (choose the store)
- Create: `supabase/migrations/20261117b_passkey_rate_limits.sql`
- Modify: `apps/web/vercel.json` (cron entry)
- Modify: `docs/PASSKEY_ACCOUNTS_STATE.md`, `docs/PASSKEY_SIGNIN_NOTES.md`
- Test: `apps/web/src/lib/passkey/__tests__/email-handler.test.ts`, create `email-rate-limit.test.ts`

**Interfaces:**
- Produces: `RateLimiter.take(key: string): Promise<boolean>` (was synchronous; `FixedWindowLimiter` returns a resolved promise). `class SupabaseRateLimiter implements RateLimiter { constructor(db: SponsorBudgetRpcClient, scope: 'email-safe' | 'email-address', limit: number, windowSeconds: number) }` — calls RPC `passkey_rate_take(p_scope text, p_key_hash text, p_limit int, p_window_seconds int) returns boolean` with `p_key_hash = sha256(lowercased key)` (no email address is stored). An RPC error throws; the routes answer 503.
- Env: `PASSKEY_RATE_LIMIT_STORE=supabase` selects it; unset keeps the in-memory limiter.
- Migration: table `passkey_rate_limits(scope text, key_hash text check (key_hash ~ '^[0-9a-f]{64}$'), window_start timestamptz, count int, primary key (scope, key_hash))`, RLS on, no policies, privileges revoked from `public, anon, authenticated`; the function `security definer`, `search_path = ''`, EXECUTE only for `service_role`; it resets the row when `now() >= window_start + window`.
- `vercel.json`: `{ "path": "/api/passkey/recovery-alerts", "schedule": "*/10 * * * *" }`.

- [ ] **Step 1: Failing tests** — `email-rate-limit.test.ts`: `SupabaseRateLimiter.take('A@b.de')` and `take('a@b.de')` send the same 64-hex `p_key_hash` and neither sends the address; `data: false` → `false`; an RPC error rejects. `email-handler.test.ts`: a limiter that rejects makes `start` answer 503 `store_unavailable` and no mail is sent.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the limiter, the awaits, the store choice, the migration (PGlite check as in Task 5) and the cron entry.
- [ ] **Step 4: Update the docs.** In `PASSKEY_ACCOUNTS_STATE.md` add a section "Sovereign sign-up foundations (2026-11-17)": the surface table from Task 1 with the four `app_settings` keys, the guest tier, the guest cap env, the owner → Safe lookup, the boot rule. In `PASSKEY_SIGNIN_NOTES.md`: §5 boot (sources, failed ≠ logout), §7 (strike the three closed gaps and say where they were closed), §8c (guest tier list).
- [ ] **Step 5: Run the web folder tests** — Expected: PASS.
- [ ] **Step 6: Commit** — `feat(web): shared rate limit for the warning email, recovery-alert cron; docs: sovereign sign-up foundations` — staging by path; push.

---

## Owner gates (Max — not agent steps)

Nothing below is done by an executor. The branch is ready for review when Task 10 is pushed.

1. Merge `feat/sovsignup-1-foundations` after review.
2. Apply through the Supabase MCP, in this order: `20260927_passkey_sponsor_budget.sql`, `20260927_passkey_key_backup.sql`, `20260927_passkey_contact_email.sql`, `20260927_passkey_api_sessions.sql`, `20261117a_passkey_sponsor_guest_cap.sql`, `20261117b_passkey_rate_limits.sql`.
3. Vercel production env: a dedicated production paymaster owned by a Safe and funded (`PASSKEY_PAYMASTER_ADDRESS`, `PASSKEY_SPONSOR_KEY`, never the Netizen demo signer), `PASSKEY_SPONSOR_ENABLED=1`, `PASSKEY_SPONSOR_BUDGET_STORE=supabase`, `PASSKEY_RATE_LIMIT_STORE=supabase`, the budgets (`PASSKEY_SPONSOR_DAILY_WEI`, `PASSKEY_SPONSOR_GLOBAL_DAILY_WEI`, `PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI`, `PASSKEY_SPONSOR_GUEST_GLOBAL_DAILY_WEI`; see open question 1 and the prefunds printed by Task 5 Step 6), `PASSKEY_KEY_BACKUP_ENABLED=1`, `PASSKEY_EMAIL_ENABLED=1`, `PASSKEY_EMAIL_STORE=supabase`, `PASSKEY_SESSION_TOKENS_ENABLED=1` + `PASSKEY_SESSION_SECRET`, `CRON_SECRET`.
4. Deploy `ortis-id` so `id.ortis.app` serves the Apple and Android app-association files.
5. Redeploy the edge functions `org-membership`, `merchant-registry`, `delete-user-account`, `nostr-identity-register`.
6. Privacy text: name the optional warning email and its single purpose.
7. EAS update to the preview channel, then your device pass: sign up as a guest, add a guardian, request citizenship, get invited and collect Röbel Münzen, recover on a second phone and sign in there with the new passkey.
8. The logout-after-update cause is fixed separately; this project does not go to production before that fix is confirmed on a real store update (spec 5.9).
9. Flags, in this order: `passkey_accounts_enabled = 'true'`, then `passkey_accounts_enabled_production = 'true'`. Leave `passkey_migration_enabled_production`, `passkey_detach_enabled_production` and `passkey_words_enabled_production` unset.

## Self-review (done while writing)

- Spec coverage: 5.6 guests → Tasks 3, 4, 5, 7, 8; 5.6 Röbel Münzen gap → Tasks 3, 8; 5.2 owner → Safe → Task 6; 5.8 gate split and rollout → Task 1 and Owner gates; 5.9 restore → Task 2; 6 naming → Task 9; 7 gates → Task 10 and Owner gates. The ECDSA-owner Safe in the sponsor (5.6 first bullet) is plan 3; push alerts and the way-back rule are plan 2; the update test procedure is plan 4.
- Names used across tasks: `PasskeySurface`, `isPasskeySurfaceAllowed`, `SessionSource`, `BootResult`, `guest`, `legacyShapes`, `checkDeployedSafeShape`, `GUEST_GROUP_KEY`, `findSafesByOwner`, `settingsKind`, `isDetachConfirmed`.
