# Onboarding-Rollen + echte Münzen für Gäste — Design

**Date:** 2026-07-05
**Scope:** apps/expo only (no web changes, no contract changes, no DB migration)
**Context:** Sommer-Camp-Hackathon (Jul 10–17) brings devs/students into the app who
will never hold a CitizenNFT. Their profile currently shows off-chain gamification
points labeled with the Münzen coin icon ("140 Münzen") — dishonest, since they can
never mint real Röbel Münzen today. Separately, onboarding only knows Bürger/Tourist,
and people who live outside Röbel but run a company/Verein in Röbel have no path.

## Goals

1. Third onboarding role **Organisation** that funnels into the existing `/create-org`
   wizard; rename **Tourist:in → Besucher:in** (UI only).
2. **Bürger path**: collect citizen-verification data during onboarding (with DSGVO
   micro-labels) and auto-submit the verification request — no double data entry.
3. **Honest, real Münzen for non-citizens**: unified on-chain balance, guest
   `personalMint`, invite path surfaced (hackathon trust + Metri referral link),
   off-chain points relabeled **Punkte**.
4. **Besucher → Organisation upgrade path** via profile CTA.

## Non-goals (explicit)

- In-app invite *issuing* by citizens (invite quota is an operational problem;
  DevRel request pending — see `docs/CIRCLES_DEVREL_INVITE_QUOTA_REQUEST.md`).
- Lootbox/Schatzkammer mechanics, converting existing Punkte into Münzen.
- Any web-app or contract change. No Supabase migration (`users.preferred_role`
  is plain text, no CHECK constraint).

## 1. Welcome wizard: three roles

File: `apps/expo/app/welcome/role.tsx`, context `context/WelcomeWizardContext.tsx`.

| Card | Desc | Illustration | `preferred_role` |
|---|---|---|---|
| Bürger:in | „Ich wohne in Röbel." | `onboarding/buerger.png` (unchanged) | `buerger` |
| Besucher:in | „Ich besuche Röbel." | `onboarding/suitcase.png` (unchanged) | `tourist` (value unchanged — no data break) |
| Organisation | „Ich führe ein Unternehmen oder einen Verein in Röbel." | `illustration/small/services.png` | `organisation` (new) |

- `PreferredRole` union gains `'organisation'`; `updateUserOnboarding` /
  `lib/supabase-users.ts` typing widened. DB value `'organisation'` chosen over
  `'unternehmen'` to avoid collision with `OrgSubType 'unternehmen'`.
- Step count becomes dynamic: Besucher/Organisation = 3 steps (name → role →
  consent), Bürger = 4 (name → role → **citizen-data** → consent). `StoryProgress`
  props derive from role.
- **Rename Tourist → Besucher** in all user-facing strings: profile pill labels,
  `RoleBadge`/`TierBadge`, `TIER_LABELS`, empty states, role card. Code
  identifiers and DB values stay `tourist`.

## 2. Bürger path: verification data in onboarding

New screen `apps/expo/app/welcome/citizen-data.tsx` (step 3, Bürger only):

- Fields identical to `verification/request-citizen/form.tsx`: Vorname, Nachname,
  Geburtsdatum (native date picker), Adresse.
- Each field gets a DSGVO micro-label explaining purpose, e.g. „Nur zur
  Wohnsitz-Prüfung durch die Vertrauenspersonen. Verschlüsselt übertragen." Exact
  copy must be verified against what `buildCitizenCommitment` actually
  stores/uploads so labels are truthful (commitment vs. plaintext).
- **„Später ausfüllen"** link skips the step → current behavior (profile
  `BuergerWerdenBanner` → manual request) remains the fallback.
- Wizard context stores the identity fields.

Consent screen (`welcome/consent.tsx`) on „Akzeptieren":

1. Existing flow runs first (consent write, `updateUserOnboarding`, retries).
2. If `preferredRole === 'buerger'` and identity data complete → call
   `useCreateCitizenRequest().createRequest(identity, reason)` from the consent
   screen (gasless on-chain `createAttestationRequest` + commitment evidence
   upload), passing the same `DEFAULT_REASON` constant the request form uses. The
   wizard only runs post-login, so the smart account is available.
