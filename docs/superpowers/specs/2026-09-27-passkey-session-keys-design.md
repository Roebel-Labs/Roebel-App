# Passkey session keys — design

**Status:** SPEC + FORK PROOF only (2026-09-27). No app wiring, no deploys, no broadcasts.
**Branch:** `feat/session-keys` (preview-only, like `feat/passkey-accounts`; never merged to `main` without Max's go).
**Fork proof:** `contracts/passkey-accounts/test/SessionKeys.t.sol` (10/10 pass, whole suite 35/35).

## Goal

Everyday on-chain actions (claim Münzen, send small amounts of Münzen) should need **no fingerprint** once the
citizen has granted the app a scoped, expiring **session** with one fingerprint. The passkey stays the only root of
the account; guardians keep working; our paymaster keeps sponsoring.

## Decision

**Option A: migrate the passkey Safes to the Safe7579 adapter + SmartSession, with audited, deployed policies.**
The passkey stays the root through the **Safe owner check** (Safe7579's built-in fallback to
`Safe.checkSignatures` for nonce key 0), **not** through a 7579 WebAuthn validator.

### Why not a 7579 WebAuthn validator as root

Rhinestone's `WebAuthnValidator` is deployed and verified on Gnosis (`0x0000000000578c4cB0e472a5462da43C495C3F33`,
solc 0.8.28; `0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69` has code but is unverified; ZeroDev's
`0xbA45…90Fd` has no code on Gnosis). Using it as root would move the key out of the Safe's owner set, and the
Candide SocialRecoveryModule rotates **Safe owners**. Recovery would stop protecting the account. Keeping the
passkey as the Safe owner means: recovery unchanged (fork-proven), ERC-1271 is still the Safe's own check, and a
7579 validator bug cannot take over the root.

### Why not option B (keep Safe4337Module)

- **A "session signer" as an extra Safe owner** is full power. Rejected by the brief.
- **Safe AllowanceModule** (`0xCFbF…3134`, deployed): ERC-20 only, and it spends the **Safe's** balance. Münzen
  are Circles **ERC-1155** held by the **legacy thirdweb account**, not by the Safe. It also cannot express
  `personalMint` / `groupMint` / `trust`. Not applicable.
- **Guard-based design:** Safe4337Module executes through `execTransactionFromModule`, and Safe 1.4.1 does **not**
  call the transaction guard for module transactions (module guards only arrive with Safe 1.5). A guard never sees
  4337 ops. Also Safe4337Module validates only owner signatures, so a session key would still have to be an owner.
  The only B path left is a custom 4337 module with its own session logic: new, unaudited validation code. That is
  exactly what SmartSession already is, audited and deployed.

## Modules (Gnosis, chain 100, code + verified source checked 2026-09-27)

| Role | Contract | Address |
|---|---|---|
| ERC-7579 adapter (module + fallback handler) | Safe7579 (Rhinestone, solc 0.8.26) | `0x7579EE8307284F293B1927136486880611F20002` |
| Session validator module | SmartSession (Rhinestone + Biconomy, 0.8.28) | `0x00000000002B0eCfbD0496EE71e01257dA0E37DE` |
| Session-key signature check | OwnableValidator (ISessionValidator, ECDSA) | `0x000000000013fdB5234E4E3162a810F54d9f7E98` |
| Call scope + amount caps | UniActionPolicy | `0x0000000000714Cf48FcF88A0bFBa70d313415032` |
| Expiry (userOp policy) | TimeFramePolicy | `0x0000000000D30f611fA3bf652ac6879428586930` |
| Not used | Safe7579 launchpad `0x7579011a…C00ff` (new Safes only), ERC-7484 registry `0x0000…51B2`, UsageLimitPolicy `0x0000…De4B`, ValueLimitPolicy `0x0000…0278`, ERC20SpendingLimitPolicy `0x0000…77a6`, SudoPolicy `0x0000…d869` | |

Unchanged: Safe L2 1.4.1, SafeWebAuthnSharedSigner / SignerFactory, Candide SRM `0x3827…541c`,
EntryPoint v0.7, NetizenVerifyingPaymaster (voucher v2), MultiSendCallOnly `0x9641…02e2`.

