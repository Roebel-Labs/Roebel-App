# Sovereign Sign-up 3 — Expert Path (12 words as the main key) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can create, use, back up and restore an independent account whose only key is a 12-word phrase generated on the device, with nothing in an Apple or Google keychain.

**Architecture:** The same Safe as the passkey path (Safe 1.4.1 + Safe4337Module + Candide SocialRecoveryModule enabled at setup), with one ECDSA owner: the key at `m/44'/60'/0'/0/0` of the phrase. In the app it is a third owner type (`ownerType: 'ecdsa'`) of the existing session and record shapes, so boot, the thirdweb adapter, guardians and the key backup keep working; only signing branches. The phrase lives in SecureStore, device-only, behind the device unlock. The sponsor proves an ECDSA-owner Safe as strictly as a passkey Safe.

**Tech Stack:** viem 2.53 (`viem/accounts`), Expo SecureStore (`requireAuthentication`), thirdweb v5 wallet adapter, Next.js 15 route handlers, Foundry fork tests on Gnosis, jest-expo, node:test.

**Spec:** `docs/superpowers/specs/2026-11-17-sovereign-signup-design.md` sections 5.1, 5.2 (without the backup file), 5.5 (expert part), 5.6 (first bullet), 5.7, 5.8. Also `docs/PASSKEY_SIGNIN_NOTES.md` §1–§3 and §8a.

**Depends on:** plan 1 merged (`isPasskeySurfaceAllowed('words')`, guest sponsoring, `checkDeployedSafeShape`, `findSafesByOwner`, the boot sources, `SovereignAccountSettings.tsx`) and from plan 2: Task 1 (`words.ts`), the `WordsGrid` / `WordsConfirm` / `WordsInput` components of Task 5, and `way-back.ts` of Task 8.

## Open questions for the owner

1. **Device unlock.** The current binary has no `expo-local-authentication`. *Default: the phrase is stored with SecureStore `requireAuthentication: true`, so every signature, every reveal and every recovery change asks for fingerprint or face, exactly as often as a passkey does. A phone without biometrics cannot use the expert path and is told so. Task 5 Step 1 checks that the ≥ 3.8.0 binary carries the iOS Face ID usage text; if it does not, that is a native change: the executor stops and reports (spec 5.8).*
2. **Logging out keeps the phrase on the phone**, the way a passkey stays in the keychain, so logging out can never lose an account whose words were not written down. Sign-in then offers "Gespeichertes Konto auf diesem Gerät öffnen". Removing the phrase from the phone is a separate action in Settings, offered only after the words were confirmed. *Default: yes.*
3. **`users.auth_provider` for these accounts.** *Default: `'words'` (Task 5 checks for a database constraint and adds a migration file only if one exists).*
4. **After a guardian recovery to a new phrase**, the voting key, Nostr key and commitment salt wrapped under the old phrase cannot be opened (same as a passkey account without recovery words today). *Default: accepted and written into the sovereignty ledger (plan 4); the app says so on the recovery screen.*
5. **Skipping the confirm step.** Spec 5.2 allows it for a guest. *Default: "Später" is offered; Settings shows "Wörter bestätigen" until done; the way-back rule blocks the citizenship request until then.*

## Global Constraints

- Key: BIP-39, 12 words, English wordlist, account key at `m/44'/60'/0'/0/0`. The words must work in any other wallet tool.
- The phrase stays on the device in the secure store, device-only (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), never synced to a cloud keychain, never sent anywhere, never logged.
- Revealing the words and changing recovery settings always require the device unlock. Never more prompts than the passkey path for the same action.
- Restoring a session at app start never prompts and never reads the phrase.
- Restore with the words is immediate (the words are the owner key; no 3-day wait).
- The sponsor accepts the expert Safe with the same strictness as the passkey Safe. Verifiers are confirmed with tests, not assumed (spec 5.7).
- Everything sits behind `isPasskeySurfaceAllowed('words')`.
- An app update or flag flip never logs anyone out (spec 5.9).
- UI German, code and comments English, `StyleSheet.create()` + `useTheme()`. Never show wallet addresses. No vendor names in the app (the copy test from plan 1 stays green).
- No new native modules, no new dependencies, pnpm only. If one turns out to be unavoidable: stop and tell Max before building.
- No full `tsc` in `apps/expo`; eslint on touched files plus tests. Expo tests: `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`. Web: `cd apps/web && npx tsx --test <path>`. Fork: `cd contracts/passkey-accounts && forge test --match-contract <Name> -vvv`.
- Worktree `.worktrees/sovsignup-3` on branch `feat/sovsignup-3-expert-path` (`pnpm install --frozen-lockfile`). Stage by explicit path. Every task ends with commit + push. Never merge, never run EAS, never deploy.

## Review Focus

1. **Fingerprints changed on Android.** The system invalidates the protected phrase. The person stays logged in (the session needs no secret) and is asked for the 12 words again on the next signature, not logged out. Test in Task 5.
2. **Someone types valid words that were never used.** They get the (empty) account those words derive, not an error and not someone else's account. Test in Task 7.
3. **A recovered expert account opened on another phone.** The new words must find the old Safe, not the fresh Safe that sent the recovery. Test in Task 7.
4. **An op signed by the words but claiming a passkey (or the other way round)** must not pass the sponsor's sender check. Test in Task 3.
5. **Leaving the app while the 12 words are on screen at sign-up.** The account exists and the phrase is stored; the words can be shown again from Settings after the device unlock. Test in Task 7 (state after `createWordsAccount`) and a manual check in Task 8.

---

### Task 1: Fork proof and golden vector for the ECDSA-owner Safe

**Files:**
- Create: `contracts/passkey-accounts/test/EcdsaSafe.t.sol`
- Create: `contracts/passkey-accounts/test/fixtures/ecdsa-safe-vector.json` (written by the test); copies in `apps/expo/lib/passkey/__tests__/` and `apps/web/src/lib/passkey/__tests__/`
- Modify: `contracts/passkey-accounts/test/utils/PasskeySafeBase.sol` (a sibling helper `_ecdsaSafeInitializer(address owner)`), `contracts/passkey-accounts/README.md`

