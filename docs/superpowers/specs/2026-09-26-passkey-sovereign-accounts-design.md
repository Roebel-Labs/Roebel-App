# Passkey sovereign accounts — design

**Status:** approved in chat 2026-09-26 (Max: "amazing … go build"), PREVIEW-ONLY.
**Branch:** `feat/passkey-accounts` (never merged to `main` without Max's explicit go).

## Goal

Replace the thirdweb `inAppWallet` login (email/phone/social; the signing key
lives in thirdweb's enclave = custodial) with a **passkey** the citizen alone
controls, add **social recovery** by guardians, and keep **gasless**
account-abstraction via our own paymaster — without changing any citizen's
address.

## Why the address must not change

The legacy thirdweb smart account (EIP-1167 → impl `0xf22175c8…a346`,
EntryPoint v0.6, factory `0x85e23b94…DF00`) is bound to: CitizenNFTv2
(soulbound), the Circles v2 avatar (no migration path; re-registering costs
96 personal CRC per invite), MACI sign-ups, the XMTP inbox and every
wallet-keyed Supabase row.

## Architecture: "wrap, don't move"

```
passkey (P-256, iCloud/Google synced, PRF)            guardians (other citizens' Safes)
        │ WebAuthn signature                                 │ confirmRecovery() txs
        ▼                                                    ▼
Safe 1.4.1  ── owner: SafeWebAuthnSharedSigner ──   Candide SocialRecoveryModule (3-day delay)
  modules: Safe4337Module v0.3.0 (EntryPoint v0.7)
        │ sponsored userOp  ◄── NetizenVerifyingPaymaster 0x11ed03Db… (voucher v2)
        ▼  execTransaction-equivalent call
legacy thirdweb Account  (same address as today)   isAdmin(Safe) == true
        │ execute(target, value, data)
        ▼
CitizenNFTv2 / Circles / MACI / …  (see the unchanged address)
```

**Account choice — Safe, not Kernel.** The 2026-07-31 bake-off picked Kernel
v3.1 for server-held ECDSA signers. For passkeys + guardians that are
themselves smart accounts, the Safe stack wins on Gnosis *today*:
Safe4337Module v0.3.0, SafeWebAuthnSharedSigner/SignerFactory 0.2.1, FCL
P-256 verifier and Candide SocialRecoveryModule (recoveryPeriod 259200 s) are
all deployed on chain 100 (verified 2026-09-26), all audited; the ZeroDev
WebAuthn validator is not deployed. Guardians confirm by *calling*
`confirmRecovery` (msg.sender), so a guardian's own passkey Safe confirms via
a sponsored userOp — no ERC-1271 guardian support needed. Also consistent with
the parallel org→Safe migration (`feat/org-safe-protocol`).

**P-256:** Gnosis has the RIP-7212 precompile at `0x100` (verified). Verifier
config = precompile `0x100` with FCL `0xA86e…5DBA` as fallback.

## Verified onchain facts (from verified source, 2026-09-26)

- `Account.execute/executeBatch` are `onlyAdminOrEntrypoint` → `isAdmin(msg.sender)`,
  so a **contract admin (the Safe) can call them directly**.
- `setPermissionsForSigner(req, sig)` is callable by anyone; `sig` must be an
  ECDSA EIP-712 signature (domain `Account`/`1`) by a current admin.
  `isAdmin=1` adds, `isAdmin=2` removes. After the thirdweb EOA is removed the
  admin set is **frozen** (no ECDSA admin left) — acceptable because key
  rotation/recovery happens at the Safe layer.
- `Account.isValidSignature` only ECDSA-recovers → after EOA removal the
  legacy account **cannot produce ERC-1271 signatures**. Verifiers we control
  must accept "Safe signed AND `legacy.isAdmin(safe)`"; XMTP must get the Safe
  associated to the inbox *before* removal.

## Migration ceremony (per citizen, opt-in)

1. Logged in with thirdweb as today.
2. Create passkey (rpId `id.ortis.app`, the neutral Ortis identity domain shared by all communities, decided 2026-09-26; PRF extension). Derive Safe address
   counterfactually.
3. Re-wrap signature-derived secrets (MACI voting key, Nostr key) under an
   AES-GCM key from HKDF(PRF output) — keeps MACI sign-ups; no ceremony.
4. thirdweb admin EOA signs `SignerPermissionRequest{signer: safe, isAdmin: 1}`.
5. The Safe's first sponsored userOp deploys the Safe and submits that request
   to the legacy account → Safe is co-admin. **(Tranche 1 stops here —
   reversible, nothing breaks.)**
6. *(Tranche 2)* XMTP association, all app write paths routed through the
   Safe, verifiers accept Safe-on-behalf-of-legacy, then EOA removal
   (`isAdmin: 2`) → thirdweb loses control.

New users (tranche 3): Safe-only, no legacy account.

## Preview-only guarantees

- Everything lives on `feat/passkey-accounts`; nothing merges to `main`.
- Expo surface gated by `app_settings.passkey_accounts_enabled` **AND**
  `Updates.channel !== 'production'`.
- No Supabase schema changes in tranche 1. Web sponsor route is off unless
  `PASSKEY_SPONSOR_ENABLED=1` (set on Vercel **Preview** only).
- Tranche 1 never removes the thirdweb admin.

## Known gates (Max)

- Native build: `webcredentials:id.ortis.app` in `app.config.ts`
  `associatedDomains` → new preview EAS build. The AASA on `id.ortis.app`
  (served by `apps/roebel-id`, Fly app `ortis-id`) must list the app under
  `webcredentials`.
- Android: `delegate_permission/common.get_login_creds` in the
  `assetlinks.json` on `id.ortis.app` (same deploy: `fly deploy -c fly.ortis.toml`).
- Vercel Preview env: `PASSKEY_SPONSOR_ENABLED=1`, `PASSKEY_PAYMASTER_ADDRESS`
  (a DEDICATED preview paymaster) and `PASSKEY_SPONSOR_KEY` (its own
  `sponsorSigner` key; the production signer is refused). See
  `docs/PASSKEY_ACCOUNTS_STATE.md`.
- Sponsorship budget persistence before any prod use (preview uses caps only).
