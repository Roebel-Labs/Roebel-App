# Passkey Accounts — State

> What the person controls and what still depends on a vendor or on us: [`SOVEREIGNTY_LEDGER.md`](SOVEREIGNTY_LEDGER.md). Check any independence claim in the app or in marketing against it.

**Status (2026-09-27):** preview-only. First device test on a Pixel 7 passed the everyday basics (see "Device test 2026-09-27"); tranche 1 originally built on `feat/passkey-accounts`.
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
| `recovery` (no `legacy`) | the wallet being recovered (a guest wallet: the sender Safe, see the sovereign sign-up section) | `multiConfirmRecovery` / `executeRecovery` with newOwners = [getSigner(x, y)], threshold 1; `finalizeRecovery` when the pending owners are [getSigner(x, y)] and the delay is over; `confirmRecovery` when the sender is a guardian; `createSigner(x, y)`. The wallet must be citizen(wallet) or admin of a citizen `recoveryLegacy`, with ≥ 1 guardian. Any passkey Safe may send these (family members are not citizens). |

Identity and recovery calls never mix; a non-citizen passkey Safe gets nothing else. **Registration of brand-new users is not sponsored** (they need attesters first). Verified live: the counterfactual v2 citizen `0xEbf3…5227` has no code, `hasCitizenNFT == true`, and `AccountFactory.getAddress(0x21e7…0e90, 0x)` (admin read from Base) equals it.

New env: web `PASSKEY_CITIZEN_NFT_V3`, `PASSKEY_ATTESTER_NFT_V3`; Expo `EXPO_PUBLIC_PASSKEY_CITIZEN_NFT_V3`, `EXPO_PUBLIC_PASSKEY_ATTESTER_NFT_V3` (empty = v3 off / hidden). Expo library: `guardians.ts`, `migration-v3.ts`. Fork gas (FCL fallback, worst case): deploy new Safe + createSigner + multiConfirmRecovery with 2 passkey approvals ≈ 1.56M; live Gnosis has the P-256 precompile and needs far less.

Tests: 21 forge, 96 web node:test (+4 live), 96 Expo jest.

## Optional warning email (D6, built 2026-09-26, not deployed)

A passkey user MAY add an email. It is used ONLY for recovery alerts ("Jemand stellt dein Konto wieder her. Du hast bis … Zeit, das abzubrechen") and, later, notifications they opt into. It is never a login or a key, and it never reaches the newsletter: it lives in new `passkey_*` tables, not `users.email` (the `trg_newsletter_auto_enroll` trigger sits on `users`; live 2026-09-26 it is enabled but a no-op because `app_settings.newsletter_auto_enroll = 'off'`).

- **Web** (`apps/web/src/lib/passkey/email-*.ts`, routes `api/passkey/email/{start,verify,remove}`, 503 unless `PASSKEY_EMAIL_ENABLED=1`): add/remove need an ERC-1271 proof by the Safe over a fixed EIP-191 text (`email-proof.ts`, byte-exact with Expo via `email-proof-vector.json`), ±10 min, replay-guarded, checked with viem `verifyMessage` on Gnosis. **Counterfactual Safes are refused (409)**, not ERC-6492: every migrated Safe is deployed by its handover op, and an undeployed Safe has no guardians to warn about. 6-digit code via Resend from `konto@roebel.app`, only a hash stored, 10 min, 5 attempts, constant-time compare. Rate limits in memory (3/h per address, 5/h per Safe).
- **Recovery alerts** (`GET /api/passkey/recovery-alerts`, `CRON_SECRET` bearer): scans the SRM for `RecoveryExecuted` since a cursor (first run looks back 60k blocks ≈ 3.5 days), mails verified contacts whose delay is still running, idempotent per (wallet, recovery nonce), holds the cursor when a send fails. Refuses the in-memory store.
- **Expo**: `lib/passkey/email.ts` (proof text, ERC-1271 signing via `safeMessageHash` + `safeSignatureFromAssertion`, AbortController timeouts, German errors; the device remembers its email in SecureStore because the server has no status endpoint) + `components/passkey/EmailRow.tsx`, mounted in `app/settings/passkey.tsx` once the Safe is connected.
- **Migration file** `supabase/migrations/20260927_passkey_contact_email.sql` — **NOT applied**. RLS on, no policies, all privileges revoked from anon/authenticated, no functions.
- Tests: 39 web node:test (incl. an offline passkey-Safe ERC-1271 emulator checked against the fork-proven recovery vector), 14 Expo jest.

