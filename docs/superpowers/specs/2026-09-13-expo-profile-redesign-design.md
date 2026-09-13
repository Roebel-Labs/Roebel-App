# Expo profile redesign: credential cards, glass switcher, golden Münzen button

Date: 2026-09-13. App: `apps/expo`. Branch: `feat/profile-redesign`.

## 1. Goal

Rebuild the profile surface of the Expo app around three ideas taken from the
2026-09-13 mockups (four phone frames: Gast, Bürger, Bescheiniger, Org Account,
plus the two Münzen button states and the explainer flow):

1. The account's **credential cards** (soulbound NFTs) are the hero. They peek
   out from behind a white content sheet like cards in a wallet. Guests see a
   silver "GAST" card, citizens a navy "BÜRGER" card, attesters both the navy
   card and a gold "BESCHEINIGER" card in front of it. Pressing the stack opens
   the credential explainer, where the cards are a horizontally swipeable row.
2. The **Münzen button** next to the identity row is a crafted golden 3D pill
   that physically pushes down, claims the accrued Röbel Münzen with a coin
   flip micro-animation, then morphs into a neutral "Münzen ›" pill that opens
   the Münzen page. It replaces the full-screen reward overlay for this action.
3. **Org mode** removes the cards, turns the header title into the org type
   (Verein, Unternehmen, ...), and adds a "Mitglieder ›" pill with stacked
   member avatars. The "Account wechseln" pill in the header uses the same
   frosted glass as the bottom navigation and only exists for users with more
   than one account.

Everything else on the page (quick-action grid, menu rows, banners, Konto &
Karte, stories, QR FAB, drawers) stays functionally identical but is restyled
to the mockups: the illustrated quick actions sit inside rounded gray squares.

## 2. What the mockups say (analysis)

Measured against a 393pt frame.

| Element | Gast | Bürger | Bescheiniger | Org |
|---|---|---|---|---|
| Header title | Profil | Profil | Profil | org type label (Unternehmen) |
| Header right | Account wechseln pill (avatars + label) | same | same | same |
| Card zone | 1 silver card, ~60pt visible | 1 navy card, ~64pt visible | navy behind (~44pt), gold in front (~64pt) | none |
| Identity row | avatar 48 + name + "Zum Profil ›" | same + gold "+1 Münze" | same + "Münzen ›" | org avatar + name + "Mitglieder ›" pill |
| Grid | none | 2×3 tiles | 2×3 tiles | 2×3 tiles |
| Menu | 2 + 3 rows | 2 + 3 rows | 2 + 3 rows | 2 + 3 rows |