**Interfaces:**
- Produces the setup, fixed for every later task: `Safe.setup(owners = [owner], threshold = 1, to = SafeModuleSetup 0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47, data = enableModules([Safe4337Module 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226, SocialRecoveryModule 0x38275826E1933303E508433dD5f289315Da2541c]), fallbackHandler = Safe4337Module, paymentToken = 0, payment = 0, paymentReceiver = 0)`, proxy via `SafeProxyFactory.createProxyWithNonce(SafeL2 singleton, initializer, 0)`. No MultiSend (one delegatecall is enough without the shared signer).
- Proves on the real Gnosis bytecode: (1) the predicted address equals the deployed one; (2) a sponsored first userOp deploys the Safe and executes, signed with a plain 65-byte ECDSA signature (v 27/28) over `Safe4337Module.getOperationHash`; (3) a different key gets AA24; (4) ERC-1271: `isValidSignature(h, sig)` returns `0x1626ba7e` for an ECDSA signature over the Safe's `SafeMessage` hash of `abi.encode(h)`; (5) a guardian recovery to a NEW EOA: after `finalizeRecovery`, `getOwners() == [newEoa]`, the Safe emitted `AddedOwner(newEoa)`, the new key's ops pass and the old key's fail.
- Vector (`test_writeVector`, deterministic), owner = key 0 of `test test test test test test test test test test test junk` (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`): `owner`, `safeAddress`, `setupData`, `initCode`, a fixed `userOp` with `safeOpHash`, `ownerSignature` (65 bytes), `userOpSignature`, and `erc1271: { hash, safeMessageHash, signature }`.

- [ ] **Step 1: Write the test contract** with `test_predictedAddressMatches`, `test_sponsoredDeployAndExecute`, `test_wrongKey_AA24`, `test_erc1271`, `test_guardianRecoveryToNewEoa`, `test_writeVector`.
- [ ] **Step 2: Run** `forge test --match-contract EcdsaSafe -vvv` — Expected: PASS. A failure of (2) or (4) means the design does not hold: stop and report.
- [ ] **Step 3: Copy the vector** into both apps' test folders; add the README rows.
- [ ] **Step 4: Commit**

```bash
git add contracts/passkey-accounts/test/EcdsaSafe.t.sol contracts/passkey-accounts/test/fixtures/ecdsa-safe-vector.json contracts/passkey-accounts/test/utils/PasskeySafeBase.sol contracts/passkey-accounts/README.md apps/expo/lib/passkey/__tests__/ecdsa-safe-vector.json apps/web/src/lib/passkey/__tests__/ecdsa-safe-vector.json
git commit -m "test(contracts): ECDSA-owner Safe with 4337 and recovery modules (fork proof + vector)"
git push -u origin feat/sovsignup-3-expert-path
```

---

### Task 2: Expo — address derivation and a signer-neutral userOp sender

**Files:**
- Create: `apps/expo/lib/passkey/ecdsa-safe.ts`
- Modify: `apps/expo/lib/passkey/userop.ts:422-437` (`sponsorRequestBody`), `529-658` (`sendPasskeyUserOp`)
- Test: `apps/expo/lib/passkey/__tests__/ecdsa-safe.test.ts`, `userop.test.ts`

**Interfaces:**
- Produces (`ecdsa-safe.ts`): `buildEcdsaSafeSetup(owner: Address): { initializer: Hex; saltNonce: bigint }`, `predictEcdsaSafeAddress(owner: Address): Address`, `ecdsaSafeFactoryData(owner: Address): Hex`, `ecdsaSafeInitCode(owner: Address): Hex`.
- Produces (`userop.ts`):
  - `type SafeOpSigner = { proof: { x: Hex; y: Hex } | { ecdsaOwner: Address }; predicted: Address; factoryData: Hex; dummySignature: Hex; signOpHash: (hash: Hex) => Promise<Hex> }` (`signOpHash` returns the complete userOp signature)
  - `passkeyOpSigner(p: { credentialId: string; x: Hex; y: Hex; owner?: Address }, sign: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>): SafeOpSigner`
  - `ecdsaOpSigner(owner: Address, signDigest: (digest: Hex) => Promise<Hex>): SafeOpSigner` — `signDigest` returns a 65-byte signature over the raw digest (no message prefix); `dummySignature` = `encodeUserOpSignature(0, 0, 0x + 'ff' × 65)`
  - `type SafeUserOpArgs = { signer: SafeOpSigner; calls: SponsoredCall[]; deployed: boolean; sender?: Address; legacy?: Address; recoveryLegacy?: Address; pollId?: bigint }`
  - `sendSafeUserOp(args: SafeUserOpArgs, deps?: UserOpDeps): Promise<{ userOpHash: Hex; txHash: Hex }>` — the body of today's `sendPasskeyUserOp`, with the five signer-specific spots taken from `args.signer`
  - `sendPasskeyUserOp(args, deps)` keeps its exact signature and becomes a wrapper (`passkeyOpSigner` + `sendSafeUserOp`), so no existing caller or test changes.
  - `sponsorRequestBody(op, args)`: sends `x, y` for a passkey proof and `ecdsaOwner` for an ECDSA proof, never both.

- [ ] **Step 1: Write the failing tests**

```ts
// ecdsa-safe.test.ts
it('reproduces the fork vector byte for byte', () => {
  expect(buildEcdsaSafeSetup(v.owner).initializer).toBe(v.setupData);
  expect(predictEcdsaSafeAddress(v.owner)).toBe(getAddress(v.safeAddress));
  expect(ecdsaSafeInitCode(v.owner)).toBe(v.initCode.toLowerCase());
});
it('a different owner gives a different Safe', () => {
  expect(predictEcdsaSafeAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).not.toBe(getAddress(v.safeAddress));
});
// userop.test.ts
it('ECDSA signer: the op hash and the userOp signature match the fork vector', async () => {
  const account = wordAccount('test test test test test test test test test test test junk', 0);
  const signer = ecdsaOpSigner(v.owner, (digest) => account.sign({ hash: digest }));
  expect(safeOpHash(vectorOp(v), 0, 0)).toBe(v.userOp.safeOpHash);
  expect(await signer.signOpHash(v.userOp.safeOpHash)).toBe(v.userOpSignature);
});
it('sendSafeUserOp with an ECDSA signer: deploy op carries the ECDSA factoryData and the body names ecdsaOwner, no x/y', async () => {
  const { bodies, sent } = await runWithFakeNetwork({ signer: ecdsaOpSigner(v.owner, async () => v.ownerSignature), deployed: false, calls: [CALL] });
  expect(bodies.sponsor.ecdsaOwner).toBe(v.owner);
  expect(bodies.sponsor.x).toBeUndefined();
  expect(sent.factoryData).toBe(ecdsaSafeFactoryData(v.owner));
  expect(sent.sender).toBe(getAddress(v.safeAddress));
});
it('the passkey wrapper still produces the old sponsor body', async () => { /* existing fixture: body has x, y and no ecdsaOwner */ });
```

(`runWithFakeNetwork` = the fake fetch the existing `sendPasskeyUserOp` tests use, returning the request bodies.)

- [ ] **Step 2: Run** both files — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` — Expected: PASS, including every untouched passkey test.
- [ ] **Step 5: Lint and commit** — `feat(expo): ECDSA-owner Safe derivation and a signer-neutral sponsored userOp sender` — staging the two source files and two tests; push.

---

### Task 3: Web — the sponsor accepts the ECDSA-owner Safe

**Files:**
- Modify: `apps/web/src/lib/passkey/safe-address.ts` (ECDSA setup, mirrored from Task 2)
- Modify: `apps/web/src/lib/passkey/sponsor-policy.ts` (`SponsorContext`, `checkFactory`, the deployed-sender check, recovery owner binding, `parseSponsorRequest`), `sponsor-handler.ts:123-131`
- Test: Create `apps/web/src/lib/passkey/__tests__/sponsor-policy-ecdsa.test.ts`; extend `safe-address.test.ts`, `sponsor-route.test.ts`, `fake-chain.ts` (`makeEcdsaSafe`)

**Interfaces:**
- Produces (`safe-address.ts`): `buildEcdsaSafeSetup`, `predictEcdsaSafeAddress`, `ecdsaSafeFactoryData` (same names and bytes as Expo).
- Produces (`sponsor-policy.ts`): `SponsorContext` gets `x?: Hex; y?: Hex; ecdsaOwner?: Hex` — exactly one of (x and y) or `ecdsaOwner`; `parseSponsorRequest` throws otherwise (the route answers 400).
- Sender proof with `ecdsaOwner`: deploy op → `factory == SafeProxyFactory`, `factoryData == ecdsaSafeFactoryData(ecdsaOwner)` byte for byte, `sender == predictEcdsaSafeAddress(ecdsaOwner)`. Deployed → `checkDeployedSafeShape(sender)` (plan 1) AND `getOwners() == [ecdsaOwner]` AND the owner's code is empty or an EIP-7702 designator (`0xef0100` + 20 bytes).
- Modes with `ecdsaOwner`: `safe`, `everyday` and guest results as for a passkey Safe. Recovery: the "submitter's own signer" is `ecdsaOwner` itself (`newOwners == [ecdsaOwner]`, threshold 1; `finalizeRecovery` when the pending owners are `[ecdsaOwner]`); a `createSigner` call is refused. A body that names `legacy` together with `ecdsaOwner` is refused (`an expert-path Safe cannot drive a legacy account`).
- `fake-chain.ts`: `makeEcdsaSafe(w: FakeWorld, safe: Hex, owner: Hex)`.

- [ ] **Step 1: Write the failing tests** (`E = { ecdsaOwner: v.owner, nowSeconds: NOW }`, `ESAFE = v.safeAddress`):

```ts
test("ECDSA setup matches the fork vector", () => {
  assert.equal(predictEcdsaSafeAddress(v.owner).toLowerCase(), v.safeAddress.toLowerCase());
  assert.equal(buildEcdsaSafeSetup(v.owner).initializer, v.setupData);
});
test("deploy op of a new expert account asking for citizenship: guest, onboarding tier", async () => {
  const o = { ...op(outer(C.citizenNft, askCitizen), { sender: ESAFE }), factory: ADDRESSES.safeProxyFactory, factoryData: ecdsaSafeFactoryData(v.owner) };
  const r = await evaluateSponsorPolicy(o, E, fakeChain());
  assert.ok(r.ok && r.mode === "everyday" && r.tier === "onboarding" && r.guest === true, JSON.stringify(r));
});
test("deployed expert Safe: guardian management passes; a citizen one is not a guest", async () => {
  const world = (w: FakeWorld) => makeEcdsaSafe(w, ESAFE, v.owner);
  assert.ok((await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), E, fakeChain(world))).ok);
  const citizen = (w: FakeWorld) => { world(w); w.citizens.add(ESAFE.toLowerCase()); };
  assert.deepEqual(await evaluateSponsorPolicy(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), E, fakeChain(citizen)), { ok: true, mode: "safe", budgetKey: ESAFE });
});
test("the proof must match the sender (Review Focus 4)", async () => {
  // words-owner body for a passkey Safe, passkey body for an expert Safe, wrong ECDSA owner, a second owner, a contract owner
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add)), E, fakeChain());
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), NO_LEGACY, fakeChain((w) => makeEcdsaSafe(w, ESAFE, v.owner)));
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), { ...E, ecdsaOwner: OTHER_EOA }, fakeChain((w) => makeEcdsaSafe(w, ESAFE, v.owner)));
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), E, fakeChain((w) => { makeEcdsaSafe(w, ESAFE, v.owner); w.owners.set(ESAFE.toLowerCase(), [v.owner, OTHER_EOA]); }));
  await refused(op(outer(ADDRESSES.socialRecoveryModule, add), { sender: ESAFE }), E, fakeChain((w) => { makeEcdsaSafe(w, ESAFE, v.owner); w.codes.set(v.owner.toLowerCase(), "0x6080"); }));
});
test("recovery to a new phrase: newOwners must be the submitter's ECDSA owner; createSigner is refused", async () => {
  const world = (w: FakeWorld) => { makePasskeySafe(w, WALLET, OTHER_KEY); w.guardians.set(WALLET.toLowerCase(), new Set([GUARDIAN.toLowerCase()])); };
  const exec = (owner: Hex) => encodeFunctionData({ abi: srm, functionName: "executeRecovery", args: [WALLET, [owner], 1n] });
  const deploy = (data: Hex) => ({ ...op(outer(ADDRESSES.socialRecoveryModule, data), { sender: ESAFE }), factory: ADDRESSES.safeProxyFactory, factoryData: ecdsaSafeFactoryData(v.owner) });
  assert.ok((await evaluateSponsorPolicy(deploy(exec(v.owner)), E, fakeChain(world))).ok);
  await refused(deploy(exec(OTHER_EOA)), E, fakeChain(world));
  await refused({ ...deploy(exec(v.owner)), callData: viaMultiSend([{ to: ADDRESSES.signerFactory, data: createSigner(KEY, WEBAUTHN_VERIFIERS) }, { to: ADDRESSES.socialRecoveryModule, data: exec(v.owner) }]) }, E, fakeChain(world));
});
test("legacy and ecdsaOwner together are refused; a body with both proofs or none is a bad request", async () => {
  await refused(op(outer(LEGACY, execLegacy(C.circlesHub, 0n, personalMint)), { sender: ESAFE }), { ...E, legacy: LEGACY }, fakeChain((w) => makeEcdsaSafe(w, ESAFE, v.owner)));
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp: RAW_OP, x: KEY.x, y: KEY.y, ecdsaOwner: v.owner }));
  assert.throws(() => parseSponsorRequest({ chainId: 100, userOp: RAW_OP }));
});
```

(`refused` = assert `ok === false`. `RAW_OP` = the hex-string userOp fixture `sponsor-policy.test.ts` uses for `parseSponsorRequest`.)

- [ ] **Step 2: Run** `npx tsx --test src/lib/passkey/__tests__/sponsor-policy-ecdsa.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; pass `ecdsaOwner` from the handler into the policy; extend the header comment of `sponsor-policy.ts` ("All modes, 2.").
- [ ] **Step 4: Run the whole folder** — Expected: PASS (every passkey test untouched).
- [ ] **Step 5: Commit** — `feat(web): the sponsor proves and accepts the ECDSA-owner Safe` — staging by path; push.

---

### Task 4: Verifiers accept the expert Safe (confirmed, not assumed)

**Files:**
- Create: `apps/web/src/lib/auth/__tests__/expert-safe-signature.live.test.ts`
- Create: `apps/web/src/lib/auth/__tests__/expert-safe-signature.test.ts`
- Modify (only if a test fails): `apps/web/src/lib/auth/account-signature-core.ts` and its byte-identical copy `apps/expo/supabase/functions/_shared/verify-account-signature.ts`

**Interfaces:**
- Consumes: `verifyAccountSignature` (`apps/web/src/lib/auth/verify-account-signature.ts`), `ecdsa-safe-vector.json`, `ecdsaSafeFactoryData`, viem `serializeErc6492Signature`, `privateKeyToAccount` (test key 0 of the junk phrase: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`).
- Produces: a test per endpoint message format of `PASSKEY_SIGNIN_NOTES.md` §2a plus the three passkey-route texts: `roebel-org-v1:…`, `roebel-merchant-v1:…`, `delete-account:…`, `roebel-tickets-v1:…`, `roebel-chat-v1:session:…`, `Netizen Nostr-Binding v1…`, the key-backup proof text, the session-start text (`session-message-vector.json`), the warning-email proof text. Each is signed as the counterfactual expert Safe (ECDSA over `safeMessageHash(safe, hashMessage(text))`, wrapped in ERC-6492 with the ECDSA factory data).
- Live test (runs only with `PASSKEY_LIVE_TEST=1`, like `verify-account-signature.live.test.ts`): for every text, `verifyAccountSignature({ address: safe, message, signature })` on Gnosis is `true`; with a signature by key 1 it is `false`; a plain 65-byte signature without the 6492 wrapper for the undeployed Safe is `false`.
- Offline test: against `fake-gnosis.ts`, an expert-Safe signature takes rule (a) only: it is not mistaken for the Safe-admin envelope (b) and not for the thirdweb-admin fallback (c) (a 65-byte inner signature whose recovered signer is not an admin of the address).