**Registry:** off (`RegistryInit(0, [], 0)`). On Gnosis the registry holds a Rhinestone attestation only for
SmartSession itself; none for the policies or OwnableValidator. So `SmartSession.enableSessions()` (which always
checks the registry) cannot be used. Sessions are granted through `onInstall` in `UNSAFE_ENABLE` mode ("unsafe"
only means "registry skipped"; we pin every module address ourselves and the sponsor checks them).

## Architecture

```
passkey (P-256) ── Safe owner (SharedSigner / per-key signer) ── ROOT: nonce key 0 → Safe.checkSignatures
                                                                  (SafeOp EIP-712, verifyingContract = Safe7579)
Safe 1.4.1
  modules:   Safe7579, Candide SocialRecoveryModule        (Safe4337Module disabled)
  fallback:  Safe7579
  7579 validators: SmartSession
       └─ session (per device): OwnableValidator(threshold 1, [sessionKey])
            userOp policy: TimeFramePolicy(validUntil = grant + 30 d)
            action (legacy, Account.execute): UniActionPolicy(rules below)
            permitERC4337Paymaster = true
        │ session op: nonce key = SmartSession, sig = 0x00 ++ permissionId ++ ECDSA(sessionKey, userOpHash)
        ▼
legacy thirdweb Account (isAdmin(Safe)) ── execute(Hub, 0, personalMint / groupMint / safeTransferFrom)
```

### Session scope (v1)

One device key, **three sessions** (one permissionId each, same key, different salts). UniActionPolicy ANDs all
rules of one config, and every legacy call has the same action id `(legacy, execute)`, so one session cannot
express "personalMint OR groupMint". One session per call shape solves it. The claim becomes two session ops
(personalMint, then groupMint), which is fine: no fingerprint either way.

Rules read 32 bytes at `4 + offset` of the `legacy.execute(target, value, data)` calldata:

| Session | Rules (all EQUAL unless noted) |
|---|---|
| all | 0x00 target = Hub · 0x20 value = 0 · 0x40 bytes offset = 0x60 (forces the canonical layout) · 7579 `valueLimitPerUse = 0` |
| `roebel/muenzen/personalMint` | 0x60 data.length = 4 · 0x80 = `personalMint` selector + 28 zero bytes |
| `roebel/muenzen/groupMint` | 0x80 = selector ++ first 28 bytes of `abi.encode(group)` · 0x84 group = Röbel group `0xAc2C…470c` |
| `roebel/muenzen/send` | 0x80 = selector ++ first 28 bytes of `abi.encode(legacy)` · 0x84 from = legacy · 0xc4 id = Röbel group · 0xe4 amount **LTE 50 Münzen per transfer, isLimited 100 Münzen per session** |

- **Value 0** everywhere (outer 7579 value and inner `legacy.execute` value), fork-proven.
- **Expiry 30 days:** TimeFramePolicy returns `validUntil`; the EntryPoint rejects afterwards with `AA22 expired or not due`.
- **Per-day Münzen cap:** SmartSession cannot express one with deployed policies. UniActionPolicy's `isLimited` is
  **cumulative per session**, not per day. v1 = per-transfer cap + per-session cap (numbers are for Max to set;
  the proof uses 50 / 100). A true rolling daily window needs a small custom `IActionPolicy`
  (`used` reset per `block.timestamp / 1 days`), about 60 lines. It would be **new, unaudited** code: phase 2, audit gate.
- **Out of scope in v1 (stays on the passkey):** `trust`, MACI `signUp` / `publishMessage` (a vote should cost a
  fingerprint; poll targets are dynamic), attestations, org Safes, guardian changes, anything on the Safe itself.
- **Revocation:** one passkey op, `execute(batch, [removeSession(pid)…])`. Revoking all 3 costs 421k gas (FCL).
- **Renewal / new device:** one passkey op, `execute(batch, [uninstallModule(SmartSession, (SENTINEL, "")),
  installModule(SmartSession, UNSAFE_ENABLE ++ sessions)])`. The reinstall drops every session, so the app
  re-sends the sessions of all still-active devices (their public session keys are listed on chain via
  `getPermissionIDs` + app-side records). An alternative for later: SmartSession's in-op ENABLE flow (the passkey
  signs the session digest via ERC-1271, the first session op carries it). It needs `LibZip` compression and was
  not fork-proven here.

