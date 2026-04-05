# Profile Card Airbnb-Style Redesign

## Context

The current profile screen uses a colored gradient identity card (FlippableIdentityCard) that doesn't match the clean, modern Airbnb aesthetic the user wants. The redesign transforms the profile card area into white cards with shadows, Airbnb-style verified badges, and improves the account switcher UI. The GovernanceTestBanner ("Bürger Umfragen testen") is also removed from the citizen profile.

## Changes

### 1. FlippableIdentityCard — Front Side

**File:** `apps/expo/components/FlippableIdentityCard.tsx`

Replace the colored gradient card with a white Airbnb-style card:

**Citizen account layout:**
- White (`colors.surface`) card with subtle shadow and rounded corners (20px)
- Large centered circular profile picture (80px diameter)
- Airbnb-style verified badge: a small circular icon (24px) with pink/red background and white checkmark, positioned overlapping the bottom-right of the avatar (offset so it sits on the edge)
- Name centered below the avatar
- Subtitle: **"Röbeler Bürger"** (replacing "Röbel/Müritz")
- Remove the old mode emoji badges and footer text

**Org account layout:**
- Same white card base with shadow
- Top portion shows the org's `cover_url` (title image) as a cropped header band (~100px tall) with rounded top corners
- Circular profile picture (org `avatar_url`) overlapping the header/body border (positioned half on header, half on white body)
- Store icon badge (24px circle, purple/navy background, white store icon) overlapping bottom-right of avatar — same positioning as citizen verified badge
- Org name centered below avatar
- Org type label as subtitle (e.g., "Unternehmen", "Verein")

**Pending status:**
- If the active account's associated business has `status !== 'approved'`, show a small pill label ("In Prüfung") on the card, positioned top-right

**Shadow styling:**
```
iOS: shadowColor '#000', shadowOffset {0, 2}, shadowOpacity 0.08, shadowRadius 8
Android: elevation 3
```

### 2. FlippableIdentityCard — Back Side

The card flips using the existing react-native-reanimated 3D flip animation (already implemented). Redesign the back content:

- **Back button:** Top-left arrow icon (←) that triggers the flip back to front. This is NOT a navigation — it just flips the card back.
- **Content area** (white card, same shadow as front):
  - Heading: "Bürgerverifizierung" (or "Über uns" for org)
  - Body text: Brief description of the citizen verification system — how it works (attestation by existing citizens), the architecture (soulbound NFTs on Base L2), and the mission/goal (civic participation, transparent governance for Röbel)
  - Tappable link: "roebel.app" that opens `https://www.roebel.app` via `openBrowserAsync`
- Text styled with `colors.textPrimary` for heading, `colors.textSecondary` for body, `colors.primary` for link

### 3. Remove GovernanceTestBanner

**File:** `apps/expo/app/profile.tsx`

Remove the `GovernanceTestBanner` component rendering from the logged-in citizen profile (lines 262-268). Remove the import and the `useGovernanceTest` hook usage if it becomes unused elsewhere in the file.

### 4. Header "Account wechseln" Button

**File:** `apps/expo/app/profile.tsx`

Restyle the `switchButton` to be pill-shaped with a border:
- `borderRadius: 20` (fully rounded pill)
- `borderWidth: 1`
- `borderColor: colors.border`
- `paddingVertical: 6, paddingHorizontal: 14`
- Keep existing text style

### 5. Account Switcher Bottom Sheet

**File:** `apps/expo/app/profile.tsx`

Restyle the account rows in the Modal:

**Account avatars — fully circular:**
- Change `accountIcon` from `borderRadius: 12` (rounded square) to `borderRadius: 22` (fully circular, width/height 44)
- For personal accounts: show user's `profile_picture_url` as a circular image, fallback to initials
- For org accounts: show org's `avatar_url` as a circular image, fallback to emoji
- All images are circular (fully rounded)

**Pending status label:**
- For accounts whose associated business has `status === 'pending'` or where `is_verified === false` for org accounts: show a small status pill at the right end of the row
- Pill text: "In Prüfung"
- Styling: `colors.warningBackground` background, `colors.warning` text, small rounded pill (borderRadius 8, paddingHorizontal 8, paddingVertical 2, fontSize 11)

### 6. Props & Data Access

**FlippableIdentityCard** already uses `useAccount()` internally — `activeAccount.cover_url`, `activeAccount.avatar_url`, and `activeAccount.account_type` are directly available. No new props needed for org data.

- Add `isPending?: boolean` prop — passed from profile.tsx based on business record status or `activeAccount.is_verified === false` for org accounts
- Remove unused props: `pointsBalance`, `badges`, `businessName`, `roleLabel`
- Keep: `user`, `role`, `isCitizen`, `verifiedSince`, `attestedBy`, `votingStreak`

**Org type label** derived internally from `activeAccount.account_type` using the existing mapping logic (already in profile.tsx).

## Files to Modify

| File | Changes |
|------|---------|
| `apps/expo/components/FlippableIdentityCard.tsx` | Complete front/back redesign |
| `apps/expo/app/profile.tsx` | Remove GovernanceTestBanner, restyle header button, restyle account sheet, update FlippableIdentityCard props |

## Verification

1. Run `pnpm start` in `apps/expo` and check on iOS simulator
2. Verify citizen profile: white card, centered avatar, verified badge overlapping, "Röbeler Bürger" subtitle, card flips to show verification info + roebel.app link
3. Verify org profile: title image header on card, store icon badge, org name + type
4. Verify GovernanceTestBanner is removed from citizen profile
5. Verify "Account wechseln" button is pill-shaped with border
6. Verify account sheet: circular avatars, pending accounts show "In Prüfung" label
7. Verify card flip animation is smooth 3D flip (not page slide)
8. Test dark mode — all colors should use theme tokens
