# Passkey Accounts — State

**Status (2026-09-26):** tranche 1 built on `feat/passkey-accounts`, **preview-only, not merged, not device-tested.**
Spec: [`superpowers/specs/2026-09-26-passkey-sovereign-accounts-design.md`](superpowers/specs/2026-09-26-passkey-sovereign-accounts-design.md) ·
Plan: [`superpowers/plans/2026-09-26-passkey-accounts-tranche-1.md`](superpowers/plans/2026-09-26-passkey-accounts-tranche-1.md)

## What it is

A citizen's thirdweb login (email/phone/social, key held by thirdweb) gets a
**passkey Safe** as additional admin of their existing thirdweb smart account.
The address never changes, so CitizenNFT, Circles, MACI and XMTP stay attached.
Gas is paid by a **dedicated preview** NetizenVerifyingPaymaster (`PASSKEY_PAYMASTER_ADDRESS`), never the production `0x11ed03Db…`. Guardians can move
the Safe to a new passkey after a 3-day delay (Candide SocialRecoveryModule).

Tranche 1 only **adds** the passkey Safe as co-admin. The thirdweb key keeps
working; nothing is removed.

## What shipped (branch commits)

| Area | Where | Proof |
|---|---|---|
| Onchain path, forked from Gnosis | `contracts/passkey-accounts/` | 12 forge tests: contract-admin `execute`, EOA removal (after which the legacy account's ERC-1271 check reverts), sponsored passkey deploy+handover, wrong passkey → AA24, guardian recovery + owner cancel |
| Golden vector | `contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json` | TS reproduces it byte-for-byte. rpId `id.ortis.app`, origin `https://id.ortis.app` |
| Sponsor route | `apps/web/src/app/api/passkey/sponsor` + `apps/web/src/lib/passkey/` | 66 node:test tests (+3 live Gnosis, `PASSKEY_LIVE_TEST=1`). Body `{chainId, userOp, x, y, legacy}`. Sender must be the genuine passkey Safe for (x, y) (exact factoryData + predicted address, or deployed proxy/singleton/4337 handler+module/single owner bound to (x, y)); `legacy` must be a thirdweb Account proxy holding CitizenNFTv2; handovers verified by eth_call `verifySignerPermissionRequest` + `isAdmin(signer)`; execute/SRM need an existing admin or a verified handover; one legacy per op; maxFee ≤ 3 gwei; daily budget per legacy (0.01 xDAI) + global (0.05 xDAI), 429 when exhausted; fails closed (503) on RPC errors; logs carry no RPC URLs |
| Expo library | `apps/expo/lib/passkey/` | WebAuthn + PRF, counterfactual Safe, sponsored userOps, handover, PRF vault (AES-256-GCM, HKDF) |
| Migration screen | `apps/expo/app/settings/passkey.tsx` | Gated: `app_settings.passkey_accounts_enabled = 'true'` AND channel ≠ production (dev builds allowed) |

Expo passkey tests: 70 (`cd apps/expo && ./node_modules/.bin/jest lib/passkey --watchAll=false --no-watchman --ci`; watchman hangs jest).

## Migration + recovery sponsorship (built 2026-09-26, not deployed)

**ERC-1271 works on a passkey Safe** (fork-proven, `contracts/passkey-accounts/test/GuardianErc1271.t.sol`): Safe4337Module v0.3.0 inherits Safe's CompatibilityFallbackHandler 1.4.1, so `isValidSignature(h, sig)` returns `0x1626ba7e` when the WebAuthn challenge is the Safe's EIP-712 `SafeMessage` hash of `abi.encode(h)` and `sig` is the usual one-owner contract signature. Recipe + byte-exact vectors: `contracts/passkey-accounts/test/fixtures/recovery-vector.json` (copied to `apps/expo/lib/passkey/__tests__/`).

**Recovery UX:** guardians with a DEPLOYED passkey Safe approve off-chain (`signRecoveryApprovalAsGuardian`); the recovering person's NEW passkey Safe sends one sponsored op `[createSigner(newKey), multiConfirmRecovery(wallet, [signer(newKey)], 1, approvals, true)]`, and after 3 days `[finalizeRecovery(wallet)]`. A guardian whose Safe is still counterfactual cannot sign off-chain (no code) and confirms on-chain with its own sponsored `confirmRecovery` op (which deploys it). After recovery the wallet signs through the per-key signer: the migration record persists `ownerType` + `owner` (review L4), `sendPasskeyUserOp({ sender, owner })`.

**Sponsor policy modes** (`apps/web/src/lib/passkey/sponsor-policy.ts`), citizen(a) = CitizenNFTv2.hasCitizenNFT(a) OR (v3 configured AND CitizenNFTv3.hasCitizenNFT(a)):

| Mode | Identity / budget key | Allowed |
|---|---|---|
| `legacy` (body names `legacy`) | the legacy thirdweb account | tranche-1 shapes + `legacy.execute(v3, 0, moveTo(sender))` on the configured v3 NFTs only + `AccountFactory.createAccount(admin, 0x)` as call #0 when `factory.getAddress(admin, 0x) == legacy` and legacy has no code (the handover is then verified by ECDSA recovery against `admin`, low-s) |
| `safe` (no `legacy`, citizen(sender)) | the sender Safe | SRM guardian management + `confirmRecovery` |
| `recovery` (no `legacy`) | the wallet being recovered | `multiConfirmRecovery` / `executeRecovery` with newOwners = [getSigner(x, y)], threshold 1; `finalizeRecovery` when the pending owners are [getSigner(x, y)] and the delay is over; `confirmRecovery` when the sender is a guardian; `createSigner(x, y)`. The wallet must be citizen(wallet) or admin of a citizen `recoveryLegacy`, with ≥ 1 guardian. Any passkey Safe may send these (family members are not citizens). |

Identity and recovery calls never mix; a non-citizen passkey Safe gets nothing else. **Registration of brand-new users is not sponsored** (they need attesters first). Verified live: the counterfactual v2 citizen `0xEbf3…5227` has no code, `hasCitizenNFT == true`, and `AccountFactory.getAddress(0x21e7…0e90, 0x)` (admin read from Base) equals it.

New env: web `PASSKEY_CITIZEN_NFT_V3`, `PASSKEY_ATTESTER_NFT_V3`; Expo `EXPO_PUBLIC_PASSKEY_CITIZEN_NFT_V3`, `EXPO_PUBLIC_PASSKEY_ATTESTER_NFT_V3` (empty = v3 off / hidden). Expo library: `guardians.ts`, `migration-v3.ts`. Fork gas (FCL fallback, worst case): deploy new Safe + createSigner + multiConfirmRecovery with 2 passkey approvals ≈ 1.56M; live Gnosis has the P-256 precompile and needs far less.

Tests: 21 forge, 96 web node:test (+4 live), 96 Expo jest.

## Measured / verified facts

- The P-256 precompile at `0x100` is live on Gnosis. Foundry's fork EVM lacks it, so fork gas figures use the FCL fallback (worst case): deploy + handover ≈ 917k, later `legacy.execute` via the Safe ≈ 343k.
- thirdweb `Account`:
  - A contract admin can call `execute` directly.
  - Adding or removing an admin needs an ECDSA EIP-712 signature from a current admin, domain `("Account","1")`.
  - Once the EOA is removed, `isValidSignature` reverts, so the legacy account can no longer sign (no ERC-1271).
- The Candide SocialRecoveryModule `0x3827…541c` has a recovery period of 259200 s (3 days). Guardians confirm with an ordinary transaction (as msg.sender), so a guardian's passkey Safe can confirm.

## Gates before a device test (Max)

Passkeys use the rpId **`id.ortis.app`** (decided 2026-09-26): the neutral Ortis identity domain shared by all communities, not `roebel.app`. It is served by the Fly app `ortis-id`, built from `apps/roebel-id` with `fly.ortis.toml`. `roebel.app` hosts no passkey association any more (this branch's `get_login_creds` on roebel.app was reverted).

1. **iOS: preview EAS build.** `webcredentials:id.ortis.app` is in iOS `associatedDomains`. That is a native change, so an OTA update isn't enough. It also needs gate 2, since iOS fetches the AASA from `id.ortis.app`.
2. **AASA + assetlinks live on id.ortis.app.** `apps/roebel-id/src/well-known/app-associations.ts` serves `/.well-known/apple-app-site-association` (`webcredentials` → `88879TXSXK.com.maxbrych.roebelonchain`) and `/.well-known/assetlinks.json` (`handle_all_urls` + `get_login_creds` for `com.maxbrych.roebelonchain`). They are **not deployed yet**. Deploy from this branch with `cd apps/roebel-id && fly deploy -c fly.ortis.toml` (app `ortis-id`), then check with `curl -si https://id.ortis.app/.well-known/apple-app-site-association` and `curl -si https://id.ortis.app/.well-known/assetlinks.json` (both must return 200 + `application/json` with no redirect). Android: `get_login_creds` on id.ortis.app is the only Android association gate.
3. **Vercel Preview env** (this branch only):
   - `PASSKEY_SPONSOR_ENABLED=1`
   - `PASSKEY_PAYMASTER_ADDRESS` = a **dedicated preview paymaster** (deploy a fresh NetizenVerifyingPaymaster, fund it modestly). Required; there is no default.
   - `PASSKEY_SPONSOR_KEY` = that preview paymaster's own `sponsorSigner` key. **Not** `SIGNER_SPONSOR_KEY` from `netizen_labs/demo/.env`: the route refuses the production signer `0x218B…8bF7`.
   - optional `PASSKEY_SPONSOR_DAILY_WEI` / `PASSKEY_SPONSOR_GLOBAL_DAILY_WEI` (defaults 0.01 / 0.05 xDAI per UTC day)
   - optional `GNOSIS_RPC_URL`
   - `GNOSIS_BUNDLER_RPC_URL`, if the `/api/bundler` proxy is used
4. **Preview build env:**
   - `EXPO_PUBLIC_PASSKEY_API_URL` = the branch's Vercel preview URL. Deployment protection must allow the app's requests.
   - `EXPO_PUBLIC_PASSKEY_BUNDLER_URL` (defaults to `<api>/api/bundler`)
   - `EXPO_PUBLIC_PASSKEY_PAYMASTER_ADDRESS` = the same preview paymaster
5. **Supabase:** `app_settings` row `passkey_accounts_enabled = 'true'`. It only has an effect on non-production channels.

## Known risks to watch in the first preview run

- **Gas estimation with the placeholder voucher.** Estimation uses a 372-byte `paymasterAndData` with an all-zero voucher. If the bundler reverts on the paymaster's signature failure during estimation, we need a state-override or a pre-sponsor dry voucher.
- **Lockfile churn.** Adding viem and @noble changed about 630 lines of `pnpm-lock.yaml`, including unrelated peer re-resolutions. Review before any merge.
- **Sponsorship budget is in-memory.** It is per serverless instance and resets on cold start, so the real ceiling is caps × instances. A persistent, shared budget is a production gate.
- **Fees.** The client takes fees from `pimlico_getUserOperationGasPrice` (floor 1.5 gwei, fails above the 3 gwei route cap). Paymaster gas is floored at 150k / 50k (the fork-proof values), because estimation runs against a zero stub voucher.

## Tranche 2 (not built)

- XMTP: associate the Safe with the inbox **before** the EOA is removed.
- Route every app write through the Safe → `legacy.execute`, via an account adapter.
- Verifiers we control (Supabase login, delete-user-account, signed-request, Shamir submissions) accept "Safe signed + `legacy.isAdmin(safe)`".
- EOA removal (`isAdmin: 2`). After it, thirdweb has no control and the legacy admin set is frozen.
- Guardian setup UI, with the attesters who vouched for the citizen as default guardians (library + sponsor policy ready, see above).
- Persistent per-account sponsor budget (today: in-memory, preview-only).
- New users: Safe-only onboarding, with no thirdweb account.
- Re-key the Shamir attester share keys, which derive from deterministic thirdweb signatures.
