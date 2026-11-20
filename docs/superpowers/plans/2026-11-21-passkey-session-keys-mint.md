# Röbel Münzen ohne Fingerabdruck (Passkey-Session-Keys, nur Abholen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A passkey citizen claims Röbel Münzen (`personalMint` + Röbel `groupMint`) with no fingerprint for 30 days. A device session key on the Safe7579 + SmartSession stack does the claim. The first claim costs one fingerprint, which migrates the Safe and grants the session in one op.

**Architecture:** One passkey op migrates each passkey Safe from Safe4337Module to the Safe7579 adapter and installs SmartSession with two mint-only sessions. The passkey stays the Safe owner (root: nonce key 0 → `Safe.checkSignatures`). A software secp256k1 device key signs session ops (nonce key = SmartSession). The web sponsor policy learns the 7579 layout and four new modes. Each mode re-checks every byte the server can rebuild. A remote kill switch sends the app back to today's passkey claim. A migrated Safe keeps working for every other action through the 7579 root path.

**Tech Stack:** Foundry fork tests (Gnosis, chain 100), TypeScript + viem 2.53.1 (web `node:test` via `tsx`, Expo `jest`), Expo SDK (runtime 3.10.0, OTA only), expo-secure-store ~56.0.4, Next.js route `/api/passkey/sponsor`, Supabase `app_settings`.

**Spec:** `docs/superpowers/specs/2026-09-27-passkey-session-keys-design.md`. It lives only on branch `feat/session-keys` (commit `1c0959d5`) until Task 1 brings it to `main`. Fork proof: `contracts/passkey-accounts/test/SessionKeys.t.sol`. The owner decisions below override the spec wherever they differ. The main differences: no `send` session, and the rollout is open to all passkey accounts instead of preview-only.

## Global Constraints

