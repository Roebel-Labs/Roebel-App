# Ortis identity migration — design

**Status:** DRAFT 2026-09-26, based on Max's decisions in chat. Builds on
[`2026-09-26-passkey-sovereign-accounts-design.md`](2026-09-26-passkey-sovereign-accounts-design.md) (tranche 1, built).
**Branch:** `feat/passkey-accounts`. Nothing merges to `main` without Max's explicit go.

## Decisions (Max, 2026-09-26)

| # | Decision |
|---|---|
| D1 | Passkeys belong to **`id.ortis.app`**, the neutral identity domain shared by every community, not `roebel.app`. |
| D2 | **Check whether CitizenNFTv2/AttesterNFTv2 can be reused**, then build v3 where they can't. |
| D3 | **Circles migrates last.** Until then the legacy thirdweb account stays as a Circles vault operated by the Safe. |
| D4 | **Default guardians = the vouching attesters + one family member.** More family members can be added at any time. |
| D5 | **A new Attester multisig Safe** (Max creates it). |
| D6 | **Optional email** for users who want it. |
| D7 | **Dedicated preview paymaster** on Gnosis, separate from the Netizen production signer. |

## Hard constraint: production keeps working

The Röbel app is **live**. Max will ship one more EAS build when this is done, and App Store review adds lead time. Rules:

- Every new surface is off by default: `app_settings` flag **and** channel ≠ production.
- The thirdweb login keeps working for every existing user until that user has fully migrated. Removing thirdweb happens per user and is opt-in; it is never a global switch.
- Native changes that ship inert in the next build are allowed: `webcredentials:id.ortis.app`, and the native passkey module, which is already in the build. Everything else must be OTA-able, so later phases need no second store review.
- Before merging: smoke-test the production channel on an emulator (login, feed, DMs, vote, Münzen), paying special attention to the pnpm-lock churn around thirdweb.
- **Ortis rebrand (in a few months):** keep the bundle ID `com.maxbrych.roebelonchain` and passkeys keep working untouched. A new bundle ID only needs one more entry in the `id.ortis.app` AASA/assetlinks files, and no user has to re-create a passkey. This is the payoff of D1.

## Target model

- **Person = one passkey Safe** (Safe 1.4.1 + Safe4337Module + WebAuthn signer). The same address on every chain, and the address survives recovery. It is the global Ortis identity.
- **Community = membership:** that community's CitizenNFT (plus AttesterNFT) on the Safe. Röbel is tenant #1. Other communities come in through CommunityRegistry + factory.
- **Legacy thirdweb account = temporary vault** for Circles and any leftovers, controlled by the Safe (tranche 1 handover).
- **Proof of linkage old→new is on-chain:** `legacyAccount.isAdmin(safe) == true`. Every migration script reads that proof; there is no operator-maintained mapping.

## UX (everyday people, "grandma test")

- **Sign-up:** "Konto erstellen" → first name → fingerprint/Face ID → done.
  - No email, no seed phrase, and the word "wallet" never appears.
  - The Safe is counterfactual; it is deployed, sponsored, on the first on-chain action.
- **Sign-in:** "Mit Fingerabdruck anmelden".
  - The passkey syncs via iCloud Keychain / Google Password Manager.
  - iOS 16+ and Android 9+ (with Google Play Services + screen lock).
  - Devices without synced passkeys (Huawei without Google services, very old Android) get a device-bound passkey plus a nudge to set up guardians.
- **Prompts:** the fingerprint is asked for on-chain actions only (vote, send Röbel Münzen, guardian changes), like a banking app. Posts, likes and chat run on the app session.
- **Citizenship stays in person:** the attester scans the citizen's QR code and confirms with their own fingerprint.
- **Optional email (D6):** a profile field, verified by a one-time code.
  - **Used for:** recovery alerts ("Jemand stellt dein Konto wieder her — nicht du? Hier abbrechen"). This matters because the 3-day cancel window only protects people who find out. Also newsletter/notifications, if opted in.
  - **Not used for:** login or custody. Email is never a key.
  - **Later option:** an email-based guardian via ZK Email recovery. It is trust-minimized, but only after its audit and Gnosis deployment are verified.