**Gates (Max):**
1. Apply `20260927_passkey_contact_email.sql`.
2. Vercel Preview env: `PASSKEY_EMAIL_ENABLED=1`, `PASSKEY_EMAIL_STORE=supabase` (only after gate 1; unset = in-memory, which breaks when start and verify hit different instances), confirm `RESEND_API_KEY` is present on Preview, `CRON_SECRET` for the alert route.
3. Add the cron to `vercel.json`, e.g. `{"path": "/api/passkey/recovery-alerts", "schedule": "*/10 * * * *"}` (the 3-day window needs a frequent scan, not a daily one).
4. Production gates: a shared rate limiter (Postgres or Upstash) instead of the in-memory one; privacy text (Datenschutzerklärung) naming this purpose-bound address.

## Device test 2026-09-27 + polish (`feat/passkey-polish`)

**Device test (Max, Pixel 7, passkey session on legacy `0xc49d…` via Safe `0xe3d1…`):**
- Adding a guardian, getting Münzen and sending Münzen **work**.
- Surprise: claiming Münzen sent **two separate sponsored ops** (`personalMint`, then `groupMint`), each with its own
  fingerprint prompt, settled in the background after the tap (the settlement queue retries up to 3×, so up to
  6 prompts).
- "Schlüssel sichern" backed up only `nostr`. `maci` and `salt` were missing because this fresh install never had a
  local MACI key (and no commitment preimage).