### Device-bound session key

- The Secure Enclave (iOS) and Android Keystore / StrongBox support **P-256 only, not secp256k1**, and
  `expo-secure-store` only stores secrets; it does not generate or sign with keys.
- **v1:** a software secp256k1 key (viem `generatePrivateKey`) in `expo-secure-store` with
  `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` and `requireAuthentication: false`. It is encrypted at rest by
  the Keychain / Keystore, is never backed up and never leaves the device. But it is decrypted into JS memory to
  sign, so a rooted or compromised device can extract it. The caps and expiry bound the damage.
- **v2:** a hardware P-256 key (non-extractable) through a small native module, with Rhinestone's
  `WebAuthnValidator` (`0x0000000000578c4c…3F33`, it implements `validateSignatureWithData`) as the SmartSession
  `sessionValidator`. The app builds its own authenticatorData / clientDataJSON and signs with the hardware key.
  Needs a native build plus a fork test of the WebAuthn session path.

## Fork results (`SessionKeys.t.sol`, Gnosis fork, Foundry 1.5.1)

Subject: **Max's real Safe `0xe3d18fecdcf8e8b656b11340790f7c0147632deb`**, with its real modules, handler,
2 guardians / threshold 2, and co-admin of legacy `0xc49dE63C…Fb28` (a Circles human trusted by the Röbel group).
Fork cheats: the SharedSigner (x, y) in the Safe's storage is swapped for a test passkey; guardians are pranked.
Every op is sponsored by the live NetizenVerifyingPaymaster (the sponsor key is swapped as in the existing tests).

| Test | Result |
|---|---|
| migrate + grant 3 sessions, 1 passkey op (Safe7579 module+handler, 4337 disabled, SRM/owner/guardians/legacy admin unchanged) | PASS |
| session key `personalMint` then `groupMint` via legacy, no passkey, sponsored (balances up, paymaster paid) | PASS |
| send 50 Münzen ok; 50+1 → PolicyViolation; 2nd 50 ok; +1 over the 100 session cap → PolicyViolation | PASS |
| out of scope: wrong permission, `trust`, other inner target, `executeBatch`, direct Hub call, Safe self-call `addOwner`, 7579 value 1 (PolicyCheckReverted), inner value 1, batch smuggling, `installModule` from a session (NoPoliciesSet), `from` ≠ legacy, wrong key (AA24); the allowed op still works after them | PASS |
| expiry: valid 1 h before, `AA22 expired or not due` after | PASS |
| revoke all sessions with 1 passkey op → InvalidPermissionId | PASS |
| renew after expiry with 1 passkey op (uninstall + reinstall) | PASS |
| grant on an already-migrated Safe with 1 passkey op (installModule) | PASS |
| social recovery after migration: guardians rotate to a new passkey; the old passkey fails AA24 on the 7579 root; **sessions survive recovery**; the new passkey revokes them | PASS |
| ERC-1271: before migration the plain Safe signature works; after, it needs a **20-byte zero prefix** (same SafeMessage hash); without it the call reverts | PASS |

Gas (`handleOps`, sponsored; root ops pay the FCL P-256 fallback, because the fork lacks the `0x100` precompile, which live Gnosis has):

| Op | Gas |
|---|---|
| migrate + grant 3 sessions (passkey) | 3,276,785 |
| migrate only (passkey) | 472,470 |
| grant 3 sessions on a migrated Safe (passkey) | 2,915,955 |
| renew: uninstall + reinstall (passkey) | 2,271,524 |
| revoke all 3 (passkey) | 420,561 |
| session `personalMint` | 227,016 |
| session `groupMint` | 224,304 |
| session `safeTransferFrom` | 257,978 |

