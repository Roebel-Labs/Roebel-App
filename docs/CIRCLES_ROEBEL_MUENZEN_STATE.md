# Röbel Münzen (Circles) — Current State & Handoff

> Snapshot 2026-06-19. The town currency went LIVE end-to-end on Circles v2 (Gnosis).
> This is the single source of truth for where things stand. Related memory:
> `project_circles_human_onboarding`, `project_circles_roebeltaler`, `feedback_roebeltaler_copy`.

## TL;DR
The full chain **works in production**: a verified citizen's wallet was invited (trusted) →
registered as a Circles human → minted **48 Röbel Münzen**. Three surfaces ship it (Expo app,
web admin dashboard, a standalone Circles mini-app). Display currency was renamed
**Röbel-Taler → "Röbel Münzen"**. Remaining work is mostly **operational** (InvitationFarm
quota + a Safe governance tx + a service bot), not blocked by code.

## Display name
Currency display name is now **"Röbel Münzen"** (renamed from "Röbel-Taler", 81 strings across
expo/web/mini-app). On-chain **symbol `RCRC` is unchanged** and never shown. Code identifiers
stay `roebeltaler`/`RoebelTaler`/`talerBalance`. ⚠️ **Open naming decision:** "Münzen" collides
with the off-chain **points** term — keep it, switch to singular "Röbel-Münze", or rename points
to "Punkte".

## Key addresses (Gnosis, chain 100)
- Circles Hub v2: `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8`
- **Röbel Münzen group** (BaseGroup, symbol RCRC, std mint policy): `0xAc2CeCdBead594F97358a0d3132454f24F3E470c`
- Group owner = **3-of-5 Attester Safe**: `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa`
- CitizenNFT (Gnosis): `0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4` (`hasCitizenNFT(addr)`)
- InvitationFarm: `0xd28b7C4f148B1F1E190840A1f7A796C5525D8902` (`inviterQuota(addr)→uint256`)
- Circles RPC (queries + balances): `https://rpc.aboutcircles.com/`
- Circles mini-app **host**: `circles.gnosis.io` — sideload any miniapp: `circles.gnosis.io/playground?url=<encoded url>`
- User's personal Metri wallet (the inviter, **passkey Safe**): `0x1f14C82926227d948b9a756Db9aEB77fe51273c3`
- User's thirdweb **citizen** wallet: `0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28` (citizen/attester #1)
- 15 citizens: `contracts/governor-contract/deployments/gnosis.json`

## On-chain state (verified live 2026-06-19)
- `0xC49d…Fb28`: **verified Circles human**, holds **48 Röbel Münzen**. GroupTokenSupply = 48.
- `0x1f14…` self-funded-invited (trusted) **5 citizens** (the 5 attesters: `0xC49d, 0x90F6, 0xf468, 0xD7cA, 0x3B49`)
  on 2026-06-19. Of these, only `0xC49d` has registered; the other 4 are **"Eingeladen"** (trusted, not yet registered).
- `0x1f14` raw personal CRC ≈ 410 after paying one 96-CRC invite (started ~489 raw + had ~460 wrapped earlier).

## Deployed surfaces
1. **Mini-app "Röbel Circles"** — `https://circles-inviter.vercel.app` (Vercel project `circles-inviter`).
   Repo: top-level `/circles-roebel-mini-app` (Vite+React19+TS+Tailwind4; **NOT a pnpm-workspace member** → isolated from web/Expo builds).
   Tabs: **Town** (stats + radial trust graph), **Flow** (transfers), **Network** (towns map), **Invite** (generateInvites + self-fund).
   Deploy: `cd circles-roebel-mini-app && npx vercel --prod --yes`. Runs inside the Circles host iframe (wallet via `@aboutcircles/miniapp-sdk`).
   Registry PR (listing in launcher): **github.com/aboutcircles/CirclesMiniapps#58** — PENDING MERGE.
2. **Web admin dashboard** — `roebel-web` `/admin/dashboard/circles` ("Circles-Verifizierung").
   Per-citizen: CitizenNFT, **Verifiziert / Eingeladen / Nicht verifiziert**, Röbel Münzen, personal CRC (raw/wrapped), group-trust;
   wallets link to the Circles Explorer. Auto-deploys on push to `main`. Reads on load + "Aktualisieren" button (not live).
3. **Expo app** — `apps/expo/app/rewards/index.tsx` (the Röbel Münzen home) + `app/roebel-taler-info.tsx` (DE info screen,
   linked via header "Info"). Daily "Heute abholen" with 3 button states + a midnight-reset cooldown countdown. User rebuilds to see changes.