**Changes:**
1. **One tap → one fingerprint for Münzen (passkey sessions only).** `lib/muenzen-claim.ts`:
   - No background claim under a passkey session: `useDailyMint.claim()` refuses, the profile pill reads
     "Münzen abholen" and opens the Münzen page.
   - The Münzen page's one primary "Münzen abholen" button claims in the foreground as ONE batch
     (`personalMint` + `groupMint(group, [self], [amount], 0x)` for group members) → ONE userOp, no retries.
     Pending: "Bestätige mit deinem Passkey…"; success in the same place: "+X Röbel Münzen"; errors as an alert,
     cooldown/streak only move on success.
   - `groupMint` amount = personal balance + accrued issuance − 0.1 % (covers the daily demurrage step if the op
     lands after midnight; the dust stays personal and is swept next time).
   - The adapter (`thirdweb-adapter.ts`) now sends a legacy identity's batch as ONE `legacy.executeBatch(targets,
     values, datas)` call (was: a MultiSend of several `legacy.execute`). The sponsor's everyday mode already
     accepted it; pinned in `everyday-policy.test.ts`. Also applies to the org-Safe batches (their test already
     uses `executeBatch`).
   - thirdweb sessions: unchanged (two gasless sends via the settlement queue).
2. **"Schlüssel sichern" completes MACI + Nostr (+ salt).** `lib/passkey/key-completion.ts` +
   `key-completion-runtime.ts`, used by Settings → Passkey and the "thirdweb trennen" checklist:
   - A slot with no local key and no backup is derived with the EXISTING thirdweb derivation (MACI message
     "Röbel Bürgerumfrage – Abstimmungsschlüssel v1", now in `lib/maci-key-derivation.ts`, shared with
     `MaciContext`; salt typed data via `deriveCommitmentSalt`; Nostr via `deriveAndStoreIdentity`), persisted
     locally like today (MACI → `roebel.maci.keypair.v1`; salt → PRF device blob, no preimage is written),
     wrapped under the PRF and backed up. Never from a passkey signature.
   - thirdweb source: the active account when it is a thirdweb one; else `wallets[0].autoConnect` from the stored
     inApp session — outside the connection manager, so the active wallet stays the passkey adapter. A session of
     another account is refused.
   - No thirdweb session: what the device has is backed up, the rest is reported, and "Einmal mit Google/E-Mail
     bestätigen" runs the existing thirdweb login (Google OAuth or E-Mail code) on the same wallet instance,
     again outside the connection manager, then completes. The app stays on the passkey session.
   - A backup-service error throws; it is never read as "no backup".
   - Checklist "Schlüssel gesichert" is green only when maci + nostr (+ salt when the citizen has a commitment:
     local preimage or a `request_evidence` row with `irys_id = 'commitment'`; a failed lookup counts as yes) are in
     the backup. It names what is missing.

**Needs a device test:**
- Münzen: one fingerprint per claim, "+X Röbel Münzen" shown, balance updates; a guest (no group trust) claims
  `personalMint` only. Profile pill opens the Münzen page. thirdweb session: pill still claims as before.
- Keys, silent path (device still holds the thirdweb login): "Schlüssel sichern" → 2 fingerprints, no Google
  prompt, backup has maci + nostr (+ salt), the app is still on the passkey session afterwards.
- Keys, confirm path (thirdweb logged out on the device): Google and E-Mail code both work, no switch of the active
  account, no redirect to `/profile` leaking into the router (Android).
- **MACI key match (risk):** the derived key equals the one MACI knows only if this citizen's key was derived with
  the same thirdweb signature (chainId 100 signing domain). Keys minted randomly by very old installs, or derived
  while the wallet signed with Base (before 2026-07-27), will differ, exactly as for a thirdweb session on a fresh
  install. Check the voting screen shows "signed up" after the restore.

## Onboarding + recovery helpers (`feat/onboarding-passkey-helpers`, 2026-09-28)

- **Production rollout switch.** `app_settings.passkey_accounts_enabled_production` (missing = off). Production opens
  only with BOTH flags `'true'` AND a binary with runtimeVersion ≥ 3.8.0 (3.7.0 lacks `webcredentials:id.ortis.app`).
  `passkey_accounts_enabled` stays the global kill switch. Boot (`passkeyChannelAllowed`, synchronous, flag-free):
  production restores a passkey session only on ≥ 3.8.0, so a flag flip never signs anyone out. Not set yet.
- **First launch.** Gate open + logged out: accepting the first-launch consent continues to `/welcome`, whose
  logged-out variant shows "Unabhängiges Konto" first, then "Mit E-Mail, Google oder Apple anmelden" and "Erst mal
  umsehen". A new passkey account lands in the app; the wizard is deferred once (`lib/onboarding-deferral.ts`) and
  UserContext marks onboarding done. The terms re-prompt (`/welcome/consent`) still appears on a later cold start, as
  for every account without `terms_accepted_at`.
- **"Profil vervollständigen"** card on the profile (not gated): name, photo, role, terms, each into the same step UI
  (`/welcome/name|role|consent?single=1`, photo → edit-profile). Apple sign-ins are never asked for a name.
- **Recovery helper** (Settings → Passkey → Vertrauenspersonen → "E-Mail oder Google als Helfer hinzufügen"): a
  thirdweb login (Google / Apple / E-Mail, no phone) on a separate wallet object outside the connection manager; its
  Gnosis smart account is added with `SRM.addGuardianWithThreshold` in one sponsored passkey op (threshold 1 if it is
  the only guardian, else the user's threshold). Only while the passkey session is the active wallet and the identity
  is sponsorable (citizen). thirdweb keeps one connector/storage per client id, so the helper login is written to the
  device's thirdweb storage and is logged out again right after its address is known (a cold start must never restore
  the helper). Side effect: a dormant thirdweb session of ANOTHER account on that device is replaced and then gone
  (the passkey session is untouched; "Schlüssel sichern" then needs its confirm path). Labels are local
  (`passkey_recovery_helpers_v1`: kind + masked email); another device shows the helper as "Unbekannte Person".
- **Recovery with the helper** ("Konto wiederherstellen" → "Mit E-Mail oder Google bestätigen"): the helper logs in,
  must be a guardian, and sends `SRM.confirmRecovery(wallet, [newSigner], 1, false)` itself as a normal thirdweb
  smart-account transaction (sponsorGas → thirdweb's paymaster; our passkey sponsor route is not involved). Then the
  existing poll → executeRecovery → 3 days → finalize. Refused while a thirdweb session is the active wallet.

## Sovereign sign-up foundations (2026-11-17)

Plan 1 of the sovereign sign-up project (branch `feat/sovsignup-1-foundations`, not merged, not deployed; spec
[`superpowers/specs/2026-11-17-sovereign-signup-design.md`](superpowers/specs/2026-11-17-sovereign-signup-design.md)).
A person without a thirdweb login (a **guest**: a passkey Safe that is not a citizen) can now be sponsored far
enough to get guardians, request citizenship and join Röbel Münzen.

**Per-surface gate** (`apps/expo/lib/passkey/gate.ts`). Kill switch `passkey_accounts_enabled` closes everything.
Preview and dev open every surface. Production needs runtime >= 3.8.0, the `signup` production flag, and for any
other surface that surface's own flag:

| Surface | `app_settings` production key |
|---|---|
| `signup` | `passkey_accounts_enabled_production` |
| `migration` | `passkey_migration_enabled_production` |
| `detach` | `passkey_detach_enabled_production` |
| `words` | `passkey_words_enabled_production` |

At launch set only `passkey_accounts_enabled`, then `passkey_accounts_enabled_production`. Leave the other three unset.

**Existing accounts are not behind the sign-up flags** (`apps/expo/lib/passkey/existing-account.ts`). The flags and
the kill switch close NEW sign-up entry points only. When the device holds a passkey session or a connected migration
record (status `done`), the Settings kind (`settings-kind.ts`), the root recovery banner (`PasskeyRecoveryWatch`) and
the recovery screens `/passkey/code` and `/passkey/restore` (the latter also while a recovery is in progress on the
device, `passkey_recovery_v1`) are decided by `passkeyChannelAllowed()` alone, so guardians, the warning email and the
"someone is recovering your account" banner never disappear for someone who already has an account. `useSettingsKind`
reads all surface flags with one fetch (`passkeySurfacesAllowed`). The independent-account settings never write a
fresh migration record over the stored one after a failed SecureStore read; they show "Erneut versuchen" instead
(`sovereign-record.ts`).

**Guest tier (sponsor).** A non-citizen Safe is sponsored for: `CitizenNFTv2.createAttestationRequest`, guardian
management (add/revoke guardian, threshold, cancel recovery), `Hub.registerHuman`, `Hub.personalMint`,
`NameRegistry.updateMetadataDigest`, and recovery of a guest Safe that has at least one guardian (the Safe must pass
the shape check, including the SocialRecoveryModule). The recovery of a guest Safe is charged to the **submitting
Safe's** key (plus the guest group), never to the guest wallet: any passkey Safe can submit such an op (it reverts on
chain without the guardians, but the paymaster pays), and charging the wallet would let a stranger exhaust the
budget the wallet needs for its own `cancelRecovery`. Citizen recovery stays keyed to the wallet. Not sponsored for guests: `groupMint`, `trust`, `send`, legacy
shapes (handover, `moveTo`, calls to a legacy account). A Safe is a guest only if it is not a citizen identity.

**Budgets.**
- `PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI`: per guest Safe per UTC day, default 0.002 xDAI.
- `PASSKEY_SPONSOR_GUEST_GLOBAL_DAILY_WEI`: all guests together per UTC day (shared row `'guests'`), default 0.02 xDAI.
  It must stay **below** `PASSKEY_SPONSOR_GLOBAL_DAILY_WEI`. Guests also count against the global total, so a guest cap
  at or above it would let guests use up the budget citizens need. Enforced in code: the handler clamps it to
  global cap - 1 wei (`guestGroupCap` in `sponsor-handler.ts`).
- Measured prefunds (Task 5, EntryPoint prefund per op): deploy + guardian + citizenship request = 0.00234 xDAI at
  1.5 gwei, 0.00468 at 3 gwei (an upper bound for verification gas only); `personalMint` on a deployed Safe = 0.00159 /
  0.00318. **The default onboarding cap of 0.002 xDAI therefore does not fit a guest's first op even at 1.5 gwei.**
  The owner must set `PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI` (suggested 0.006 xDAI) before opening sign-up.
- Migrations (not applied): `20261117a_passkey_sponsor_guest_cap.sql` (`passkey_sponsor_reserve_v2`),
  `20261117b_passkey_rate_limits.sql` (shared warning-email rate limit, `PASSKEY_RATE_LIMIT_STORE=supabase`, RPC
  `passkey_rate_take`; only a sha256 of the lowercased Safe/address is stored).

**Owner to Safe lookup** (`apps/expo/lib/passkey/recovery-lookup.ts`, `findSafesByOwner`). A recovered Safe's owner
changes, so a new phone finds the Safe from the new signer: it scans `AddedOwner(owner)` logs over the full range back
to `PASSKEY_EPOCH_BLOCK`, shape-checks every candidate (proxy runtime, SafeL2 singleton, Safe4337Module fallback,
exactly the 4337 + SocialRecovery modules), prefers the candidate with history and otherwise fails with an ambiguity
error. An RPC error during the lookup fails sign-in with a "try again" message; it never falls back to another
account. Known residuals: the history signal can be forged (worst case is a lockout, never a wrong account), and the
scan grows by about 52 windows per month, so an index or a pinned block will be needed eventually.

**Boot rule** (`apps/expo/lib/passkey/boot.ts`). `bootWallets` takes ordered `SessionSource`s. A source that is stored
but fails to restore because of a storage error or a failing lazy import is a **failed** boot: the app shows "restore
failed" and retries in the background. It never falls through to thirdweb and never logs the person out. A stored
session that is **corrupt** (unparsable, so retrying cannot help) is different: after one attempt the boot falls
through to the thirdweb path. The background retry does the same (`backgroundRestore`): when the failed source's
session turns out corrupt or gone, the source is dropped and thirdweb is restored in the same tick, so the timer never
keeps retrying a session that no longer exists. The passkey source's presence check (`hasStored`) is a direct
SecureStore read in `boot-source.ts`; only `load` / `connect` import the sign-in runtime, so a failing import can only
affect someone who really holds a passkey session. Production below runtime 3.8.0 builds no passkey source and boots
exactly as before.

**Other.** The recovery-alert cron (`/api/passkey/recovery-alerts`, every 10 minutes, `CRON_SECRET` bearer) is now in
`apps/web/vercel.json` (Vercel runs crons on the production deployment only; the route answers 503 until the email
flags and the Supabase store are set). The warning-email limiter is shared when `PASSKEY_RATE_LIMIT_STORE=supabase`; if the store is
down, `start` answers 503 `store_unavailable` and sends nothing. The consent processor list still names the provider
on purpose (DSGVO). A Safe can join Circles (fork proof `contracts/passkey-accounts/test/SafeCircles.t.sol`).

**Owner gates** (Max): merge after review; apply the six sponsor/key/email/session/guest-cap/rate-limit migrations in
order via the Supabase MCP; for the recovery words also apply `20261117c_passkey_key_backup_words_slots.sql` **before
opening the `words` surface** (without it the server refuses the `_w` / `wvk` slots, so no words copy is stored) and
`20261117d_passkey_alert_channels.sql` **before deploying the web code** (without it every recovery alert, email
included, fails to claim); Vercel production env (dedicated production paymaster, `PASSKEY_SPONSOR_*` budgets incl. the
onboarding cap above, `PASSKEY_SPONSOR_BUDGET_STORE=supabase`, `PASSKEY_RATE_LIMIT_STORE=supabase`, email/session/key
backup flags, `CRON_SECRET`); deploy `ortis-id`; redeploy the four edge functions; privacy text for the optional
warning email; EAS preview update and a device pass; do not go to production before the logout-after-update fix is
confirmed on a real store update; then set the flags in the order above.

## Wiederherstellungswörter (2026-11-17)

Plan 2 of the sovereign sign-up project (branch `feat/sovsignup-2-recovery-words`, behind the `words` surface, except
the way-back rule below). Twelve BIP-39 words (English list) are a second recovery route next to people. They are a
recovery key, not an instant key: using them starts the same 3-day wait as guardian recovery and the owner can cancel.

**Pool rule.** The words become **5 guardian addresses** (the "pool"), derived at `m/44'/60'/0'/0/i`, i = 0..4. The
app keeps the 5 public addresses (SecureStore `passkey_words_pool_v1`; it is also saved on a restoring phone and
carried to a second phone inside the `wvk` blob) and forgets the words after setup. Only the **first t** pool
addresses are on chain as guardians, where t = the recovery threshold, so the words alone reach the threshold and
nobody else is needed. `splitGuardians(onChain, pool)` separates people from word addresses; the UI shows the words
as ONE entry, never as several people and never as addresses. Adding a person or changing the threshold changes the
number of word guardians in the same op (`planGuardianSet`); the limit is 5 (the person count may not push the
threshold above it). Anyone can confirm a recovery with the words in any wallet tool: sign the recovery approval with
the key at `m/44'/60'/0'/0/i` of the phrase.

