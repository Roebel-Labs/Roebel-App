# Passkey Accounts — Tranche 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A citizen on the PREVIEW channel can create a passkey, get a counterfactual passkey Safe (with the social-recovery module pre-enabled), and — in one gasless, sponsored userOp — make that Safe a co-admin of their existing thirdweb smart account, with MACI/Nostr secrets re-wrapped under the passkey PRF. Nothing is removed; production is untouched.

**Architecture:** Safe 1.4.1 + Safe4337Module v0.3.0 (EntryPoint v0.7) + SafeWebAuthnSharedSigner owner + Candide SocialRecoveryModule, sponsored by the live NetizenVerifyingPaymaster via a new preview-only web route. The Safe calls the legacy thirdweb `Account` as an admin (`execute` / `setPermissionsForSigner`). Proven first on a Gnosis fork (Foundry), then wired into Expo behind a flag + non-production channel.

**Tech Stack:** Foundry 1.5.1 (fork tests), Next.js 15 route (apps/web, viem ^2.47), Expo 56 / RN 0.85 (`react-native-passkey` 3.3.2 already native in the build, adds `viem` + `permissionless` JS deps), jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-26-passkey-sovereign-accounts-design.md`

## Global Constraints

- Branch `feat/passkey-accounts` only. NEVER merge/push to `main`. Commit with pathspecs only (`git add <files>`), never `git add .`/`-A`. Check `git branch --show-current` == `feat/passkey-accounts` before every commit (another agent works in `.worktrees/org-safe-protocol`).
- Chain: Gnosis, chainId 100. RPC for forks/tests: `https://gnosis-rpc.publicnode.com` (rpc.gnosischain.com rate-limits).
- Addresses (all verified to have code on chain 100, 2026-09-26):
  - EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`; EntryPoint v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`
  - thirdweb AccountFactory `0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00`, Account impl `0xf22175c80c6e074c171811c59c6c0087e2a6a346`
  - Safe L2 singleton 1.4.1 `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`, SafeProxyFactory 1.4.1 `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, MultiSend 1.4.1 `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526`
  - Safe4337Module v0.3.0 `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`, SafeModuleSetup v0.3.0 `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47`
  - SafeWebAuthnSharedSigner 0.2.1 `0x94a4F6affBd8975951142c3999aEAB7ecee555c2`, SafeWebAuthnSignerFactory 0.2.1 `0x1d31F259eE307358a26dFb23EB365939E8641195`, FCLP256Verifier `0xA86e0054C51E4894D88762a017ECc5E5235f5DBA`, P-256 precompile `0x0000000000000000000000000000000000000100`
  - Candide SocialRecoveryModule `0x38275826E1933303E508433dD5f289315Da2541c` (recoveryPeriod 259200 s)
  - NetizenVerifyingPaymaster `0x11ed03Db610c88b010FfE38B13142D3657f2E84f` (sponsorSigner `0x218B0a592f2078Aa542d7B981638595DF6bA8bF7`)
- Verifiers packing for the WebAuthn signer: `uint176 verifiers = (uint176(0x0100) << 160) | uint160(FCLP256Verifier)`.
- Passkey rpId `roebel.app`. PRF salt = `keccak256("roebel.app/passkey-prf/v1")` (32 bytes).
- UI copy German; identifiers/comments English. Never show raw 0x addresses in UI (show "Dein Passkey-Konto" etc.). Label the currency "Röbel Münzen".
- Expo: `StyleSheet.create()` + `useTheme()` — NO NativeWind. Package manager pnpm.
- Tranche 1 NEVER signs or submits an `isAdmin: 2` (remove) request from app code.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. User cancels the passkey sheet / device has no passkey support → flow returns to idle with a German message, no partial state persisted.
2. PRF unsupported (older iOS/Android, some password managers) → secrets re-wrap is skipped with an explicit "not protected by passkey" status, the handover still works; never derive a key from a missing PRF.
3. Handover run twice (already co-admin) → detected via `legacy.isAdmin(safe)` read, no second userOp.
4. Sponsor route receives a userOp whose callData targets anything other than the allowlist (legacy account `setPermissionsForSigner`/`execute`, SRM guardian mgmt) or exceeds gas caps → 403, no voucher.
5. The sponsored op is estimated with the 372-byte paymaster stub BEFORE sponsoring and the echoed gas limits are used verbatim (any re-estimate after signing invalidates the voucher).

---

### Task 1: Fork-proof the whole onchain path (Foundry)

**Files:**
- Create: `contracts/passkey-accounts/foundry.toml`, `contracts/passkey-accounts/.gitignore` (`lib/`, `out/`, `cache/`), `contracts/passkey-accounts/README.md`
- Create: `contracts/passkey-accounts/test/LegacyHandover.t.sol`, `test/PasskeySafeSponsored.t.sol`, `test/SocialRecovery.t.sol`, `test/utils/WebAuthnHelper.sol`
- Create: `contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json` (written by the test via `vm.writeJson`, then committed)

**Interfaces:**
- Produces: `passkey-safe-vector.json` = `{ x, y, verifiers, saltNonce, safeAddress, setupData }` — the golden counterfactual Safe address for a known P-256 key that Task 3's TS derivation must reproduce byte-for-byte.

Setup: `forge init --no-git --no-commit` is NOT needed; hand-write `foundry.toml` (`solc = "0.8.24"`, `evm_version = "cancun"`, `fs_permissions = [{ access = "read-write", path = "./test/fixtures" }]`, `[rpc_endpoints] gnosis = "https://gnosis-rpc.publicnode.com"`) and `forge install foundry-rs/forge-std --no-git`. Tests use minimal hand-written interfaces for the deployed contracts (no vendored Safe/thirdweb sources). Every test starts with `vm.createSelectFork("gnosis")`.

- [ ] **Step 1: LegacyHandover test (write, run, must pass against real bytecode)**
  1. `eoa = vm.addr(0xA11CE)`; `legacy = factory.createAccount(eoa, "")`.
  2. Deploy a plain Safe (proxy factory `createProxyWithNonce`, singleton L2 1.4.1, owner = `vm.addr(0xB0B)`, threshold 1) as the stand-in admin contract.
  3. Build `SignerPermissionRequest{signer: safe, isAdmin: 1, approvedTargets: [], nativeTokenLimitPerTransaction: 0, permissionStartTimestamp: 0, permissionEndTimestamp: 0, reqValidityStartTimestamp: block.timestamp, reqValidityEndTimestamp: block.timestamp + 1 hours, uid: keccak256("add")}`; EIP-712 digest with domain `("Account","1",100,legacy)` and TYPEHASH `SignerPermissionRequest(address signer,uint8 isAdmin,address[] approvedTargets,uint256 nativeTokenLimitPerTransaction,uint128 permissionStartTimestamp,uint128 permissionEndTimestamp,uint128 reqValidityStartTimestamp,uint128 reqValidityEndTimestamp,bytes32 uid)` (approvedTargets hashed as `keccak256(abi.encodePacked(arr))`); sign with `vm.sign(0xA11CE, digest)`; submit from an unrelated address. Assert `legacy.isAdmin(safe)`.
  4. Safe executes `legacy.execute(recipient, 1 wei, "")` (fund legacy with `vm.deal`) through `execTransaction` signed by owner `0xB0B` → recipient balance +1.
  5. Replay the same request → reverts (`uid` executed).
  6. EOA signs `isAdmin: 2` for itself (uid `"remove"`); submit; assert `!legacy.isAdmin(eoa)`, Safe still admin and can still `execute`; `vm.prank(eoa)` direct `execute` reverts `"Account: not admin or EntryPoint."`.
  7. After removal: `legacy.isValidSignature(hash, eoaSig)` does NOT return `0x1626ba7e` (expect revert or other value — use `try/catch`). This documents the ERC-1271 loss.
  Run: `cd contracts/passkey-accounts && forge test --match-contract LegacyHandover -vvv` → PASS.
- [ ] **Step 2: PasskeySafeSponsored test**
  1. P-256 key: `pk = 0xC0FFEE`; `(x, y) = vm.publicKeyP256(pk)`.
  2. Safe setup exactly as the Safe passkey 4337 flow: `setup(owners=[SharedSigner], threshold=1, to=MultiSend, data=multiSend([delegatecall SafeModuleSetup.enableModules([Safe4337Module, SocialRecoveryModule]), delegatecall SharedSigner.configure({x, y, verifiers})]), fallbackHandler=Safe4337Module, 0,0,0)`. `saltNonce = 0`. Compute counterfactual address via `proxyFactory` CREATE2 rules (`proxyCreationCode()` + singleton) and assert it equals `createProxyWithNonce` result in a snapshot.
  3. Build a PackedUserOperation (v0.7) with `initCode = factory ++ createProxyWithNonce(...)`, callData = `Safe4337Module.executeUserOp(legacyOrRecipient, 1 wei, "", 0)`.
  4. Sponsorship: `vm.store` the paymaster's `sponsorSigner` slot (find it with `forge inspect`-free approach: `vm.load` scan slots 0..10 for `0x218B0a59…`) to `vm.addr(0x5905)`, then build voucher v2 exactly per `netizen_labs/contracts/test/fixtures/voucher-vector.json` (copy that file to `test/fixtures/voucher-vector.json`; domain `{NetizenSponsorship,"2",100,paymaster}`, 320-byte `paymasterData`, `paymasterAndData = paymaster ++ uint128 pmVerifGas ++ uint128 pmPostOpGas ++ paymasterData`, `validUntil != 0`).
  5. WebAuthn signature (`test/utils/WebAuthnHelper.sol`): Safe4337Module operation hash → `challenge`; `clientDataJSON = {"type":"webauthn.get","challenge":"<base64url(challenge)>","origin":"https://roebel.app"}`; `authenticatorData = sha256("roebel.app") ++ 0x05 ++ uint32 signCount`; message = `sha256(authData ++ sha256(clientDataJSON))`; `(r,s) = vm.signP256(pk, message)` normalized to low-s; signature = `abi.encodePacked(validAfter uint48, validUntil uint48, safeSignatureBytes)` where the Safe contract signature points at SharedSigner with `abi.encode(authenticatorData, clientDataFields, r, s)` (`clientDataFields` = the JSON between the challenge and the closing brace, i.e. `"origin":"https://roebel.app"`).
  6. `entryPoint.handleOps([op], beneficiary)`; assert Safe deployed, recipient +1 wei, paymaster deposit decreased.
  7. `vm.writeJson` the vector to `test/fixtures/passkey-safe-vector.json`.
  Run: `forge test --match-contract PasskeySafeSponsored -vvv` → PASS. If the fork EVM lacks the 0x100 precompile the fallback verifier must make it pass anyway — that is the point of the packing.
- [ ] **Step 3: SocialRecovery test**
  1. Deploy the passkey Safe from Step 2 (reuse helper). Owner Safe adds guardians G1, G2, G3 (plain EOA-owned Safes) via `SRM.addGuardianWithThreshold(g, t)` executed as Safe txs from the passkey Safe (userOps through EntryPoint signed with the P-256 key; sponsorship optional here — fund the Safe deposit with `vm.deal` + `entryPoint.depositTo`), final threshold 2.
  2. New passkey `pk2`; `newOwner = SafeWebAuthnSignerFactory.createSigner(x2, y2, verifiers)`.
  3. G1 and G2 Safes each call `SRM.confirmRecovery(passkeySafe, [newOwner], 1, false)` via `execTransaction`.
  4. `SRM.executeRecovery(passkeySafe, [newOwner], 1)`; `vm.warp(+259200+1)`; `SRM.finalizeRecovery(passkeySafe)`; assert `getOwners() == [newOwner]`.
  5. Negative: before the warp, the owner (old passkey) calls `SRM.cancelRecovery()` via userOp → finalize reverts.
  Run: `forge test -vvv` (all three) → PASS.
- [ ] **Step 4: README** — how to run, what each test proves, the vector file contract ("Task 3 TS must reproduce `safeAddress`").
- [ ] **Step 5: Commit**
```bash
git add contracts/passkey-accounts
git commit -m "test(contracts): fork-prove passkey Safe handover, sponsorship and social recovery on Gnosis"
```

### Task 2: Preview-only sponsor route (apps/web)

**Files:**
- Create: `apps/web/src/lib/passkey/voucher.ts` (port of `netizen_labs/packages/signer/src/vouchers.ts`: `UserOperationV07`, `hashStableFields`, `requiredPrefund`, `SPONSORSHIP_VOUCHER_TYPES`, `encodePaymasterAndData`, signing via viem `privateKeyToAccount(...).signTypedData`) — keep only what the route needs, same encodings.
- Create: `apps/web/src/lib/passkey/sponsor-policy.ts`
- Create: `apps/web/src/app/api/passkey/sponsor/route.ts`
- Create: `apps/web/src/lib/passkey/__tests__/voucher.test.ts`, `sponsor-policy.test.ts`, fixture copy `apps/web/src/lib/passkey/__tests__/voucher-vector.json`
- Modify: `apps/web/.env.example` (add `PASSKEY_SPONSOR_ENABLED=`, `PASSKEY_SPONSOR_KEY=` placeholders)

First check which test runner apps/web uses (`grep -n '"test' apps/web/package.json`; look for vitest/jest config) and follow it.

**Interfaces:**
- Produces HTTP: `POST /api/passkey/sponsor` body `{ chainId: 100, userOp: UserOperationV07 (hex strings for all numeric fields) }` → `200 { paymasterAndData: Hex, paymasterVerificationGasLimit: Hex, paymasterPostOpGasLimit: Hex, validUntil: number }` | `403 { error: 'not_sponsorable', reason }` | `503 { error: 'disabled' }`.
- `evaluateSponsorPolicy(op: UserOperationV07): { ok: true } | { ok: false; reason: string }`.

Policy (pure, unit-tested):
- `PASSKEY_SPONSOR_ENABLED !== '1'` → 503.
- `chainId !== 100` → 403.
- `callData` must decode as `Safe4337Module.executeUserOp(to, value, data, operation)` or `executeUserOpWithErrorString` with `operation == 0` and `value == 0`, OR `multiSend` via `executeUserOp(MultiSendCallOnly…)` whose every inner call satisfies the next rule.
- Inner `to`/`data` allowed: (a) any address whose `data` selector is thirdweb `setPermissionsForSigner` with `req.isAdmin == 1` (removals REJECTED in tranche 1) or `execute`/`executeBatch`; (b) `SocialRecoveryModule` selectors `addGuardianWithThreshold`, `revokeGuardianWithThreshold`, `changeThreshold`, `confirmRecovery`, `cancelRecovery`.
- Gas caps: `callGasLimit <= 1_500_000`, `verificationGasLimit <= 1_000_000`, `preVerificationGas <= 200_000`, `maxFeePerGas <= 50 gwei`.
- If `factory` set it must equal SafeProxyFactory 1.4.1.
- `validUntil = now + 10 min`.

- [ ] **Step 1: Copy fixture, write voucher.test.ts** asserting `hashStableFields`, digest, `paymasterData`, `paymasterAndData` equal the vector byte-for-byte (fixture uses Anvil key #0; test-only).
- [ ] **Step 2: Run → FAIL; implement voucher.ts; run → PASS.**
- [ ] **Step 3: sponsor-policy.test.ts** — one passing op per allowed shape; rejections for: removal request (`isAdmin: 2`), arbitrary ERC-20 `transfer`, delegatecall operation, non-zero value, gas over cap, foreign factory. Run → FAIL; implement; → PASS.
- [ ] **Step 4: route.ts** (`runtime = "nodejs"`, `dynamic = "force-dynamic"`, mirror style of `apps/web/src/app/api/bundler/route.ts`); never log the key; 400 on malformed JSON.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/passkey apps/web/src/app/api/passkey apps/web/.env.example
git commit -m "feat(web): preview-only passkey sponsor route issuing NetizenVerifyingPaymaster vouchers"
```