Everyday ops no longer pay for P-256 verification: 227k vs about 343k for today's passkey `legacy.execute`.
Grants are storage-heavy, mostly UniActionPolicy rule slots. At ≤ 2 gwei that is ≤ 0.007 xDAI, but it needs
`callGasLimit` ≈ 3.5M.

## Sponsor-policy changes (`apps/web/src/lib/passkey/sponsor-policy.ts`)

The NetizenVerifyingPaymaster contract itself needs **no change**: the voucher covers the stable fields
(sender, nonce incl. the validator key, callData, gas) and not the signature, so session ops and root ops sponsor
alike (fork-proven). What changes is the server policy:

1. **Sender check (`checkDeployedPasskeySafe`)** accepts a second layout, "7579": fallback handler slot =
   Safe7579, `isModuleEnabled(Safe7579)`, Safe4337Module **not** enabled, SRM enabled, the same single-owner
   (x, y) binding. Optionally require SmartSession to be the only installed 7579 validator and no executors or hooks
   (read the adapter's sentinel lists).
2. **Nonce key routing:** `op.nonce >> 64` must be `0` (root / passkey) or `uint192(bytes24(bytes20(SmartSession)))`
   (session). Any other key → deny.
3. **callData:** besides `Safe4337Module.executeUserOp[WithErrorString]`, parse `Safe7579.execute(mode, data)` with
   callType single (0x00) or batch (0x01), execType default only, **never** delegatecall (0xff). Unpack
   `Execution`s and feed each `(target, value, data)` into the existing `checkAllowedCall` / everyday classifier.
   Identity, budget key and citizen checks stay as they are (identity = legacy through `legacy.execute`).
4. **Session ops:** also re-check the session scope server-side (defence in depth: the three shapes above only),
   budget key = legacy, plus a per-session daily sponsor budget.
5. **New mode `session-upgrade`** (4337 layout, root): the op is **byte-equal** to the migration batch built by a
   shared builder (`enableModule(7579)`, `setFallbackHandler(7579)`, `initializeAccount([SmartSession, templates],
   [], [], [], registry 0)`, `disableModule(prev, 4337)`) as a DELEGATECALL into MultiSendCallOnly. That is the one
   allowed Safe self-call.
6. **New mode `session-grant`** (7579 layout, root): `installModule(1, SmartSession, UNSAFE_ENABLE ++ sessions)`
   or the batch `[uninstallModule(1, SmartSession, (SENTINEL, "")), installModule(…)]`, where every session equals
   a server template (validator = OwnableValidator threshold 1, TimeFramePolicy `validUntil` ≤ now + 30 d, the
   exact UniActionPolicy configs, `permitERC4337Paymaster = true`, no ERC-7739 content). Raise `callGasLimit`
   for these to ~3.5M.
7. **`session-revoke`:** root `execute` of `removeSession(pid)` calls only. Always sponsored.
8. **ERC-1271 consumers** (email-proof, key-backup proof, Supabase Safe-admin envelope, Candide guardian approvals
   by migrated Safes, XMTP SCW association): a migrated Safe signs `address(0) ++ safeSignature`. Verifiers that
   call `isValidSignature` on chain keep working with the prefixed signature; the Expo `safeSignatureFromAssertion`
   path must add the prefix when the Safe's handler is Safe7579.

## Migration path (existing passkey Safes, incl. Max's `0xe3d1…2deb`)

1. The app reads the Safe's layout (handler slot). If it is Safe4337Module, it offers the upgrade.
2. **One fingerprint:** a sponsored `session-upgrade` op through the current Safe4337Module path. It enables
   Safe7579 as module and fallback, initialises SmartSession **with this device's sessions** (so migration and the
   first grant are the same fingerprint), and disables Safe4337Module. `initializeAccount` runs in the same
   transaction as the handler switch, so the audited front-running issue on `initializeAccount` (Ackee H1) has no
   window.
3. From then on: root ops = 7579 SafeOp (domain verifyingContract = Safe7579, same signature layout
   `validAfter ++ validUntil ++ safeSigs`), session ops = SmartSession.
4. New Safes can be built 7579-native (`Safe7579Launchpad`). Not needed for v1; keep the existing deploy and then upgrade.

