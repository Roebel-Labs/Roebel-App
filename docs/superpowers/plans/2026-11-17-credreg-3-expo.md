# Credential Register 3 — Röbel App (Expo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the register visible and usable in the Röbel app: profile cards and a badge grid driven by the register, accepting an Ausweis with the public/private choice, showing and scanning a proof, the org side on the phone (issue to one person, revoke, confirm an action prepared on a desktop, door-scanner delegate), Guest as a self-claimed token, all behind a flag pair.

**Architecture:** A new folder `apps/expo/lib/credreg/` holds everything that is not a screen: gate, chain reads, the signed API client, a pure model that turns register data into cards and badges, a pure verifier for shown proofs, and a small on-device cache. Encodings and call data come only from `@netizen-labs/credential-registry`; the registry address comes only from the app's own constants, so a server can never point the phone at another contract. Screens are thin and use `StyleSheet.create()` + `useTheme()`.

**Tech Stack:** Expo SDK 56 / React Native, expo-router, thirdweb v5 account adapter (covers the old sign-in and passkey Safes), viem 2.53, jest-expo, `@netizen-labs/credential-registry` (plans 1 and 2).

**Spec:** `docs/superpowers/specs/2026-11-17-credential-register-design.md` (sections 5.2, 5.3, 5.6, 5.9, 6). Server contract: `docs/superpowers/plans/2026-11-17-credreg-2-backend.md` (Tasks 3, 4, 5, 8). Chain contract: `docs/superpowers/plans/2026-11-17-credreg-1-contract.md` ("The interface").

**Depends on:** plans 1 and 2 on the branch this one is based on; for the device pass, the test-environment registry and the server env of plan 2.


> **Owner decision update 2026-11-17 (overrides item 1 below and every "private-only" rule in this plan):**
> each person can switch a credential between public and private at any time (public → private = renounce, and
> the app says the earlier public record stays in the chain history). The private-only switch belongs to the
> **org**: "Mitglieder dürfen öffentlich sichtbar sein". `fraktion` and `stadt` orgs start with it off and **the
> org's authority can turn it off and on**; an attester can only turn it off; the contract owner can do both.
> Offices stay always public. Zero-knowledge membership proofs are a later plan (`credreg-6-zk`); keep the leaf
> format and type ids so a Semaphore-style group per type can be added without a redeploy of this contract if
> possible, and say in your final report whether it is.

## Open questions for the owner

1. **Where Guest is claimed.** Spec 5.1: "in the same sponsored operation as its first on-chain action". *Default: three places a non-citizen account sends something: the citizenship request, collecting Röbel Münzen, and publicly accepting an Ausweis. If adding the Guest call makes the operation fail, the app retries once without it, so Guest can never block the real action.*
2. **Citizens and the Gastkarte.** *Default: unchanged from today: a citizen does not see the Gastkarte, even if the account holds the Guest token.*
3. **Badges of other people.** *Default: a person's public profile shows their public badges and cards; private ones are never sent to another device.*
4. **Attester switch for private-only.** The contract lets any attester switch an org to private-only. *Default: no screen for it in this plan; an attester can do it from the admin tools later.*

## Global Constraints

- UI text German, code and comments English. `StyleSheet.create()` + `useTheme()`; no NativeWind. Never show a wallet address: not in a card, a list, an error or a log line a person can read.
- No vendor names in the app. "Röbel Münzen" by name.
- Fewest prompts: related calls go into one sponsored operation (`sendOrgCalls` in `apps/expo/lib/org-safe/send.ts` sends one call as a transaction and several as one batch; reuse it).
- No new native modules, no new dependencies except `@netizen-labs/credential-registry` (`workspace:*`). Everything ships by OTA.
- New surfaces are closed unless `credentials_enabled` is `'true'`, and on the production channel also `credentials_enabled_production` (pattern: `apps/expo/lib/org-safe/gate.ts`). A closed gate must leave the profile exactly as it is today.
- The live app must keep working for people on the old sign-in and on passkey accounts; never log anyone out.
- Do not run a full `tsc` in `apps/expo` (it runs out of memory). Verify with eslint on touched files plus tests: `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci` and `./node_modules/.bin/eslint <files>`.
- Work in a git worktree: `git worktree add .worktrees/credreg-3 -b feat/credreg-3-expo` (based on the credreg-2 branch if that is not on `main`), `pnpm install --frozen-lockfile`. Stage by explicit path. Every task ends with commit + `git push -u origin feat/credreg-3-expo`. Never merge to `main`, never run `eas`.
- Commit convention: `feat(expo): …`, `test(expo): …`.