- [ ] **Step 1: Write both test files.**
- [ ] **Step 2: Run** `npx tsx --test src/lib/auth/__tests__/expert-safe-signature.test.ts` and `PASSKEY_LIVE_TEST=1 npx tsx --test src/lib/auth/__tests__/expert-safe-signature.live.test.ts` — Expected: PASS without source changes. A failing format is a real finding: fix the core (both copies, `edge-shared-signature.test.ts` keeps them identical) and name the endpoint in the commit message.
- [ ] **Step 3: Commit** — `test(web): every signature verifier accepts the expert-path Safe (ERC-6492 live + offline)` — staging by path; push.

---

### Task 5: Expo — the `ecdsa` owner type: phrase store, session, signing

**Files:**
- Create: `apps/expo/lib/passkey/phrase-store.ts`, `apps/expo/lib/passkey/session-signer.ts`
- Modify: `apps/expo/lib/passkey/migration.ts:63-128` (`SafeOwnerType`, record loader), `session.ts:18-68` (session type + parser), `standalone.ts:21-22`, `thirdweb-adapter.ts:156-240`, `signin-runtime.ts` (adapter deps, source owner), `apps/expo/context/UserContext.tsx:~122` (`auth_provider`)
- Test: `apps/expo/lib/passkey/__tests__/phrase-store.test.ts`, `session-signer.test.ts`, `thirdweb-adapter.test.ts`, `boot.test.ts`, `standalone.test.ts`

