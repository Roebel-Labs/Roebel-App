# Passkey sign-in — notes for the app and the server

**Status (2026-09-27):** built on `feat/passkey-signin`. Preview-only (`isPasskeyPreviewAllowed()`), **not device-tested**.
Context: [`PASSKEY_ACCOUNTS_STATE.md`](PASSKEY_ACCOUNTS_STATE.md), [`superpowers/specs/2026-09-26-ortis-identity-migration-design.md`](superpowers/specs/2026-09-26-ortis-identity-migration-design.md).

The Expo app can now run entirely on a person's passkey Safe instead of thirdweb. This file is the
contract between the app (`apps/expo/lib/passkey/`) and the verifiers and sponsor policy
(`apps/web`, edge functions).

## 1. How it plugs into thirdweb

- `lib/passkey/thirdweb-adapter.ts` implements `createPasskeyAccount(session, deps)`. It is a thirdweb v5
  `Account` with `address`, `sendTransaction`, `sendBatchTransaction`, `signMessage` and `signTypedData`.
- `passkeyWalletOptions(...)` wraps that account for `createWalletAdapter` from `thirdweb/wallets` (5.119.3). The
  resulting wallet has id **`"adapter"`**.
- `lib/passkey/signin-runtime.ts` provides two helpers:
  - `createPasskeyWallet(session)` builds the wallet.
  - `activatePasskeySession(session, setActiveWallet)` calls `useSetActiveWallet()`'s setter.
- After activation, `useActiveAccount()` returns the adapter account app-wide. Every existing
  `sendTransaction(...)` and `account.signMessage(...)` site runs through the Safe unchanged.
- `switchChain` to anything but Gnosis (100) throws: "Dein unabhängiges Konto funktioniert nur auf der Gnosis
  Chain."
- **Logout:** any existing `useDisconnect()` site ends up in the adapter's `onDisconnect`. That deletes **only**
  `passkey_session_v1`:
  - the passkey itself stays on the device;
  - `passkey_migration_v1` stays;
  - thirdweb's keys stay.
- thirdweb's connection manager writes its own bookkeeping (`thirdweb:active-wallet-id`, `thirdweb:last-used-wallet-id`,
  connected ids = `"adapter"`) when the adapter becomes active. The app never reads those keys: `WalletBootContext`
  calls `inAppWallet.autoConnect` directly, and `ConnectEmbed` has `autoConnect={false}`. They are overwritten by
  the next thirdweb login. The in-app auth session itself is never touched.

### Address = identity

| Person | `account.address` | How it is found |
|---|---|---|
| Migrated (Safe = co-admin of the thirdweb account) | the **legacy** thirdweb account | `AdminUpdated(signer = Safe)` emitters, re-checked with `isAdmin` (`recovery-lookup.findLinkedLegacies`). With several, the one holding CitizenNFTv2 wins. |
| Passkey-only | the **Safe** | no linked legacy |
| After the v3 `moveTo` | the **Safe** | the Safe holds CitizenNFTv3 (only when `EXPO_PUBLIC_PASSKEY_CITIZEN_NFT_V3` is set) |

## 2. Signatures (what verifiers receive)

**What gets signed:**
- `signMessage({ message })` signs `hash = hashMessage(message)` (EIP-191).
- `signTypedData(td)` signs `hash = hashTypedData(td)`.
- **Recipe:** WebAuthn challenge = `safeMessageHash(safe, hash)`. That is the Safe's EIP-712
  `SafeMessage{bytes message = abi.encode(hash)}`, domain `{chainId: 100, verifyingContract: safe}`. The Safe's
  one-owner contract signature is `owner ++ 65 ++ 0x00 ++ len ++ abi.encode(authData, clientDataFields, r, s)`.
- **Proof:** the recipe is fork-proven in `contracts/passkey-accounts/test/GuardianErc1271.t.sol` and reproduced
  byte-for-byte in `__tests__/thirdweb-adapter.test.ts` against `recovery-vector.json`.