## Review Focus

1. **A phone asked to confirm something else than it shows.** The server sends steps and a summary. Expected: the confirm screen describes the steps itself, encodes them against the app's own registry address, and refuses when the summary's numbers do not match the steps. Test in Task 6.
2. **Guest breaks the first real action.** Expected: a failed operation that contained the Guest call is retried once without it; the person never sees an error caused by Guest. Test in Task 7.
3. **A private Ausweis after reinstalling the app.** Expected: the list comes back from the server after sign-in (`mine`), nothing depends on the old device's storage. Test in Task 2.
4. **The gate is off or the registry address is missing.** Expected: profile shows exactly the three cards of today, no network call to the credential routes, no crash. Test in Task 3.
5. **A shown code that is replayed.** Somebody photographs the QR code. Expected: the scanner rejects a presentation older than 300 seconds and one whose account signature does not verify. Test in Task 5.

---

### Task 1: Wiring — package, constants, gate, chain reads, API client

**Files:**
- Modify: `apps/expo/package.json` (add `"@netizen-labs/credential-registry": "workspace:*"`)
- Modify: `apps/expo/constants/gnosis.ts` (after the OrgRegistry block, about line 52)
- Modify: `apps/expo/lib/supabase-app-settings.ts` (after `fetchOrgSafesEnabledProduction`)
- Modify: `apps/expo/lib/signed-request.ts` (scope and action type)
- Create: `apps/expo/lib/credreg/gate.ts`, `chain.ts`, `api.ts`, `types.ts`
- Test: `apps/expo/lib/credreg/__tests__/gate.test.ts`, `api.test.ts`

**Interfaces:**
- Produces (`constants/gnosis.ts`): `credentialRegistryGnosisAddress = process.env.EXPO_PUBLIC_CREDENTIAL_REGISTRY_GNOSIS || ""` (empty until the production deployment; then the production address becomes the fallback) and `credentialRegistryDeployBlock = Number(process.env.EXPO_PUBLIC_CREDENTIAL_REGISTRY_DEPLOY_BLOCK || 0)`.
- Produces (`supabase-app-settings.ts`): `fetchCredentialsEnabled(): Promise<boolean>`, `fetchCredentialsEnabledProduction(): Promise<boolean>` (keys `credentials_enabled`, `credentials_enabled_production`; only `'true'` enables).
- Produces (`signed-request.ts`): `CREDENTIALS_SCOPE = 'roebel-credentials-v1'`, `type CredentialAction` (the same union as `apps/web/src/lib/signed-request/message.ts`), added to `SignedAction`.
- Produces (`gate.ts`): `credentialsConfigured(): boolean`; `credentialsAllowed(p: { flag: boolean; productionFlag: boolean; channel: string | null | undefined; dev: boolean }): boolean` (same truth table as `orgSafesAllowed`); `isCredentialsAllowed(): Promise<boolean>`; `useCredentialsGate(): boolean | null` (null while loading).
- Produces (`chain.ts`): `registryReader()` (a `createCredentialRegistryReader` over a viem public client on `EXPO_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com'`, as in `lib/org-safe/chain.ts`); `REGISTRY: Address`; `fetchTypeMetadata(uri: string): Promise<{ name: string; description: string; image: string | null; properties: { kind: string; organisation: string | null; recognised: boolean; benefits: string[] } } | null>` (10 s timeout with `AbortController`; RN fetch never times out on its own).
- Produces (`types.ts`): `InvitationView`, `Presentation`, `ActionView`, `PersonRow` — the response shapes of plan 2 Tasks 4, 5 and 8, copied field for field.
- Produces (`api.ts`): `credApi<T>(account: SigningAccount, route: 'org' | 'actions' | 'me', action: CredentialAction, payload: Record<string, unknown>): Promise<ApiResult<T>>` built on the existing signed-request sender in `lib/signed-request.ts` (same queueing, same passkey-session shortcut), plus one typed wrapper per action used in this plan: `fetchMine`, `redeemInvitation`, `respondInvitation`, `fetchHoldings`, `createPresentation`, `resolvePresentation`, `fetchTypes`, `fetchPeople`, `searchPeople`, `prepareBatch`, `prepareRevocation`, `prepareDelegate`, `fetchActions`, `fetchAction`, `reportSubmitted`, `cancelAction`.

- [ ] **Step 1: Write the failing tests**