**Interfaces:**
- Produces (`migration.ts`, `session.ts`): `SafeOwnerType = 'sharedSigner' | 'webauthnSigner' | 'ecdsa'`. A record or session with `ownerType: 'ecdsa'` has `owner` = the phrase's address 0, `credentialId: ''` and `x`, `y` = 32 zero bytes (unused; the parsers accept exactly this for `ecdsa` and keep today's rules for the other two). Helper `isWordsOwner(s: { ownerType: SafeOwnerType }): boolean`. The session and record keys (`passkey_session_v1`, `passkey_migration_v1`) are unchanged, so boot restore works as it is.
- Produces (`phrase-store.ts`):
  - `WORDS_PHRASE_KEY = 'words_phrase_v1'`, `WORDS_PHRASE_MARKER_KEY = 'words_phrase_present_v1'`, `WORDS_CONFIRMED_KEY = 'words_phrase_confirmed_v1'`
  - `class PhraseUnavailableError extends Error`, `class PhraseCancelledError extends Error`
  - `type PhraseStore = { canProtect(): Promise<boolean>; has(): Promise<boolean>; write(phrase: string): Promise<void>; read(reason: string): Promise<string>; remove(): Promise<void>; isConfirmed(): Promise<boolean>; markConfirmed(): Promise<void> }`
  - `createPhraseStore(secure: { getItemAsync; setItemAsync; deleteItemAsync; canUseBiometricAuthentication(): boolean }): PhraseStore` — `write`/`read` use `{ requireAuthentication: true, authenticationPrompt: reason, keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY }`; `has` reads only the marker (no prompt); `read` maps a user cancel to `PhraseCancelledError` and a missing or invalidated item to `PhraseUnavailableError`.
  - `PHRASE_PROMPT = 'Bestätige, dass du es bist'`, `NO_BIOMETRICS_MESSAGE = 'Für ein Konto mit 12 Wörtern braucht dein Handy Fingerabdruck oder Gesichtserkennung als Gerätesperre.'`