## Backup and recovery (D4)

1. **Synced passkey:** new phone + the same Apple/Google account → the passkey is simply there.
2. **Guardians (Candide SocialRecoveryModule, 3-day delay, the owner can cancel):**
   - **Default set:** the attesters who vouched + one family member. Threshold 2.
   - **Adding family members:** any time, with one fingerprint (`addGuardianWithThreshold`).
   - **A family member needs an Ortis account** (free, counterfactual) but **not** citizenship.
   - **Confirmation UX:** a guardian signs a recovery approval (EIP-712, ERC-1271 through their passkey Safe). The recovering person's new device collects the approvals and one sponsored transaction submits `multiConfirmRecovery` + `executeRecovery`. Guardians never need gas or an on-chain transaction.
   - **Sponsor policy change needed:** allow `multiConfirmRecovery`/`executeRecovery`/`finalizeRecovery` for a Safe whose guardians include at least one Röbel citizen, instead of requiring the caller to be a citizen, so non-citizen family members are covered.
   - **Collusion guard:** the default set always includes a non-attester (family). The delay + email/push alerts are mandatory.
3. **Optional second owner:** a family member's tablet or a hardware security key as a second passkey owner (1-of-2).
4. **Client prerequisite (review L4):** persist the Safe address + owner type. After recovery the owner is a per-key signer proxy, and the address is no longer derivable from the new key.

## What migrates (phases)

| Phase | Scope |
|---|---|
| **0** | D1 (rpId `id.ortis.app` + AASA/assetlinks served by the id.ortis.app issuer) · D7 preview paymaster · preview device test of tranche 1 |
| **1** | Passkey sign-up for new users (Safe-only, no thirdweb) · handover for existing citizens (on-chain link) · guardian setup UI · optional email |
| **2** | New Attester Safe (D5; owners = the attesters' passkey Safes, e.g. 3-of-5, with its own signing screen in the admin dashboard) · NFTs per D2 · new SignUpTokenGatekeeper + MACI + Governor + Timelock · a new Shamir ceremony (today's share keys derive from thirdweb signatures) · ownership moves from `0x3A08…` to the new Safe (Circles group, both paymasters, treasury Safe, CommunityRegistry record, hard-coded server attester address) |
| **3** | The app switches to the Safe as identity. Supabase wallet-keyed rows get an old→new mapping, then a rewrite. XMTP adds the Safe to the existing inbox **before** EOA removal. Nostr re-bind, org memberships (coordinate with `feat/org-safe-protocol`), mini-app wallets, merchant, Gnosis Pay. Verifiers we control accept Safe signatures. Then per-user EOA removal. |
| **4** | Circles: the old avatar invites its own new Safe (burns 96 of its own personal CRC, so no outside inviter is needed). Then transfer Münzen + CRC, stop the old avatar, and the group re-trusts in a batch. **Verify first:** per-citizen personal CRC ≥ 96 and the exact v2 `registerHuman` rules. |
| **5** | Open protocol: "Connect with Ortis" (EIP-1193/EIP-6963 provider backed by an `id.ortis.app` popup / Ortis app via WalletConnect, plus OIDC for web2), scoped session keys for third-party and AI clients (per-app limits, one fingerprint to grant, revocable), builder SDK + docs, multi-tenant Ortis. |

## Open protocol: why other clients can't just use the passkey (and why that's good)

A passkey only works for apps associated with `id.ortis.app`, and that is exactly what makes it phishing-proof. A third-party or AI-generated client reaches the same identity through (a) the Ortis wallet flow, where the user sees and confirms each request, or (b) a scoped session key the user granted. The passkey never leaves the user's device. The data layer stays open: governance on-chain, public record on Nostr, DMs on XMTP, Röbel MCP.

## Open items

- **D2 verdict:** pending (research running 2026-09-26).
- **Pimlico's minimum paymaster stake on Gnosis is unknown.** The preview paymaster is planned with 0.05 xDAI stake. If Pimlico needs more: `addStake` via the owner Safe, or self-bundle through a relayer (as the Netizen demo does).
- **Persistent sponsor budget** (production gate).
- **Backup of the PRF-wrapped secrets** + a restore path (production gate).
