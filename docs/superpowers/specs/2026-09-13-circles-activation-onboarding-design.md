# Röbel Münzen activation: invite and register every CitizenNFT holder

**Date:** 2026-09-13 · **Status:** approved in chat, awaiting spec review · **Scope:** Expo app + Circles mini-app + one reward-rail action

## Problem

52 wallets hold a CitizenNFTv2, the Röbel Münzen group already trusts all 52, but only 4 are
registered Circles humans. A citizen can only mint Röbel Münzen once they are a human. Becoming
a human requires (1) a registered human to `Hub.trust()` them and (2) the citizen's own wallet
to call `Hub.registerHuman(inviter)`, which burns **96 CRC of the inviter's own raw personal
CRC** and mints the citizen 48 CRC welcome bonus.

Verified state on 2026-09-13 (see memory `project_roebel_group_base_treasury_no_redemption`):

- 4 registered, 8 trusted by `0x1F14` but unregistered, 40 with no human truster at all.
- Every registered wallet holds 0 raw personal CRC: the app's daily mint converts everything to
  Röbel Münzen, and the group's `BaseTreasury` burns group tokens sent to it. **Münzen can never
  be redeemed back into personal CRC.**
- The 8 citizens already trusted would revert on "mitmachen" today (no inviter holds 96).
- Two attester wallets hold **335.5 CRC unclaimed issuance each** (14-day cap, last claim in July);
  a third holds 54. Claimed as raw CRC these fund 6 activations on day one.