```ts
// gate.test.ts — the six rows of the truth table
it('kill switch off closes everything, also in dev', …);
it('dev and non-production channels are open with the flag on', …);
it('production needs the production flag too', …);
it('a release build without a channel is closed', …);
it('isCredentialsAllowed is false without a registry address and makes no settings call', …);
// api.test.ts
it('signs under roebel-credentials-v1 and posts to /api/credentials/<route>', …);
it('a network failure is { ok: false, code: "NETWORK_ERROR" } and never throws', …);
```

- [ ] **Step 2: Run** `./node_modules/.bin/jest lib/credreg/__tests__ --watchAll=false --no-watchman --ci` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests — Expected: PASS (7). Then prove Metro can bundle the workspace package (the only check that catches a `.js` import in it): `cd apps/expo && npx expo export --platform android --output-dir "$TMPDIR/credreg-export-check"` — Expected: "Exported" without `Unable to resolve module`; delete the output directory afterwards.
- [ ] **Step 5: Lint and commit** — `feat(expo): credential register wiring (gate, chain reads, API client)`.

---

### Task 2: The model — what a person holds

**Files:**
- Create: `apps/expo/lib/credreg/model.ts`, `held.ts`
- Modify: `apps/expo/lib/credentials.ts` (export the benefit list type for reuse; no behaviour change)
- Test: `apps/expo/lib/credreg/__tests__/model.test.ts`, `held.test.ts`

**Interfaces:**
- Produces (`model.ts`):

```ts
export type RegisterCard = {
  key: string;                       // 'builtin:citizen' or typeId
  source: 'builtin' | 'register';
  builtin?: CredentialKind;          // guest | citizen | attester
  typeId?: Hex;
  kind: 'role' | 'membership' | 'badge';
  title: string; orgName: string | null; imageUrl: string | null;
  recognised: boolean;
  visibility: 'public' | 'private';
  validUntil: number | null;         // unix seconds
  state: 'valid' | 'expired';
  invitationId?: string;
};
export function buildProfile(input: {
  isCitizen: boolean; isAttester: boolean;
  held: HeldCredential[];            // from held.ts
  nowSec: number;
}): { cards: RegisterCard[]; badges: RegisterCard[] };
export function publicProfile(input: { isCitizen: boolean; isAttester: boolean; publicHeld: HeldCredential[]; nowSec: number }): { cards: RegisterCard[]; badges: RegisterCard[] };
```

  Order of `cards`: the built-in cards exactly as `credentialKindsFor` returns them today, then recognised roles, then other roles, then memberships, each group by title. `badges`: newest first. Expired entries stay in the list with `state: 'expired'` for 30 days after expiry, then drop out. Guest never appears as a register card (the built-in Gastkarte stands for it).
- Produces (`held.ts`):
  - `type HeldCredential = { typeId: Hex; kind: 'role' | 'membership' | 'badge'; title: string; orgName: string | null; imageUrl: string | null; recognised: boolean; visibility: 'public' | 'private'; validUntil: number | null; invitationId: string | null; claim: InvitationView['claim'] | null }`
  - `loadHeld(account: SigningAccount, deps?): Promise<HeldCredential[]>` — `fetchMine` (accepted invitations), then one `registryReader().holdsMany` for their type ids: `public` when the chain says held, otherwise `private`; revoked invitations are dropped; result cached under `credreg:held:v1:<address lowercase>` in AsyncStorage and returned from cache first when offline.
  - `loadPublicHeld(address: Address, deps?): Promise<HeldCredential[]>` — for another person's profile. A full log replay is too heavy for a phone, so: the public type directory `GET /api/credentials/types` (plan 2 Task 3; unsigned, cached 5 minutes in memory) gives the type ids and their names, then one `holdsMany(typeIds, address)` on chain decides. Returns only `visibility: 'public'` entries; the server is never asked about the other person.
  - `clearHeld(address): Promise<void>` (called on logout).
  - `useHeld(): { held: HeldCredential[]; pending: InvitationView[]; refresh(): Promise<void>; loading: boolean }` — `pending` = invitations in state `invited`.

- [ ] **Step 1: Write the failing tests**

```ts
it('a citizen with nothing else gets exactly today\'s cards', …);                       // cards.map(c => c.key) equals ['builtin:citizen']
it('an attester keeps citizen behind attester, register cards follow', …);
it('recognised roles come before other roles and memberships', …);
it('badges are separate and newest first', …);
it('an Ausweis expired 5 days ago is shown as expired; after 31 days it is gone', …);
it('the Guest register type never produces a second card', …);
it('publicProfile contains no private entry even if one is passed in', …);
it('loadHeld marks chain-held types public and accepted-only ones private', …);
it('loadHeld returns the cache when the request fails and refreshes it when it succeeds', …);
it('after clearHeld a new loadHeld restores private entries from the server (reinstall case)', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `./node_modules/.bin/jest lib/credreg/__tests__ lib/__tests__/credentials.test.ts --watchAll=false --no-watchman --ci` — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): register-driven credential model and held-credentials cache`.

