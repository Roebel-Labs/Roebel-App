# Credential Register 3b — Mobile Experience (Stamps, Collection, Org Profile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the register feel finished in the Röbel app: scanning an event QR ends in a full-screen stamp moment with every error state handled, collected badges live in an "Abzeichen" collection, org admins get a "Mitglieder & Ausweise" area on their org profile, and the public org profile shows offices, public members and the org's badges.

**Architecture:** Plan 3 built the register plumbing and plain screens; this plan replaces the plain parts with the experience of spec 5.6b. The existing Smart Event QR (`roebel.app/e/<id>`, `reward_events`) **is** the badge QR: one code at the door gives the Röbel Münzen for attending (unchanged, server-paid by `claim-reward`) and records attendance for the badge. The badge itself still needs a leaf from the organiser (plan 4); until it exists the app celebrates at once and shows the stamp as "wird eingetragen", remembers the person's public/private wish on the device, and claims later inside the next sponsored operation the account sends anyway. Animations use Reanimated 4.3.1 and expo-haptics; both are already in the binary.

**Tech Stack:** Expo SDK 56 / React Native, expo-router, react-native-reanimated 4.3.1, expo-haptics ~56.0.3, @react-native-community/netinfo 12.0.1, react-native-qrcode-svg (all present), jest-expo; Next.js route handlers for two small server additions.

**Spec:** `docs/superpowers/specs/2026-11-17-credential-register-design.md` section 5.6b (and 5.3, 5.5). Builds on `docs/superpowers/plans/2026-11-17-credreg-3-expo.md` (names from its Tasks 1–7 are used as defined there) and on `docs/superpowers/plans/2026-11-17-credreg-4-dashboard-and-badges.md` Tasks 5, 6 and 9.