| Identity | Returned signature | Verifier rule |
|---|---|---|
| Safe (deployed) | plain Safe contract signature | standard: `client.verifyHash({ address: safe, hash, signature })` on Gnosis (ERC-1271) |
| Safe (counterfactual, before its first on-chain action) | ERC-6492 wrapper: factory `SafeProxyFactory 0x4e1DCf7A…`, calldata `createProxyWithNonce(singleton, initializer, 0)` | standard viem universal verification (ERC-6492) |
| legacy thirdweb account | **Safe-admin envelope** `SAFE_ADMIN_SIGNATURE_MAGIC ++ abi.encode(address safe, bytes safeSignature)`, MAGIC = `keccak256("roebel.safe-admin-signature.v1")` = `0xc147971c4ed41e39ec9a286f1686117a7a3e33a2a5a6bcd0ec1881c11ac60de5` | rule (b) of `apps/web/src/lib/auth/account-signature-core.ts`: `safeSignature` valid for `safe` over the same hash AND `legacy.isAdmin(safe)` on Gnosis |

The legacy thirdweb `Account.isValidSignature` is ECDSA-only, so it can never validate a Safe signature. Every
verifier that authenticates a migrated person therefore needs rule (b). The app's encoder is pinned to the server's
byte layout in `__tests__/thirdweb-adapter.test.ts`.

**Signing prompts.** Every signature and every transaction asks for the fingerprint or face (a WebAuthn assertion).
Restoring a session never prompts.

### 2a. Server endpoints that must accept these signatures

All of them sign an EIP-191 text with `account.signMessage`. They need rule (a) + (b) on Gnosis.

| Endpoint | Verifier today | Message (exact) | When the app signs |
|---|---|---|---|
| Edge fn `org-membership` (`supabase/functions/org-membership/index.ts`) | EOA recover, then viem `verifyMessage` on Gnosis | `roebel-org-v1:${action}:${wallet.toLowerCase()}:${timestampSec}:${sha256Hex(JSON.stringify(sortedPayload))}` | **At sign-up:** `create_account` (personal account) right after the first login of a passkey-only person, which is the first fingerprint after creating the passkey. Afterwards on every org action. |
| Edge fn `merchant-registry` | same scheme | `roebel-merchant-v1:${action}:${wallet}:${ts}:${sha256(sortedPayload)}` | merchant actions |
| Edge fn `delete-user-account` | same scheme | `delete-account:${wallet.toLowerCase()}:${issuedAt}` | account deletion |
| Web `POST /api/connect/onboard`, `/api/connect/session`, `/api/connect/status` (`apps/web/src/lib/signed-request/verify.ts`) | `verifyWalletSignature` (EOA, then viem `verifyMessage`) | `roebel-tickets-v1:${action}:${wallet}:${ts}:${sha256(sortedPayload)}` | Stripe Connect |
| Web `POST /api/chat/session` (`apps/web/src/lib/chat/session.ts`) | `verifyWalletSignature` | `roebel-chat-v1:session:${wallet}:${ts}:${sha256("{}")}` | Mecky chat session |
| Edge fn `nostr-identity-register` | EOA, ERC-1271, thirdweb AccountMessage re-wrap, ERC-6492 | `Netizen Nostr-Binding v1\naccount=<lower addr>\nnpub=<npub>` | Nostr binding |

Not ours to change:
- **Gnosis Pay SIWE** (`lib/gnosispay/auth.ts`, vendor API) will not understand the envelope for a legacy
  identity. For a Safe identity it is plain ERC-1271 (a Safe is a valid SIWE smart account if the vendor supports
  1271).
- **Mini-app `personal_sign` / `eth_signTypedData*` passthrough** (`lib/miniapp-wallet.ts`) returns the envelope
  for a legacy identity. Third-party mini-app servers will not accept it.