Max's Safe today: owner SharedSigner, modules [SRM, Safe4337Module], handler Safe4337Module, 2 guardians /
threshold 2, admin of legacy `0xc49dE63C…Fb28`. The proof migrates exactly this state.

## App flow (Expo, behind the preview gate)

- **Grant screen** (Settings → Passkey → "Ohne Fingerabdruck"):
  - Title: **„Alltägliches ohne Fingerabdruck"**
  - Body: **„Die App darf 30 Tage lang:**
    - **Röbel Münzen abholen**
    - **bis zu 50 Röbel Münzen pro Überweisung senden, insgesamt höchstens 100**
    - **… nur auf diesem Gerät."**
  - Note: „Für alles andere (Abstimmen, Bestätigungen, Kontoänderungen) fragen wir weiter nach deinem Fingerabdruck."
  - Button: **„Erlauben"** (one fingerprint). Secondary: „Nicht jetzt".
- **Active state:** „Aktiv bis 27.10.2026 · noch 60 von 100 Röbel Münzen", with the button **„Jetzt beenden"**
  (one fingerprint, revokes this device's sessions). After expiry: „Abgelaufen · Erneut erlauben".
- **Recovery:** after `finalizeRecovery`, the first thing the new passkey does is **revoke all sessions**
  (proof: sessions survive recovery). Copy: „Alle Geräte-Freigaben wurden beendet."
- Session keys never appear in the UI (no addresses).

## Risks and audit status

- **Audits:**
  - Safe7579 was audited by Ackee Blockchain ([report](https://github.com/rhinestonewtf/safe7579/blob/main/audits/ackee-blockchain-rhinestone-safe7579-report.pdf), [summary](https://ackee.xyz/blog/rhinestone-erc-7579-safe-adapter-audit-summary/)) and reviewed by Safe.
  - Rhinestone core modules (incl. OwnableValidator) were audited by Ackee ([summary](https://ackee.xyz/blog/rhinestone-core-modules-audit-summary/)).
  - **SmartSession + UniActionPolicy / TimeFramePolicy: audit coverage of these exact deployed bytecodes NOT verified
    in this session.** Gate: find the report for the deployed commit (`erc7579/smartsessions`) before any
    production use.
- **UniActionPolicy on nested calldata** relies on the pinned bytes offset (0x60) and exact selector windows. A
  non-canonical encoding fails closed (proven for the shapes above). Every new session shape needs its own fork test.
- **The per-session cap is cumulative, not daily**, and `used` counts at validation.
- **Software session key** is extractable on a rooted device. Bounded by scope, caps and 30 days.
- **Sessions survive social recovery.** The recovery flow must revoke them.
- **ERC-1271 format change** after migration (20-byte prefix) touches every 1271 consumer (see sponsor item 8).
- **Validation-rule (ERC-7562) compliance** of SmartSession + policies with our bundler is unproven. Foundry does
  not simulate the bundler's rules. Check with a live preview bundler before the device test.
- **Grant gas** (~2.3–3.3M) exceeds today's sponsor `callGasLimit` cap.
- **Safe4337Module is disabled** in the upgrade; a failed upgrade op leaves the Safe unchanged (atomic).

## Rollout (preview gate)

1. Max decides: caps (50 / 100 is a proposal), 30 days, scope v1 = claim + send.
2. Verify the SmartSession / policy audit coverage (gate).
3. Shared TS builders + golden vectors (migration batch, session templates, 7579 SafeOp hash, session signature)
   reproduced byte-for-byte from a fork-written fixture, like `passkey-safe-vector.json`.
4. Sponsor policy modes (above) + tests; preview paymaster only.
5. Expo: 7579 root signing, session key store, grant / revoke / renew screens, recovery revoke, 1271 prefix. Behind
   `app_settings.passkey_accounts_enabled` AND channel ≠ production, plus a new `passkey_session_keys_enabled`.
6. Live bundler check (ERC-7562) on preview, then Max's own Safe first (the proof already runs on its state).
7. Phase 2: hardware P-256 session key (WebAuthnValidator), and optionally a daily-window policy (needs an audit).