---

### Task 3: Profile — cards from the register, badge grid, seal

**Files:**
- Modify: `apps/expo/app/profile.tsx:107-108,182`
- Modify: `apps/expo/components/profile/CredentialCardStack.tsx`, `CredentialCard.tsx`, `credential-art.ts`
- Create: `apps/expo/components/profile/BadgeGrid.tsx`, `RecognisedSeal.tsx`, `CredentialDetailSheet.tsx`
- Modify: `apps/expo/app/user/[username].tsx` (public cards and badges of another person)
- Test: `apps/expo/components/profile/__tests__/credential-stack.test.tsx`

**Interfaces:**
- Consumes: `buildProfile`, `publicProfile`, `useHeld`, `useCredentialsGate`.
- Produces: `CredentialCardStack` props become `{ cards: RegisterCard[]; onPress(card: RegisterCard): void }`; a built-in card renders exactly as today (same art, same label); a register card renders `imageUrl` when present, otherwise a neutral default face drawn with views (new component `DefaultCardFace` in `CredentialCard.tsx`: the card shape and radius of `credential-art.ts` (`CARD_ASPECT`, `CARD_RADIUS_AT_462`), theme primary as background, the type title, the org name, and a small "Amt" or "Mitglied" label by kind; no new image assets). `RecognisedSeal` is a small round mark at the card's top right with the accessibility label "Offizielles Amt der Stadt". An expired card is dimmed and carries "Abgelaufen". A private card carries a small lock and "Privat".
- Produces: `BadgeGrid` props `{ badges: RegisterCard[]; onPress(card): void }` — three columns, square tiles with image (default: a neutral ribbon tile), title under it, section heading "Abzeichen"; renders nothing for an empty list.
- Produces: `CredentialDetailSheet` props `{ card: RegisterCard | null; onClose(): void; onShow(card): void; onMakePublic(card): void; onMakePrivate(card): void }` — title, org, valid until ("Gültig bis 31.12.2027" / "Unbefristet"), benefits from the type metadata, and the actions "Vorzeigen", "Öffentlich zeigen" (private and allowed) or "Privat machen" (public). For built-in cards the existing explainer opens instead (`openExplainer`).