- **XMTP** (`lib/xmtp/client.ts`, SCW signer) verifies ERC-1271 **on the identity address**. For a legacy identity
  it fails; per the spec, phase 3 adds the Safe to the inbox before EOA removal. **Do not open DMs on a legacy
  passkey session until that exists.** For a Safe identity it works once the Safe is deployed; a counterfactual
  Safe returns 6492, whose XMTP support is unverified.

### 2b. Deterministic derivations that a passkey cannot reproduce

These derive keys from a signature. WebAuthn signatures are randomized, so with the adapter they produce a
different key every time.

| Where | Message | Effect with the adapter |
|---|---|---|
| `context/MaciContext.tsx:325` | `"Röbel Bürgerumfrage – Abstimmungsschlüssel v1"` → MACI keypair | An existing SecureStore key is kept (shim). On a fresh device the key is random-per-signature: fine for a first signUp, but not reproducible on another device. Spec: move to random keys wrapped under the passkey PRF. |
| `lib/nostr/identity.ts:73` | `"Netizen Nostr-Identität v1"` | same (the existing key is reused) |
| `lib/citizen-commitment.ts:89` | EIP-712 `CommitmentSalt` (chainId 100) | the salt is not reproducible; the preimage is cached in SecureStore |
| `lib/encryption.ts:85` | EIP-712 `KeyDerivation`, **chainId 8453** | **refused** by the adapter (wrong chain, German error), so evidence is never encrypted to a key that can't be re-derived |

## 3. Transactions and the sponsor allowlist

Every write is one sponsored userOp from the Safe (`sendPasskeyUserOp` → `POST /api/passkey/sponsor`):
- **Legacy identity:** each call becomes `legacy.execute(to, value, data)` (selector `0xb61d27f6`), and the body
  names `legacy`.
- **Safe identity:** the call goes to the target directly, with no `legacy`.
- **Batches** (`sendBatchTransaction`): several such calls in one op through MultiSendCallOnly `0x9641d764…`
  (DELEGATECALL).
- **Value:** the app sends `value` through, and `SponsoredCall.value` is new. The server's everyday mode requires
  value 0.

All on Gnosis (100). Selectors computed with viem `toFunctionSelector`.

| Contract | Address | Function | Selector | App call site |
|---|---|---|---|---|
| MACI core | `0x6663eDC8650276fe264710B1A2ba46eB8bd0bF1D` | `signUp((uint256,uint256),bytes,bytes)` | `0x3364120a` | `components/VoteButtons.tsx:352` |
| MACI Poll (per proposal) | `MACI.polls(pollId)` | `publishMessage((uint256[10]),(uint256,uint256))` | `0x27bea0da` | `components/VoteButtons.tsx:567` |
| Circles v2 Hub | `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8` | `personalMint()` | `0x0d873a79` | `lib/roebel-taler.ts:538` (via `RoebelTalerProvider`) |
| Circles v2 Hub | same | `groupMint(address,address[],uint256[],bytes)`, group `0xAc2CeCdBead594F97358a0d3132454f24F3E470c` | `0x6cb498e5` | `lib/roebel-taler.ts:582` |
| Circles v2 Hub | same | `registerHuman(address,bytes32)` | `0xe76cec53` | `lib/roebel-taler.ts:551` (rewards, event pages) |
| Circles v2 Hub (ERC-1155) | same, id = uint256(group) | `safeTransferFrom(address,address,uint256,uint256,bytes)` | `0xf242432a` | `lib/roebel-taler.ts:591`, `lib/lootbox-muenzen.ts:35` (to = `spend-muenzen` funder) |
| Circles v2 Hub | same | `trust(address,uint96)` | `0x75dcebc7` | `lib/roebel-taler.ts:568` (dormant, no caller) |
| Circles NameRegistry | `0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474` | `updateMetadataDigest(bytes32)` | `0x3857d9d7` | `hooks/useCirclesProfileSync.ts:86,107` |
| CitizenNFTv2 | `0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5` | `createAttestationRequest(string)` | `0xda5f81d7` | `hooks/useVerification.ts:92` |
| AttesterNFTv2 | `0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82` | `createAttestationRequest(string)` | `0xda5f81d7` | `hooks/useVerification.ts:168` |
| Citizen / Attester NFT | either | `createRevocationRequest(address,string)` | `0xdfa59e4a` | `hooks/useVerification.ts:260` |
| CitizenNFTv2 | `0x59aA…5dE5` | `approveRequest(uint256,bool)` / `rejectRequest(uint256,bool)` | `0x767e0b9c` / `0x1effb912` | `hooks/useVerification.ts:332,401` |
| AttesterNFTv2 | `0xC587…db82` | `approveRequest(uint256)` / `rejectRequest(uint256)` | `0xd7d1bbdb` / `0x2d7788db` | `hooks/useVerification.ts:339,407` |
| MaciAttesterGovernor | `0x5F5e499Dc1872c2Ce19a4b50cd10f680e78E3Ba3` | `castVote(uint256,uint8)` | `0x56781388` | `components/VoteButtonsEnhanced.tsx:80` (**dead code**, nothing imports it) |
| Deliberate | `0xB208C359A206A0C35a7D4D99DEf63d9F6143de9B` | `join`, `addArgument`, `stakePro`/`stakeCon`, `tallyTree`, `createDebate` | `0x049878f3`, `0xd79083bc`, `0x87cb96f4`/`0x38ac4721`, `0x6700c92e`, `0x8ee9f901` | `lib/deliberate/chain.ts` (**dormant**) |