Owner decisions (2026-11-20/21), verbatim:
- MINT ONLY: the device session key may call only `personalMint` and the Röbel `groupMint` (two sessions; the spec's `roebel/muenzen/send` session is OUT). Sending Münzen, trust, votes, everything else stays on the passkey.
- Session expiry 30 days (TimeFramePolicy), v1 software secp256k1 key in expo-secure-store (WHEN_UNLOCKED_THIS_DEVICE_ONLY, never backed up).
- Rollout ON for all passkey accounts (the upgrade is offered at the first Münzen claim; migration + grant = one fingerprint), BUT with a remote kill switch `app_settings.passkey_session_keys_enabled` (default true) that makes the app fall back to today's passkey claim and the sponsor route deny session-* modes.
- Build mode: builder agents per part + ONE security review of the sponsor-policy changes before release (make the review a plan task with explicit checks: no open faucet, nonce-key routing, byte-equal upgrade batch, session-scope re-check, budgets, delegatecall ban).
- Ships as an Expo OTA onto runtime 3.10.0: no new native modules (check expo-secure-store and viem are already in apps/expo/package.json; if something native is missing, say so in the plan and stop that task).

Derived constraints (from the spec and the fork proof; exact values):
- Native check done 2026-11-21: `apps/expo/package.json` has `expo-secure-store: ~56.0.4` and `viem: 2.53.1`. `react-native-get-random-values` is already installed in `index.js` (`lib/passkey/random.ts`). No new native module is needed. If any task finds it needs one, it STOPS and reports.
- Gnosis addresses (verified in the spec): Safe7579 `0x7579EE8307284F293B1927136486880611F20002`, SmartSession `0x00000000002B0eCfbD0496EE71e01257dA0E37DE`, OwnableValidator `0x000000000013fdB5234E4E3162a810F54d9f7E98`, UniActionPolicy `0x0000000000714Cf48FcF88A0bFBa70d313415032`, TimeFramePolicy `0x0000000000D30f611fA3bf652ac6879428586930`, MultiSendCallOnly `0x9641d764fc13c8B624c04430C7356C1C7C8102e2`, Circles Hub `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8`, Röbel group `0xAc2CeCdBead594F97358a0d3132454f24F3E470c`. The registry is off: `RegistryInit(0, [], 0)`. Sessions are granted through `onInstall` with mode `UNSAFE_ENABLE = 0x02`.
- Session salts: `keccak256("roebel/muenzen/personalMint")` and `keccak256("roebel/muenzen/groupMint")`. Session validator: OwnableValidator with `abi.encode(uint256(1), [signer])`. userOp policy: TimeFramePolicy `abi.encodePacked(uint48 validUntil, uint48 0)`. Action: `(legacy.execute selector 0xb61d27f6, legacy)` with UniActionPolicy `abi.encode(ActionConfig)`, using exactly the rules of `_mintConfig` / `_groupMintConfig` in the fork test. `permitERC4337Paymaster = true`. No ERC-7739 content.
- Session nonce key = `uint192(bytes24(bytes20(SmartSession)))` = `BigInt(SMART_SESSIONS) << 32n`. Session signature = `0x00 ++ permissionId ++ ECDSA(sessionKey, userOpHash)`. The ECDSA is over the raw EntryPoint v0.7 userOpHash (no EIP-191 prefix), 65 bytes r‖s‖v.
- Root ops after migration: `Safe7579.execute(mode, executionCalldata)`. Mode is EXEC_SINGLE `0x00…00` (packed `target ++ uint256 value ++ data`) or EXEC_BATCH `0x01 << 248` (`abi.encode(Execution[])`). The SafeOp EIP-712 domain has `verifyingContract = Safe7579`. The signature layout is the same as today: `uint48 validAfter ++ uint48 validUntil ++ safeSignatures`.
- ERC-1271 after migration: `address(0) ++ safeSignature` (20 zero bytes). The SafeMessage hash does not change.
- Expiry `SESSION_DAYS = 30`. Renew when `validUntil − now < 3 days` (`SESSION_RENEW_BEFORE_SEC = 259_200`). The server accepts `now < validUntil ≤ now + 30 d + 600 s`.
- In this repo "session" already means the passkey login session (`PasskeySession`, `lib/passkey/session.ts`, web `session-handler.ts` / `session-token-*`). The new feature is always called **device session** in code (`DeviceSession…`, dir `session-keys/`). Do not touch the old `session*` files except where a task names them.
- Code and comments in English, UI copy in German. Never show addresses or session keys in the UI. No drop shadows. StyleSheet + `useTheme()` only.
- Scope v1: legacy identities (`identityKind(session) === 'legacy'`) with a passkey owner. Words/ECDSA Safes and Safe-identity citizens are never offered the upgrade and keep today's flow.
- Tests: web `cd apps/web && npx tsx --test <file>`. Expo `cd apps/expo && npx jest <file>` (no tsc mid-iteration). Fork `cd contracts/passkey-accounts && forge test --match-contract SessionKeysTest -vvv` (Foundry ≥ 1.5.1, `forge install foundry-rs/forge-std --no-git` once).
- Git: other sessions edit the checkout concurrently. Never stash, reset or checkout. Stage only your own files. `git pull --rebase --autostash && git push` after every commit. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Done = commit + push. Max runs `eas update` himself. Agents never run EAS commands.

## Review Focus

1. **A migrated Safe with the kill switch off, or after "Nicht jetzt", must still do everything** (claim with passkey, send, vote, guardians, mini apps). Every existing sponsor mode must accept the 7579 root callData, and the app must build 7579 root ops. Pinned by Task 5 (`sendSafeUserOp builds Safe7579 execute + 7579 SafeOp hash for a 7579 Safe`) and Task 7 (`every existing mode passes in 7579 layout`).
2. **A new phone or a recovery sign-in finds a migrated Safe.** `recovery-lookup.ts isPasskeySafe` currently requires handler = Safe4337Module. Pinned by Task 5 (`isPasskeySafe accepts the migrated 7579 layout`).
3. **A second device grants, and the first device's session dies** (InvalidPermissionId), or the session expires between `personalMint` and `groupMint`. The claim must fall back to the passkey once, clear the stale record, and not loop on errors. Pinned by Task 10 (`stale permission falls back to passkey and clears the record`, `groupMint failure after personalMint returns a partial result`).
4. **The app is killed after the grant lands but before the record is saved.** The device key is persisted as `pending` before sending, and on load it is promoted once `getPermissionIDs` contains its ids. Pinned by Task 8 (`pending record is promoted when the chain has its permission ids`).
5. **A migrated Safe receives ERC-721/1155 tokens and signs guardian approvals.** Safe7579 replaces the CompatibilityFallbackHandler. Pinned by Task 2 (`test_receiverHooksAfterMigration`) and Task 6 (`guardian approval of a migrated guardian Safe carries the prefix`).

---

## Task order and parallelism

| Wave | Tasks (parallel within a wave) | Files touched |
|---|---|---|
| 0 | T1 → T2 (sequential) | `contracts/passkey-accounts/**`, spec |
| 1 | T3 (Expo builders + layout) ‖ T4 (web builders) | disjoint |
| 2 | T5 (Expo root path) ‖ T6 (Expo 1271 prefix) ‖ T7 (web 7579 layout) | disjoint |
| 3 | T8 (Expo device key + session op) ‖ T9 (web session modes + kill switch) | disjoint |
| 4 | T10 (Expo grant/revoke + claim routing) | needs T8 |
| 5 | T11 (Settings UI + offer sheet) | needs T10 |
| 6 | T12 security review (needs T7, T9) — can run alongside T10/T11 | review notes + fixes in web policy |
| 7 | T13 deploy + device test + OTA handoff | — |

---

### Task 1: Bring the spec and fork proof onto `main`, green

**Files:**
- Add (cherry-pick `1c0959d5`): `docs/superpowers/specs/2026-09-27-passkey-session-keys-design.md`, `contracts/passkey-accounts/test/SessionKeys.t.sol`, `contracts/passkey-accounts/test/utils/SessionInterfaces.sol`
- Modify: `contracts/passkey-accounts/README.md` (SessionKeys row)

**Interfaces:**
- Produces: the fork suite `SessionKeysTest` on `main`, unchanged (3 sessions), green.

- [ ] **Step 1:** `git cherry-pick 1c0959d5`. On a README conflict keep both table rows (main's EcdsaSafe/WordsRecovery rows plus the SessionKeys row). If the conflict is anywhere else, STOP. Do not run `git checkout` or `git reset`. Copying the four files from `git show 1c0959d5:<path>` and committing them is an allowed fallback.
- [ ] **Step 2:** Run `forge test --match-contract SessionKeysTest -vvv`. Expected: 10/10 PASS. If `setUp` fails on a live-shape assertion (Max's Safe `0xE3D1…2deB` changed since 2026-09-27), pin the fork to the last good block: `vm.createSelectFork(rpc, <block>)` in `_fork()` of this test only. Record the block and the drift in the commit message. Any other failure: STOP and report.
- [ ] **Step 3:** Run the whole suite with `forge test`. Expected: all PASS (the existing EcdsaSafe/WordsRecovery tests still pass next to the new ones).
- [ ] **Step 4:** Commit `test(passkey): session keys spec + Gnosis fork proof onto main (cherry-pick 1c0959d5)` and push.

### Task 2: Fork proof → mint-only scope, receiver hooks, golden vector

**Files:**
- Modify: `contracts/passkey-accounts/test/SessionKeys.t.sol`
- Create: `contracts/passkey-accounts/test/fixtures/session-keys-vector.json` (written by the test)
- Modify: `docs/superpowers/specs/2026-09-27-passkey-session-keys-design.md`. Add an "Owner decisions 2026-11-21" block at the top: mint-only (2 sessions), rollout to all passkey accounts with the kill switch, and the grant gas numbers from step 5. Mark the send session and the send UI copy as OUT.

**Interfaces:**
- Produces `session-keys-vector.json`. Tasks 3 and 4 copy it into their `__tests__` dirs and reproduce every byte. Fixed inputs: `safe = MAX_SAFE`, `legacy = MAX_LEGACY`, `signer = vm.addr(SESSION_KEY)`, `validUntil = 1_800_000_000`, `prev4337` (as read on the fork). Fields:
  `{ inputs:{safe,legacy,signer,validUntil,prev4337,modulesBefore[]}, permissionIds:{personalMint,groupMint}, smartSessionInitData, migrationCallData, grantInstallCallData, grantReplaceCallData, revokeCallData, sessionNonceKey, personalMintSessionCallData, groupMintSessionCallData (amount 1e18), rootClaimCallData (batch: legacy.executeBatch personalMint+groupMint), rootOp:{…packed fields, safeOpHash7579}, sessionOp:{…packed fields, userOpHash, signature}, erc1271:{hash, safeSignature, prefixedSignature} }`

- [ ] **Step 1: Write the new/changed tests**
  - `_sessions()` returns 2 sessions (personalMint, groupMint). Delete `_sendConfig`, `pidSend` and `test_sessionKeySendsMuenzenWithinCaps`.
  - `test_sendIsOutOfScope`: `safeTransferFrom` via legacy, signed with `pidGroupMint` and with `pidMint` → `_expectReject(op, POLICY_VIOLATION)`.
  - `test_disallowedCallsFail`: replace every `pidSend` with `pidGroupMint`. Keep all 11 shapes.
  - `test_revokeAllSessionsWithOnePasskeyOp`: 2 `removeSession` calls. Assert `getPermissionIDs(safe).length == 0`.
  - `test_rootOpClaimAfterMigration`: after `_migrate(true)`, a `_rootOp` with `Safe7579.execute(EXEC_BATCH, [legacy.executeBatch([HUB,HUB],[0,0],[personalMint, groupMint(GROUP,[legacy],[x],"")])])` succeeds. Personal and group balances go up. This is the kill-switch fallback path.
  - `test_receiverHooksAfterMigration`: after `_migrate(true)`, staticcall the Safe's `onERC721Received(address,address,uint256,bytes)` and `onERC1155Received(...)`. Assert the magic return values `0x150b7a02` / `0xf23a6e61`. **If this fails, STOP the whole plan and report.** Safe7579 as fallback handler would then break NFT receipts by migrated Safes (CitizenNFT/CredentialRegistry mints to a Safe).
  - `test_grantGasFitsSponsorCap`: `GRANT_CALL_GAS = 3_000_000`. `_migrate(true)` with this callGasLimit succeeds. Log the handleOps gas. `assertLt(gasUsed, 2_800_000)`.
  - `test_writeSessionKeysVector`: builds every vector field from the fixed inputs and calls `vm.writeJson(..., "./test/fixtures/session-keys-vector.json")`. For `rootOp` and `sessionOp`, assert `ISafe7579.getSafeOp` hash == `_safeOpHash7579` and `entryPoint.getUserOpHash` == the written `userOpHash`.
- [ ] **Step 2:** `forge test --match-contract SessionKeysTest -vvv`. Expected before the changes: the new tests fail (missing functions). After them: all PASS, and the vector file is written.
- [ ] **Step 3:** Run `forge test` (whole suite). Expected: all PASS.
- [ ] **Step 4:** Update the spec header block. Fill in the measured gas (2-session migrate+grant, grant, revoke, session mint ops).
- [ ] **Step 5:** Commit `test(passkey): session keys mint-only (2 sessions), receiver hooks, golden vector` and push.

### Task 3: Expo builders + Safe layout reader

**Files:**
- Create: `apps/expo/lib/passkey/session-keys/builders.ts`, `apps/expo/lib/passkey/safe-layout.ts`
- Test: `apps/expo/lib/passkey/__tests__/session-keys-builders.test.ts`, `apps/expo/lib/passkey/__tests__/safe-layout.test.ts`
- Copy: `apps/expo/lib/passkey/__tests__/session-keys-vector.json` (from Task 2's fixture, byte-identical)

**Interfaces (Produces):**
```ts
// builders.ts — pure viem encoders, no I/O
export const SAFE7579, SMART_SESSIONS, OWNABLE_VALIDATOR, UNI_ACTION_POLICY, TIME_FRAME_POLICY: Address;
export const SESSION_DAYS = 30, SESSION_RENEW_BEFORE_SEC = 259_200;
export const SESSION_NONCE_KEY: bigint;                       // BigInt(SMART_SESSIONS) << 32n
export type MintSessionKind = 'personalMint' | 'groupMint';
export type DeviceSessionParams = { legacy: Address; signer: Address; validUntil: number };
export type PermissionIds = Record<MintSessionKind, Hex>;
export function mintSessions(p: DeviceSessionParams): SessionStruct[];        // [personalMint, groupMint]
export function permissionIdsOf(p: DeviceSessionParams): PermissionIds;       // keccak256(abi.encode(validator, validatorInitData, salt))
export function smartSessionInitData(p: DeviceSessionParams): Hex;            // 0x02 ++ abi.encode(Session[])
export function prev4337AfterEnable(modulesBefore: readonly Address[]): Address; // 7579 lands at the head
export function migrationCallData(p: DeviceSessionParams & { safe: Address; prev4337: Address }): Hex;
export function grantCallData(p: DeviceSessionParams & { safe: Address; replace: boolean }): Hex;
export function revokeCallData(pids: readonly Hex[]): Hex;
export function encode7579Execute(calls: readonly { to: Address; value?: bigint; data: Hex }[]): Hex; // 1 = single, n = batch
export function sessionClaimCallData(legacy: Address, innerHubData: Hex): Hex;
export function encodeSessionSignature(pid: Hex, ecdsa65: Hex): Hex;          // 0x00 ++ pid ++ sig
export function withValidatorPrefix(safeSignature: Hex): Hex;                 // 20 zero bytes ++ sig
// safe-layout.ts
export type SafeLayout = '4337' | '7579';
export async function readSafeLayout(safe: Address, deps?: { rpcUrl?: string; fetch?: FetchLike }): Promise<SafeLayout>; // handler slot; throws on any other handler
export function invalidateSafeLayout(safe: Address): void;                   // per-address memo, cleared after upgrade
export async function readModules(safe: Address, deps?): Promise<Address[]>; // getModulesPaginated(SENTINEL, 10)
```

- [ ] **Step 1: Write failing tests.** For every field of `session-keys-vector.json`, `session-keys-builders.test.ts` asserts `toBe(vector.<field>)` (lowercased hex), e.g. `test('migrationCallData reproduces the fork batch byte for byte')`, `test('permissionIdsOf matches SmartSession.getPermissionId')`, `test('grantCallData replace=true is uninstall(SENTINEL,"") + install')`, `test('SESSION_NONCE_KEY equals the vector')`. Plus `test('prev4337AfterEnable: 4337 first → SAFE7579, else the module before it')` and `test('encode7579Execute never emits callType 0xff')`. `safe-layout.test.ts`: handler word = Safe4337Module → `'4337'`, = Safe7579 → `'7579'`, any other → throws `'unknown Safe layout'`. The memo is cleared by `invalidateSafeLayout`.
- [ ] **Step 2:** `npx jest lib/passkey/__tests__/session-keys-builders.test.ts lib/passkey/__tests__/safe-layout.test.ts` → FAIL (modules missing).
- [ ] **Step 3:** Implement both files. Session tuple types are copied from `SessionInterfaces.sol` (struct order is ABI-relevant). `ParamRules.rules` is a fixed `ParamRule[16]`: pad the unused entries with zero rules.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(expo): device-session builders + Safe layout reader (golden vector)` and push.

### Task 4: Web builders (server copy, same vector)

**Files:**
- Create: `apps/web/src/lib/passkey/session-keys-builders.ts`
- Test: `apps/web/src/lib/passkey/__tests__/session-keys-builders.test.ts`
- Copy: `apps/web/src/lib/passkey/__tests__/session-keys-vector.json`

**Interfaces (Produces):** the same exported names and signatures as Task 3's `builders.ts` (minus `withValidatorPrefix`), in the web code style (double quotes), plus `export const DEVICE_SESSION_MAX_SEC = 30 * 86_400 + 600`. This copy exists because Metro cannot import server code. Both copies are pinned by the same vector, which is how the server's byte-equal checks match the app.

- [ ] **Step 1:** Write the same vector assertions as Task 3 with `node:test` (`test("migrationCallData reproduces the fork batch byte for byte", …)` etc.).
- [ ] **Step 2:** `npx tsx --test src/lib/passkey/__tests__/session-keys-builders.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(web): device-session builders for the sponsor policy (golden vector)` and push.

### Task 5: Expo root-op path for migrated Safes

**Files:**
- Modify: `apps/expo/lib/passkey/userop.ts` (`safeOpHash`, `buildCallData`, `SafeOpSigner`, `SafeUserOpArgs`, `sponsorRequestBody`, `sendSafeUserOp`)
- Modify: `apps/expo/lib/passkey/recovery-lookup.ts` (`isPasskeySafe`, ~line 376)
- Modify: `apps/expo/lib/passkey/__testutils__/lookup-client.ts` (layout option)
- Test: `apps/expo/lib/passkey/__tests__/userop.test.ts`, `apps/expo/lib/passkey/__tests__/recovery-lookup.test.ts`

**Interfaces:**
- Consumes: Task 3 `encode7579Execute`, `SAFE7579`, `readSafeLayout`, `SafeLayout`.
- Produces:
```ts
export function safeOpHash(op: UnpackedUserOp, validAfter: number, validUntil: number, verifyingContract: Address = SAFE_4337_MODULE): Hex;
export function buildCallData(calls: SponsoredCall[], layout: SafeLayout = '4337'): Hex;
export type SafeOpSigner = { …existing; nonceKey?: bigint /* default 0n */; hashKind?: 'safeOp' | 'userOpHash' /* default 'safeOp' */ };
export type SafeUserOpArgs = { …existing;
  layout?: SafeLayout;            // default: readSafeLayout(sender) when deployed, '4337' when not
  callData?: Hex;                 // overrides `calls` encoding (grant / migration / session ops)
  maxFeePerGasCap?: bigint;       // grant ops pass 2_000_000_000n
  deviceSession?: { signer: Address; validUntil: number }; // sponsor body field for session-upgrade / session-grant
};
```

- [ ] **Step 1: Failing tests** (`userop.test.ts`):
  - `test('sendSafeUserOp builds Safe7579 execute + 7579 SafeOp hash for a 7579 Safe')`. Fake fetch; layout `'7579'`. Assert the sent `callData` starts with the `execute(bytes32,bytes)` selector, and the signed hash == `safeOpHash(op,0,0,SAFE7579)`.
  - `test('a 4337 Safe still gets executeUserOp + module-domain hash')`: existing bytes unchanged.
  - `test('signer.nonceKey is used for getNonce and hashKind userOpHash signs the EntryPoint hash')`. `getNonce(sender, SESSION_NONCE_KEY)` appears in the RPC log. The signer receives `getUserOperationHash({ entryPointVersion: '0.7', chainId: 100, … })`.
  - `test('callData override is sent verbatim')`. `test('maxFeePerGasCap clamps maxFeePerGas and maxPriorityFeePerGas')`.
  - `test('sponsorRequestBody carries deviceSession as {signer, validUntil}')`.
  - `recovery-lookup.test.ts`: `test('isPasskeySafe accepts the migrated 7579 layout')`. Handler Safe7579, modules exactly {Safe7579, SRM} → true. Handler 7579 with Safe4337Module still enabled → false.
- [ ] **Step 2:** `npx jest lib/passkey/__tests__/userop.test.ts lib/passkey/__tests__/recovery-lookup.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Undeployed Safes are always `'4337'`. `sendSafeUserOp` calls `invalidateSafeLayout(sender)` after any op whose sponsor reply mode is `session-upgrade`.
- [ ] **Step 4:** Re-run those plus the whole `lib/passkey/__tests__` dir → PASS (the existing vectors are unchanged).
- [ ] **Step 5:** Commit `feat(expo): passkey root ops on Safe7579 (layout-aware callData + SafeOp domain)` and push.

### Task 6: Expo ERC-1271 prefix for migrated Safes

**Files:**
- Modify: `apps/expo/lib/passkey/thirdweb-adapter.ts` (`AdapterDeps`, `signHashAsIdentityWithPrf`). This covers the Supabase Safe-admin envelope (`encodeOnBehalfSignature`), the key-backup proof (`derived-keys-runtime.ts`), the API session token, and XMTP SCW association (`signHashAsSafe` → `lib/xmtp/passkey-link.ts`).
- Modify: `apps/expo/lib/passkey/email.ts` (`signEmailProof`, the passkey branch at ~line 108)
- Modify: `apps/expo/lib/passkey/guardians.ts` (`signRecoveryApprovalAsGuardian`, ~line 365)
- Test: `apps/expo/lib/passkey/__tests__/thirdweb-adapter.test.ts`, `email.test.ts`, `guardians.test.ts`

**Interfaces:**
- Consumes: Task 3 `withValidatorPrefix`, `readSafeLayout`.
- Produces: `AdapterDeps.safeLayout?: (safe: Address) => Promise<SafeLayout>` (default `readSafeLayout`). The same optional dep goes into `EmailDeps` and the `signRecoveryApprovalAsGuardian` deps.
- Rule: prefix iff the Safe is deployed AND its layout is `'7579'`. The prefix wraps the plain Safe signature BEFORE the on-behalf envelope. It is never combined with ERC-6492 (a migrated Safe is always deployed). The servers verify on-chain (`email-verifier.ts verifyMessage`, `account-signature-core.ts verifyHash`, Supabase `_shared/verify-account-signature.ts`, Candide SRM, XMTP), so server code does not change.

- [ ] **Step 1: Failing tests:**
  - `test('signHashAsIdentity on a 7579 Safe prefixes 20 zero bytes inside the on-behalf envelope')`: `decodeOnBehalfSignature(sig).signature` starts with `0x` + 40 zeros, followed by the plain Safe signature.
  - `test('signHashAsIdentity on a 4337 Safe is unchanged')`.
  - `test('signEmailProof prefixes for a 7579 Safe')`.
  - `test('guardian approval of a migrated guardian Safe carries the prefix')`.
  - A golden check against the vector: `withValidatorPrefix(vector.erc1271.safeSignature) === vector.erc1271.prefixedSignature`.
- [ ] **Step 2:** Run the three test files → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run, plus `lib/xmtp` and `lib/passkey` tests → PASS.
- [ ] **Step 5:** Commit `feat(expo): ERC-1271 validator prefix for Safe7579 passkey Safes` and push.

### Task 7: Web sponsor policy — Safe7579 layout for every existing mode

**Files:**
- Create: `apps/web/src/lib/passkey/safe7579.ts`
- Modify: `apps/web/src/lib/passkey/sponsor-policy.ts`: `deployedSafeShape` (~l.874), `checkDeployedPasskeySafe` (~l.923), `checkCallData` (~l.752), `ScanState` (+`layout`), the top of `evaluateSponsorPolicy` (~l.1249, nonce-key check)
- Modify: `apps/web/src/lib/passkey/chain-reader.ts`, `__tests__/fake-chain.ts` (7579 world)
- Test: `apps/web/src/lib/passkey/__tests__/sponsor-policy-7579.test.ts`

**Interfaces:**
```ts
// safe7579.ts
export const SAFE7579: Hex; export const EXEC_SINGLE: Hex; export const EXEC_BATCH: Hex;
export type Execution = { target: Hex; value: bigint; data: Hex };
export function decodeSafe7579Execute(callData: Hex): { batch: boolean; executions: Execution[] } | null;
//   null unless the mode word is EXACTLY EXEC_SINGLE or EXEC_BATCH (callType 0x00/0x01, execType 0x00, rest zero);
//   0xff delegatecall, 0x01 try, any selector/payload byte → null.
export function nonceKeyOf(nonce: bigint): bigint;   // nonce >> 64n
// ChainReader additions
getModulesPaginated(safe: Hex): Promise<{ modules: readonly Hex[]; next: Hex }>;
```
- `deployedSafeShape` returns `{ ok: true; owner; layout: '4337' | '7579' }`. The 7579 layout requires: handler = Safe7579, `isModuleEnabled(Safe7579)`, NOT `isModuleEnabled(Safe4337Module)`, SRM enabled, modules exactly {Safe7579, SRM} (`next == SENTINEL`), one owner. Owner binding is unchanged. ECDSA (words) Safes stay 4337-only.
- `checkCallData`: when `decodeSafe7579Execute` matches, every execution goes through `checkAllowedCall(target, data, st)`, with `value == 0` and target ≠ sender. Sets `st.layout = '7579'`. The existing Safe4337Module branch sets `'4337'`. The sender check denies when `st.layout` ≠ the on-chain layout.
- In this task only nonce key 0 passes (`nonceKeyOf(op.nonce) !== 0n` → deny `"nonce key not allowed"`). Task 9 adds the SmartSession key.

- [ ] **Step 1: Failing tests** (`sponsor-policy-7579.test.ts`, fake chain with a migrated `SAFE`):
  - `test("every existing mode passes in 7579 layout")`. Table-driven, reusing the existing ops of `sponsor-policy.test.ts`, `everyday-policy.test.ts`, `sponsor-policy-recovery-helper.test.ts` and `miniapp-policy.test.ts`, re-encoded with `encode7579Execute`. Each gives the same `{ mode, budgetKey }` as in 4337 layout.
  - Attacks, each `ok === false` with the given reason substring:
    - `"7579 callType delegatecall (0xff) is denied"`, reason `callData`
    - `"7579 try execType is denied"`
    - `"7579 non-zero mode payload is denied"`
    - `"7579 callData on a 4337 Safe is denied"`, reason `layout`
    - `"4337 callData on a 7579 Safe is denied"`, reason `layout`
    - `"7579 Safe with Safe4337Module still enabled is denied"`
    - `"7579 Safe with an extra Safe module is denied"`
    - `"execution with value 1 is denied"`
    - `"execution targeting the Safe itself (installModule) is denied"`
    - `"nonce key 1 is denied"`
    - `"nonce key = SmartSession is denied (no session modes yet)"`
  - The existing suites stay green unchanged: run them all.
- [ ] **Step 2:** `npx tsx --test src/lib/passkey/__tests__/sponsor-policy-7579.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `chain-reader.ts getModulesPaginated` reads `getModulesPaginated(0x…01, 10)`.
- [ ] **Step 4:** Run `npx tsx --test src/lib/passkey/__tests__/*.test.ts` (excluding `*.live.test.ts`) → all PASS.
- [ ] **Step 5:** Commit `feat(web): sponsor policy accepts Safe7579 passkey Safes (root ops, all modes)` and push.

### Task 8: Expo device key store + session-op signer

**Files:**
- Create: `apps/expo/lib/passkey/session-keys/device-key.ts`, `apps/expo/lib/passkey/session-keys/session-op.ts`
- Test: `apps/expo/lib/passkey/__tests__/session-keys-device-key.test.ts`, `session-keys-session-op.test.ts`

**Interfaces:**
- Consumes: Task 3 builders, Task 5 `SafeOpSigner{nonceKey,hashKind}`, `sendSafeUserOp`, `ECDSA_DUMMY_SIGNATURE`, `normalizeEcdsaSignature`.
- Produces:
```ts
// device-key.ts — store = '@/lib/storage/secureStorage', options
// { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false }
export const DEVICE_SESSION_STORE_KEY = (safe: Address) => `passkey_device_session_v1_${safe.toLowerCase()}`;
export type DeviceSessionRecord = { v: 1; safe: Address; legacy: Address; signer: Address; validUntil: number;
  permissionIds: PermissionIds; status: 'pending' | 'active' };
export function newDeviceKey(): { privateKey: Hex; signer: Address };         // viem generatePrivateKey
export async function savePendingDeviceSession(store, rec: Omit<DeviceSessionRecord,'status'>, privateKey: Hex): Promise<void>;
export async function activateDeviceSession(store, safe: Address): Promise<void>;
export async function loadDeviceSession(store, safe: Address, onChainPids: () => Promise<Hex[]>): Promise<{ record: DeviceSessionRecord; privateKey: Hex } | null>;
//   pending + chain has both pids → promoted to active; pending + chain lacks them → deleted, null
export async function deleteDeviceSession(store, safe: Address): Promise<void>;
// session-op.ts
export function deviceSessionOpSigner(rec: DeviceSessionRecord, privateKey: Hex, kind: MintSessionKind, proof: { x: Hex; y: Hex }): SafeOpSigner;
//   nonceKey SESSION_NONCE_KEY, hashKind 'userOpHash', dummySignature = encodeSessionSignature(pid, ECDSA_DUMMY_SIGNATURE)
export async function sendDeviceSessionCall(a: { record; privateKey; proof; kind: MintSessionKind; innerHubData: Hex }, deps?: UserOpDeps): Promise<{ txHash: Hex }>;
//   callData = sessionClaimCallData(record.legacy, innerHubData), legacy hint = record.legacy
export class DeviceSessionRejectedError extends Error {}   // sponsor 403 / AA22 / InvalidPermissionId / AA24
```
- [ ] **Step 1: Failing tests:**
  - `test('the key is stored WHEN_UNLOCKED_THIS_DEVICE_ONLY without authentication')`: assert the secure-store mock's options.
  - `test('pending record is promoted when the chain has its permission ids')`.
  - `test('pending record whose ids are missing on chain is deleted')`.
  - `test('the private key never appears in the JSON record')`.
  - `test('session signature = 0x00 ++ pid ++ raw ECDSA over the userOpHash')`: reproduces `vector.sessionOp.signature` from the vector's key and hash.
  - `test('sendDeviceSessionCall uses nonce key SmartSession and never prompts the passkey')`: a `sign` mock that throws if called.
  - `test('sponsor 403 maps to DeviceSessionRejectedError')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(expo): device session key store + session-op signer` and push.

### Task 9: Web sponsor — session modes, budgets, kill switch

**Files:**
- Create: `apps/web/src/lib/passkey/session-key-policy.ts`, `apps/web/src/lib/passkey/session-keys-flag.ts`, `supabase/migrations/20261121_passkey_session_keys_flag.sql`
- Modify: `apps/web/src/lib/passkey/sponsor-policy.ts` (`SponsorMode`, `SponsorContext`, `checkGas` per-mode caps, `parseSponsorRequest` + `deviceSession`, a hook at the top of `evaluateSponsorPolicy`), `sponsor-handler.ts` (`handleSponsorRequest` deps + budget limits), `src/app/api/passkey/sponsor/route.ts` (wire the flag), `chain-reader.ts` (+2 reads), `__tests__/fake-chain.ts`
- Test: `apps/web/src/lib/passkey/__tests__/sponsor-policy-session-keys.test.ts`, `sponsor-route.test.ts` (extend)

**Interfaces:**
- Consumes: Task 4 builders, Task 7 `decodeSafe7579Execute`, `nonceKeyOf`, the 7579 `deployedSafeShape`.
- Produces:
```ts
export type SponsorMode = …existing | "session-upgrade" | "session-grant" | "session-revoke" | "session";
SponsorContext += { deviceSession?: { signer: Hex; validUntil: number }; sessionKeysEnabled: boolean };
export async function evaluateSessionKeyModes(op: SponsorUserOp, ctx: SponsorContext, chain: ChainReader): Promise<PolicyResult | null>; // null = not a session shape
export const SESSION_CAPS = { grantCallGasLimit: 3_000_000n, grantVerificationGasLimit: 600_000n, grantMaxFeePerGas: 2_000_000_000n, sessionCallGasLimit: 500_000n };
export const DEFAULT_SESSION_DAILY_WEI = 5n * 10n ** 15n;   // env PASSKEY_SPONSOR_SESSION_DAILY_WEI
// ChainReader additions
getPermissionIDs(safe: Hex): Promise<readonly Hex[]>;                 // SmartSession.getPermissionIDs
isSmartSessionInstalled(safe: Hex): Promise<boolean>;                // Safe7579.isModuleInstalled(1, SmartSession, "")
// session-keys-flag.ts
export function sessionKeysFlag(admin: SupabaseClient, ttlMs = 30_000): () => Promise<boolean>; // missing key → true, 'false' → false, read error → false
```
- Mode rules (each also needs: no `factory`, a passkey proof (x, y) bound by `checkDeployedPasskeySafe`, `ctx.legacy` set, `isAdmin(legacy, sender)`, `citizen(legacy)`):
  - **session-upgrade**: 4337 layout, key 0. `deviceSession` present, `now < validUntil ≤ now + DEVICE_SESSION_MAX_SEC`, signer ≠ 0. `op.callData` byte-equal to `migrationCallData({ safe: sender, legacy, signer, validUntil, prev4337: prev4337AfterEnable(chain modules) })`. Grant caps apply. Budget key `grant:<legacy>`.
  - **session-grant**: 7579 layout, key 0, same deviceSession checks. Byte-equal to `grantCallData({…, replace: await isSmartSessionInstalled(sender)})`. Grant caps. Budget key `grant:<legacy>`.
  - **session-revoke**: 7579 layout, key 0. Executions are only `SmartSession.removeSession(pid)`, 1..n, no duplicates, each pid ∈ `getPermissionIDs(sender)`. Normal caps. Budget key legacy. **Allowed even with the kill switch off.** This is a deliberate exception (revoking only removes power), flagged for Max in Task 12.
  - **session**: `nonceKeyOf(nonce) == SESSION_NONCE_KEY`, 7579 layout, `isSmartSessionInstalled`. `op.callData` byte-equal to either `sessionClaimCallData(legacy, encode personalMint())` or `sessionClaimCallData(legacy, encode groupMint(ROEBEL_GROUP, [legacy], [amount], "0x"))`, where `amount` is decoded from the op and must be > 0, and the comparison is against the canonical re-encoding. `callGasLimit ≤ sessionCallGasLimit`. Budget key legacy plus `limits.group = { key: "session:" + sender, dailyWei: PASSKEY_SPONSOR_SESSION_DAILY_WEI }`.
  - `sessionKeysEnabled === false` → `session-upgrade`, `session-grant` and `session` are denied with `"device sessions are switched off"`.
  - Any op with the session nonce key that is not exactly the `session` shape → deny. Root-key ops that touch SmartSession or the Safe itself outside these shapes → deny (Task 7 already denies self-targets).
- Migration SQL: `insert into app_settings (key, value) values ('passkey_session_keys_enabled', 'true') on conflict (key) do nothing;`

- [ ] **Step 1: Failing tests** (`sponsor-policy-session-keys.test.ts`, inputs built with the Task 4 builders):
  - Happy paths: `"session-upgrade: byte-equal migration batch is sponsored with budget key grant:<legacy>"`, `"session-grant install and replace"`, `"session-revoke of own pids"`, `"session personalMint"`, `"session groupMint into the Röbel group with [legacy] collateral"`.
  - Attacks, each denied:
    - `"upgrade with one byte changed in the batch"` (flip the last byte of the initData)
    - `"upgrade with a 3rd session (send) appended"`
    - `"upgrade whose prev4337 is not the chain's"`
    - `"upgrade with validUntil > now+30d+600s"`, `"…with validUntil in the past"`
    - `"upgrade without deviceSession"`
    - `"grant callGasLimit 3_000_001"`, `"grant maxFeePerGas 2_000_000_001"`
    - `"session op calling safeTransferFrom"`, `"session op calling trust"`
    - `"session groupMint into another group"`, `"session groupMint with foreign collateral"`, `"session groupMint amount 0"`
    - `"session op via executeBatch"`, `"session op batch mode"`
    - `"session op non-canonical bytes offset (0x80)"`
    - `"session op for another legacy"`
    - `"session op on a Safe without SmartSession"`
    - `"session op callGasLimit 500_001"`
    - `"revoke of a pid not on chain"`, `"revoke mixed with another call"`
    - `"kill switch off: upgrade, grant, session denied; revoke and 7579 root ops still pass"`
  - Handler (`sponsor-route.test.ts`): `"session op reserves against the session:<sender> group"`. `"grant reserves under grant:<legacy>, not the legacy key"`. `"flag read error = switched off"` (fake `sessionKeysEnabled` rejects).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Call `evaluateSessionKeyModes` right after `senderProof`/`checkFactory` and before the structural `checkCallData`. `checkGas` takes the detected mode's caps. Document `PASSKEY_SPONSOR_SESSION_DAILY_WEI` and the flag in the route header comment.
- [ ] **Step 4:** Run the whole web passkey test dir → PASS.
- [ ] **Step 5:** Commit `feat(web): sponsor modes for device sessions (upgrade/grant/revoke/session) + kill switch` and push. Do NOT apply the migration yet (Task 13).

### Task 10: Expo grant / revoke orchestration + claim routing + kill switch

**Files:**
- Create: `apps/expo/lib/passkey/session-keys/grant.ts`, `apps/expo/lib/passkey/session-keys/claim-route.ts`
- Modify: `apps/expo/lib/muenzen-claim.ts` (+`claimMuenzenWithDeviceSession`), `apps/expo/context/RoebelTalerProvider.tsx` (`claimNow` at ~l.179, context type at ~l.67), `apps/expo/lib/supabase-app-settings.ts` (+`fetchPasskeySessionKeysEnabled`)
- Test: `apps/expo/lib/passkey/__tests__/session-keys-grant.test.ts`, `session-keys-claim-route.test.ts`, `apps/expo/lib/__tests__/muenzen-claim.test.ts` (extend), `muenzen-claim-hook.test.tsx` (extend)

**Interfaces:**
- Consumes: Tasks 3, 5, 8.
- Produces:
```ts
// grant.ts — every function = exactly ONE passkey prompt
export async function grantDeviceSession(session: PasskeySession, deps: GrantDeps): Promise<DeviceSessionRecord>;
//   layout 4337 → session-upgrade op (migrationCallData, prev4337 from readModules), then invalidateSafeLayout
//   layout 7579 → session-grant op (grantCallData, replace = SmartSession installed)
//   new key saved as pending BEFORE sending; activated after the receipt; maxFeePerGasCap 2 gwei
export async function revokeDeviceSessions(session: PasskeySession, deps: GrantDeps): Promise<void>; // removeSession for every on-chain pid, then delete the local record
export async function readDeviceSessionState(session: PasskeySession, deps): Promise<DeviceSessionState>;
export type DeviceSessionState = { layout: SafeLayout; local: DeviceSessionRecord | null; onChainPids: Hex[]; otherDeviceUntil: number | null };
// claim-route.ts — pure
export type ClaimPath = 'session' | 'renew-then-session' | 'offer' | 'passkey';
export function chooseClaimPath(p: { enabled: boolean; eligible: boolean; state: DeviceSessionState | null; nowSec: number; declinedUntilSec: number | null }): ClaimPath;
// muenzen-claim.ts
export async function claimMuenzenWithDeviceSession(account: BatchAccount, reads: ClaimReads, addrs, send: (kind: MintSessionKind, data: Hex) => Promise<Hex>): Promise<{ mintedRaw: bigint; partial: boolean }>;
//   same txs as buildMuenzenClaimTxs, one session op per tx, in order; a groupMint failure after personalMint landed → partial: true
// provider
claimNow(opts?: { allowGrant?: boolean }): Promise<ClaimNowResult>;  // ClaimNowResult += { partial?: boolean }
deviceSessionClaimPath(): Promise<ClaimPath>;                           // for the rewards page sheet
declineDeviceSession(): Promise<void>;                                  // AsyncStorage 'rt_device_session_declined_until' = now + 7 d
// supabase-app-settings.ts
export async function fetchPasskeySessionKeysEnabled(): Promise<boolean>; // missing → true, 'false' → false, error → false
```
- `chooseClaimPath` rules, in order:
  1. `!enabled` or `!eligible` (words owner, Safe identity, or not deployed) → `'passkey'`.
  2. Local `active` record whose pids are both on chain: `validUntil − now ≥ SESSION_RENEW_BEFORE_SEC` → `'session'`, else `'renew-then-session'`.
  3. `declinedUntilSec > now` → `'passkey'`.
  4. Otherwise → `'offer'`.
- `claimNow`: `'session'` → session ops (no prompt). `'renew-then-session'` or `'offer'` with `allowGrant` → `grantDeviceSession` (one prompt), then session ops. Otherwise → today's `claimMuenzenAsOneBatch` (one prompt; it builds 7579 root ops automatically via Task 5). On `DeviceSessionRejectedError`: delete the local record, run the passkey claim once, and do not retry the session.

- [ ] **Step 1: Failing tests:**
  - `chooseClaimPath` table test: kill switch off, words, Safe identity, active >3 d, active <3 d, expired, pids missing on chain, declined, nothing.
  - `test('grant on a 4337 Safe sends the session-upgrade op with deviceSession and one prompt')`.
  - `test('grant on a 7579 Safe with SmartSession installed uses replace=true')`.
  - `test('revoke removes every on-chain pid and deletes the local key')`.
  - `test('stale permission falls back to passkey and clears the record')`.
  - `test('groupMint failure after personalMint returns a partial result')`.
  - `test('kill switch off → passkey claim even with an active record')`.
  - `test('offer accepted = exactly one passkey prompt for grant + claim')` (counting `sign` mock).
  - `test('fetchPasskeySessionKeysEnabled: missing → true, "false" → false, error → false')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Keep `claimsAsOneBatch` semantics for thirdweb accounts unchanged.
- [ ] **Step 4:** Run the affected tests plus `lib/__tests__/muenzen-claim*.test.*` → PASS.
- [ ] **Step 5:** Commit `feat(expo): Münzen claim via device session (grant/renew/revoke, kill switch)` and push.

### Task 11: Settings section + first-claim offer sheet (German UI)

**Files:**
- Create: `apps/expo/components/passkey/DeviceSessionSection.tsx`, `apps/expo/components/rewards/DeviceSessionOfferSheet.tsx`
- Modify: `apps/expo/components/passkey/SovereignAccountSettings.tsx` (render the section), `apps/expo/app/rewards/index.tsx` (`onPasskeyClaim` ~l.225: ask `deviceSessionClaimPath()` first; `'offer'` → sheet)
- Test: `apps/expo/components/passkey/__tests__/device-session-section.test.tsx`, `apps/expo/components/rewards/__tests__/device-session-offer-sheet.test.tsx`

**Interfaces:** Consumes Task 10 (`readDeviceSessionState`, `grantDeviceSession`, `revokeDeviceSessions`, `claimNow`, `deviceSessionClaimPath`, `declineDeviceSession`, `fetchPasskeySessionKeysEnabled`).

Exact copy (dates `de-DE`, `dd.MM.yyyy`):
- Section title: „Gerät ohne Fingerabdruck"
- Active: „Gerät ohne Fingerabdruck: aktiv bis {Datum}". Body: „Diese App darf auf diesem Gerät Röbel Münzen für dich abholen, ohne nach deinem Fingerabdruck zu fragen. Für alles andere fragen wir weiter nach deinem Fingerabdruck." Button: „Jetzt beenden"
- After revoke: „Beendet. Beim Abholen fragen wir wieder nach deinem Fingerabdruck."
- Expired: „Gerät ohne Fingerabdruck: abgelaufen". Button: „Erneut erlauben"
- Off: „Gerät ohne Fingerabdruck: aus". Button: „Erlauben"
- Other device: „Auf einem anderen Gerät aktiv bis {Datum}". Button: „Beenden"
- Kill switch off: the section shows only an active state's „Jetzt beenden". Nothing else.
- Offer sheet title: „Münzen abholen ohne Fingerabdruck?" Body: „Die App darf 30 Tage lang auf diesem Gerät Röbel Münzen für dich abholen, ohne Fingerabdruck. Dafür wird dein Konto einmal aktualisiert. Für alles andere (Senden, Abstimmen, Bestätigungen, Kontoänderungen) fragen wir weiter nach deinem Fingerabdruck." Primary: „Erlauben" (→ `claimNow({ allowGrant: true })`). Secondary: „Nicht jetzt" (→ `declineDeviceSession()` then `claimNow()`).
- Partial claim alert: „Ein Teil deiner Münzen ist angekommen. Der Rest wird beim nächsten Abholen umgewandelt."

- [ ] **Step 1: Failing tests:** each state renders its exact copy. „Jetzt beenden" calls `revokeDeviceSessions` once. The sheet's „Erlauben" calls `claimNow({ allowGrant: true })` and „Nicht jetzt" calls `declineDeviceSession` then `claimNow()`. No address or hex string is ever rendered (regex `/0x[0-9a-f]{6,}/i` absent).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `StyleSheet.create` + `useTheme()`, no shadows, one primary CTA.
- [ ] **Step 4:** Run → PASS. Take one screenshot pass on the simulator, if one is available.
- [ ] **Step 5:** Commit `feat(expo): 'Gerät ohne Fingerabdruck' settings + first-claim offer` and push.

### Task 12: Security review of the sponsor-policy changes (one reviewer, before release)

**Files:**
- Create: `docs/superpowers/reviews/2026-11-2x-session-keys-sponsor-review.md` (findings + verdict)
- Fixes go into the web policy files as separate `fix(web): …` commits with a regression test each.

The reviewer gets the code diff of Tasks 4, 7 and 9 plus the spec, not the builders' summaries. Every check below needs a verdict (PASS / FINDING) with evidence (a test name or a code line):
- [ ] **No open faucet:** every new branch ends in a byte-equal or canonical re-encoding check. No mode sponsors an op whose callData the server did not rebuild. A session op cannot reach any target other than `legacy.execute(Hub, 0, personalMint|groupMint(Röbel group, [legacy], [a>0], 0x))`.
- [ ] **Nonce-key routing:** only key 0 (root) and `SESSION_NONCE_KEY` pass. The session key only matches the `session` mode. Key 0 never matches the `session` mode. Fuzz `nonce >> 64` over 1000 random keys and assert deny.
- [ ] **Byte-equal upgrade batch:** `prev4337` comes from the chain, not the request. `deviceSession` bounds hold (past / >30 d+600 s / zero signer). A 3-session (send) batch is denied. The DELEGATECALL into MultiSendCallOnly is allowed ONLY in `session-upgrade`.
- [ ] **Session-scope re-check:** the server denies the 11 out-of-scope shapes from the fork test even though the chain would reject them.
- [ ] **Budgets:** grant prefund at the caps (3.0M+0.6M+0.2M+0.3M+0.1M gas × 2 gwei = 0.0084 xDAI) stays below the per-key cap. Session ops count against `session:<sender>`. The global cap still applies. A stolen device key can at most burn `PASSKEY_SPONSOR_SESSION_DAILY_WEI` per day and mint into the owner's own account.
- [ ] **Delegatecall ban:** 7579 callType `0xff`, `try` execType and any non-zero mode payload are denied. Executions never target the Safe outside `session-grant`.
- [ ] **Kill switch:** off → upgrade/grant/session are denied, while revoke and every 7579 root mode still pass. A read error counts as off. Max must sign off on the revoke exception.
- [ ] **Layout check fails closed:** a 7579 Safe with Safe4337Module enabled, an extra module, or another handler is denied. ECDSA Safes are never accepted in 7579 layout.
- [ ] **Audit gate (spec):** find the audit report that covers the deployed SmartSession, UniActionPolicy and TimeFramePolicy bytecode (`erc7579/smartsessions` at the deployed commit). If none is found: verdict BLOCKED, and Max decides.
- [ ] Verdict line: `RELEASE: yes | no (open findings: …)`. Commit the review and push.

### Task 13: Deploy, device test, OTA handoff

**Files:** none new (ops). Record the results in the spec's rollout section.

- [ ] **Step 1:** Release gate: Task 12 verdict `RELEASE: yes` and Max's go.
- [ ] **Step 2:** Apply `supabase/migrations/20261121_passkey_session_keys_flag.sql` via the Supabase MCP (`apply_migration`; check that the MCP points at project `wwbeqhkslxdxhktqzqti`). Then set the value to `'false'` for the test phase: `update app_settings set value='false' where key='passkey_session_keys_enabled'`.
- [ ] **Step 3:** Confirm the Vercel production deploy of `main` contains Tasks 7 and 9 (`list_deployments`). Optionally set `PASSKEY_SPONSOR_SESSION_DAILY_WEI`. Check that `PASSKEY_SPONSOR_GLOBAL_DAILY_WEI` leaves room for upgrades (~0.0084 xDAI each).
- [ ] **Step 4:** Live bundler check (ERC-7562, Pimlico via `/api/bundler`). Use Max's own Safe `0xE3D1…2deB` on a preview build: flip the flag to `'true'` for Max (or briefly globally), run the upgrade, then 2 session claims. Expected: both ops get receipts. A bundler validation-rule rejection → flip the flag to `'false'` and STOP.
- [ ] **Step 5:** Device matrix (Pixel 7 + iPhone), each on runtime 3.10.0:
  - (a) First claim → sheet → „Erlauben" → exactly 1 fingerprint → Münzen arrive.
  - (b) Next hourly claim → 0 fingerprints.
  - (c) Settings shows „aktiv bis …" (+30 d).
  - (d) Send Münzen and vote → fingerprint as before.
  - (e) Email proof, key backup and XMTP DM still work (1271 prefix).
  - (f) „Jetzt beenden" → 1 fingerprint, the next claim asks again.
  - (g) Flag `'false'` → claim uses the passkey and works on the migrated Safe.
  - (h) Sign in on a second device → Safe found. Grant there → the first device falls back cleanly.
  - (i) „Nicht jetzt" → passkey claim, and no sheet for 7 days.
- [ ] **Step 6:** Set the flag to `'true'`. Hand the OTA to Max: `cd apps/expo && eas update --channel production --message "Münzen ohne Fingerabdruck"` (Max runs it; runtime 3.10.0 only). Note: the OTA only reaches devices once the 3.10.0 store build is out (that build is still pending).
- [ ] **Step 7:** Update the spec's rollout section with the results. Commit `docs: session keys rollout results` and push.

---

## Open risks (for Max)

- **Audit coverage of SmartSession + UniActionPolicy/TimeFramePolicy is still unverified** (spec gate). Task 12 blocks the release if no report is found.
- **ERC-7562 / Pimlico acceptance** of SmartSession validation is unproven until Task 13 step 4.
- **Single device in v1:** a grant on device B uninstalls and reinstalls SmartSession, which ends device A's session (A falls back to passkey). Two devices in daily use cost a fingerprint each time they swap.
- **Safe7579 as fallback handler:** ERC-721/1155 receipt and other CompatibilityFallbackHandler functions change. Task 2 gates on the receiver hooks.
- **The migration is one-way in v1** (no downgrade path). The kill switch only stops new upgrades and session ops. Migrated Safes stay on the 7579 root path permanently, so Tasks 5–7 are release-critical even with the switch off.
- **Sponsor budget:** an upgrade prefund is ~0.0084 xDAI against a 0.05 xDAI/day global default. A wave of first claims can exhaust the global budget, so raise `PASSKEY_SPONSOR_GLOBAL_DAILY_WEI` for rollout day.
- **Software session key** can be extracted on a rooted device. With the mint-only scope the damage is limited to gas griefing up to the per-session daily budget.
- **The session-revoke exception to the kill switch** (always sponsored) needs Max's explicit OK.