### Task 3: Expo passkey + Safe library (no UI)

**Files:**
- Modify: `apps/expo/package.json` (add `viem` pinned to the version already resolved for `apps/web` — check `pnpm why viem` — and `permissionless`; if permissionless's Safe WebAuthn support needs a newer viem, prefer hand-rolled encoding with viem only and DROP permissionless).
- Create under `apps/expo/lib/passkey/`: `constants.ts` (all addresses + rpId + PRF salt from Global Constraints), `webauthn.ts`, `cose.ts`, `safe-address.ts`, `userop.ts`, `legacy-handover.ts`, `prf-vault.ts`, `index.ts`
- Tests: `apps/expo/lib/passkey/__tests__/{cose,safe-address,userop,legacy-handover,prf-vault}.test.ts`; fixture copy of `contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json`

**Interfaces (Produces):**
```ts
// webauthn.ts
export type PasskeyCredential = { credentialId: string; x: Hex; y: Hex; prfSupported: boolean };
export async function createPasskey(userName: string): Promise<PasskeyCredential>; // throws PasskeyCancelledError on cancel
export async function signWithPasskey(credentialId: string, challenge: Hex): Promise<{ authenticatorData: Hex; clientDataJSON: string; r: bigint; s: bigint; prf?: Hex }>;
export async function getPrfSecret(credentialId: string): Promise<Hex | null>; // null when PRF unsupported
export class PasskeyCancelledError extends Error {}
// safe-address.ts
export function buildSafeSetup(p: { x: Hex; y: Hex }): { initializer: Hex; saltNonce: bigint };
export function predictSafeAddress(p: { x: Hex; y: Hex }): Address; // must equal fixture safeAddress
// userop.ts
export type SponsoredCall = { to: Address; data: Hex };
export async function sendPasskeyUserOp(args: { credentialId: string; x: Hex; y: Hex; calls: SponsoredCall[]; deployed: boolean }): Promise<{ userOpHash: Hex; txHash: Hex }>;
// legacy-handover.ts
export function buildAddAdminRequest(safe: Address, nowSec: number): SignerPermissionRequest;
export function signerPermissionTypedData(legacy: Address, req: SignerPermissionRequest): TypedDataDefinition;
export function encodeSetPermissions(req: SignerPermissionRequest, sig: Hex): Hex;
// prf-vault.ts
export async function wrapSecret(prf: Hex, label: string, secret: Uint8Array): Promise<string>; // AES-256-GCM, HKDF-SHA256(prf, salt=label) — returns versioned base64 "pkv1:..."
export async function unwrapSecret(prf: Hex, label: string, blob: string): Promise<Uint8Array>;
```
`sendPasskeyUserOp` sequence (matches Review Focus 5): build unsigned op → `eth_estimateUserOperationGas` with a 372-byte stub `paymasterAndData` and a dummy WebAuthn signature of realistic length → `POST {EXPO_PUBLIC_PASSKEY_API_URL}/api/passkey/sponsor` → rebuild with echoed paymaster gas limits VERBATIM → compute Safe4337Module op hash → `signWithPasskey` → encode signature exactly as Task 1 Step 2.5 → `eth_sendUserOperation` to `EXPO_PUBLIC_PASSKEY_BUNDLER_URL` (default `{EXPO_PUBLIC_PASSKEY_API_URL}/api/bundler`) → poll `eth_getUserOperationReceipt` with an AbortController timeout (RN fetch never times out). Crypto via `react-native-quick-crypto` (already a dependency; check how `lib/encryption.ts` does AES-GCM and reuse that approach).

- [ ] **Step 1: cose.test.ts** — parse a fixed attestationObject (generate one in the test from a known key by CBOR-encoding a COSE EC2 key) → x/y. FAIL → implement `cose.ts` (minimal CBOR map reader for the attested credential data) → PASS.
- [ ] **Step 2: safe-address.test.ts** — `predictSafeAddress(fixture)` === `fixture.safeAddress` and `buildSafeSetup(fixture).initializer === fixture.setupData`. FAIL → implement → PASS.
- [ ] **Step 3: legacy-handover.test.ts** — typed-data digest for a fixed request equals the digest computed in Task 1 (add the digest to the fixture in Task 1 or recompute with viem `hashTypedData` and cross-check against a hard-coded value produced by `cast`); `buildAddAdminRequest` always has `isAdmin === 1`. → PASS.
- [ ] **Step 4: userop.test.ts** — pure parts only: signature encoding for a fixed (authData, clientDataJSON, r, s) equals Task 1 helper output (hard-code the bytes from a Task 1 `console.logBytes`); stub-sponsor rebuild keeps limits verbatim. → PASS.
- [ ] **Step 5: prf-vault.test.ts** — round trip; wrong label/prf fails to unwrap; blob prefix `pkv1:`. → PASS.
- [ ] **Step 6: webauthn.ts** (no unit test for native calls; mock `react-native-passkey` in one smoke test that `createPasskey` maps a cancel error to `PasskeyCancelledError`).
- [ ] **Step 7: Run** `cd apps/expo && pnpm jest lib/passkey` → all PASS. Commit:
```bash
git add apps/expo/package.json pnpm-lock.yaml apps/expo/lib/passkey
git commit -m "feat(expo): passkey Safe library — WebAuthn, counterfactual Safe, sponsored userOps, legacy handover, PRF vault"
```

### Task 4: Preview-gated migration screen (Expo)

**Files:**
- Modify: `apps/expo/lib/supabase-app-settings.ts` — add `fetchPasskeyAccountsEnabled()` (missing key = OFF, only `'true'` enables).
- Create: `apps/expo/lib/passkey/gate.ts` — `isPasskeyPreviewAllowed(): Promise<boolean>` = flag && `Updates.channel !== 'production'` (import `* as Updates from 'expo-updates'`; `__DEV__` also allowed).
- Create: `apps/expo/lib/passkey/migration.ts` — state machine `idle → creatingPasskey → rewrappingSecrets → signingHandover → submitting → done | error`, persisted in SecureStore key `passkey_migration_v1` (`{credentialId, x, y, safe, status}`) only AFTER passkey creation succeeds.
- Create: `apps/expo/app/settings/passkey.tsx` (screen), `apps/expo/components/passkey/MigrationSteps.tsx`
- Modify: the settings list screen to show the entry only when `isPasskeyPreviewAllowed()` (find it via `grep -rn "reveal-key" apps/expo/app --include=*.tsx`).
- Test: `apps/expo/lib/passkey/__tests__/migration.test.ts`

**Interfaces:**
- Consumes Task 3 exports; thirdweb admin account via `useActiveWallet()` → `(wallet as any).getAdminAccount?.()` (the inAppWallet EOA that is admin of the smart account) for `signTypedData` of the handover request; legacy address = `useActiveAccount().address`.
- Secrets re-wrap: MACI key via the existing persisted keypair (read how `context/MaciContext.tsx` persists it — reuse its getter, do NOT re-derive with a new message), Nostr key from SecureStore `SECRET_KEY_STORE` in `lib/nostr/identity.ts`. Store wrapped blobs in SecureStore `passkey_wrapped_maci_v1` / `passkey_wrapped_nostr_v1`. Originals stay in place (tranche 1 is additive).
- Idempotence: before submitting, read `legacy.isAdmin(safe)` (viem publicClient, Gnosis) → if true skip to `done`.

- [ ] **Step 1: migration.test.ts** — with Task 3 functions mocked: cancel at passkey → `idle` + nothing persisted; PRF null → status `rewrap: 'skipped'`, handover continues; `isAdmin` already true → no `sendPasskeyUserOp` call; happy path calls `sendPasskeyUserOp` once with one call `{to: legacy, data: encodeSetPermissions(isAdmin 1)}`. FAIL → implement → PASS.
- [ ] **Step 2: Screen** — German copy. Title "Passkey & Wiederherstellung". Steps: "Passkey erstellen", "Schlüssel schützen", "Passkey-Konto verbinden". Explain: "Dein Konto bleibt dasselbe. Dein Passkey wird zusätzlicher Verwalter — die E-Mail-Anmeldung funktioniert weiterhin." A disabled row "E-Mail-Anmeldung entfernen — kommt bald" (no action). Guardian section read-only placeholder text "Vertrauenspersonen einrichten — kommt im nächsten Schritt". StyleSheet + useTheme, no shadows, no raw addresses.
- [ ] **Step 3: Gate the settings entry.** Verify with a jest render test or by reasoning that production channel returns false.
- [ ] **Step 4: Config for the native build gate** — `apps/expo/app.config.ts` iOS `associatedDomains` add `'webcredentials:roebel.app'`; `apps/web/public/.well-known/assetlinks.json` add `"delegate_permission/common.get_login_creds"` to the existing relation array; `apps/expo/.env.example` add `EXPO_PUBLIC_PASSKEY_API_URL=` and `EXPO_PUBLIC_PASSKEY_BUNDLER_URL=`.
- [ ] **Step 5: Commit**
```bash
git add apps/expo/lib/supabase-app-settings.ts apps/expo/lib/passkey apps/expo/app/settings/passkey.tsx apps/expo/components/passkey apps/expo/app.config.ts apps/expo/.env.example apps/web/public/.well-known/assetlinks.json <settings-list-file>
git commit -m "feat(expo): preview-gated passkey migration screen (co-admin handover, PRF-wrapped secrets)"
```

### Task 5: State doc + push

- [ ] Create `docs/PASSKEY_ACCOUNTS_STATE.md`: what shipped, the gates list from the spec, how to test on a preview build, tranche 2 list (XMTP association, write-path routing through Safe, verifier Safe-on-behalf-of-legacy, EOA removal, guardian UI, persistent sponsor budget, new-user Safe-only onboarding).
- [ ] `git push -u origin feat/passkey-accounts`.