Writes the sponsor will (correctly) refuse, and what the person sees:
- `app/wallet.tsx:176` **native xDAI send** to any address (value > 0).
- `lib/miniapp-wallet.ts:218` **mini-app `eth_sendTransaction`** (arbitrary target and value).
- `lib/xmtp/client.ts:144` "deploy by self-transfer": value 0, no data, to the identity itself. For a legacy identity
  it becomes `legacy.execute(legacy, 0, 0x)`; for a Safe identity it is a call to self. Only needed for an
  undeployed thirdweb account; a Safe is deployed by its first sponsored op.
- `app/wallet.tsx:184` **USDC transfer on Base** is refused by the adapter itself (chain 8453 → German error).

## 4. Sign-in / sign-up

UI: `components/passkey/PasskeySignInOption.tsx`, first in `LoginDrawer`, rendered only when
`isPasskeyPreviewAllowed()`.
- **Title:** "Unabhängiges Konto".
- **Subtext:** "Mit Passkey · Fingerabdruck oder Gesicht, ohne E-Mail. Nur du hast den Schlüssel."
- **Tapping** reveals "Mit Passkey anmelden" and "Neues unabhängiges Konto erstellen".
- The thirdweb `ConnectEmbed` below it is unchanged.

**Sign in:**
1. Discoverable `Passkey.get` (no `allowCredentials`, rpId `id.ortis.app`, UV required).
2. Credential → key:
   - If `passkey_migration_v1` or `passkey_session_v1` on this device has that credential id, use its
     x, y, Safe and owner.
   - Otherwise, **P-256 public-key recovery** from the signature (`lib/passkey/p256-recover.ts`, pure bigint;
     tested against both fork vectors and node-generated keys). It gives 2 candidates, and the one whose
     predicted Safe is known wins. "Known" means any of:
     - it has code;
     - it is an admin of a legacy account;
     - a `users` row exists for it.
   - If neither is known (a counterfactual account on a second device), one more assertion with that credential
     is taken; the intersection of both candidate sets is the key.
3. Safe → identity (table in §1).
4. Save `passkey_session_v1` and write `passkey_migration_v1` if the device has none (never overwritten).
5. Activate the adapter wallet.