Card art: `assets/cards/{Guest,Citizen,Attester}.svg`, 462×290 (ratio 1.593),
corner radius 24 at 462 wide. All text is outlined paths. Each uses two
gradients, a soft-light sheen overlay and inner-shadow filters (feMorphology +
arithmetic composite). react-native-svg supports the filter primitives but not
`mix-blend-mode: soft-light`, which would wash the navy card out. The cards are
therefore **rasterized to PNG** (see §8); librsvg 2.61 (via sharp 0.34.5 in
the repo's pnpm store) renders both effects correctly, verified visually.

Gold button: pill, ~44pt tall. Fill is a vertical pale-to-warm yellow gradient,
the border a 1.5pt diagonal gold gradient (light top-left, olive bottom-right),
soft warm drop shadow, dark-olive label, tilted 3D coin on the left. Idle
state: white pill, light gray gradient border, coin-stack-with-crown icon,
"Münzen" label, chevron.

Tiles: ~64pt rounded squares (radius ~18), light gray (#F2F3F5), illustration
~40pt inside, 12pt label in up to two lines below.

Explainer flow: pressing the stack opens the explainer with the full card(s) at
the top; with two cards, the row is horizontally swipeable and the next card is
teased at the right edge. Explainer text sits below.

## 3. Screen composition

`app/profile.tsx` is rewritten as a thin composition; every section becomes a
component under `components/profile/`. Rendering per mode:

```
SafeAreaView
└ GlassProvider
  ├ ProfileHeader (title, switcher pill)
  ├ GlassBackdrop > ScrollView (RefreshControl)
  │  ├ [personal] CredentialCardStack (guest | citizen | citizen+attester)
  │  └ ProfileSheet (white, top radius 24, upward shadow)
  │     ├ [personal] IdentityRow (avatar, name, "Zum Profil ›", right: MuenzenButton?)
  │     ├ [org]      OrgIdentityRow (avatar, name, right: MembersPill)
  │     ├ [personal, aspiring] CitizenVerificationBanner / [wants citizen] BuergerWerdenBanner
  │     ├ [org]      BusinessStatusBanner (unchanged condition)
  │     ├ [citizen | aspiring] ProfileActionGrid (personal tiles)
  │     ├ [org]      ProfileActionGrid (org tiles)
  │     ├ [personal] KontoCard (unchanged)
  │     ├ [citizen-ish] StoryCollectionsBar (unchanged)
  │     └ ProfileMenu (rows per mode)
  ├ QR FAB (unchanged condition: hasAnyNFT)
  ├ BottomNavigation glass (unchanged)
  └ LoginDrawer / LogoutDrawer / AccountSwitchSheet (unchanged behaviour)
```

Not-connected state keeps its current content (empty-state card, guest
RewardsCTABanner, menu rows) under the new header. It is not in the mockups
and is out of scope beyond the header.

Mode resolution (unchanged semantics, now in one place):

- `isOrg` = active account is an organisation.
- `isCitizen` = `useIsCitizen()` (on-chain CitizenNFT). The old screen used
  `useUser().isCitizen`, which ORs in the drifting DB flag; the redesign uses
  the canonical hook per `hooks/useIsCitizen.ts`.
- `isAttester` = `hasAttesterNFT` from `useVerificationContext()`.
- `isAspiringCitizen`, `wantsToBeCitizen`: as today.

## 4. Components

All new files live in `components/profile/` unless noted. Styling is
`StyleSheet.create` + `useTheme()`; fonts via the `fontFamily` tokens in
`constants/theme.ts`. Every pressable gets `accessibilityRole="button"` and a
German `accessibilityLabel`.

### 4.1 `PressableScale` (`components/PressableScale.tsx`)

Generic primitive: a `Pressable` whose content springs to `scale` (default
0.96) on press-in and back on press-out (reanimated `withSpring`, damping 15,
stiffness 300, matching `FeedFAB`). Props: everything `Pressable` accepts plus
`scaleTo`, `haptic?: 'selection' | 'light' | 'none'` (expo-haptics, native
only). Used by tiles, the card stack, pills and the Münzen button.

### 4.2 `GlassPill` (`components/GlassPill.tsx`)

A rounded pill with `GlassSurface` as its first child (the documented recipe:
container transparent, `overflow: 'hidden'`, hairline border via
`glassEdgeColor(isDark)`), height 36, horizontal padding 12, `softShadow(1)`.
Renders children in a row with gap 8. Props: `onPress`, `accessibilityLabel`,
`children`, `style`. It does **not** set `androidExperimentalBlur`; the bottom
nav stays the one Android sampler on `/profile`, so on Android the pill uses
the tinted fallback (same as every other bar today).

### 4.3 `ProfileHeader`

Row: title left (22pt `MonaSansSemiCondensed-Medium`, as today), optional
`GlassPill` right containing `AvatarStack` (recent other accounts, max 2,
small) and the label "Account wechseln". No bottom border (the mockup has
none). Props: `title`, `switcherVisible`, `recentOtherAccounts`, `onSwitch`.

Title logic (`lib/profile-header.ts`, pure): `profileHeaderTitle(account)` →
`'Profil'` for personal/null, `SUB_TYPE_LABELS[sub_type]` for organisations,
`'Organisation'` when the sub type is unknown. `SUB_TYPE_LABELS` and
`SUB_TYPE_EMOJI` come from `lib/types.ts`; the two local copies in
`app/profile.tsx` are deleted.

### 4.4 `CredentialCard`

One card image. Props: `kind: CredentialKind`, `width`, `style`. Height =
`width × 290/462`, corner radius = `24 × width/462`, `overflow: 'hidden'`.
Renders the PNG with React Native `Image` (static asset; keeps the component
trivially testable) plus `softShadow(2, isDark)`. Accessibility label is the
card title ("Bürgerausweis", "Bescheiniger-Ausweis", "Gastkarte").

### 4.5 `CredentialCardStack`

The wallet peek on the profile. Props: `kinds: CredentialKind[]` ordered back
to front (from `credentialKindsFor`), `onPress(kind)` (front card kind).

Geometry: card width = screen width − 32; zone height = `44 × (n − 1) + 64`
plus 12pt top margin. Card *i* (0 = back) is absolutely positioned at
`top = i × 44`, `left = 16`, so its lower part extends under the sheet that
follows in flow. The zone is a `PressableScale` (scale 0.985) so the whole
stack responds. The zone must not clip (`overflow: 'visible'`).

### 4.6 `ProfileSheet`

The white content surface. `backgroundColor: colors.background`, top corner
radius 24, `boxShadow: '0px -8px 24px rgba(0,0,0,0.10)'` (dark: 0.35),
`paddingTop: 20`, `zIndex: 2`, `minHeight` = viewport height so the sheet
always covers the card bottoms and reaches the nav bar. Children stack with the
existing 12pt/24pt rhythm.

### 4.7 `IdentityRow`

Left (pressable → own profile): `UserAvatarWithFrame` size 48; citizen and
attester get a small verified badge (existing `badge-check.svg`, 16pt, primary
on white ring) at the bottom-right of the avatar; name 17pt semibold; below it
"Zum Profil ›" 13pt secondary. Right slot: `MuenzenButton` or nothing.

Navigation target: the public profile (`/user/[username]`) or `/edit-profile`
when the user has no username. This is the same for citizens now (the old
citizen header card went to `/citizen-verification`; that role moves to the
card stack).

### 4.8 `OrgIdentityRow`

Left: org avatar (avatar_url → cover_url → emoji tile from `SUB_TYPE_EMOJI`),
verified badge when `is_verified`, name 17pt semibold. Right: `MembersPill`:
white pill (border `colors.border`, `softShadow(1)`) with `AvatarStack` of up to
2 members, label "Mitglieder", chevron → `/org/manage`. Members come from
`useOrgMemberPreview(accountId)` (`hooks/useOrgMemberPreview.ts`): one
`fetchMembersWithProfiles` call per account id, mapped to
`{ avatar_url, username }[]` plus `count`; refetches when the account id
changes.

### 4.9 `ProfileActionTile` and `ProfileActionGrid`

`ProfileActionTile` props: `label`, `image`, `onPress`. A `PressableScale`
column: 64×64 rounded square (radius 18, light `#F2F3F5`, dark
`colors.surfaceSecondary`; pressed darkens to `#E6E8EB` / `colors.surface`),
illustration 40×40 `contain`, label 12pt medium, centered, `numberOfLines={2}`,
`lineHeight` 15.

`ProfileActionGrid` props: `items: ProfileAction[]`; lays them out in three
columns (each cell `width: '33.333%'`) with 16pt row gap, inside the sheet's
16pt horizontal padding. Item lists live in `lib/profile-actions.ts` (pure,
returns `{ key, label, href | onPress marker }`) and are resolved to images in
the component:

Personal (citizen, aspiring citizen):

1. Röbel Card → `/roebel-card` (image `assets/images/card.png`)
2. Bürgerbefragung → `/governance` (02.png)
3. Durchstarten → `/create-org` (03.png)
4. Veranstaltung einsenden → `/submit-event` (04.png)
5. Anzeige erstellen → `/create-listing` (05.png)
6. Dienstleistung anbieten → `/create-listing?listingType=service` (06.png)

Org (replaces `OrgActionCards`, which is deleted):

1. Anzeige erstellen → `/create-listing?listingType=product` (05.png)
2. Dienstleistung anbieten → `/create-listing?listingType=service` (06.png)
3. Veranstaltung erstellen → `/submit-event` (04.png)
4. Anzeigen → `/org/ads` (ads.png)
5. Dashboard → `/org/dashboard` (dashboard.png)

Org actions keep the `requireAuth` wrap they have today.

"Abfallkalender" leaves the grid (the mockup has exactly six tiles) and becomes
a menu row so the feature stays reachable.

### 4.10 `ProfileMenu`

Renders the existing `ProfileMenuItem` rows in two groups separated by the
existing divider. Row sets:

Personal, connected:

- Group 1: Veranstaltung einsenden (tourists and guests only, since citizens
  have the tile), Meine Veranstaltungen, Abfallkalender, Feedback geben
- Group 2: Benachrichtigungen, Einstellungen, Hilfe, Datenschutz

Org: Mein Profil, Meine Veranstaltungen, Feedback geben | Benachrichtigungen,
Einstellungen, Hilfe, Datenschutz (as today).

Not connected: as today.

"Mein Profil", "Über die App" and "Organisation erstellen" rows disappear from
the personal list: the identity row, the Hilfe page and the Durchstarten tile
cover them. "Benachrichtigungen" moves into the personal list (it was
org-only). The mockup shows five rows; the two extra rows (Meine
Veranstaltungen, Abfallkalender, Einstellungen) keep real features reachable
and are a deliberate deviation.

### 4.11 `MuenzenButton` (the crafted one)

Files: `components/profile/MuenzenButton.tsx` (button + state machine),
`components/profile/CoinFlipBurst.tsx` (sprite overlay),
`hooks/useDailyMint.ts`, `lib/muenzen-daily-mint.ts`.

**Visual, claimable state** ("+N Münze" / "+N Münzen"):

- Outer `LinearGradient` (border): colors `['#EAD98A', '#B9992F']`, start
  (0,0) end (1,1), radius 22, padding 1.5.
- Inner `LinearGradient` (fill): `['#FFF9D6', '#FFEE93', '#F9DF63']`,
  locations `[0, 0.55, 1]`, vertical, radius 20.5, height 41, paddingLeft 10,
  paddingRight 16.
- Shadow layer: separate absolutely positioned view under the pill,
  `boxShadow: '0px 4px 10px rgba(110, 85, 0, 0.28)'`, so it can be faded
  independently of the surface.
- Icon: `assets/illustration/muenzen/top_hero_coin.png` (tilted 3D coin),
  26×28 `contain`. Label: 15pt `MonaSans-SemiBold`, color `#4A3E0B`.
- Highlight: a 1pt inner top line `rgba(255,255,255,0.7)` for the glass rim.

**Visual, idle state** ("Münzen ›"): same construction; border
`['#E9E9E9', '#CFCFCF']` (dark: `['#4a4d52', '#2d2e31']`), fill
`['#FFFFFF', '#F4F4F5']` (dark: `[colors.surfaceSecondary, colors.surface]`),
icon `assets/illustration/gamification/stack.png` 28×28, label
`colors.textPrimary`, chevron `chevron-right.svg` 16pt `colors.textSecondary`,
shadow `softShadow(1)`.

**Press mechanics (both states):** on press-in the surface translates 3pt down
and the shadow layer fades to 0 over 90ms; on press-out it springs back
(damping 14, stiffness 260) and the shadow fades in over 160ms. Haptic:
`impactAsync(Light)` on press-in.

**Claim choreography (claimable → idle), reanimated 4:**

1. `t = 0`: press-out spring starts; `notificationAsync(Success)`;
   `claim()` runs (optimistic cooldown persisted, settlement enqueued).
2. `t = 40ms`: `CoinFlipBurst` mounts `min(amount, 5)` sprites
   (`assets/illustration/gamification/single.png`, 24pt) at the pill's
   top-center, sprite *i* delayed `i × 90ms`. Each sprite: `translateY` 0 →
   −56 (easeOut cubic, 380ms) then → −44 (easeIn quad, 240ms); `translateX`
   fixed spread `(i − (n−1)/2) × 16`; `rotateY` 0 → 540deg linear over 620ms
   with `perspective: 500`; `scale` 0.5 → 1 → 0.8; `opacity` 1 until 420ms
   then → 0 by 620ms.
3. `t = 300ms`: content crossfade. The pill renders both state layers; the
   claimable layer fades 1 → 0 and the idle layer 0 → 1 over 260ms. The
   container's width animates through reanimated `LinearTransition` (260ms),
   so the pill visibly reshapes from "+1 Münze" to "Münzen ›".
4. `t ≈ 900ms`: burst unmounts; state is `idle`.

Reduced motion (`AccessibilityInfo.isReduceMotionEnabled`): no burst, instant
state swap.

**State machine** (`MuenzenButton` is controlled by `useDailyMint`):

```
hidden     no wallet, or (guest && !onboarded && balance == 0)
idle       default: press → router.push('/rewards')
claimable  onboarded && !minting && !inCooldown && mintable >= MIN_MINTABLE
claiming   transitional, ~900ms; ignores presses
```

Guests (non-citizens) only get the button when they are Circles-onboarded or
hold a non-zero balance; the Gast mockup shows no button and this keeps it
that way for fresh guests while never hiding money someone already has.

### 4.12 `hooks/useDailyMint.ts` and `lib/muenzen-daily-mint.ts`

`lib/muenzen-daily-mint.ts` (pure, tested) receives the constants and helpers
that currently live inline in `app/rewards/index.tsx`:
`MIN_MINTABLE = 0.1`, `MINT_COOLDOWN_MS = 3_600_000`, `rtClaimKey(addr)`,
`rtStreakKey(addr)`, `dayStart(ts)`, `nextMidnight(ts)`,
`claimAmount(mintable) = max(1, round(mintable))`,
`isInCooldown(lastClaim, now)`, `computeNextStreak(prevStreak, prevLastClaim,
now)` (same day → unchanged; yesterday → +1; otherwise → 1). The rewards page
imports these instead of its local copies; its behaviour does not change.

`useDailyMint()` returns `{ state, amount, claim, cooldownMs }`:

- Reads `useRoebelTaler()` (`mintable`, `minting`, `onboarded`, `talerBalance`,
  `dailyMint`, `enqueueSettlement`, `account`).
- Loads `lastClaim` from AsyncStorage `rtClaimKey(address)` on mount / address
  change and keeps a 1s ticker only while in cooldown (same keys as the rewards
  page, so both screens agree).
- `claim()`: snapshot `lastClaim`/streak; write optimistic `lastClaim = now`
  and streak via `computeNextStreak`; persist both; then
  `enqueueSettlement({ label: 'Münzen', amount, settle: dailyMint, onFailed:
  rollback })`. No `celebratePending`/`celebrate` call: the button's own
  animation is the celebration. Settlement failure rolls the optimistic
  cooldown back exactly as the rewards page does and the provider shows its
  existing snackbar.

### 4.13 Account switch sheet

Unchanged behaviour, extracted to `AccountSwitchSheet` (a `BottomDrawer`), and
it reads `SUB_TYPE_LABELS` / `SUB_TYPE_EMOJI` from `lib/types.ts` so
`journalist` accounts stop falling back to "Organisation".

## 5. Credential model (`lib/credentials.ts`, pure, tested)

```ts
export type CredentialKind = 'guest' | 'citizen' | 'attester';
export function credentialKindsFor(i: { isCitizen: boolean; isAttester: boolean }): CredentialKind[];
// → ['guest'] | ['citizen'] | ['citizen', 'attester']   (back → front)
export const CREDENTIAL_COPY: Record<CredentialKind, {
  title: string;        // "Gastkarte" | "Bürgerausweis" | "Bescheiniger-Ausweis"
  intro: string;        // one paragraph
  benefits: { icon: BenefitIcon; title: string; desc: string }[]; // 3–5 rows
  cta?: { label: string; kind: 'become-citizen' | 'scan' | 'show-qr' | 'attester-form' };
}>;
```

An attester without the CitizenNFT is not a state the contracts allow; the
function still returns `['citizen', 'attester']` for `isAttester` regardless.

Copy (German, UI only; identifiers English):

- **Gast**: intro on discovering Röbel; benefits: Veranstaltungen & News,
  Anzeigen ansehen, Röbel Münzen sammeln (personal), Feedback geben; CTA
  "Bürger:in werden" → `/verification/request-citizen` (or
  `/verification/my-request` when a request is pending).
- **Bürger**: intro on the soulbound Bürgerausweis; benefits: Anonym abstimmen
  (Bürgerbefragungen), Röbel Münzen der Stadt, Organisation gründen, Anzeigen &
  Veranstaltungen einreichen, Bürger:innen bescheinigen (Unterschrift geben);
  CTA "Ausweis vorzeigen" opens the QR sheet.
- **Bescheiniger**: intro on the attester role; benefits: Neue Bürger:innen
  bestätigen, Anträge prüfen, Auszählungen freischalten (3-von-5), Alles aus
  dem Bürgerausweis; CTA "QR-Code scannen" → `/verification/scan`.

## 6. Explainer screen (`app/citizen-verification.tsx`, route unchanged)

Accepts `card?: CredentialKind` (initial focus). Layout:

1. Header row: existing round back button.
2. `CredentialCarousel`: with one card, a full-width `CredentialCard` (width
   W − 32). With two or more, a horizontal `FlatList`: item width
   `W − 32 − 28`, gap 12, `snapToInterval = itemWidth + 12`,
   `decelerationRate="fast"`, `contentContainerStyle paddingHorizontal 16`, so
   the next card is teased ~28pt at the right edge. `initialScrollIndex` from
   the `card` param, `getItemLayout` provided. `onViewableItemsChanged`
   (50% threshold) drives `activeKind`. Page dots (6pt, primary / border)
   below the row.
3. Explainer body for `activeKind`, keyed so it re-enters with reanimated
   `FadeIn`/`FadeOut` (180ms): title 20pt heading, intro 15/22, benefit rows
   (40pt rounded gray square with the icon, title 15 semibold, desc 13
   secondary), CTA button (primary, 48pt) when defined.
4. Citizen extras, only when `activeKind === 'citizen'`:
   `CompleteCitizenDataBanner embedded` (as today) and the QR: a `BottomDrawer`
   (`CredentialQrSheet`) with `react-native-qrcode-svg` rendering
   `roebel://verification/request/${requestId}?type=citizen`, opened by the
   "Ausweis vorzeigen" CTA. `CitizenPassportCard` is deleted.
5. The existing "Mehr erfahren" link to `roebel.app/buergerausweis` stays at
   the bottom of the citizen explainer.

Card order in the carousel is front-first (`[...kinds].reverse()`), so the
card the user tapped is what they land on.

## 7. Animations and platform notes

- reanimated 4.3 + react-native-worklets. Helpers used inside worklets carry
  the `'worklet'` directive (release-only crash otherwise, per project memory).
  Prefer inline `useAnimatedStyle` bodies.
- `LinearTransition` on the Münzen pill container only; no layout animations on
  the ScrollView children.
- Shadows through `boxShadow` (`lib/shadow.ts` style) so iOS and Android match.
- Glass: `GlassProvider` wraps header, backdrop and nav (as today). The header
  pill is not an Android sampler.
- Haptics wrapped in `Platform.OS !== 'web'`.

## 8. Asset pipeline

`apps/expo/scripts/render-credential-cards.mjs` reads
`assets/cards/*.svg` with sharp (resolved from the monorepo pnpm store at
`node_modules/.pnpm/sharp@*/node_modules/sharp`, no new dependency) and writes
`assets/cards/png/{guest,citizen,attester}@2x.png` (924×580) and `@3x.png`
(1386×870). Metro resolves `require('.../citizen.png')` to the best scale.
The SVG sources stay in the repo as the design source; the script is
documented at the top of `components/profile/credential-art.ts`, which holds
the three `require`s.

## 9. Cleanup

Deleted with this change (each verified unused after the rewrite):
`components/profile/ProfileHeaderCard.tsx`, `CoinsCard.tsx`,
`TouristActionRow.tsx`, `OrgActionCards.tsx`, `CitizenPassportCard.tsx`,
`ProfileContent.tsx`, `ProfileModeCards.tsx`, `components/AccountSwitcher.tsx`,
`components/FlippableIdentityCard.tsx`, `components/ProfilePromoCard.tsx`.
`hooks/useIsBusinessOwner.ts` mentions one of these names in a comment only
and is left alone. `RewardsCTABanner` stays (not-connected state).

## 10. Testing

Unit (jest-expo, `lib/__tests__/`):

- `credentials.test.ts`: `credentialKindsFor` matrix; every kind has a title,
  intro and ≥3 benefits; CTA kinds are valid.
- `muenzen-daily-mint.test.ts`: `claimAmount`, `isInCooldown`,
  `computeNextStreak` (same day / yesterday / gap / first claim), `dayStart`.
- `profile-header.test.ts`: `profileHeaderTitle` for personal, each org sub
  type, unknown sub type.
- `profile-actions.test.ts`: personal list has the six mockup actions in
  order; org list has five; every href is a string starting with `/`.

Component (`components/__tests__/`): `CredentialCardStack-test.tsx` renders
one image per kind with the right accessibility labels (reanimated primitives
mocked via `jest.mock`).

Manual, on device (Max): Android emulator pass of all four modes, dark mode,
the claim choreography, the explainer swipe with two cards. The daily mint is
verified end-to-end by claiming on the profile and confirming the rewards page
shows the cooldown.

## 11. Assumptions (decided without a round-trip)

1. The "+N Münze" state is the **hourly Circles mint** already exposed on the
   Münzen page (`mintable`); nothing else awards a coin from the profile. Other
   reward sources (votes, event submissions, checkpoints) keep the full-screen
   overlay; only the profile claim switches to the micro-animation.
2. Guests see the Münzen button only when onboarded or holding a balance.
3. The grid follows the mockup's six actions; Abfallkalender becomes a menu
   row; two extra menu rows keep Einstellungen and Meine Veranstaltungen
   reachable.
4. The explainer keeps a back button instead of the mockup's "Profil" header,
   because it is a pushed screen.
5. Cards ship as PNG (2x/3x) rendered from the SVGs.
6. The "Account wechseln" pill appears whenever the user owns more than one
   account, which is the same as "has an org account" today.
7. The screen background stays white (mockup) rather than tinting the card
   zone.

## 12. Out of scope

Public profile page (`/user/[username]`), org public page, `/org/manage`,
the Münzen page itself, not-connected layout beyond the header, iOS-only
Liquid Glass, and any change to the reward overlay used elsewhere.

## 13. Review round 1 (2026-09-13, after the first Android preview)

Max's device feedback, applied on the branch: the Röbel Card tile is replaced by
Abfallkalender (the menu row remains only for users without the grid); the
"Konto & Karte" card is removed from the profile until Gnosis Pay works; the
glass switcher border is 1.5pt; the Münzen label is 13pt; in a two-card stack
the back card is drawn at 93% width, centred; the header and card zone sit on
a new `colors.backdrop` token (`#F0F0F0` light, `#111214` dark) while the
sheet keeps `colors.background`, and the flat sheet (org, not connected) is
rounded with a 12pt top gap so every mode reads as a sheet on the stage.

Added in the same round: while the hourly cooldown runs, the idle button label
alternates between "Münzen" and a MM:SS clock (`MuenzenCooldownLabel`), using
the explore search placeholder's slide/fade with a 3 s hold; the clock ticks
inside the label only, and the hook exposes `cooldownEnd`.