- Produces (`session-signer.ts`):
  - `type SessionSigner = { opSigner: SafeOpSigner; signDigest: (digest: Hex) => Promise<{ safeSignature: Hex; vaultKey?: Hex }>; vaultKey: () => Promise<Hex | null>; counterfactual: { factoryData: Hex; predicted: Address } }`
  - `sessionSignerFor(session: PasskeySession, deps: { signPasskey: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>; getPrf: (credentialId: string) => Promise<Hex | null>; phrase: Pick<PhraseStore, 'read'> }): SessionSigner` — passkey: today's behaviour (`safeSignatureFromAssertion`, PRF). `ecdsa`: one `phrase.read(PHRASE_PROMPT)` per call, then `wordAccount(phrase, 0).sign({ hash: digest })`; `vaultKey` = `wordsVaultKey(phrase)`; `signDigest` returns the vault key from the same read. It throws when the phrase's address 0 is not `session.owner`.
- Produces (`thirdweb-adapter.ts`): `AdapterDeps` gains `signerFor?: (session: PasskeySession) => SessionSigner` (default: built from `deps.sign`, passkey only); `signHashAsIdentityWithPrf` and the `send` closure use it; `sendUserOp` in `AdapterDeps` becomes `(args: SafeUserOpArgs) => Promise<{ userOpHash: Hex; txHash: Hex }>`. Property name `prf` in the return value stays (it now means "vault key"). Existing adapter tests that inspect the `sendUserOp` arguments (`credentialId`, `x`, `y`, `owner`) are updated to read `args.signer.proof`; their expectations about calls, `legacy`, `pollId`, `sender` and `deployed` stay as they are.
- `standalone.ts`: an existing record with `ownerType: 'ecdsa'` is treated as absent by `ensureStandalonePasskey` (a words record is re-derivable from the phrase; a passkey sign-up on the same phone replaces it).
- `signin-runtime.ts`: `passkeySessionSource` reports `owner: 'words'` for an `ecdsa` session (restore report only).
- `UserContext.tsx`: an adapter wallet whose session `isWordsOwner` reports `auth_provider = 'words'`.

- [ ] **Step 1: Check the binary supports the protected store.** Run `cd apps/expo && npx expo config --type introspect 2>/dev/null | grep -n "NSFaceIDUsageDescription"` — Expected: one line with a usage text (the `expo-secure-store` config plugin in `app.config.ts:78` adds it). No line → STOP and report to Max (open question 1); do not add native configuration.
- [ ] **Step 2: Check the `auth_provider` column.** Through the Supabase MCP run `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.users'::regclass and pg_get_constraintdef(oid) ilike '%auth_provider%';` — no row: nothing to do. A row: write `supabase/migrations/20261117e_users_auth_provider_words.sql` adding `'words'` and list it under Owner gates.
- [ ] **Step 3: Write the failing tests**

```ts
// phrase-store.test.ts
it('write protects the phrase, device-only, and sets the marker; has() never prompts', async () => {
  const s = fakeSecure();
  const store = createPhraseStore(s);
  await store.write(JUNK);
  expect(s.calls.find((c) => c.key === WORDS_PHRASE_KEY)!.options).toMatchObject({ requireAuthentication: true, keychainAccessible: s.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  expect(await store.has()).toBe(true);
  expect(s.authenticatedReads).toBe(0);
});
it('an invalidated item is PhraseUnavailableError, a cancelled prompt PhraseCancelledError', async () => {
  await expect(createPhraseStore(fakeSecure({ readThrows: 'invalidated' })).read('x')).rejects.toBeInstanceOf(PhraseUnavailableError);
  await expect(createPhraseStore(fakeSecure({ readThrows: 'cancel' })).read('x')).rejects.toBeInstanceOf(PhraseCancelledError);
});
// session-signer.test.ts
it('ecdsa: ERC-1271 signature and userOp signature match the fork vector, one phrase read each', async () => {
  const reads = jest.fn(async () => JUNK);
  const signer = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: reads } });
  expect((await signer.signDigest(v.erc1271.safeMessageHash)).safeSignature).toBe(v.erc1271.signature);
  expect(await signer.opSigner.signOpHash(v.userOp.safeOpHash)).toBe(v.userOpSignature);
  expect(reads).toHaveBeenCalledTimes(2);
});
it('ecdsa: the same prompt yields the vault key; the wrong phrase is refused', async () => {
  const signer = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: async () => JUNK } });
  expect((await signer.signDigest(v.erc1271.safeMessageHash)).vaultKey).toBe(wordsVaultKey(JUNK));
  const wrong = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: async () => ABOUT } });
  await expect(wrong.signDigest(v.erc1271.safeMessageHash)).rejects.toThrow();
});
// thirdweb-adapter.test.ts
it('a words session signs a message as the counterfactual Safe with an ERC-6492 wrapper around the ECDSA factory data', async () => { /* parseErc6492Signature(sig): address = SAFE_PROXY_FACTORY, data = ecdsaSafeFactoryData(owner), inner signature 65 bytes */ });
it('a words session sends ONE userOp per transaction with an ECDSA signer and no legacy', async () => { /* sendUserOp called once; args.signer.proof = { ecdsaOwner } */ });
// boot.test.ts
it('a stored words session restores without reading the phrase', async () => { /* storage.touched contains only passkey_session_v1 */ });
// standalone.test.ts
it('a words record on the device does not block a passkey sign-up', async () => { /* status 'created', the record is replaced */ });
```

(Review Focus 1: add to `thirdweb-adapter.test.ts` — `phrase.read` rejecting with `PhraseUnavailableError` makes `sendTransaction` reject with that same error, and the session in storage is untouched.)

- [ ] **Step 4: Run** the five files — Expected: FAIL.
- [ ] **Step 5: Implement.** Then find every remaining direct use of the passkey fields and route it through the session signer or guard it: `grep -rn "credentialId" apps/expo --include='*.ts' --include='*.tsx' -l | grep -v "node_modules\|__tests__\|__testutils__"`. Passkey-only by design (leave, but make them refuse an `ecdsa` record with a thrown `Error('passkey record required')`): `detach-runtime.ts`, `key-completion-runtime.ts`, `standalone.ts`, `signin.ts`, `cose.ts`, `webauthn.ts`. Handled in Task 6: `derived-keys-runtime.ts`, `maci-key-runtime.ts`, `guardians-runtime.ts`, `email.ts`, `EmailRow.tsx`, `recovery-flow.ts`.
- [ ] **Step 6: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 7: Lint and commit** — `feat(expo): 12-word owner type for the independent account (phrase store, session signer, adapter)` — staging by path; push.