## How verify/invite actually works (proven)
1. A registered human **inviter** trusts the target address: `Hub.trust(addr, expiry)`.
2. The target calls `Hub.registerHuman(inviter, metadata)` (Expo: "Bei Röbel Münzen mitmachen"; `useRoebelTaler.onboard()` finds the
   inviter on-chain via `findInviter`). Effect: **96 RAW personal CRC burned from the inviter**, **48 welcome bonus** minted to the target.
3. "Heute abholen" (`dailyMint`) = `personalMint()` then `groupMint(group, …)` → converts personal CRC to Röbel Münzen (group token).

**Three invite routes:**
- **Self-fund (no quota)** — what's working: unwrap wrapped personal CRC (`DemurrageCircles.unwrap`) + `Hub.trust`. Bounded by own CRC (~4–5 invites). In the mini-app's Invite tab. Signed inside the Circles host.
- **InviteFarm quota** — `@aboutcircles/sdk-invitations` `InviteFarm.generateInvites(inviter, addrs[])`, on-chain, community-funded.
  Needs quota assigned to the inviter (currently `inviterQuota(0x1f14)=0` — request from Gnosis team). Best for all 15 at once.
- (Referrals / magic links create NEW accounts — not used; our citizens have existing wallets.)

## Hard-won gotchas (don't relearn these)
- **96-CRC invite cost is the inviter's RAW ERC-1155 personal CRC** (`toTokenId(inviter)`), NOT gCRC and NOT wrapped ERC-20. Metri's
  "Personal CRC" can be **wrapped** (a `DemurrageCircles` ERC-20) → shows a balance while raw is ~0. Unwrap before inviting.
- **Passkey Safe (0x1f14) can only sign inside the Circles host** (playground/miniapp via `miniapp-sdk`) — no Node script (no key),
  no WalletConnect (the Gnosis/Metri app only does passkey-QR login + referral links / QR, NOT trust-by-address).
- **Smart contracts CAN be Circles humans** (no EOA check in `registerHuman`); thirdweb default smart account is `ERC1155Holder` so it
  receives personal CRC + the welcome bonus.
- **Citizen-gating today = curated trust-list** (the group trusts exactly the 15). NOT a live CitizenNFT check yet.
- **BaseGroup**: `setMembershipCondition(addr,bool) onlyOwner`; `trustBatchWithConditions(addrs,expiry) onlyOwnerOrService` runs the
  membership conditions. So a condition gates *who can be added* (to live CitizenNFT holders) but adds are still owner/**service**-initiated — there is **no permissionless self-join**.
- **Vercel `roebel-web` build** needs `NODE_OPTIONS=--max-old-space-size=4096` + `eslint.ignoreDuringBuilds` + `typescript.ignoreBuildErrors`
  (the type-check phase OOM-killed the 8GB container). Don't revert these.

## Open items / next steps
1. **InvitationFarm quota** for `0x1f14` (currently 0) — ask the Gnosis Circles team (DevRel: Sandipan). Unblocks one-tap invite of all 15.
2. **Merge PR #58** → mini-app appears in the Circles launcher (until then use the `/playground?url=` link).
3. **Dynamic CitizenNFT gate** (replace the manual trust-list): deploy `CitizenMembershipCondition` (contract exists at
   `contracts/governor-contract/contracts/verification-system/CitizenMembershipCondition.sol`; script `scripts/deploy-citizen-condition.cjs`),
   then `setMembershipCondition(condition,true)` on the group = a **3-of-5 Attester Safe** tx. Makes member-adds credential-gated.
4. **Auto-expansion / "auto-invite every new CitizenNFT holder"** = a **service bot** (set as the group's `service`) that watches new
   CitizenNFT mints and calls `trustBatchWithConditions([newCitizen])`. Also powers a future mini-app "recently joined / open invitations" view.
5. **Naming decision** (Röbel Münzen vs Röbel-Münze vs rename points).
6. **Rebuild the Expo app** to pick up: rename, the 3-state daily button + cooldown, the info screen, and the real weekly chart.
7. **Bigger vision (future):** converge off-chain points → Circles (open lootboxes by spending Röbel Münzen; Circles-native invite
   affiliate). Network-of-towns: more towns get their own group + CitizenNFT, trusting each other (Stage 2 of the netizenlabs essay).

## Useful scripts (repo)
- `scripts/circles/verify-status.ts` — read-only diagnostic of a wallet's Circles verification state.
- `scripts/circles/trust-wallet.ts` — trust a wallet from a KEY-based funded inviter (not the passkey one).
- `scripts/circles/register-roebel-group.ts` — registers a citizen-gated group (reference).
- PR automation (not in repo, were in /tmp): `open-pr.mjs`, `update-pr-entry.mjs` — used the macOS git-keychain token via the GitHub API.