**Sign up:**
1. `ensureStandalonePasskey`: `createPasskey`, then the counterfactual Safe (SharedSigner + Safe4337Module +
   SocialRecoveryModule enabled at setup).
2. The identity is the Safe.
3. On first login, `UserContext` inserts the `users` row (`wallet_address` = Safe, `auth_provider = 'passkey'`)
   and calls `createPersonalAccount`, which signs `org-membership create_account`. That is 6492 while the Safe is
   counterfactual, so the org-membership verifier needs rule (a) with ERC-6492.
4. Onboarding (`/welcome`, name step) follows as for thirdweb users.

If this device already holds an unfinished migration record, sign-up refuses rather than turning it into a
Safe-only account.

**Settings → Passkey → ANMELDUNG:** "Mit Passkey anmelden" (`PasskeySessionSwitch`) for people whose handover is
done.
- It switches the app session to the adapter without a prompt. The record has x, y and the Safe; the identity is
  re-resolved on chain.
- The thirdweb login is **not** signed out and stays an admin until the later "thirdweb trennen" step. That step is
  not built, and nothing here builds an `isAdmin: 2` request.

### userHandle — deviation from the brief

The brief asked for `userHandle = Safe address` at creation. That is impossible: the Safe address derives from the
public key, and the key only exists after the authenticator created the credential. WebAuthn cannot update
`user.id` afterwards. `createPasskey` is therefore **unchanged** (random 16-byte `user.id`), and sign-in on a
device without the record uses public-key recovery instead (above).

## 5. Boot / restore (`lib/passkey/boot.ts`, `context/WalletBootContext.tsx`)

1. `passkeyChannelAllowed()` is synchronous, with no network and no storage. It is false on the `production`
   channel, and false in release builds without a channel. **Production therefore skips step 2 entirely and boots
   exactly as before.**
2. If a `passkey_session_v1` exists, activate the adapter wallet (no biometric prompt) and stop.
3. Otherwise, or if step 2 throws, run the **unchanged** thirdweb loop (`wallet.autoConnect({ client })` per
   `wallets`, then `setActiveWallet`).
4. The `app_settings.passkey_accounts_enabled` flag is deliberately not checked at boot. Turning the flag off hides
   the sign-in option but never signs out someone already on a passkey session.

`UserContext`: an `adapter` wallet reports `auth_provider = 'passkey'`. `upsertUser` only writes it on rows without
a provider, so migrated accounts keep theirs. The optimistic cached-user hydration is untouched.

## 6. Needs a device test (preview build with `webcredentials:id.ortis.app`)

1. **Discoverable `Passkey.get`** on iOS and Android:
   - Does the sheet list the `id.ortis.app` passkeys?
   - Is `userHandle` returned?
   - Is the signature DER (as `parseDerSignature` expects)?
2. **Sign in as Max** with no local record. Legacy `0xc49dE63C…`, Safe `0xe3d18fec…` → identity must be the legacy
   account, and the feed, profile and Münzen balance must match the thirdweb session.
3. **Sign up** a fresh passkey-only account:
   - `users` row with `auth_provider = 'passkey'`;
   - `create_account` accepted by `org-membership` (6492);
   - welcome and name flow.
4. **One everyday write per identity:**
   - legacy: `personalMint` / Münzen send;
   - Safe: `createAttestationRequest`.
   Check the op passes the sponsor's everyday mode and the fingerprint prompt appears once.
5. **Logout** from settings/profile:
   - `passkey_session_v1` is gone;
   - a thirdweb session stored on the same device comes back on the next cold start;
   - the passkey still signs in.
6. **Surprise prompts at login.** Contexts that sign automatically (MACI key, Nostr, XMTP, chat session) would
   each trigger a biometric prompt. Watch for prompts on app start.
7. **Production channel smoke test.** The Anmelden sheet must look as before, and a thirdweb login must still
   auto-restore.

## 7. Known gaps