---

### Task 6: Expo — keys, guardians and the warning email under a words session

**Files:**
- Modify: `apps/expo/lib/passkey/derived-keys-runtime.ts:36-182`, `maci-key-runtime.ts`, `guardians-runtime.ts:181-251`, `email.ts`, `apps/expo/components/passkey/EmailRow.tsx`
- Test: `apps/expo/lib/passkey/__tests__/derived-keys.test.ts`, `fewer-prompts.test.ts`, `guardians.test.ts`, `email.test.ts`

**Interfaces:**
- Consumes: `sessionSignerFor` (Task 5), `sendSafeUserOp` (Task 2).
- Produces: `derived-keys-runtime.ts` builds one `SessionSigner` per call from the session; `getPrf` for the resolver = `signer.vaultKey()`; `keyBackupFor(session)` signs through `signer.signDigest` and returns the vault key as `prf`. Result (spec 5.5): the three blobs of an expert account are wrapped under the phrase's vault key, so signing in with the words on a new phone opens them.
- Produces: `guardians-runtime.ts` — `opSignerForRecord(record: MigrationRecord): SafeOpSigner`; `sendOwnSafeOp` and `sendGuardianConfirm` send through `sendSafeUserOp({ signer: opSignerForRecord(record), … })`.
- Produces: `email.ts` — the ERC-1271 proof is built through the session signer (the Safe proves itself with an ECDSA signature for `ecdsa` records).

- [ ] **Step 1: Write the failing tests**

```ts
it('expert account: a generated key is wrapped under the phrase vault key and opens again from the words alone', async () => {
  // resolve slot 'nostr' with getPrf = () => wordsVaultKey(JUNK): the stored blob unwraps with wordsVaultKey(JUNK) and not with wordsVaultKey(ABOUT)
});
it('expert account: reading the key backup and unwrapping costs ONE device unlock', async () => {
  // fewer-prompts style: phrase.read called once for remote.read() + unwrap
});
it('guardian change from a words record: one op, ECDSA signer, guest mode', async () => {
  // sendOwnSafeOp(WORDS_RECORD, { mode: 'safe' }, [encodeAddGuardian(P1, 1)]) → sendSafeUserOp called once with signer.proof = { ecdsaOwner: WORDS_RECORD.owner }
});
it('the warning-email proof of a words record verifies as an ERC-1271 signature of the Safe', async () => {
  // signature equals account.sign over safeMessageHash(safe, hashMessage(proofText))
});
```

- [ ] **Step 2: Run** the four files — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(expo): voting, Nostr and salt keys, guardians and the warning email work under a 12-word account` — staging by path; push.

---

### Task 7: Create an account with 12 words; sign in with them

**Files:**
- Create: `apps/expo/lib/passkey/words-account.ts`, `apps/expo/lib/passkey/words-account-runtime.ts`
- Test: `apps/expo/lib/passkey/__tests__/words-account.test.ts`

**Interfaces:**
- Consumes: `generatePhrase`, `validatePhrase`, `deriveWordAddresses`, `phraseErrorMessage` (plan 2 Task 1); `predictEcdsaSafeAddress` (Task 2); `PhraseStore` (Task 5); `findSafesByOwner` (plan 1 Task 6); `savePasskeySession`, `MIGRATION_STORE_KEY`.
- Produces (`words-account.ts`, every side effect injected):
  - `type WordsAccountDeps = { phrase: PhraseStore; sessionStorage: SessionStorage; migrationStorage: KeyValueStorage; findSafesByOwner: (owner: Address) => Promise<Address[]>; random?: (n: number) => Uint8Array }`
  - `type WordsResult = { status: 'signedIn'; session: PasskeySession; phrase?: string } | { status: 'error'; message: string }`
  - `createWordsAccount(deps): Promise<WordsResult>` — refuses with `NO_BIOMETRICS_MESSAGE` when `!canProtect()`; generates the phrase; stores it; writes the record and the session (`ownerType: 'ecdsa'`, `safe = identity = predictEcdsaSafeAddress(owner)`); returns the phrase ONCE for the show screen. It refuses when a phrase is already stored on the device (`Auf diesem Gerät liegt schon ein Konto mit 12 Wörtern. Öffne es über „Anmelden".`).
  - `signInWithWords(input: string, deps): Promise<WordsResult>` — validate (error = `phraseErrorMessage`); owner = address 0; `safes = await findSafesByOwner(owner)`; exactly one → that Safe (a recovered account); more than one → `Diese Wörter passen zu mehreren Konten. Bitte wende dich an den Support.`; none → `predictEcdsaSafeAddress(owner)`; store the phrase (replacing a different stored one), mark it confirmed, write record and session. A failed lookup (network) is an error (`Keine Verbindung. Bitte versuche es erneut.`), never a silent fall-back to the predicted Safe.
  - `openStoredWordsAccount(deps): Promise<WordsResult>` — for "Gespeichertes Konto auf diesem Gerät öffnen": one `phrase.read`, then as `signInWithWords` without re-storing.
- Produces (`words-account-runtime.ts`): `createWordsAccountDeps()` wiring SecureStore, `lookupChain`, and `secureSessionStorage`.

- [ ] **Step 1: Write the failing test**

```ts
it('create: session and record for the predicted Safe, phrase stored, returned once, not yet confirmed', async () => {
  const d = deps({ random: () => hex('7f'.repeat(16)) });
  const r = await createWordsAccount(d);
  const owner = deriveWordAddresses(LEGAL, 1)[0];
  expect(r).toMatchObject({ status: 'signedIn', phrase: LEGAL, session: { ownerType: 'ecdsa', owner, safe: predictEcdsaSafeAddress(owner), identity: predictEcdsaSafeAddress(owner) } });
  expect(await d.phrase.has()).toBe(true);
  expect(await d.phrase.isConfirmed()).toBe(false);
  expect(JSON.stringify(d.dump())).not.toContain('winner'); // session + record hold no word
});
it('create on a phone without biometrics is refused before anything is generated', async () => {
  const d = deps({ canProtect: false });
  expect(await createWordsAccount(d)).toEqual({ status: 'error', message: NO_BIOMETRICS_MESSAGE });
  expect(await d.phrase.has()).toBe(false);
});
it('sign in with never-used words opens the account they derive (Review Focus 2)', async () => {
  const r = await signInWithWords(JUNK, deps());
  expect(r).toMatchObject({ status: 'signedIn', session: { safe: predictEcdsaSafeAddress(deriveWordAddresses(JUNK, 1)[0]) } });
});
it('sign in after a guardian recovery finds the recovered Safe, not the fresh one (Review Focus 3)', async () => {
  const r = await signInWithWords(JUNK, deps({ findSafesByOwner: async () => [RECOVERED] }));
  expect(r).toMatchObject({ status: 'signedIn', session: { safe: RECOVERED, identity: RECOVERED, owner: deriveWordAddresses(JUNK, 1)[0] } });
});
it('a typo is explained and nothing is stored', async () => {
  const d = deps();
  expect(await signInWithWords('abandon '.repeat(11) + 'abuot', d)).toEqual({ status: 'error', message: 'Dieses Wort kennen wir nicht: abuot' });
  expect(await d.phrase.has()).toBe(false);
});
it('a failed lookup is an error, not the predicted Safe', async () => {
  const r = await signInWithWords(JUNK, deps({ findSafesByOwner: async () => { throw new Error('rpc'); } }));
  expect(r).toEqual({ status: 'error', message: 'Keine Verbindung. Bitte versuche es erneut.' });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(expo): create and open an independent account with 12 words` — staging by path; push.

