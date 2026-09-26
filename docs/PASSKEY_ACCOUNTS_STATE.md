# Passkey Accounts — State

**Status (2026-09-26):** tranche 1 built on `feat/passkey-accounts`, **preview-only, not merged, not device-tested.**
Spec: [`superpowers/specs/2026-09-26-passkey-sovereign-accounts-design.md`](superpowers/specs/2026-09-26-passkey-sovereign-accounts-design.md) ·
Plan: [`superpowers/plans/2026-09-26-passkey-accounts-tranche-1.md`](superpowers/plans/2026-09-26-passkey-accounts-tranche-1.md)

## What it is

A citizen's thirdweb login (email/phone/social, key held by thirdweb) gets a
**passkey Safe** as additional admin of their existing thirdweb smart account.
The address never changes, so CitizenNFT, Circles, MACI and XMTP stay attached.
Gas is paid by our NetizenVerifyingPaymaster (`0x11ed03Db…`). Guardians can move
the Safe to a new passkey after a 3-day delay (Candide SocialRecoveryModule).

Tranche 1 only **adds** the passkey Safe as co-admin. The thirdweb key keeps
working; nothing is removed.

## What shipped (branch commits)

| Area | Where | Proof |
|---|---|---|
| Onchain path, forked from Gnosis | `contracts/passkey-accounts/` | 12 forge tests: contract-admin `execute`, EOA removal (after which the legacy account's ERC-1271 check reverts), sponsored passkey deploy+handover, wrong passkey → AA24, guardian recovery + owner cancel |
| Golden vector | `contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json` | TS reproduces it byte-for-byte |
| Sponsor route | `apps/web/src/app/api/passkey/sponsor` + `apps/web/src/lib/passkey/` | 50 node:test tests; only the sender's own legacy thirdweb account (proxy-code check + `isAdmin` / same-batch handover), no admin removals, gas caps, fails closed on RPC errors |
| Expo library | `apps/expo/lib/passkey/` | WebAuthn + PRF, counterfactual Safe, sponsored userOps, handover, PRF vault (AES-256-GCM, HKDF) |
| Migration screen | `apps/expo/app/settings/passkey.tsx` | Gated: `app_settings.passkey_accounts_enabled = 'true'` AND channel ≠ production (dev builds allowed) |

Expo passkey tests: 55 (`cd apps/expo && ./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci`; watchman hangs jest).

## Measured / verified facts

- The P-256 precompile at `0x100` is live on Gnosis. Foundry's fork EVM lacks it, so fork gas figures use the FCL fallback (worst case): deploy + handover ≈ 917k, later `legacy.execute` via the Safe ≈ 343k.
- thirdweb `Account`:
  - A contract admin can call `execute` directly.
  - Adding or removing an admin needs an ECDSA EIP-712 signature from a current admin, domain `("Account","1")`.
  - Once the EOA is removed, `isValidSignature` reverts, so the legacy account can no longer sign (no ERC-1271).
- The Candide SocialRecoveryModule `0x3827…541c` has a recovery period of 259200 s (3 days). Guardians confirm with an ordinary transaction (as msg.sender), so a guardian's passkey Safe can confirm.

## Gates before a device test (Max)

1. **Preview EAS build** — `webcredentials:roebel.app` was added to iOS `associatedDomains`, which is a native change, so an OTA update isn't enough.
2. **Android** — `get_login_creds` was added to `apps/web/public/.well-known/assetlinks.json`. It only counts once it is live on roebel.app, which means that one file has to reach `main`.
3. **Vercel Preview env** (this branch only):
   - `PASSKEY_SPONSOR_ENABLED=1`
   - `PASSKEY_SPONSOR_KEY` = `SIGNER_SPONSOR_KEY` from `netizen_labs/demo/.env`
   - optional `GNOSIS_RPC_URL`
   - `GNOSIS_BUNDLER_RPC_URL`, if the `/api/bundler` proxy is used
4. **Preview build env:**
   - `EXPO_PUBLIC_PASSKEY_API_URL` = the branch's Vercel preview URL. Deployment protection must allow the app's requests.
   - `EXPO_PUBLIC_PASSKEY_BUNDLER_URL` (defaults to `<api>/api/bundler`)
5. **Supabase:** `app_settings` row `passkey_accounts_enabled = 'true'`. It only has an effect on non-production channels.

## Known risks to watch in the first preview run

- **Gas estimation with the placeholder voucher.** Estimation uses a 372-byte `paymasterAndData` with an all-zero voucher. If the bundler reverts on the paymaster's signature failure during estimation, we need a state-override or a pre-sponsor dry voucher.
- **Lockfile churn.** Adding viem and @noble changed about 630 lines of `pnpm-lock.yaml`, including unrelated peer re-resolutions. Review before any merge.
- **Sponsorship budget.** The only limit is per-op gas caps; there is no persistent per-account budget.

## Tranche 2 (not built)

- XMTP: associate the Safe with the inbox **before** the EOA is removed.
- Route every app write through the Safe → `legacy.execute`, via an account adapter.
- Verifiers we control (Supabase login, delete-user-account, signed-request, Shamir submissions) accept "Safe signed + `legacy.isAdmin(safe)`".
- EOA removal (`isAdmin: 2`). After it, thirdweb has no control and the legacy admin set is frozen.
- Guardian setup UI, with the attesters who vouched for the citizen as default guardians.
- Persistent per-account sponsor budget, keyed on CitizenNFT holding.
- New users: Safe-only onboarding, with no thirdweb account.
- Re-key the Shamir attester share keys, which derive from deterministic thirdweb signatures.