Rules: when `useCredentialsGate()` is not `true`, `profile.tsx` passes `buildProfile({ isCitizen, isAttester, held: [], nowSec })` and renders no `BadgeGrid`, and `useHeld` is not mounted. "Privat machen" explains before sending: "Dein Ausweis wird aus dem öffentlichen Register genommen. Der bisherige Eintrag bleibt in dessen Verlauf sichtbar. Dein Nachweis bleibt gültig." and then sends `renounceCall`. "Öffentlich zeigen" runs the claim of Task 4.

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders today\'s three built-in cards unchanged when the gate is closed', …);        // snapshot of accessibility labels equals the current ones
it('makes no credential request when the gate is closed', …);                             // fetchMine mock not called
it('shows register cards after the built-in ones and a seal on a recognised role', …);
it('shows "Privat" on a private card and "Abgelaufen" on an expired one', …);
it('BadgeGrid renders nothing without badges and three tiles for three badges', …);
it('no rendered text matches /0x[0-9a-fA-F]{6,}/', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the test file and `lib/__tests__/credentials.test.ts` — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): profile cards and badge grid from the credential register`.

---

### Task 4: Annehmen — invitation, link, the public/private choice

**Files:**
- Create: `apps/expo/app/credentials/index.tsx` (inbox: "Deine Ausweise" with open invitations on top)
- Create: `apps/expo/app/credentials/accept/[id].tsx`
- Create: `apps/expo/app/invite/ausweis/[token].tsx`
- Create: `apps/expo/lib/credreg/accept.ts`
- Modify: `apps/expo/hooks/useNotifications.ts` (tap on `credential_invite` → `/credentials/accept/<invitationId>`; `credential_action` → `/org/credentials/approve/<actionId>`), `apps/expo/app/notifications/index.tsx` (same two types in the inbox switch), `apps/expo/app/+native-intent.tsx` (no mapping needed if `/invite/ausweis/<token>` resolves by file route; add a test either way)
- Modify: `apps/expo/app/profile.tsx` (a row "Neuer Ausweis wartet auf dich" above the cards when `pending.length > 0`)
- Test: `apps/expo/lib/credreg/__tests__/accept.test.ts`, `apps/expo/lib/__tests__/native-intent-credential.test.ts`

**Interfaces:**
- Produces (`accept.ts`):

```ts
export type AcceptChoice = 'public' | 'private' | 'decline';
export type AcceptOptions = { canPublic: boolean; canPrivate: boolean; reason: 'office' | 'private_only' | 'free' };
export function acceptOptions(inv: InvitationView): AcceptOptions;
export async function acceptInvitation(account: Account, inv: InvitationView, choice: AcceptChoice, deps?): Promise<{ ok: true } | { ok: false; message: string }>;
export async function makePublic(account: Account, held: HeldCredential, deps?): Promise<{ ok: true } | { ok: false; message: string }>;
```

  `acceptOptions`: a recognised `role` → `{ canPublic: true, canPrivate: false, reason: 'office' }`; `publicClaimAllowed === false` → `{ canPublic: false, canPrivate: true, reason: 'private_only' }`; otherwise both, `reason: 'free'`.
  `acceptInvitation`: `public` → `sendWithGuestClaim` (Task 7; until then `sendOrgCalls`) with `claimCall(REGISTRY, { batchId, leaf, proof, claimSignature })`, wait for the receipt, then `respondInvitation(accept)`; `private` → `respondInvitation(accept)` only, no transaction, no fingerprint; `decline` → `respondInvitation(decline)`. After any of them `useHeld().refresh()`.
- Screen copy (exact):
  - Heading: `Du hast einen Ausweis erhalten` (badge: `Du hast ein Abzeichen erhalten`), then type title, org name, validity.
  - Option 1 **"Öffentlich zeigen"** — "Dein Ausweis steht im öffentlichen Register von Röbel. Jede:r kann nachsehen, dass dein Konto ihn trägt. Das lässt sich später beenden, bleibt aber im Verlauf des Registers sichtbar."
  - Option 2 **"Privat behalten"** — "Nur du hast den Nachweis. Du kannst ihn vorzeigen, wenn du möchtest. Niemand kann nachschlagen, dass du ihn hast."
  - `office`: one button **"Amt annehmen"** with "Ein Amt ist öffentlich. Mit dem Annehmen steht es im Register von Röbel."
  - `private_only`: one button **"Annehmen"** with "Diese Mitgliedschaft bleibt privat. Sie erscheint nicht im öffentlichen Register."
  - Text link under the buttons: "Ablehnen".
  - One primary button per screen: for `free` the choice is two selectable rows and a single "Weiter" button; nothing is preselected for roles and memberships, "Öffentlich zeigen" is preselected for badges.
- `invite/ausweis/[token].tsx`: signed out → the existing login drawer (as `app/invite/[token].tsx` does), then `redeemInvitation(token)` and `router.replace('/credentials/accept/<id>')`; `ALREADY_REDEEMED` → "Dieser Ausweis wurde bereits abgeholt."; unknown → "Dieser Link ist nicht gültig."

- [ ] **Step 1: Write the failing tests**

```ts
it('a recognised role can only be accepted publicly', …);
it('a membership of a private-only org can only be accepted privately', …);
it('a free invitation offers both', …);
it('public sends exactly one claim call for the app\'s registry address, then reports accept', …);
it('private sends no transaction and reports accept', …);
it('a failed claim does not report accept and returns a German message without an address', …);
it('claim-key invitations pass the server signature; account invitations pass 0x', …);
it('roebel://invite/ausweis/abc and https://www.roebel.app/invite/ausweis/abc both reach /invite/ausweis/abc', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** logic and the three screens. **Step 4: Run** — Expected: PASS (8).
- [ ] **Step 5: Lint and commit** — `feat(expo): accept an Ausweis with the public/private choice`.

---

### Task 5: Vorzeigen — show a proof, scan and check one

**Files:**
- Create: `apps/expo/lib/credreg/present.ts`, `verify.ts`
- Create: `apps/expo/app/credentials/show/[key].tsx`, `apps/expo/app/credentials/check.tsx`
- Modify: `apps/expo/components/QRScanner.tsx` (new result type `'credential'` for payloads `roebel-ausweis:<code>`; route to `/credentials/check?code=<code>` when no `onScan` handler is given)
- Test: `apps/expo/lib/credreg/__tests__/verify.test.ts`, `present.test.ts`

**Interfaces:**
- Produces (`present.ts`): `SHOW_SCOPE = 'roebel-credential-show-v1'`; `showMessage(p)` (identical string to plan 2 Task 8); `buildPresentation(account: Account, held: HeldCredential, nowSec: number, nonce: string): Promise<Presentation>` — signs `showMessage` with the account; includes `private` (batch id, leaf, proof, claim signature) only for a private credential; `qrPayload(code: string): string` = `` `roebel-ausweis:${code}` ``.
- Produces (`verify.ts`):

```ts
export type CheckResult =
  | { result: 'valid'; title: string; orgName: string | null; recognised: boolean; validUntil: number | null }
  | { result: 'expired' | 'revoked' | 'invalid'; title: string | null; orgName: string | null };
export async function verifyPresentation(
  r: { presentation: Presentation; signatureValid: boolean; ageSeconds: number },
  deps: { reader: CredentialRegistryReader; recoverClaimSigner: typeof recoverClaimSigner; metadata: typeof fetchTypeMetadata; registry: Address },
): Promise<CheckResult>;
```

  Rules, in order: `signatureValid` false or `ageSeconds > 300` → `invalid`. Public presentation: `reader.holds(typeId, account)` → `valid`, else `invalid`. Private: `leaf.typeId` must equal `presentation.typeId`; `reader.checkLeaf(batchId, leaf, proof)`: `expired` → `expired`, `revoked` → `revoked`, `invalid` / `inactive` → `invalid`; `valid` then needs the binding: account leaf → `leaf.subject === account`; claim-key leaf → `boundTo === account`, or `boundTo === null` and the claim signature recovers to `leaf.subject` for this account, this batch and this registry. Title and org name come from the type's metadata URI read from chain (`reader.getType`), never from the presentation.
- Show screen: a QR code of `qrPayload(code)`, the card above it, a countdown "Gültig noch 4:59", "Neu erzeugen" when it ran out. One fingerprint at most (the account signature); for an account that signs silently, none.
- Check screen: a large "Gültig" (green), "Abgelaufen" (amber), "Widerrufen" or "Nicht gültig" (red), type title, org name, the seal for a recognised office, and "Gültig bis …". Never a name, picture or address of the person.

- [ ] **Step 1: Write the failing tests**

```ts
it('public: holds true → valid; false → invalid', …);
it('private account leaf: valid only when the leaf subject is the presenting account', …);
it('private claim-key leaf: valid when bound to the account, or unbound with a signature recovering to the subject', …);
it('a claim-key leaf bound to another account is invalid', …);
it('checkLeaf expired → expired, revoked → revoked, inactive → invalid', …);
it('older than 300 s or a bad account signature → invalid without any chain read', …);
it('a presentation whose leaf is for another type than it claims → invalid', …);
it('title and org come from chain metadata, not from the presentation', …);
it('buildPresentation leaves out the private part for a public credential', …);
it('the scanner recognises roebel-ausweis:<code>', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (10).
- [ ] **Step 5: Lint and commit** — `feat(expo): show and check a credential proof`.

---

### Task 6: Org side on the phone

**Files:**
- Create: `apps/expo/lib/credreg/org.ts`
- Create: `apps/expo/app/org/credentials/index.tsx`, `issue.tsx`, `approve/[id].tsx`, `delegates.tsx`
- Modify: `apps/expo/app/org/dashboard.tsx` (tile "Ausweise", shown when the gate is open and the active role is owner or admin)
- Test: `apps/expo/lib/credreg/__tests__/org.test.ts`

**Interfaces:**
- Consumes: `RegisterStep`, `parseSteps`, `encodeSteps` (plan 2 Task 2); `fetchAction`, `reportSubmitted`, `prepareBatch`, `prepareRevocation`, `prepareDelegate`, `fetchTypes`, `fetchPeople`, `fetchActions`.
- Produces (`org.ts`):

```ts
export function describeSteps(steps: readonly RegisterStep[], names: (typeId: Hex) => string | null): string[];
export function checkSummary(steps: readonly RegisterStep[], summary: ActionSummary): { ok: true } | { ok: false; reason: string };
export async function confirmAction(account: Account, action: ActionView, deps?): Promise<{ ok: true } | { ok: false; message: string }>;
```

  `describeSteps` (German, built from the steps only): `createType` → "Ausweis-Typ anlegen: <name>"; `updateType` → "Ausweis-Typ ändern: <name>"; `retireType` → "Ausweis-Typ dauerhaft stilllegen: <name>"; `setDelegate` true/false → "Ein Konto zum Ausstellen berechtigen: <name>" / "Berechtigung zum Ausstellen entziehen: <name>"; `setOrgPrivateOnly` → "Mitgliedschaften dieser Organisation dauerhaft privat halten"; `addBatch` → "<count> Ausweise ausstellen: <name>" (badge types: "<count> Abzeichen vergeben: <name>"); `revokeLeaves` → "<n> Ausweise widerrufen"; `revokeBatch` → "Eine ganze Ausstellung widerrufen". An unknown type name is "Unbekannter Typ".
  `checkSummary`: the sum of `addBatch.count` must equal `summary.counts.app + summary.counts.link` when counts are given; otherwise `{ ok: false }`.
  `confirmAction`: `parseSteps(action.steps)` (throws → refuse), `checkSummary`, `registryReader().canIssue`/`canManage` for the caller (false → message "Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Gleiche zuerst die Rollen ab: Organisation → Einstellungen → Onchain-Organisation."), `encodeSteps(steps, REGISTRY)`, `sendOrgCalls(account, calls)`, then `reportSubmitted(actionId, txHash)`. `sendOrgCalls` returns nothing today: change it to return the transaction hash (`Promise<Hex | null>`) and keep its two existing callers working.
- Screens:
  - `index.tsx`: "Wartet auf deine Bestätigung" (open actions), the org's types with counts ("12 angenommen · 3 offen"), per type a people list with the states of plan 2 `listPeople`, row actions "Widerrufen" (confirm dialog, then `prepareRevocation` → approve screen) and "Erneut einladen" is not offered (renewal happens through a new batch).
  - `issue.tsx`: pick a type, search a person by name (`searchPeople`), optional "Gültig bis", one button "Ausweis ausstellen" → `prepareBatch` with one recipient → `approve/<id>`.
  - `approve/[id].tsx`: the lines of `describeSteps`, the org name, "Vorbereitet am Computer" / "Vorbereitet in der App", one primary button **"Bestätigen"** and a text link "Verwerfen" (`cancelAction`). After success: "Erledigt. Die Einladungen werden jetzt verschickt."
  - `delegates.tsx`: explains "Ein Türscanner-Konto darf für diesen Ausweis-Typ ausstellen und widerrufen, sonst nichts."; pick a type and a member of the org; lists current delegates by display name with "Entziehen".
- An org that is not on chain (`409 ORG_NOT_ON_CHAIN` from any prepare call) shows one explanation card with a button to the org's settings; no other control.

- [ ] **Step 1: Write the failing tests**

```ts
it('describeSteps names every step kind in German from the steps alone', …);
it('checkSummary rejects 70 announced and 71 in the steps', …);
it('confirmAction encodes against the app registry address even if the action carries another one', …);
it('confirmAction refuses unknown step kinds without sending', …);
it('confirmAction stops with the role-sync message when the caller has no chain authority', …);
it('confirmAction reports the transaction hash after sending', …);
it('a rejected signature leaves the action untouched and returns a message without an address', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** this file and `lib/__tests__/org-safe-ops.test.ts` — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): org credential management and phone confirmation`.

---

### Task 7: Guest as a self-claimed token

**Files:**
- Create: `apps/expo/lib/credreg/guest.ts`
- Modify: `apps/expo/hooks/useVerification.ts:94-99,170-175` (the two `createAttestationRequest` sends), `apps/expo/lib/muenzen-claim.ts:115-136` (the batch claim), `apps/expo/lib/credreg/accept.ts` (public claim)
- Test: `apps/expo/lib/credreg/__tests__/guest.test.ts`

**Interfaces:**
- Produces:

```ts
export async function guestCallIfNeeded(p: { address: Address; isCitizen: boolean }, deps?): Promise<Call | null>;
export async function sendWithGuestClaim(account: Account, calls: readonly Call[], p: { isCitizen: boolean }, deps?): Promise<Hex | null>;
```

  `guestCallIfNeeded` returns `selfClaimCall(REGISTRY, RESERVED_TYPE_IDS.guest)` only when the gate is open, the account is not a citizen and `reader.holds(guest, address)` is false (result cached per address for the session; any read error → `null`).
  `sendWithGuestClaim` puts the Guest call first and sends everything as one operation; when that throws for any reason other than the person cancelling, it sends the original calls once more without the Guest call and remembers for 24 hours (AsyncStorage `credreg:guest-skip:<address>`) not to try again.

- [ ] **Step 1: Write the failing tests**

```ts
it('adds the Guest call for a non-citizen who does not hold it', …);
it('adds nothing for a citizen, a holder, a closed gate or a failing read', …);
it('one operation carries the Guest call first and the real calls after it', …);
it('a failure with the Guest call is retried once without it and the real action succeeds', …);
it('a cancellation by the person is not retried', …);
it('after a fallback the Guest call is skipped for 24 hours', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** and switch the three call sites; each keeps its current behaviour when `guestCallIfNeeded` returns `null` (the single-transaction path stays a single transaction).
- [ ] **Step 4: Run** `./node_modules/.bin/jest lib/credreg/__tests__/guest.test.ts lib/__tests__ --watchAll=false --no-watchman --ci` — Expected: PASS, no earlier test changed.
- [ ] **Step 5: Lint and commit** — `feat(expo): Guest is self-claimed with the first on-chain action`.

---

### Task 8: Members stop being written to OrgRegistry

**Files:**
- Modify: `apps/expo/lib/org-safe/ops.ts:293-311` (`planSync`)
- Modify: `apps/expo/components/org/OrgSafeSection.tsx` (wording only, where it speaks of syncing members)
- Test: `apps/expo/lib/__tests__/org-safe-ops.test.ts` (the `sync plan` block)

Rule (spec 5.2): `planSync` never produces a `setRole(…, member)`. A database `member` whose chain role is `none` stays `none`; one whose chain role is already `member` is left alone; a chain `member` who is no longer in the org's database list is cleared to `none`; `admin` handling and owner handling are unchanged. The wording in the settings section becomes "Inhaber:innen und Admins abgleichen".

- [ ] **Step 1: Change the tests first**

```ts
it('a new database member produces no setRole', …);
it('an existing chain member who is still in the org is left untouched', …);
it('a chain member who left the org is cleared', …);
it('admins are still set and cleared as before', …);
it('an org whose only difference is members is in sync', …);            // isInSync(planSync(...)) === true
```

- [ ] **Step 2: Run** — Expected: FAIL on the first, second and fifth. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): org role sync no longer writes ordinary members on chain`.

---

### Task 9: Whole-plan check

- [ ] **Step 1:** `cd apps/expo && ./node_modules/.bin/jest lib/credreg components/profile/__tests__ lib/__tests__/org-safe-ops.test.ts lib/__tests__/credentials.test.ts --watchAll=false --no-watchman --ci` — Expected: all PASS.
- [ ] **Step 2:** `./node_modules/.bin/eslint lib/credreg app/credentials app/org/credentials app/invite/ausweis components/profile hooks/useVerification.ts hooks/useNotifications.ts lib/muenzen-claim.ts lib/org-safe` — Expected: no errors.
- [ ] **Step 3:** `grep -rnE "0x\\$\\{|address\\}" app/credentials app/org/credentials components/profile/BadgeGrid.tsx components/profile/CredentialDetailSheet.tsx` — Expected: no line that puts an address into rendered text.
- [ ] **Step 4:** `npx expo export --platform android --output-dir "$TMPDIR/credreg-export-check"` — Expected: exports without a resolve error. Delete the directory.
- [ ] **Step 5:** Write the device-pass checklist into the pull request description (not a file): gate off = old profile; accept public, accept private, decline; link from a printed letter on a phone without the app; show and scan; issue to one person; confirm a 70-person action prepared in the browser; revoke; guest first action; passkey account and old sign-in each once.

---

## Owner gates (Max)

1. **EAS env** for the preview channel: `EXPO_PUBLIC_CREDENTIAL_REGISTRY_GNOSIS` and `EXPO_PUBLIC_CREDENTIAL_REGISTRY_DEPLOY_BLOCK` (test-environment values), then the preview OTA.
2. **Flags:** `credentials_enabled` = `true` for the preview pass; `credentials_enabled_production` only after the production deployment (plan 1), the production env (plan 2) and the legal review of the DPIA.
3. **Device pass** with the checklist of Task 9, on a passkey account and on an old sign-in account.
4. **Production OTA** after the address fallback in `constants/gnosis.ts` has been set to the production registry.

## Self-review notes

- Spec 5.6: Profil (Tasks 2, 3), Annehmen (Task 4), Vorzeigen (Task 5), org side (Task 6), other people's profiles (Task 3). Spec 5.3: the choice, offices public, private-only orgs, badges default public (Task 4). Spec 5.2: Task 8. Spec 5.1 Guest: Task 7. Spec 5.9: flags, no native modules (Task 1).
- `app/stamp-scan.tsx` is not touched (spec 5.5).
- Event badges for attendees arrive through the same accept screen; the organiser side is plan 4.