---

### Task 8: Screens — three ways in, the words screens, Settings

**Files:**
- Create: `apps/expo/app/passkey/words-signup.tsx`, `apps/expo/app/passkey/words-signin.tsx`, `apps/expo/app/settings/my-words.tsx`
- Modify: `apps/expo/app/welcome/index.tsx:82-106`, `apps/expo/components/passkey/PasskeySignInOption.tsx:92-128`, `apps/expo/components/passkey/SovereignAccountSettings.tsx`, `apps/expo/lib/passkey/way-back.ts` (`readWayBack` for a words session)
- Test: `apps/expo/lib/passkey/__tests__/signin-ui.test.tsx`, `way-back.test.ts`

**Interfaces:**
- Consumes: Task 7 flows; `WordsGrid`, `WordsConfirm`, `WordsInput` (plan 2 Task 5); `activatePasskeySession` (`signin-runtime.ts`); `deferWelcomeWizard`; `isPasskeySurfaceAllowed('words')`.
- Welcome (logged out), in this order (spec 5.1): the "Unabhängiges Konto" option (primary); under it, only when the words surface is open, the text link `Ohne Apple- oder Google-Schlüsselbund: mit 12 Wörtern` → `/passkey/words-signup`; `Mit Google, Apple oder E-Mail anmelden` with its subtext (plan 1); `Erst mal umsehen`.
- `PasskeySignInOption` (the "Anmelden" choices for returning users): under `Mit Passkey anmelden`, when the words surface is open, a text button `Mit 12 Wörtern anmelden` → `/passkey/words-signin`.
- `words-signup.tsx`: **intro** (`Dein Schlüssel sind 12 Wörter, die nur auf diesem Handy liegen. Kein Apple- oder Google-Schlüsselbund. Wer die Wörter hat, hat das Konto: Bewahre sie gut auf.`, button `Konto erstellen`) → `createWordsAccount` → **show** (`WordsGrid`; `Schreib die Wörter auf Papier, in dieser Reihenfolge.`) → **confirm** (`WordsConfirm`, three words; `Später` skips) → `deferWelcomeWizard(identity)`, `activatePasskeySession`, leave to home. The session is activated only after the show step was acknowledged; if the app is closed during it, the next start restores the session (it is already stored) and Settings offers the words.
- `words-signin.tsx`: `WordsInput` → `signInWithWords`; above it, when `phrase.has()`, a button `Gespeichertes Konto auf diesem Gerät öffnen` → `openStoredWordsAccount`. While looking the account up: `Konto wird gesucht …`.
- `my-words.tsx` (Settings → Passkey & Wiederherstellung, only for a words session): `Meine 12 Wörter anzeigen` (device unlock, then `WordsGrid`; cleared on background and unmount), `Wörter bestätigen` while unconfirmed, `Wörter von diesem Gerät löschen` (only when confirmed; explains `Danach brauchst du die 12 Wörter, um dich wieder anzumelden.`; logs out). When `PhraseUnavailableError` occurs anywhere, this screen is where the person re-enters the words: `Dein Handy hat die gespeicherten Wörter gesperrt, weil sich Fingerabdruck oder Gesicht geändert haben. Gib deine 12 Wörter noch einmal ein.` (re-entry must derive `session.owner`, else `Diese Wörter gehören nicht zu diesem Konto.`).
- `SovereignAccountSettings`: for a words session the lede reads `Dein Konto mit 12 Wörtern`, the row `Meine 12 Wörter` links to `my-words`, and the recovery-words entry of plan 2 is hidden (the words are the key here).
- `readWayBack`: a words session → `kind: 'words'`, `phraseConfirmed = await phrase.isConfirmed()`, `people` from the chain; `fastestWayBack('words', …)` = `{ label: 'Wörter bestätigen', route: '/settings/my-words' }`.