- A Safe recovered to a new key (owner = per-key signer) can only sign in on the device that ran the recovery (it
  has the record). Discoverable sign-in elsewhere assumes the SharedSigner Safe for the recovered key. Resolving
  "signer → Safe" (Safe `AddedOwner` logs) is not built.
- The settings migration screen still assumes a thirdweb login for its own "Passkey einrichten" flow. For a
  passkey-only person it shows its existing error.
- Circles for a passkey-only (Safe) identity: registration and invite flows were built for thirdweb accounts (see
  `docs/CIRCLES_ROEBEL_MUENZEN_STATE.md`).

## 8. Server side (web + edge, built 2026-09-27, not deployed)

### 8a. Signature rule (`apps/web/src/lib/auth/account-signature-core.ts`)

One dependency-free module, byte-identical copy at `apps/expo/supabase/functions/_shared/verify-account-signature.ts`
(a web test fails if they differ). `verifyAccountSignature({ address, message | typedData | hash, signature })` on
Gnosis is true when:

- **(a)** viem universal verification passes for `address` (`client.verifyHash`: EOA, ERC-1271, ERC-6492). For a
  non-envelope signature this is exactly the call every verifier made before, so all existing signatures still pass.
- **(b)** the signature is a **Safe-admin envelope** and the inner signature is valid for `safe` (`client.verifyHash`,
  so a counterfactual Safe's 6492 wrapper works too) AND (`safe == address` OR `ILegacyAccount(address).isAdmin(safe)`).
- **(c)** a 65-byte signature (or the inner one of a 6492 wrapper) recovers under the thirdweb `Account` domain
  `("Account", "1", chainId, address)`, `AccountMessage{message: hash}`, for **chainId 100 or 8453**, to a current
  admin (`isAdmin` on Gnosis). Covers signatures the app made with the Base chainId before 2026-07-27.

**Envelope bytes (strict):**

```
0xc147971c4ed41e39ec9a286f1686117a7a3e33a2a5a6bcd0ec1881c11ac60de5   // keccak256("roebel.safe-admin-signature.v1")
++ abi.encode(address safe, bytes safeSignature)                      // head: safe word, offset 0x40, len, data, zero padding
```

The decoder refuses a wrong offset, non-zero padding, trailing bytes, dirty address words and an empty inner
signature. An envelope is only ever checked by (b). `encodeSafeAdminSignature(safe, sig)` in the core is the
reference encoder. `address` is lowercased first, so a bad EIP-55 checksum is not an error.

Errors: RPC transport failures **throw** (each caller keeps its own mapping: 503 / 400 / false). A revert or "no
contract" on `isAdmin` is `false`.

### 8b. Verifiers switched to the rule (only the smart-account call changed; EOA fast paths untouched)

| Where | Before | Callers |
|---|---|---|
| web `lib/signed-request/signature.ts` `verifyWalletSignature` | `gnosisClient.verifyMessage` | tickets (`/api/tickets/*`), Stripe Connect (`/api/connect/*`), chat session (`/api/chat/session`) |
| web `lib/shamir/signature-verification.ts` `verifyWalletSignature` | ethers raw `isValidSignature` (no 6492, `getCode` shortcut) | `/api/coordinator/share-keys`, `key-generations`, `key-generations/[id]/proposal`, `key-generations/[id]/executed`, `sessions`. Errors still = false. Now also accepts 6492 and (b)/(c). |
| edge `org-membership` | `gnosisClient.verifyMessage` | all org actions incl. `create_account` at sign-up |
| edge `merchant-registry` | `gnosisClient.verifyMessage` | merchant actions |
| edge `delete-user-account` | `gnosisClient.verifyMessage` (throw still = 400) | account deletion |
| edge `nostr-identity-register` | `chainClient.verifyMessage` (its `diagnoseSignature` fallbacks stay) | Nostr binding |

Not changed: `lib/passkey/email-verifier.ts` (the Safe proves itself, (a) already covers it), the sponsor policy's
handover check (on-chain semantics), `lib/shamir/tally-session.ts` (runs in the browser), `apps/roebel-id` SIWE
(`src/lib/gnosis.ts`, Fly `ortis-id`), `apps/coordinator` reconstructor (Fly), `packages/relay-sync` (already has
(c); no (b)). Those are follow-ups if passkey sessions must reach them.

### 8c. Sponsor mode `everyday` (`apps/web/src/lib/passkey/everyday-allowlist.ts` + `sponsor-policy.ts`)

- **Legacy identity:** body names `legacy`; calls are `legacy.execute(to, 0, data)` / `executeBatch` (single or via
  MultiSendCallOnly). The sender must already be an admin (`isAdmin(legacy, sender)`), `legacy` must carry the
  thirdweb proxy code and hold CitizenNFTv2 (or v3). A direct call from the Safe while `legacy` is named is refused
  (wrong `msg.sender`).
- **Safe identity:** no `legacy`; direct calls. Citizen Safe: every allowlisted action. **Non-citizen Safe
  (onboarding tier):** only `CitizenNFTv2.createAttestationRequest(string)`, budget
  `PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI` (default 0.002 xDAI/day per Safe, never above the normal cap). A deploy op
  (factory + factoryData) may carry it.
- **Allowlist** = the table in §3 minus the dead/dormant rows, with argument rules: `groupMint` only into the Röbel
  group; `safeTransferFrom` only `from == identity` and `id == uint256(RöbelGroup)`; value 0 everywhere.
  `registerHuman` and `trust` are citizen-tier. Not sponsored: native sends, mini-app transactions, governor
  `propose*`/`queue`/`execute` (~15.7M gas), `castVote` (dead), Deliberate (dormant), `publishMessageBatch`, the
  XMTP self-call.
- **Votes:** a `publishMessage` call needs **`pollId` in the request body** (0x hex quantity, the first field of
  `governor.proposalPolls(proposalId)`); the server checks `MACI.polls(pollId) == target`. One poll per op.
- **Tightened:** `legacy.execute` in the migration mode no longer sponsors arbitrary inner calls; allowed inner calls
  are add-sender permission, v3 `moveTo`, `SRM.confirmRecovery`, and everyday actions.
- Everyday calls ride along with migration/guardian shapes (the mode then stays `legacy` / `safe`) but never with
  recovery calls.

### 8d. Persistent budget

`PASSKEY_SPONSOR_BUDGET_STORE=supabase` switches to `SupabaseSponsorBudget`: one RPC `passkey_sponsor_reserve(key,
cost, key_cap, global_cap)` (security definer, `search_path = ''`, EXECUTE revoked from public/anon/authenticated)
that row-locks the UTC day's `global` row and the identity row, checks both caps and adds the cost atomically.
Table `passkey_sponsor_budget` (RLS on, no policies, grants revoked). Migration
`supabase/migrations/20260927_passkey_sponsor_budget.sql`, **not applied** (checked in PGlite: caps, grants, key
validation). Unset or missing Supabase env = the old in-memory budget.

### 8e. Gates for Max

1. Apply `supabase/migrations/20260927_passkey_sponsor_budget.sql`, then set `PASSKEY_SPONSOR_BUDGET_STORE=supabase`
   on the Vercel **Preview** env (needs `SUPABASE_SERVICE_ROLE_KEY` there). Optional
   `PASSKEY_SPONSOR_ONBOARDING_DAILY_WEI`.
2. Redeploy the edge functions `org-membership`, `merchant-registry`, `delete-user-account`,
   `nostr-identity-register` (they now import `_shared/verify-account-signature.ts`). Until then passkey sessions
   on a legacy identity fail there with a bad-signature error; thirdweb users are unaffected either way.
3. The web verifiers ship with the Vercel preview of this branch; production only after a merge.