**Order:** execute **after plan 4** (this plan needs plan 4's event badge types, `badge_nudge` and the public badge route). The event page and organiser parts of spec 5.6b are in plan 4 Task 9, because they depend on badges; this plan holds the attendee, profile and org-profile parts. Plan 3 stays as written; this is a separate file because plan 3 already has nine tasks.

## Open questions for the owner

1. **The public "Mitglieder" section on org profiles.** Today `app/account/[id]/index.tsx` shows every `account_owners` row of an org as a public avatar stack, Fraktionen included, which contradicts spec 5.3 ("members who chose public"). *Default: once an org has at least one membership type on chain, the section shows only offices and members who claimed publicly (from the register); orgs without register types keep today's section unchanged. Alternative: switch every org at once, which empties the section for nearly all orgs today.*
2. **When a waiting public badge is written.** *Default: inside the next sponsored operation the account sends anyway (collecting Röbel Münzen, a vote, an acceptance), and in the collection a banner "<n> Abzeichen bereit · Jetzt eintragen" offers one operation for all of them. Never automatically in the background with a fingerprint prompt the person did not start.*
3. **`app/stamp-scan.tsx`.** Spec 5.5 said untouched; 5.6b allows replacing it. *Default: it becomes a redirect to the app's scanner, so old entries reach the working flow; nothing else uses it.*
4. **Sharing.** *Default: "Teilen" opens the existing post composer with the event linked (`/create` with the `linkedEvent*` params it already reads) and the text "Ich war dabei: <Event>"; no image generation.*

## Global Constraints

- UI German, code English. `StyleSheet.create()` + `useTheme()`. Never show a wallet address. **Never the words NFT, Token, Wallet, Blockchain or Chain in user-facing text** (spec 5.6b); credentials look like cards and stamps.
- Every animation has a reduced-motion path (`useReducedMotion()` from Reanimated): no movement, a 150 ms fade at most, the haptic still fires.
- **Every function called inside a worklet carries `'worklet';` as its first statement** (crash class from 2026-08-23, invisible to lint and bundling; see `components/DeckCardSwiper.tsx` for the pattern). Each animation task ends with a runtime check in a dev build, not only tests.
- Fewest prompts: one fingerprint at most per stamp; none for a guest's first stamp.
- No new native modules, no new dependencies. Gate: everything new is behind `useCredentialsGate()` (plan 3); with the gate closed, `app/e/[id].tsx` behaves exactly as today.
- Tests: `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`; eslint on touched files; no full `tsc`. Web tests: `cd apps/web && npx tsx --test tests/<file>`.
- Work in a git worktree: `git worktree add .worktrees/credreg-3b -b feat/credreg-3b-mobile` from the credreg-4 branch, `pnpm install --frozen-lockfile`. Stage by explicit path; every task ends with commit + `git push -u origin feat/credreg-3b-mobile`. Never merge to `main`, never run `eas`.
- Commit convention: `feat(expo): …`, `feat(web): …`.

## Review Focus

1. **Scanning with no network at the door.** Expected: the stamp moment still appears ("wird gesammelt, sobald du wieder online bist"), the scan is queued and sent once when the connection returns, never twice. Test in Task 3.
2. **The same QR scanned twice.** Expected: "Schon gesammelt" with the stamp, no second Münzen claim, no error tone. Test in Task 3.
3. **A guest whose account is not deployed yet.** Expected: the celebration shows immediately, the stamp is marked "wird eingetragen", no prompt appears now, and the claim rides the first sponsored operation later. Test in Task 4.
4. **Reduced motion on.** Expected: no drop/stamp movement, haptic still fires, all text identical. Test in Task 2.
5. **A Fraktion's public profile.** Expected: no member names unless a member claimed publicly while the org allowed it; offices always shown. Test in Task 7.

---

### Task 1: Server — waiting badges and the public org view

**Files:**
- Modify: `apps/web/src/lib/credentials/holder.ts` (`mine` gains `pendingBadges`)
- Create: `apps/web/src/lib/credentials/org-public.ts`, `apps/web/src/app/api/credentials/orgs/[accountId]/public/route.ts`
- Test: `apps/web/tests/credentials-pending-badges.test.ts`, `credentials-org-public.test.ts`

**Interfaces:**
- Consumes: `attendeesOf` logic (plan 4 Task 5) inverted per wallet; `credential_types.event_id`; `claimed_onchain` (plan 2 Task 6).
- Produces: `mine` response becomes `{ invitations: InvitationView[]; pendingBadges: PendingBadge[] }` (update plan 3's `fetchMine` and `loadHeld` accordingly) with `type PendingBadge = { eventId: string; eventTitle: string; eventDate: string; orgName: string | null; typeId: Hex | null; name: string; imageUrl: string | null; state: "waiting_for_issue" }` — every event the caller attended (checked-in ticket or non-rejected `event_attend` claim) whose event has a badge type (draft or on chain) and for which the caller has no invitation yet.
- Produces (`org-public.ts`): `orgPublicCredentials(store, reader, accountId): Promise<{ offices: { typeId: Hex; name: string; holders: { displayName: string; avatarUrl: string | null; username: string | null }[] }[]; publicMembers: { displayName: string; avatarUrl: string | null; username: string | null }[] | null; badges: { typeId: Hex; name: string; imageUrl: string | null; eventTitle: string | null; collected: number }[]; usesRegister: boolean }>` — offices = `role` types (recognised first); holders and public members = invitations with `claimed_onchain` whose `reader.holds` is still true, resolved to the `users` display name; `publicMembers` is `null` when the org's members may not be public (`membersMayBePublic` false) **and** nobody holds publicly; `usesRegister` = the org has a membership type on chain (open question 1). No address in the output. Public `GET`, cached 5 minutes.

- [ ] **Step 1: Write the failing tests**

```ts
test("pendingBadges lists attended events with a badge type and no invitation yet", …);
test("an attendee who already has an invitation is not pending; refunded tickets never are", …);
test("org public view: offices with holders, public members only from chain-held public claims", …);
test("a closed org without public holders returns publicMembers null; offices are still listed", …);
test("no field of the public view looks like an address", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (5).
- [ ] **Step 5: Commit** — `feat(web): waiting badges and public org credentials`.

---

### Task 2: Visual foundation — stamp card, motion, haptics, copy guard

**Files:**
- Create: `apps/expo/components/credentials/StampCard.tsx`, `StampMoment.tsx`
- Create: `apps/expo/lib/credreg/motion.ts`, `copy.ts`
- Test: `apps/expo/components/credentials/__tests__/stamp-moment.test.tsx`, `apps/expo/lib/credreg/__tests__/copy.test.ts`

**Interfaces:**
- Produces (`motion.ts`): `STAMP_TIMING = { dropMs: 420, settleMs: 180, inkMs: 260 }`; `stampDropY(progress: number): number` and `stampScale(progress: number): number` (both with `'worklet';`, pure; drop from −120 to 0 with a slight overshoot, scale 1.25 → 1 at impact); `useStampAnimation(opts: { play: boolean; onImpact(): void }): { cardStyle; inkStyle; reduced: boolean }` — with `useReducedMotion()` true it returns static styles and calls `onImpact` once after 150 ms.
- Produces: `stampHaptic(): Promise<void>` in `motion.ts` = `Haptics.notificationAsync(NotificationFeedbackType.Success)`, swallowing errors.
- Produces: `StampCard` props `{ imageUrl: string | null; title: string; subtitle: string; state: 'collected' | 'pending' | 'queued'; size: 'tile' | 'hero' }` — round stamp art inside a card frame (default art: a neutral ink stamp drawn with views); `pending` shows a small "wird eingetragen" chip, `queued` "wird gesammelt".
- Produces: `StampMoment` props `{ stamp: StampCardProps; headline: string; lines: string[]; muenzen: number | null; actions: { label: string; onPress(): void; kind: 'primary' | 'secondary' }[]; tone: 'success' | 'info' | 'warning' }` — full screen on the brand background, `useStampAnimation` with `play` once on mount, haptic on impact only for `tone: 'success'`, `accessibilityLiveRegion="polite"` on the headline.
- Produces (`copy.ts`): `FORBIDDEN_UI_WORDS = [/\bNFT\b/i, /\bToken\b/i, /\bWallet\b/i, /\bBlockchain\b/i, /\bChain\b/i]` and `assertCleanCopy(texts: string[]): string[]` (returns offending strings).

- [ ] **Step 1: Write the failing tests**

```tsx
it('plays once and fires the haptic once on impact', …);              // Haptics mocked
it('with reduced motion: no transform in the style and the haptic still fires', …);
it('warning tone fires no haptic', …);
it('stampDropY and stampScale start and end where specified', …);    // (0) → -120 / 1.25, (1) → 0 / 1
it('every user-facing string in components/credentials and app/credentials passes assertCleanCopy', …);   // reads the files, extracts string literals
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement**; grep the new files for helpers called from worklets and give each `'worklet';`. **Step 4: Run** — Expected: PASS (5). Then open the design-system screen (`app/design-system.tsx`, add a "Stempel" entry) in a dev build on Android and iOS and play the moment with reduced motion on and off: no redbox.
- [ ] **Step 5: Lint and commit** — `feat(expo): stamp card, stamp moment and reduced-motion animation`.

---

### Task 3: Collecting at the door — the scan flow

**Files:**
- Modify: `apps/expo/app/e/[id].tsx` (the screen keeps today's Münzen logic, including first-time onboarding, and renders `StampMoment` when the gate is open and the event has a badge)
- Create: `apps/expo/lib/credreg/collect.ts`, `collect-queue.ts`
- Modify: `apps/expo/app/stamp-scan.tsx` (redirect to the scanner, open question 3)
- Modify: `apps/expo/app/_layout.tsx` (start `flushCollectQueue` when the app comes online or to the foreground)
- Test: `apps/expo/lib/credreg/__tests__/collect.test.ts`, `collect-queue.test.ts`

**Interfaces:**
- Consumes: `claimReward(addr, 'event_attend', id)` (`lib/rewards-claim.ts`) and its result shape `{ status: 'paid' | 'already_claimed' | 'rejected' | …; reason?; amountAtto? }`; the public badge route of plan 4 Task 9 (`GET /api/credentials/events/<eventId>/badge`); `badge_nudge` (plan 4 Task 6).
- Produces (`collect.ts`):

```ts
export type CollectState =
  | { kind: 'working' }
  | { kind: 'collected'; muenzen: number | null; badge: BadgeInfo | null; pending: boolean }
  | { kind: 'already'; badge: BadgeInfo | null }
  | { kind: 'not_started' } | { kind: 'ended' } | { kind: 'budget_reached' } | { kind: 'invalid' }
  | { kind: 'queued'; badge: BadgeInfo | null }
  | { kind: 'signed_out' } | { kind: 'error'; message: string };
export type BadgeInfo = { eventId: string; eventTitle: string; eventDate: string; name: string; imageUrl: string | null };
export function stateFromClaim(r: ClaimResult, badge: BadgeInfo | null): CollectState;     // maps the existing reasons: 'event not started', 'event ended', 'event reward budget reached', else invalid
export function momentFor(s: CollectState): { headline: string; lines: string[]; tone: 'success' | 'info' | 'warning'; stampState: 'collected' | 'pending' | 'queued' | null; actions: ('ansehen' | 'teilen' | 'weiter' | 'anmelden' | 'erneut')[] };
```

  Copy (exact): collected with badge → headline "Abzeichen erhalten", lines `[eventTitle, eventDate]` plus "+<n> Röbel Münzen" when paid, plus "Wird in dein Profil eingetragen." when `pending`; collected without badge → today's Münzen text; already → "Schon gesammelt"; not_started → "Noch nicht gestartet" / "Komm zum Beginn der Veranstaltung wieder."; ended → "Vorbei" / "Diese Veranstaltung ist zu Ende."; budget_reached → today's text; invalid → "Dieser Code ist nicht gültig."; queued → "Gleich gesammelt" / "Du bist offline. Wir sammeln dein Abzeichen, sobald du wieder online bist."; signed_out → "Bitte zuerst anmelden." with action "Anmelden". Actions "Ansehen" → `/profile?badge=<eventId>`, "Teilen" → `/create` with the `linkedEvent*` params and the text "Ich war dabei: <eventTitle>".
- Produces (`collect-queue.ts`): `enqueueCollect(address: string, eventId: string): Promise<void>` (deduplicated, AsyncStorage `credreg:collect-queue:v1:<address>`); `flushCollectQueue(address, deps): Promise<{ sent: number; kept: number }>` — sends each queued scan through `claimReward` once, removes it on any definitive answer (paid, already, rejected), keeps it on network failure, drops entries older than 7 days.
- After a `collected` or `already` state with a badge, the screen calls `badge_nudge { eventId }` (best effort) and stores the person's visibility wish (Task 4). The visibility question is one row on the moment: "Im Profil öffentlich zeigen" switch, default on (spec 5.3: badges default to public); its help text: "Aus: nur du siehst dieses Abzeichen."

- [ ] **Step 1: Write the failing tests**

```ts
it('maps paid, already_claimed and each rejection reason to the right state', …);
it('momentFor(collected, pending) says "Abzeichen erhalten" and "Wird in dein Profil eingetragen."', …);
it('no copy produced by momentFor fails assertCleanCopy', …);
it('a network failure on scan enqueues once and yields queued', …);
it('flushCollectQueue sends each scan once, keeps it on network error, removes it on any answer', …);
it('queue entries older than 7 days are dropped', …);
it('with the gate closed the screen keeps today\'s behaviour (no badge request)', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement**; keep the existing first-timer branch (`event-onboard` → `onboard()` → `claimReward`) unchanged and feed its result into `stateFromClaim`. **Step 4: Run** — Expected: PASS (7). Dev-build check: scan a test event QR online, offline (airplane mode, then back), twice.
- [ ] **Step 5: Lint and commit** — `feat(expo): full-screen stamp moment for the event QR with offline queue`.

---

### Task 4: Waiting stamps — wish, auto-accept, and claims that ride along

**Files:**
- Create: `apps/expo/lib/credreg/pending.ts`
- Modify: `apps/expo/lib/credreg/guest.ts` (plan 3 Task 7: `sendWithGuestClaim` becomes `sendWithPiggyback`; keep `sendWithGuestClaim` as a thin alias for its existing callers)
- Modify: `apps/expo/lib/credreg/held.ts` (`useHeld` exposes `pendingBadges` and `readyClaims`)
- Test: `apps/expo/lib/credreg/__tests__/pending.test.ts`, `guest.test.ts` (extend)

**Interfaces:**
- Produces (`pending.ts`):

```ts
export type BadgeWish = 'public' | 'private';
export async function setBadgeWish(address: string, eventId: string, wish: BadgeWish): Promise<void>;   // AsyncStorage credreg:badge-wish:v1:<address>:<eventId>
export async function settleArrivedBadges(account: Account, invitations: InvitationView[], deps?): Promise<{ acceptedPrivately: number; ready: InvitationView[] }>;
export async function readyClaimCalls(address: string, deps?): Promise<Call[]>;    // claim calls for badge invitations with wish 'public', accepted, not yet held, at most 5
```

  `settleArrivedBadges`: for each new badge invitation whose event has a stored wish: `private` → `respondInvitation(accept)` with no transaction; `public` → `respondInvitation(accept)` and it becomes ready. Invitations without a stored wish are left for the normal accept screen (plan 3 Task 4). Called from `useHeld().refresh()`.
- Produces (`guest.ts`): `sendWithPiggyback(account: Account, calls: readonly Call[], p: { isCitizen: boolean }, deps?): Promise<Hex | null>` — prepends the Guest call (as before) and up to five `readyClaimCalls`; on failure retries once with only the original calls (same rule as plan 3 Task 7), and marks the piggyback claims to be skipped for 24 hours. A guest whose account is not deployed has its first operation carry all of it, so the stamp needs no prompt of its own.
- The collection banner "<n> Abzeichen bereit · Jetzt eintragen" sends `readyClaimCalls` alone through `sendOrgCalls` (one fingerprint).

- [ ] **Step 1: Write the failing tests**

```ts
it('a private wish accepts without any transaction', …);
it('a public wish accepts and the claim becomes ready', …);
it('an invitation without a wish is left for the accept screen', …);
it('sendWithPiggyback orders Guest, ready claims, then the real calls in one operation', …);
it('a failing piggyback falls back to the real calls alone and skips claims for 24 hours', …);
it('at most five ready claims ride along', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `./node_modules/.bin/jest lib/credreg/__tests__ --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): waiting stamps settle by wish and ride along with the next operation`.

---

### Task 5: Profile collection "Abzeichen"

**Files:**
- Modify: `apps/expo/components/profile/BadgeGrid.tsx` (plan 3 Task 3), `CredentialDetailSheet.tsx`
- Modify: `apps/expo/lib/credreg/model.ts` (badges grouped by year; pending and queued badges included)
- Modify: `apps/expo/app/profile.tsx` (handle `?badge=<eventId>` → open that sheet; render the ready banner)
- Test: `apps/expo/lib/credreg/__tests__/model.test.ts` (extend), `apps/expo/components/profile/__tests__/badge-grid.test.tsx`

**Interfaces:**
- Produces (`model.ts`): `groupBadgesByYear(badges: RegisterCard[], pending: PendingBadge[], queued: string[] /* eventIds */): { year: number; items: BadgeTile[] }[]` with `type BadgeTile = { key: string; title: string; eventTitle: string | null; date: string | null; imageUrl: string | null; state: 'collected' | 'pending' | 'queued'; visibility: 'public' | 'private' | null; card: RegisterCard | null }` — newest year first, newest first inside a year; year from the event date, else from the holding's `since`.
- `BadgeGrid` renders section heading "Abzeichen", one sub-heading per year, tiles as `StampCard size="tile"`; empty state: a dashed stamp outline and "Noch keine Abzeichen. Scanne bei einer Veranstaltung den QR-Code am Eingang, dann landet dein erstes Abzeichen hier."
- `CredentialDetailSheet` for a badge: `StampCard size="hero"`, event title and date, org name, the public/private switch (plan 3 Task 3 semantics, with its chain-history warning), "Vorzeigen", "Teilen". For a pending tile: "Wird eingetragen, sobald der Veranstalter die Abzeichen vergibt." and no switch.

- [ ] **Step 1: Write the failing tests**

```ts
it('groups by year, newest first, pending and queued included', …);
it('empty grid shows the collect-your-first explanation', …);
it('a pending tile opens a sheet without the visibility switch', …);
it('/profile?badge=<eventId> opens that badge\'s sheet', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): Abzeichen collection grouped by year`.

---

### Task 6: Org profile, management side — "Mitglieder & Ausweise"

**Files:**
- Create: `apps/expo/app/org/credentials/members.tsx` (the area), `types-new.tsx` (create from template on the phone)
- Modify: `apps/expo/app/org/credentials/index.tsx` (plan 3 Task 6: becomes the area's start, linking to `members.tsx`), `apps/expo/app/org/manage.tsx` and `apps/expo/app/account/[id]/index.tsx` (for owners/admins of that org: entry row "Mitglieder & Ausweise")
- Modify: `apps/web/src/lib/credentials/batch.ts` (`prepareBatch` accepts `renewTypeId`)
- Test: `apps/expo/lib/credreg/__tests__/members-view.test.ts`, `apps/web/tests/credentials-batch.test.ts` (extend)
- Create: `apps/expo/lib/credreg/members-view.ts`

**Interfaces:**
- Produces (web): `prepareBatch({ …, renewTypeId: Hex, validUntil })` — recipients = everyone with an `accepted` invitation of that type that is not revoked (account leaves to their bound wallet), the new `validUntil` required; summary title `` `${n} Ausweise für ${year} erneuern: ${name}` ``.
- Produces (`members-view.ts`): `memberRows(people: PersonRow[], filter: 'alle' | 'eingeladen' | 'angenommen' | 'abgelaufen' | 'widerrufen', query: string): PersonRow[]`; `MEMBER_LIST_PHONE_LIMIT = 100` — above it the list shows the first 100 and the line "Für große Listen: roebel.app/dashboard/credentials".
- `members.tsx`: type switcher, filter chips, search, rows with state (never public/private unless `public` is true, then a small "Öffentlich"), row actions "Widerrufen"; header actions "Ausweis ausstellen" (plan 3 `issue.tsx`), "Für neues Jahr erneuern" (date picker → `renewTypeId`), "Neuer Ausweis-Typ" (`types-new.tsx`: the template list of plan 4 Task 2 as a phone form using `formFromTemplate`'s values copied into `lib/credreg/templates.ts`), the members switch and delegates (plan 3 Task 6). Every change goes to the approve screen.

- [ ] **Step 1: Write the failing tests**

```ts
it('filters by state and by name', …);
it('caps the phone list at 100 and says where the full list is', …);
it('never labels a member private', …);
test('renewTypeId builds a batch of all accepted, unrevoked holders with the new date', …);   // web
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** both — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): Mitglieder & Ausweise on the org profile` and `feat(web): renew a credential type for a new year`.

---

### Task 7: Org profile, public side

**Files:**
- Modify: `apps/expo/app/account/[id]/index.tsx` (around the "Mitglieder" section, about line 515)
- Create: `apps/expo/components/org/OrgCredentialsPublic.tsx`
- Modify: `apps/expo/lib/credreg/api.ts` (`fetchOrgPublic(accountId)`, unsigned GET of Task 1's route)
- Test: `apps/expo/components/org/__tests__/org-credentials-public.test.tsx`

**Interfaces:**
- Produces: `OrgCredentialsPublic` props `{ data: OrgPublicView }` rendering, in order: "Ämter" (each office with holder names and the seal for recognised ones), "Mitglieder" (public members as avatar stack + count, only when `publicMembers` is a non-empty list), "Abzeichen dieser Organisation" (stamp tiles with "<n> gesammelt"), and a slot `boundMiniApp` that renders nothing until project 3 provides the binding.
- Rule (open question 1): when `usesRegister` is true and the gate is open, the existing DB "Mitglieder" avatar stack is replaced by this component; otherwise the profile stays as it is.

- [ ] **Step 1: Write the failing tests**

```tsx
it('shows offices for a Fraktion and no member names when publicMembers is null', …);
it('shows public members of a Verein that allows it', …);
it('keeps the old Mitglieder section for an org without register types', …);
it('renders org badges with their collected counts', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (4).
- [ ] **Step 5: Lint and commit** — `feat(expo): offices, public members and badges on the public org profile`.

---

### Task 8: Whole-plan check

- [ ] **Step 1:** `cd apps/expo && ./node_modules/.bin/jest lib/credreg components/credentials components/profile components/org --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 2:** `grep -rn "'worklet'" components/credentials lib/credreg/motion.ts` lists every helper used by `useStampAnimation`; read each `useAnimatedStyle` body and confirm no un-workletised same-file call.
- [ ] **Step 3:** `npx expo export --platform android --output-dir "$TMPDIR/credreg3b-export"` — Expected: no resolve error. Delete the directory.
- [ ] **Step 4:** Put the device checklist into the pull request description: scan online / offline / twice / before start / after end / signed out; guest first stamp (no prompt, "wird eingetragen", claimed with the first Münzen collection); reduced motion on iOS and Android; collection empty and grouped; ready banner; Fraktion public profile; Verein public profile; Mitglieder & Ausweise with 100+ rows.

---

## Owner gates (Max)

1. Preview OTA after plan 4's server parts are deployed (Vercel) and the flag is on for preview. Runtime-test the bundle on the old binary before any `eas update` (worklet rule).
2. Decide open question 1 before the production flag: it changes what every org's public profile shows.

## Self-review notes

- Spec 5.6b: QR → stamp moment with animation, haptic, Münzen line, Ansehen/Teilen, all error states, offline queue, guest first stamp (Tasks 2–4); collection with year groups, detail sheet, empty state (Task 5); event page and organiser toggle (plan 4 Task 9); management area incl. renew and templates (Task 6); public side (Task 7); visual language and reduced motion (Task 2, copy guard).
- Spec 5.6b's "one fingerprint at most … the claim rides the first sponsored op later" is met by Task 4; the badge leaf itself still comes from the organiser or the node delegate (plan 4), so "Abzeichen erhalten" is shown truthfully as "wird eingetragen" until then.