**Vault key recipe** (so a third party can decrypt the `_w` blobs from the phrase alone):
1. `ikm` = private key at `m/44'/60'/0'/1/0` of the phrase (change index 1).
2. `vaultKey` = HKDF-SHA256(ikm, salt = utf8 `id.ortis.app/words-vault/v1`, info = empty, 32 bytes).
3. Each secret blob is `pkv1:` + base64url(iv(12) ++ AES-256-GCM(key, iv, secret, aad = utf8(label)) ++ tag(16))
   (`prf-vault.ts`), where `key` = HKDF-SHA256(ikm = `vaultKey`, salt = utf8(label), info = utf8
   `id.ortis.app/passkey-vault/v1`, 32 bytes). The vault key plays the role of the passkey PRF output.
   Labels: `roebel/maci-keypair/v1` (maci), `roebel/nostr-secret/v1` (nostr), `roebel/commitment-salt/v1` (salt).
4. `wvk` is the vault key itself wrapped under the passkey PRF with label `roebel/words-vault-key/v1`; plaintext =
   32 key bytes, optionally followed by the 5 pool addresses (20 bytes each). "Words off" is written as
   `pkv1:words-off-000...0` into `wvk` and every `_w` slot (the backup API has no delete). A setup whose passkey
   has no PRF writes `pkv1:words-nowvk-000...0` into `wvk` instead ("words on, vault key not readable here"): other
   phones read it like off for the vault key, and a phone without the pool refuses to change the words around it.