3. **Never blocks onboarding**: on failure, save the identity fields as a local
   draft (AsyncStorage) so `request-citizen/form.tsx` prefills later, show a
   snackbar pointing to the profile banner, and finish onboarding normally.
4. On success, profile lands in the existing "Antrag läuft" state
   (`isAspiringCitizen` branch).

## 3. Organisation path

- After consent completes, `preferred_role === 'organisation'` →
  `router.replace('/create-org')` (existing wizard: type → info → location →
  contact → photos → review). Personal account already exists (created at login),
  matching the "personal account first, then org onboarding" flow.
- Exiting create-org early is safe: profile shows an „Organisation erstellen"
  resume CTA (see §5).
- **Already works, verified — no unlock needed**: org accounts pass `PostingGate`
  ("Citizens and org accounts pass"), `submit-event` has no tier gate, member
  invites (`inviteOwner` / `account_members`) work and members can be citizens.

## 4. Real Münzen for non-citizens

Root cause of the fake number: `CoinsCard.tsx` / `TouristActionRow.tsx` render
off-chain `roebel_points_card.points_balance` (`useRewards().coins`) with the
Münzen coin icon for non-citizens.

Changes in `context/RoebelTalerProvider.tsx`:

- **Unified balance**: `balanceRaw` = group RCRC (`getRoebelTalerBalance`) +
  personal CRC (`getPersonalCrcBalance`) summed during `reconcile()`. Citizens:
  identical to today (personal is swept into group each mint). Guests: shows their
  real personal balance, including group Münzen received from citizens (plain
  ERC1155 transfers need no trust).
- **Membership-aware `dailyMint()`**: reconcile additionally reads on-chain
  whether the Röbel group trusts the address (trust-relations query, same pattern
  as `findInviter`). Members: `personalMint` + `groupMint` (unchanged). Guests:
  `personalMint` only — removes the guaranteed groupMint revert.
- `onboard()` / `findInviter` / `isOnboarded` already support plain (non-citizen)
  humans — unchanged.

UI changes:

- **`CoinsCard` + `TouristActionRow`**: always show the real unified balance with
  „Münzen" label; stop rendering off-chain points there.
- **Punkte relabel**: off-chain points are called **„Punkte"** everywhere they
  surface (Röbel Card surfaces, missions section, task-reward overlays „X
  Punkte"). Settles the naming collision flagged in
  `docs/CIRCLES_ROEBEL_MUENZEN_STATE.md`.
- **`NotInvitedSheet`**: wallet address + QR front and center (hackathon flow: Max
  trusts participants via the mini-app invite tab; bounded by his raw CRC ≈ 4
  invites until the DevRel quota lands), plus an external-browser button opening
  the Gnosis referral link — constant with `EXPO_PUBLIC_GNOSIS_REFERRAL_URL`
  override, default
  `https://app.gnosis.io/referral/0x2d94a225f02d6cafebe7fda1a272c790b93750b5027443ad2b6f78398d672cc7?utm_campaign=referral`.
  Sheet copy makes clear the referral path creates a separate Gnosis account
  (outside the app wallet).
- **Senden/Empfangen**: Empfangen stays for everyone; Senden only renders when the
  group balance > 0 (guest personal CRC can't use the group-token send path). The
  provider therefore exposes the group balance separately (e.g.
  `groupBalanceRaw`) alongside the unified `balanceRaw`, and `send()` continues to
  cap amounts at the group balance, not the unified figure.

## 5. Besucher → Organisation upgrade

- `ProfileModeCards`: the „Starte durch in Röbel" CTA (→ `/create-org`), today
  citizen-only, also renders for `tourist`/`guest` tiers. This is the upgrade
  path; no role-switch UI needed (account switcher takes over once the org
  exists).

## Error handling summary

- Citizen auto-submit: non-blocking, draft + banner fallback (§2).
- Guest mint: personalMint failures surface via existing snackbar/settlement
  queue; membership check prevents revert loops.
- Referral link: external browser open; no in-app state depends on it.

## Testing

- Unit tests (`lib/__tests__`) for new pure logic: balance summing, mint-branch
  guard (member vs. guest).
- Wizard flows (3 roles × skip/complete paths), guest mint, and NotInvitedSheet
  verified manually in the dev client.
- Scoped lint; no full `tsc` (repo has ~431 pre-existing errors; per standing
  preference).