- [ ] **Step 1: Write the failing tests** — `signin-ui.test.tsx`: with the words surface open the option renders `Mit 12 Wörtern anmelden`; with it closed it does not, and the two passkey buttons are unchanged. `way-back.test.ts`: a words account with unconfirmed words and no person → `ok: false` and the fastest option routes to `/settings/my-words`; confirmed → `ok: true`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Build** the three screens and the modifications.
- [ ] **Step 4: Run** the two test files, `lib/__tests__/copy-no-vendor-names.test.ts`, and eslint on every new or touched file — Expected: PASS, no errors.
- [ ] **Step 5: Manual check list for the commit message** (cannot run without a device; write it for Max's pass): create → kill the app on the words screen → reopen → logged in, words visible in Settings after the device unlock; one device unlock per transaction; log out and "Gespeichertes Konto … öffnen".
- [ ] **Step 6: Commit** — `feat(expo): welcome and sign-in offer the 12-word account; Settings shows and confirms the words` — staging by path; push.

---

### Task 9: Guardian recovery of an expert account ends in a new phrase

**Files:**
- Modify: `apps/expo/lib/passkey/recovery-flow.ts` (`RecoveryState`, `RecoveryDeps`, `startRecovery`, `opBase`, `executeRecoveryStep`, `finalizeRecoveryStep`), `guardians-runtime.ts` (`createRecoveryDeps`), `migration.ts` (`saveRecoveredRecord`)
- Modify: `apps/expo/app/passkey/restore.tsx`
- Modify: `docs/PASSKEY_ACCOUNTS_STATE.md`, `docs/PASSKEY_SIGNIN_NOTES.md`
- Test: `apps/expo/lib/passkey/__tests__/recovery-flow.test.ts`

**Interfaces:**
- Consumes: `createWordsAccount`'s building blocks (phrase generation and store), `ecdsaOpSigner`, `sendSafeUserOp`, `readSafeOwners`.
- Produces: `RecoveryState.ownerKind?: 'passkey' | 'ecdsa'` (missing = passkey). `startRecovery(args: { wallet; name; recoveryLegacy?; ownerKind?: 'passkey' | 'ecdsa' }, deps)`: for `ecdsa` it generates and stores a new phrase instead of creating a passkey, `signer` = its address 0, `newSafe` = `predictEcdsaSafeAddress(signer)`, and returns the phrase once in a non-persisted field of its result (`{ state: RecoveryState; phrase?: string }` — the existing callers read `.state`). `executeRecoveryStep` for `ecdsa` sends `[executeRecovery(wallet, [signer], 1)]` only (no `createSigner`) from the fresh expert Safe. `finalizeRecoveryStep` then saves record and session with `ownerType: 'ecdsa'`, `safe = wallet`, `owner = signer`. `RecoveryDeps.sendPasskeyUserOp` becomes `sendUserOp: (args: SafeUserOpArgs) => Promise<…>` and `RecoveryDeps` gains `phrase: PhraseStore` and `random`.
- `saveRecoveredRecord(storage, rec)` accepts `ownerType: 'webauthnSigner' | 'ecdsa'`.
- Screen: after the account was found, `restore.tsx` reads `getOwners(wallet)`; an owner without contract code means an expert account → `ownerKind: 'ecdsa'`. The new phrase is shown (`WordsGrid`) and confirmed (`WordsConfirm`, no skip here) before the guardian QR code appears. A note under it: `Abstimmungs- und Nachrichtenschlüssel, die mit den alten Wörtern gesichert waren, kommen nicht zurück.` (open question 4). The guardian link and the guardian's confirm screen are unchanged (`signer` is the new address).

- [ ] **Step 1: Write the failing tests**

```ts
it('expert account: start generates and stores a new phrase, no passkey; the state holds no word', async () => {
  const d = deps({ random: () => hex('7f'.repeat(16)) });
  const { state, phrase } = await startRecovery({ wallet: WALLET, name: 'Anna', ownerKind: 'ecdsa' }, d);
  const signer = deriveWordAddresses(LEGAL, 1)[0];
  expect(phrase).toBe(LEGAL);
  expect(state).toMatchObject({ step: 'waitingForGuardians', ownerKind: 'ecdsa', signer, newSafe: predictEcdsaSafeAddress(signer) });
  expect(d.createPasskey).not.toHaveBeenCalled();
  expect(await d.storage.getItem(RECOVERY_STORE_KEY)).not.toContain('winner');
});
it('expert account: the execute op is ONE call from the fresh expert Safe, signed by the words', async () => {
  const s = await executeRecoveryStep(waitingState('ecdsa'), d);
  const args = d.sendUserOp.mock.calls[0][0];
  expect(args.calls).toEqual([encodeExecuteRecovery(WALLET, [SIGNER], 1)]);
  expect(args.signer.proof).toEqual({ ecdsaOwner: SIGNER });
  expect(args.deployed).toBe(false);
  expect(s.step).toBe('waitingDelay');
});
it('expert account: finalize saves a words session on the OLD Safe address', async () => {
  await finalizeRecoveryStep(delayOver('ecdsa'), d);
  expect(await loadPasskeySession(d.sessionStorage)).toMatchObject({ safe: WALLET, identity: WALLET, owner: SIGNER, ownerType: 'ecdsa' });
});
it('passkey accounts recover exactly as before', async () => { /* the existing passkey cases, adapted to { state } */ });
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the flow and the screen.
- [ ] **Step 4: Update the docs.** `PASSKEY_ACCOUNTS_STATE.md`: a section "Expert path: 12 words as the main key (2026-11-17)" — the setup from Task 1, the owner type, where the phrase lives, the sponsor proof, the device-unlock rule, what a guardian recovery does and does not bring back. `PASSKEY_SIGNIN_NOTES.md`: §1 identity table (a row for the expert Safe), §2 signature table (plain ECDSA Safe signature, 6492 while counterfactual), §4 sign-up / sign-in with words, §5 boot.
- [ ] **Step 5: Run** `./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci` and the web folder — Expected: PASS.
- [ ] **Step 6: Commit** — `feat(expo): guardians recover a 12-word account to a new phrase` — staging by path; push.

---

## Owner gates (Max — not agent steps)

1. Merge `feat/sovsignup-3-expert-path` after review. The sponsor change (Task 3) ships with the web deploy; no new env.
2. If Task 5 Step 2 produced a migration: apply `20261117e_users_auth_provider_words.sql` through the Supabase MCP.
3. EAS update to the preview channel, then your device pass on iOS and Android: create with 12 words; one device unlock per action; request citizenship (blocked until the words are confirmed); add a guardian; log out and reopen the stored account; sign in on a second phone with the words (voting key and Nostr identity are there); recover through a guardian to a new phrase and sign in with it on a third install; on Android add a fingerprint in system settings and check you stay logged in and are asked for the words once.
4. Production: `passkey_words_enabled_production = 'true'` after that pass and after plan 2's pass (one flag opens both).
5. The backup file (plan 4) is not part of this release; until then the only copy of an expert account's key outside the phone is the paper.

## Self-review (done while writing)

- Spec coverage: 5.1 → Task 8; 5.2 key, account, storage → Tasks 1, 2, 5; sign-up flow and skip → Tasks 7, 8; restore on a new phone → Task 7; guardians and recovery to a new phrase → Tasks 3, 9; finding the account after an owner change → Task 7 (on plan 1's finder); signing prompts → Tasks 5, 6; 5.5 expert part → Task 6; 5.6 first bullet → Task 3; 5.7 → Task 4; 5.8 flag → Global Constraints and Task 8. The backup file and "Backup-Datei öffnen" are plan 4. Rotation of leaked words by the user is deferred by the spec.
- Names used across tasks: `predictEcdsaSafeAddress`, `ecdsaSafeFactoryData`, `SafeOpSigner`, `ecdsaOpSigner`, `sendSafeUserOp`, `SafeUserOpArgs`, `ecdsaOwner`, `PhraseStore`, `sessionSignerFor`, `SessionSigner`, `isWordsOwner`, `createWordsAccount`, `signInWithWords`, `openStoredWordsAccount`, `opSignerForRecord`.