**Which pool is current.** A phone's own pool counts only while at least one of its addresses is a guardian on
chain; otherwise the server's `wvk` decides. The guardian list reads it without a prompt (session token); a phone
that cannot tell whether unnamed guardians are words shows one entry "Wiederherstellungswörter (nicht geladen)" and
refuses guardian changes until "Angaben laden" on the words screen (one fingerprint) has loaded the pool.

**Derivation paths.** Guardian/approval keys `m/44'/60'/0'/0/i`; vault key source `m/44'/60'/0'/1/0`. The seed runs
once per call (pbkdf2-sha512, 2048 rounds) through `wordsFromSeed`.

**Alert channels.** The recovery-alert cron claims each alert per (wallet, recovery nonce, channel): `email` (needs a
verified warning email) and `push` (`PASSKEY_PUSH_ALERTS_ENABLED=1`; devices from `push_tokens` by the Safe address).
A cancelled recovery moves the nonce, so a second attempt alerts again. A push counts as sent when any device accepted
it; a push that keeps failing is given up after 3 runs per nonce (the email still goes out). Migration
`20261117d_passkey_alert_channels.sql` (not applied) adds the `channel` column and makes it part of the key: **the
code always writes `channel`, so EMAIL alerts fail too (every claim errors) until 20261117d is applied** — apply it
before (or together with) deploying this branch's web code. The in-app banner is unchanged.