- `0x1F14` (Max's personal Gnosis-app account) auto-routes its mint into the "Gnosis" group whose
  `ScoreTreasury` has no redemption; it cannot fund anything unless that is switched off.
- The InviteFarm quota (30) still reverts for thirdweb accounts (`0x57f447ce`, re-verified today).

## Key insight

**Inviting and paying are separable.** `trust()` costs nothing and duplicate trust edges are
harmless. The 96 CRC is burned at registration time from whichever human truster the citizen
names in `registerHuman`. So every sponsor can trust every citizen today, and the citizen's app
picks a truster that holds ≥96 raw CRC at activation time. No coordination between sponsors.

## Decisions (approved by Max)

1. **Funding = hybrid.** Attester wallets sponsor by default; any citizen may opt in via a toggle.
   Nobody pays forward without switching it on. Toggle label: **"Neue Bürger mit einladen"**
   (never "Pate werden").
2. **Activation = one tap, auto-shown.** A bottom sheet with one button; a snackbar afterwards.
3. **Client-orchestrated.** No new backend. Reads via Circles RPC + Gnosis RPC. Push nudges are a
   later slice.
4. **Ordering.** The sponsor reserve in the daily mint ships first, and the two dormant attesters
   must not claim before the OTA is live (their 335 CRC would be locked as Münzen).
5. **Sponsoring earns a referral reward: 24 Röbel Münzen per activated citizen**, paid by the
   funder through the existing reward rail (`reward_config` row `citizen_activation`, editable in
   the admin console). Sponsor nets −72 per citizen; 48 activations need 1,152 Münzen of float.
6. **The invitation page becomes Münzen-native.** `app/rewards/referral.tsx` turns into
   "Bürger einladen": it hosts the sponsor toggle, on-chain invite stats, and the share-code flow
   reworded around Münzen. Points wording disappears from the page.

## Non-goals

- Server-side signing for citizens (impossible: `registerHuman` is `msg.sender`-bound; a thirdweb
  session key would also be able to move Münzen).
- Safe-based Circles identities / InviteFarm quota. Long-term Circles-native path, not this work.
- Push notification "Deine Röbel Münzen sind bereit" (slice 2).
- Web admin changes. The existing `/admin/dashboard/circles` page already shows per-citizen state,
  and the Belohnungen tab already edits `reward_config` rows.
- Changing the `redeem_referral` SQL function (it still awards points to both sides; only the page
  copy stops talking about points).

## Architecture

### 1. Read model: `apps/expo/lib/circles-onboarding.ts` (new)

Pure reads, cached in memory for 5 minutes per address, all through the existing `fetchJson`
timeout wrapper pattern.

```ts
export interface OnboardingSnapshot {
  citizens: string[];            // trustees of the Röbel group (Circles RPC, TrustRelations truster=group)
  registered: Set<string>;       // subset that is a CrcV2_RegisterHuman (Circles RPC, Avatars, FilterType "In")
  fetchedAt: number;
}
export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot>;

/** Human trusters of `addr` with their raw own CRC balance (Hub.balanceOf(t, id(t))). */
export async function getHumanTrusters(addr: string): Promise<{ address: string; rawCrc: bigint }[]>;

/** Pure: highest-balance truster with rawCrc >= 96e18, else null. */
export function pickFundedInviter(trusters: { address: string; rawCrc: bigint }[]): string | null;

export type ActivationStatus = 'not_citizen' | 'not_invited' | 'waiting' | 'ready' | 'registered';
/** Pure: derive the status from (isCitizen, isHuman, trusters). */
export function computeActivationStatus(input: {
  isCitizen: boolean; isHuman: boolean; trusters: { address: string; rawCrc: bigint }[];
}): ActivationStatus;

/** Addresses of the Röbel group's trustees the sponsor does not trust yet and that are unregistered. */
export async function getSponsorTodo(sponsor: string, snap: OnboardingSnapshot): Promise<string[]>;
```

`findInviter` in `lib/roebel-taler.ts` is replaced by `pickFundedInviter(await getHumanTrusters(me))`.
The Circles RPC "In" filter and the group-trustee query were verified live (52 rows).

### 2. Citizen side: activation

**Provider (`context/RoebelTalerProvider.tsx`)**

- New state `activationStatus: ActivationStatus` and `activationChecking: boolean`.
- Computed on mount, on rewards screen focus, and on `AppState` → `active`, throttled to once per
  60 s. Inputs: `hasCitizenNFT` from `VerificationContext`, `isOnboarded(me)`, `getHumanTrusters(me)`.
- `onboard()` becomes `activate()`:
  1. `trusters = await getHumanTrusters(me)` (fresh, not cached: balance must be <60 s old).
  2. `inviter = pickFundedInviter(trusters)`; if null → throw `{ code: 'NOT_FUNDED' }`.
  3. `sendTransaction(prepareOnboard(inviter))`.
  4. Best effort: `sendTransaction(prepareContributeToRoebelTaler(me, personalCrc))` so the 48
     welcome CRC shows as Röbel Münzen immediately. If this fails, the next daily mint converts it.
  5. On revert of step 3 (two citizens raced for the same sponsor): re-run 1–3 once with the
     failed inviter excluded; if still none → `NOT_FUNDED`.
  6. `refresh()`.

**Sheet (`components/rewards/ActivateMuenzenSheet.tsx`, new; uses `BottomDrawer`)**

- Hero coin image, headline **"Röbel Münzen aktivieren"**, body
  **"Du bist eingeladen. Mit einem Tipp aktivierst du dein Konto und bekommst 48 Röbel Münzen
  zum Start."**, primary **"Jetzt aktivieren"**, secondary **"Später"**. No addresses shown.
- While activating: button shows a spinner and "Wird aktiviert…"; the sheet cannot be dismissed.

**Host (`components/rewards/MuenzenActivationHost.tsx`, new; mounted in `app/_layout.tsx` next to
`ConsentGate`)**

- Renders the sheet when `activationStatus === 'ready'` and it has not been dismissed this
  session (in-memory flag) and no other gate (consent, update) is showing.
- On success: `showSnackbar({ message: 'Röbel Münzen aktiviert – 48 Münzen Willkommensbonus' })`.
- On `NOT_FUNDED`: close the sheet, `showSnackbar({ message: 'Gerade nicht möglich – versuch es
  gleich nochmal.' })`, status recomputes to `waiting`.

**Rewards screen (`app/rewards/index.tsx`)**

- The existing "mitmachen"/join CTA calls `activate()` and opens the same sheet for `ready`.
- `waiting`: the CTA area shows a calm inline line **"Deine Einladung wird gerade freigeschaltet –
  schau später nochmal vorbei."** (no sheet, no revert).
- `not_invited`: unchanged (`NotInvitedSheet`).

### 3. Sponsor side: silent fan-out and reserve

**Who is a sponsor.** `hasAttesterNFT` (from `VerificationContext`) OR a local opt-in flag in
AsyncStorage under `muenzen:sponsor:<address>`. Attesters default to on; the toggle is visible to
every registered citizen and switchable by all, attesters included.

**Toggle.** Lives on the invitation page (section 6), not on the Münzen screen. Switch labelled
**"Neue Bürger mit einladen"**, sub-copy **"Pro neuem Bürger werden 96 Münzen von deinem Konto
verwendet – du bekommst 24 Münzen Belohnung."** Only rendered when
`activationStatus === 'registered'`. The Münzen screen keeps its existing banner to the page.

**Fan-out (`useSponsorFanOut` hook, new, called from the host).** On app open and on
`AppState` → `active`, at most once per 6 h per address (AsyncStorage timestamp):

1. Skip unless sponsor && registered.
2. `todo = await getSponsorTodo(me, snapshot)`; skip if empty.
3. `sendBatchTransaction({ account, transactions: todo.slice(0, 20).map(prepareTrust) })`
   (thirdweb 5.105 supports batched userOps; gasless via the Gnosis paymaster). Loop in chunks
   of 20 until done. On batch failure fall back to sequential sends for at most 5, then stop
   silently and retry on the next window. Log with `console.warn('[Münzen] fan-out …')` only.

**Reserve (change in `dailyMint`).** After `personalMint()`, convert personal CRC to Röbel Münzen
**only if** the wallet is not a sponsor **or** the snapshot shows zero unregistered citizens.
Otherwise leave it raw. The displayed balance is already `group + personal`, so the user sees the
same number. Once every citizen is registered, sponsors convert everything again as today.

**Sponsor send path.** `prepareSendRoebelTaler` sends group tokens only. If a sponsor's group
balance is below the amount but personal covers the rest, the send fails today; out of scope,
noted for a later slice ("convert before send").

**History label.** `hooks/useRoebelTalerHistory.ts` reads `V_CrcV2 Transfers`. A transfer of the
wallet's own personal token to the zero address whose value is 96 CRC (±3 % demurrage) is
labelled **"Einladung eines neuen Bürgers"**. Verify during implementation that Hub burns appear in
that view; if not, label from `CrcV2_Burn` events instead.

### 4. Mini-app (Max's personal account, `circles-roebel-mini-app` + `apps/mini-apps/roebel-data`)

- Invite tab: the trust step is no longer capped by `affordable`. "Self-fund invite (N)" becomes
  **"Invite (N)"** and trusts every selected open citizen in one signing (unwrap step kept, it
  only converts wrapped own CRC to raw).
- Copy under the button: "Inviting is free. The 96 CRC is taken at activation time from whichever
  inviter has the balance." The raw balance line becomes info: "Your raw CRC currently funds
  N activations."
- Both copies stay identical. Deployment is manual: `cd circles-roebel-mini-app && npx vercel@latest
  --prod --yes` (Max runs it), and the roebel-data deploy repo per its usual sync.

### 5. Referral reward and the Münzen-native invitation page

**Reward action (`claim-reward` edge function + `reward_config`).**

- New `reward_config` row: `action = 'citizen_activation'`, `amount_atto = 24e18`, `enabled = true`,
  `per_reference = true`, `daily_cap = null`, description
  "Ein:e Bürger:in, die du eingeladen hast, hat ihr Münzen-Konto aktiviert". Applied as a
  migration under `supabase/migrations/` and via the Supabase MCP.
- New verifier in `apps/expo/supabase/functions/claim-reward/index.ts`:
  `citizen_activation(wallet, reference)` queries the Circles RPC
  `CrcV2.RegisterHuman` with `avatar = reference` and checks `inviter === wallet`
  (both lowercased). Verified live: the table exposes an `inviter` column. Because a human has
  exactly one inviter on-chain and the unique index on `reward_claims` covers
  `(wallet, action, reference_id)`, each activation pays at most once, to the inviter only.
- `RewardAction` in `lib/rewards-claim.ts` gains `"citizen_activation"`.
- Funder float: when it is empty the claim is stored `failed` ("insufficient funder float") and
  the client retries on a later open, as today. The admin console's Belohnungen tab shows float
  and claims.

**Auto-claim (`useSponsorRewardClaims` hook, new).** On app open and page focus, for a registered
wallet: fetch `RegisterHuman` rows with `inviter = me` (Circles RPC), diff against a local
"claimed" set in AsyncStorage (`muenzen:sponsor-claims:<address>`), and call
`claimReward(me, 'citizen_activation', invitee)` for each new one. `paid` and `already_claimed`
mark the invitee as done; `failed` leaves it for the next run. Fire-and-forget, no UI blocking.
A paid claim shows the existing reward celebration ("+24 Münzen").

**Page: `app/rewards/referral.tsx` → "Bürger einladen".** Same shell (header, hero, scroll),
new content top to bottom:

1. Hero + title **"Lade Bürger ein, verdiene Münzen"**, subtitle
   **"Jede:r Bürger:in, die über dich ihr Münzen-Konto aktiviert, bringt dir 24 Röbel Münzen."**
2. **Sponsor card** (registered wallets only): the toggle from section 3 plus three steps:
   "Einladen einschalten" → "Ein:e Bürger:in aktiviert das Konto (96 Münzen von dir)" →
   "Du bekommst 24 Münzen". Unregistered wallets see the same card with the copy
   "Aktiviere zuerst dein eigenes Münzen-Konto" and the activation CTA.
3. **Stats**: "Eingeladen" = count of `RegisterHuman` rows with `inviter = me`;
   "Verdient" = `Σ amount_atto` of `reward_claims` where `wallet = me`,
   `action = 'citizen_activation'`, `status = 'paid'`, shown as "N Münzen".
4. **"Von dir eingeladen"** list: invitees as display name + date, resolved with the existing
   `lib/circles-profile.ts` wallet→profile map; fallback label "Bürger:in" (never an address).
   Hidden when empty.
5. **Share section** kept: `ReferralShareCard` with the code/link, retitled
   **"Freunde nach Röbel holen"**, copy: "Teile deinen Code. Wird dein:e Freund:in Bürger:in,
   startet sie mit 48 Münzen – und du wirst automatisch ihr:e Einlader:in." The share message in
   `buildReferralShareMessage` already says Münzen.
6. **Redeem box** kept as is (friend enters a code), success text becomes
   "Code eingelöst! Willkommen bei Röbel." (no "Punkte").
7. **"So funktioniert's"** rewritten to the three sponsor steps; the "200 Punkte / 100 Punkte"
   step is removed. Footer note unchanged.

The deep-link handler (`/r/<code>`, `lib/referral-deeplink.ts`) and `redeem_referral` RPC are
untouched. When a code is redeemed the app still fires the existing `claimReward(referrer,
'referral')`; that action stays as configured today.

### 6. Guard rails

- Never send `registerHuman` without a balance read less than 60 s old that shows ≥96.
- Fan-out only ever trusts addresses from the group-trustee list (citizen-only by construction).
- Duplicate trusts are skipped client-side; if one slips through it is a harmless no-op.
- No raw wallet addresses in any new UI. German copy only; code and comments English.
- Nothing here changes the Circles gate logic (`app_settings`), the auto-invite worker, or the
  group's membership condition.
- The reward verifier trusts only the Circles indexer's `RegisterHuman.inviter`; the client can
  never name itself as inviter for someone else's activation.

## Rollout order

1. Apply the `citizen_activation` reward row and deploy the updated `claim-reward` function
   (Supabase MCP; needs an authenticated interactive session, so Max runs that step).
2. Ship the reserve + toggle + fan-out + activation sheet + invitation page as one OTA.
   **Before that: tell the two dormant attesters not to tap "Heute abholen".**
3. Max trusts the 40 open citizens from the mini-app (free) so nobody is `not_invited`.
4. The dormant attesters claim → 335 raw each → 6 activations become `ready` at once.
5. Steady state: ~1.5 activations/day from attesters, more as citizens opt in. Keep the funder
   float ≥ 24 × expected activations per week (Safe top-up).

Expected: 6 on day one, all 48 in roughly four weeks, faster with opt-ins.

## Testing

- **Unit (written first):** `computeActivationStatus` for all five statuses; `pickFundedInviter`
  (none funded, one funded, highest wins, exactly 96 counts); reserve decision
  (`shouldKeepRaw(isSponsor, unregisteredCount)`); the fan-out todo excludes registered and
  already-trusted addresses; history label matcher for the 96-burn; the sponsor-claims diff
  (new invitee → claim, paid → remembered, failed → retried); the `citizen_activation` verifier
  (inviter match, mismatch, no row) with a mocked Circles RPC.
- **Type check:** judge only the new/changed files (the repo baseline has ~1,235 known errors).
- **Manual (Max):** on his citizen wallet: daily mint keeps raw; fan-out trusts the open citizens
  on the next open; the toggle persists. Then one dormant attester claims and one citizen sees the
  sheet and activates (48 Münzen + snackbar); the attester's next app open pays 24 Münzen and
  the invitation page shows "Eingeladen 1 · Verdient 24 Münzen". Device pass before OTA as per
  the usual gate.

## Open items

- Slice 2: push "Deine Röbel Münzen sind bereit" when a citizen turns `ready` (needs a small
  server cron reading the same snapshot).
- Slice 2: sponsor "convert before send".
- Ops: top up the funder from the Attester Safe as activations ramp (1,152 Münzen for all 48).
- Circles team: trust-only quota path (request already filed in
  `docs/CIRCLES_DEVREL_INVITE_QUOTA_REQUEST.md`).