**Way-back rule** (`apps/expo/lib/passkey/way-back.ts`; applies as soon as sign-up is open, NOT behind the `words`
surface). Before the citizenship request (`app/verification/request-citizen/form.tsx` and the auto-request in
`app/welcome/consent.tsx`) an independent account needs a way back: `passkey` = at least 1 person OR the words
(`wordsOn`); Google/Apple/email logins and a passkey session on a legacy identity are exempt (`provider`); the
`words` kind (expert account, plan 3) needs a confirmed phrase, an exported backup file (plan 4) or 1 person. No way
back = `WayBackSheet` (fastest option primary: words when the surface is open, else "Vertrauensperson hinzufügen"),
no request. A failed chain read = "Keine Verbindung. Bitte versuche es erneut." and no request (unknown is never
"ok"). In the welcome wizard the screen is replaced afterwards, so it saves the draft and shows the reason as a
snackbar instead of the sheet.

## Expert path: 12 words as the main key (2026-11-17)

Plan 3 of the sovereign sign-up project (branch `feat/sovsignup-3-expert-path`, everything behind the `words`
surface; a flag flip never logs a words session out). An independent account whose ONLY key is 12 BIP-39 words
(English list) — no passkey, no cloud keychain. Not to be confused with the Wiederherstellungswörter above (those
are guardians of a passkey account; these are the owner).

**Setup (fork-proven, `contracts/passkey-accounts/test/EcdsaSafe.t.sol`, vector `ecdsa-safe-vector.json`).** The
account key is the private key at `m/44'/60'/0'/0/0` of the phrase (works in any wallet tool). The Safe is a SafeL2
1.4.1 proxy, `createProxyWithNonce(SafeL2, setup, 0)` with `setup(owners = [account key], threshold 1, to =
SafeModuleSetup, data = enableModules([Safe4337Module, SocialRecoveryModule]), fallbackHandler = Safe4337Module)`,
same modules and factory as the passkey Safe, only the owner differs. Every signature is a plain 65-byte ECDSA
signature (v 27/28) by that key. Address: `predictEcdsaSafeAddress(owner)` (Expo `ecdsa-safe.ts`, web
`safe-address.ts`, both pinned by the vector). Counterfactual until its first op, which deploys it.

**Owner type.** Record (`passkey_migration_v1`) and session (`passkey_session_v1`) carry `ownerType: 'ecdsa'`,
`owner` = the account key's address, `credentialId: ''` and `x = y = WORDS_KEY_PLACEHOLDER` (32 zero bytes). An
expert account has no legacy thirdweb account: identity = the Safe. `users.auth_provider = 'words'`.

**Where the phrase lives.** Only in SecureStore on this device (`phrase-store.ts`): `words_phrase_v1`, written with
`requireAuthentication` (Face ID / fingerprint on every read) and `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (never in iCloud
Keychain, a backup or another device). Never sent, never logged. An unprotected marker
`words_phrase_present_v1` holds only the public address 0 (so checks and app start never prompt), and
`words_phrase_confirmed_v1` says the person proved they wrote the words down (reset on every write / remove). A
biometric change invalidates the item: the person stays signed in and is asked for the words again
(`/settings/my-words?reenter=1`). The unconfirmed words of another account are never overwritten (E4).

**Sponsor proof.** The request body carries `ecdsaOwner` instead of `x, y` (exactly one of the two). Deploy op:
`factoryData` must be the expert Safe deployment for `ecdsaOwner` byte-for-byte and `sender ==
predictEcdsaSafeAddress(ecdsaOwner)`. Deployed: the sovereign shape AND `getOwners() == [ecdsaOwner]`. Both: the
owner has no code or only an EIP-7702 designator (`0xef0100` ++ 20 bytes) — any other code is refused. No `legacy`
with `ecdsaOwner`; `createSigner` is refused; in recovery mode the new owner must be `ecdsaOwner` itself. Same
strictness as the passkey Safe (`apps/web/src/lib/passkey/sponsor-policy.ts`).

**Device-unlock rule.** Every signature (userOp, ERC-1271 message, key backup) reads the phrase once behind the
device unlock (`Bestätige, dass du es bist`) — one prompt per action, never more than the passkey path. Showing the
words and changing recovery settings always need the unlock. Restoring the session at app start never prompts and
never reads the phrase.

**Guardian recovery of an expert account ends in a NEW phrase** (`recovery-flow.ts`, `ownerKind: 'ecdsa'`).
`restore.tsx` reads the wallet's owner: no code or a 7702 designator = expert account (E9; with the `words` surface
closed it is recovered to a passkey instead, which the sponsor also allows). The phone generates new 12 words and
stores them (E4 applies); they are shown and confirmed (no skip) before the guardians' code appears, whose `signer`
is the new address 0 (guardian link and confirm screen unchanged). After the guardians confirmed, this phone's
fresh expert Safe (`predictEcdsaSafeAddress(newOwner)`) sends ONE op `[executeRecovery(wallet, [newOwner], 1)]`
(no createSigner; deploys it), then after the 3-day wait `[finalizeRecovery(wallet)]` — fork-proven in
`EcdsaSafe.t.sol::test_freshExpertSafeRecoversExpertAccount`. `done` saves a words record for the OLD wallet address
(`safe = identity = wallet`, `owner = newOwner`); the session is switched only on the person's tap ("Konto
zurückholen" or "Weiter"), never in the background when another device finalized. "Abbrechen und neu beginnen"
before the words were confirmed deletes them (the guardians never saw their address). The state (signer, fresh
Safe) is persisted BEFORE the words are written, so a kill never leaves words nobody points to; cleanup after a
failed write only removes the NEW words. If the new words are later unreadable (biometrics changed), replaced by
other words or gone, every step asks for the written-down words again (`reenterRecoveryWords`: only words whose
address 0 is this recovery's owner, E4 applies) and goes on. An active 12-word session of another account on this
phone is warned about before the new words replace its words.
- Comes back: the account (same address: citizenship, Münzen, profile, guardians) and its signatures.
- Does NOT come back: the voting key, Nostr key and commitment salt wrapped under the OLD words (open question 4,
  accepted; the screen says „Abstimmungs- und Nachrichtenschlüssel, die mit den alten Wörtern gesichert waren,
  kommen nicht zurück."). The old words stop working the moment `finalizeRecovery` lands.
- Signing in with the new words on another phone finds the OLD Safe (`findSafesByOwner`), not the fresh one.

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

- XMTP: associate the Safe with the inbox **before** the EOA is removed. **Built on `feat/passkey-signin`**
  (`client.addAccount`, "Nachrichten auf Passkey übertragen", [`PASSKEY_SIGNIN_NOTES.md`](PASSKEY_SIGNIN_NOTES.md) §9).
- Route every app write through the Safe → `legacy.execute`, via an account adapter. **Built on `feat/passkey-signin`** (sponsor mode `everyday`, see [`PASSKEY_SIGNIN_NOTES.md`](PASSKEY_SIGNIN_NOTES.md) §3, §8c).
- Verifiers we control (Supabase login, delete-user-account, signed-request, Shamir submissions) accept "Safe signed + `legacy.isAdmin(safe)`". **Built on `feat/passkey-signin`** (Safe-admin envelope, §8a–b; edge functions need a redeploy).
- EOA removal (`isAdmin: 2`). After it, thirdweb has no control and the legacy admin set is frozen. **Built on
  `feat/passkey-signin`**: "thirdweb trennen" behind a live checklist, sponsor mode `detach`, fork proof
  `PasskeyDetach.t.sol` (§8g, §9).
- Signature-derived keys (MACI, Nostr, commitment salt) under a passkey session: PRF-wrapped + server key backup,
  never re-derived. **Built on `feat/passkey-signin`** (§2b, §8f; migration not applied).
- Guardian setup UI, with the attesters who vouched for the citizen as default guardians (library + sponsor policy ready, see above).
- Persistent per-account sponsor budget (today: in-memory, preview-only). **Built on `feat/passkey-signin`** (Supabase RPC, migration not applied, §8d).
- New users: Safe-only onboarding, with no thirdweb account.
- Re-key the Shamir attester share keys, which derive from deterministic thirdweb signatures.
