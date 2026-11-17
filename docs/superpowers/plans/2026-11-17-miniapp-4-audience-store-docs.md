# Mini Apps 4 — Audience, Store and Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app shows the right mini apps to the right people, an org can have its own mini app, and a developer or a coding agent can build all of it from the docs, the mock and the published packages alone.

**Architecture:** A version-2 manifest says whom an app is for (`audience`) and which org it belongs to (`org`); the org confirms. The store reads all live apps as today and matches them on the device against the credentials the person holds, so a private membership never leaves the phone. Suggestions use the existing Erkunden layout (suggest only; the person taps "Übernehmen"). SDK 0.4.0 is prepared for release with a check that npm, the CDN copy and the AI builder's pin agree, and the docs are corrected and extended in one source (`devdocs.ts`) that feeds the website, `llms.txt`, `publish.md` and the developer MCP.

**Tech Stack:** Expo SDK 56 (StyleSheet + `useTheme()`, expo-router, AsyncStorage), jest-expo, Next.js 15, Supabase Postgres (migration file), node:test via tsx, tsup.

**Spec:** `docs/superpowers/specs/2026-11-17-miniapp-identity-wallet-design.md` (sections 5.6, 5.7, 5.4 last bullet, 6). Credentials: `docs/superpowers/specs/2026-11-17-credential-register-design.md` (section 8).

**Plan series:** 1 hardening → 2 identity and credentials → 3 wallet → 4 audience, store and docs (this). Requires plans 1 to 3 merged: manifest version "2" and `manifestStoreFields`, `isCredentialRef` / `refMatches`, `MINIAPP_SCOPE` and `verifySignedRequest` usage, `MiniApp.manifestVersion`, `packages/miniapp-verify`, everything the docs describe.

## Open questions for the owner

Tasks are written against the recommended default.

1. **The unpinned CDN file.** `https://www.roebel.app/sdk/miniapp-sdk.mjs` always serves the newest SDK. With 0.4.0 the wallet provider's errors carry numeric codes (plan 3), so a live app that loads the unpinned file and compares `error.code` to a string changes behaviour the moment web is deployed. *Default: the alias moves to 0.4.0 with the release, after you checked which live apps load it (Owner gate 2). Alternative: freeze the alias at 0.3.1 and document only pinned URLs.*
2. **How strict "required" is.** *Default: a required audience locks the app in the store, on the detail page and in the host. That is a courtesy on the device, not security; the docs tell developers to check the credential on their server.*
3. **Who confirms an org binding.** *Default: an owner or admin of the org (`account_owners` role `owner` or `admin`), on the phone, under Verwaltung.*
4. **Org-specific audiences before the credential register exists.** *Default: `audience` accepts org types now, but nobody matches them until the register is plugged into the adapter (Task 3). "Meine Vereine" works today from the org binding plus the accounts you belong to.*

## Global Constraints

- Matching happens on the device. No request may tell the node which credentials decided what is shown; the store keeps fetching all live apps.
- A private membership must not leak through recommendations: nothing that depends on a private credential is logged, tracked or sent (no `track` call with the matched reference, no server-side "for you" list).
- Suggestions only suggest: nothing is added to Erkunden until the person taps "Übernehmen". Each app is suggested at most once.
- Live mini apps keep working: `apps/mini-apps/roebel-data`, `_template`, external apps on SDK 0.3.0. An app without `audience` behaves exactly as today.
- Never return wallet addresses from public read APIs. Never show a wallet address in the UI. UI German, code and comments English. Expo: `StyleSheet.create()` + `useTheme()`, no NativeWind, no shadows. No vendor names in the UI. "Röbel Münzen" by name.
- Bridge protocol stays 1. SDK 0.4.0 must degrade cleanly on an older host: every new method answers `unsupported` there and `sdk.supports()` tells in advance.
- Docs are English for developers and agents (as today); German only where they quote UI copy.
- pnpm only, no new dependencies. Supabase: migration file only; applying it is an owner gate.
- Tests: web `cd apps/web && npx tsx --test tests/<file>`; SDK `cd packages/miniapp-sdk && npx tsx --test test/*.test.ts`; Expo `cd apps/expo && ./node_modules/.bin/jest <path> --watchAll=false --no-watchman --ci`. No full `tsc` in `apps/expo`; eslint on touched files plus tests.
- Work in a git worktree on `feat/miniapp-4-store-docs` (`git worktree add .worktrees/miniapp-4 -b feat/miniapp-4-store-docs`, `pnpm install --frozen-lockfile`). Stage by explicit path. Every task ends with commit + `git push -u origin feat/miniapp-4-store-docs`. Never merge to `main`, never `npm publish`, never run EAS, never deploy.

## Review Focus

1. **A person with no credentials and no orgs.** No "Für dich" rail, no empty filter, no suggestion card; the store looks as it does today. Test in Tasks 4 and 5.
2. **A locked app reached another way** (deep link `/mini-app/<slug>`, a pinned Erkunden block, a notification). It must not open; the person sees the reason and the way in. Test in Task 5.
3. **An app claims an org that never confirmed.** It must not appear on the org's page or under "Meine Vereine", and its lock text must not name the org. Tests in Tasks 2 and 4.
4. **A new manifest version changes the org.** The old confirmation must not carry over. Test in Task 2.
5. **The docs drift from the code again.** A test fails when an MCP tool, an SDK call or the SDK version in the docs no longer matches the source. Tests in Tasks 8 and 9.

---

### Task 1: Manifest `audience` and `org`, schema

**Files:**
- Modify: `packages/miniapp-sdk/src/types.ts` (`MiniAppManifest`), `apps/web/src/lib/miniapp/manifest.ts`, `apps/web/src/lib/miniapp/types.ts`
- Create: `supabase/migrations/20261117c_mini_app_audience_org.sql`
- Modify: `apps/expo/lib/miniapps.ts`
- Test: `apps/web/tests/miniapp-manifest-audience.test.ts`, extend `apps/expo/lib/__tests__/miniapps-map.test.ts`

**Interfaces:**
- Produces:
  - `interface MiniAppAudience { mode: 'required' | 'recommended'; anyOf: string[] }`; `MiniAppManifest` += `audience?: MiniAppAudience; org?: string`.
  - `validateManifest` (version "2" only; version 1 with either key → error naming the key and `version "2"`): `audience.mode` one of the two; `anyOf` 1 to 8 credential references (`isCredentialRef`), no duplicates; `org` a uuid (the org's account id, as shown in its app address `/account/<id>`), stored lowercased.
  - `manifestStoreFields` adds `audience` (or `null`) and `org_account_id` (or `null`).
  - SQL: `mini_apps` += `audience jsonb`, `org_account_id uuid references public.accounts(id) on delete set null`, `org_binding text not null default 'none' check (org_binding in ('none','requested','confirmed','rejected'))`, `org_binding_decided_at timestamptz`, `org_binding_decided_by text`. Index on `(org_account_id) where org_binding = 'confirmed'`.
  - Expo `MiniApp` += `audience: MiniAppAudience | null`, `orgAccountId: string | null` (only when `org_binding === 'confirmed'`, else `null`), `orgName: string | null` (join `accounts(name)` through `org_account_id`; `null` unless confirmed). Missing columns fall back as in plan 2 Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
test("an audience is normalised", () => {
  const m = validateManifest({ ...v2, audience: { mode: "required", anyOf: ["citizen", "org:12:*"] }, org: "3F2504E0-4F89-41D3-9A0C-0305E82C3301" });
  assert.deepEqual(m.audience, { mode: "required", anyOf: ["citizen", "org:12:*"] });
  assert.equal(m.org, "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
});
test("mode must be required or recommended", …);
test("anyOf needs 1 to 8 valid, distinct references", …);       // [], 9 entries, ["Bürger"], ["citizen","citizen"] all throw
test("org must be a uuid", …);
test("version 1 must not carry audience or org", …);
test("manifestStoreFields maps audience and org_account_id, null when absent", …);
// Expo
it('exposes the org only when the binding is confirmed', () => {              // Review Focus 3
  expect(mapMiniAppRow({ ...row, org_account_id: ORG, org_binding: 'requested', accounts: { name: 'PSV' } }).orgAccountId).toBeNull();
  const a = mapMiniAppRow({ ...row, org_account_id: ORG, org_binding: 'confirmed', accounts: { name: 'PSV' } });
  expect(a.orgAccountId).toBe(ORG); expect(a.orgName).toBe('PSV');
});
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement**, write the migration (do not apply).
- [ ] **Step 4: Run to verify they pass**; `tests/miniapp-*.test.ts` → PASS.
- [ ] **Step 5: Commit** → `feat: mini-app audience and org in the manifest`, push.

---

### Task 2: Org binding — request, decide, review

**Files:**
- Create: `apps/web/src/lib/miniapp/orgBinding.ts`, `apps/web/src/lib/miniapp/orgBindingHandler.ts`
- Create: `apps/web/src/app/api/mini-apps/org-binding/route.ts`
- Modify: `apps/web/src/lib/signed-request/message.ts` (`MiniAppAction` += `"org_binding_list" | "org_binding_decide"`), `apps/web/src/lib/miniapp/data.ts` (every write path that applies `manifestStoreFields` also applies `nextBinding`), `apps/web/src/app/admin/dashboard/mini-apps/[id]/page.tsx` (card "Zielgruppe & Verein": audience mode and types, org name, binding status)
- Test: `apps/web/tests/miniapp-org-binding.test.ts`

**Interfaces:**
- Produces:
  - `type OrgBinding = 'none' | 'requested' | 'confirmed' | 'rejected'`
  - `nextBinding(prev: { orgAccountId: string | null; binding: OrgBinding }, nextOrg: string | null): OrgBinding` — no org → `'none'`; same org as before → unchanged; a different org → `'requested'`.
  - Signed request (scope `roebel-miniapp-v1`): `org_binding_list` payload `{ account }` → `{ apps: { id, slug, name, iconUrl, binding }[] }` for that org (status `live` or `pending` apps with `org_account_id = account` and binding not `none`); `org_binding_decide` payload `{ app, decision: "confirm" | "reject" | "remove" }` → `{ binding }`. Both require the signer to be `owner` or `admin` of the org in `account_owners`; otherwise 403 `forbidden`. `remove` sets `rejected` on a confirmed binding.
  - `handleOrgBinding(body, headers, deps: { verify; roleOf(account: string, wallet: string): Promise<string | null>; listApps(account: string): Promise<…>; getApp(ref: string): Promise<{ id; org_account_id; org_binding } | null>; setBinding(id: string, b: OrgBinding, by: string): Promise<void> })`.
  - `decided_by` stores the role, not the wallet (`"owner"` / `"admin"`).

- [ ] **Step 1: Write the failing test**

```ts
test("a new org asks for confirmation", () => assert.equal(nextBinding({ orgAccountId: null, binding: "none" }, ORG), "requested"));
test("the same org keeps its confirmation", () => assert.equal(nextBinding({ orgAccountId: ORG, binding: "confirmed" }, ORG), "confirmed"));
test("another org starts over", () => assert.equal(nextBinding({ orgAccountId: ORG, binding: "confirmed" }, OTHER), "requested"));    // Review Focus 4
test("dropping the org clears the binding", () => assert.equal(nextBinding({ orgAccountId: ORG, binding: "confirmed" }, null), "none"));
test("an admin of the org can confirm", …);                     // roleOf → "admin" → setBinding called with "confirmed", "admin"
test("a plain member cannot", …);                               // roleOf → "member" → 403
test("an owner of another org cannot", …);                      // app.org_account_id !== the org the signer manages → 403
test("the list never contains a wallet", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(web): mini-app org binding, confirmed by the org`, push.

---

### Task 3: Expo — held credentials (the one place the register plugs in, device side)

**Files:**
- Create: `apps/expo/lib/miniapp-credentials.ts`
- Test: `apps/expo/lib/__tests__/miniapp-credentials.test.ts`

**Interfaces:**
- Produces:
  - `interface HeldCredential { type: string; name: string; validUntil: number | null }`
  - `interface DeviceCredentialSource { held(): Promise<HeldCredential[]> }`
  - `builtinDeviceSource(p: { signedIn: boolean; isCitizen: boolean; isAttester: boolean }): DeviceCredentialSource` — signed out → `[]`; citizen → `citizen` (and `attester` when set); otherwise `guest`. Names `Bürger:in`, `Bescheiniger:in`, `Gast`.
  - `useHeldCredentialRefs(): { refs: string[]; ready: boolean }` — from `useUser()` (`isCitizen`) and the attester flag the profile screen already uses for `credentialKindsFor` (`grep -rn "credentialKindsFor(" apps/expo` shows where it comes from).
- **What this file expects from the credential register** (planned under `2026-11-17-credreg-`): the node route that answers "which credentials does the signed-in user hold", called with the app's existing session, returning for each one: type reference (or org id and local id), kind, name, image, valid-until, recognised, and whether it is public. The private ones are included, which is why this stays on the device. When that route exists, `useHeldCredentialRefs` merges its answer (cached in memory and refreshed on focus) with the built-ins; no other file in this plan changes.

- [ ] **Step 1: Write the failing test**

```ts
it('a signed-out person holds nothing', async () => expect(await builtinDeviceSource({ signedIn: false, isCitizen: false, isAttester: false }).held()).toEqual([]));
it('a guest holds guest only', …);                              // types ['guest']
it('a citizen holds citizen, an attester both', …);             // ['citizen'] / ['citizen','attester']
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** → `feat(expo): held-credentials adapter for mini-app matching`, push.

---

### Task 4: Expo — matching on the device

**Files:**
- Create: `apps/expo/lib/miniapp-audience.ts`
- Test: `apps/expo/lib/__tests__/miniapp-audience.test.ts`

**Interfaces:**
- Consumes: `refMatches` (SDK), `MiniApp.audience` / `orgAccountId` / `orgName` (Task 1).
- Produces:
  - `type AudienceState = 'open' | 'match' | 'locked'`
  - `audienceState(app: Pick<MiniApp, 'audience'>, held: readonly string[]): AudienceState` — no audience → `open`; some `anyOf` pattern matches a held reference → `match`; no match: `locked` when `required`, `open` when `recommended`.
  - `isForYou(app, held, myOrgIds: readonly string[]): boolean` — `audienceState === 'match'`, or the app's confirmed org is one of mine.
  - `forYou(apps, held, myOrgIds): MiniApp[]` (order kept), `myOrgApps(apps, myOrgIds): MiniApp[]`.
  - `lockInfo(app: Pick<MiniApp, 'audience' | 'orgAccountId' | 'orgName'>): { text: string; cta?: { label: string; href: string } }` from the first entry of `anyOf`: `citizen` → `Für Bürger:innen.` + `{ label: 'Bürger:in werden', href: '/citizen-verification' }`; `attester` → `Für Bescheiniger:innen.`; `guest` → `Für Gäste.`; an org reference → `Für Mitglieder von ${orgName}.` + `{ label: 'Mitglied werden', href: '/account/${orgAccountId}' }` when the app has a confirmed org, else `Für Mitglieder.` without a link.

- [ ] **Step 1: Write the failing test**

```ts
it('no audience is open', () => expect(audienceState({ audience: null }, [])).toBe('open'));
it('a required audience locks who does not match', () => expect(audienceState({ audience: { mode: 'required', anyOf: ['citizen'] } }, ['guest'])).toBe('locked'));
it('a recommended audience never locks', () => expect(audienceState({ audience: { mode: 'recommended', anyOf: ['citizen'] } }, ['guest'])).toBe('open'));
it('a wildcard matches a held org type', () => expect(audienceState({ audience: { mode: 'required', anyOf: ['org:12:*'] } }, ['org:12:mitglied'])).toBe('match'));
it('nothing is for you when you hold nothing and belong nowhere', () => expect(forYou(apps, [], [])).toEqual([]));      // Review Focus 1
it('an app of my org is for me even without an audience', …);
it('an app whose org did not confirm is not', …);               // orgAccountId null                                    // Review Focus 3
it('the lock text names the org only when it confirmed', () => {
  expect(lockInfo({ audience: A_ORG, orgAccountId: null, orgName: null })).toEqual({ text: 'Für Mitglieder.' });
  expect(lockInfo({ audience: A_ORG, orgAccountId: ORG, orgName: 'PSV Röbel' })).toEqual({ text: 'Für Mitglieder von PSV Röbel.', cta: { label: 'Mitglied werden', href: `/account/${ORG}` } });
});
it('citizens-only points to becoming a citizen', …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement** (pure; no network, no tracking).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** → `feat(expo): on-device audience matching for mini apps`, push.

---

### Task 5: Expo — store, detail page, opening

**Files:**
- Modify: `apps/expo/app/mini-apps.tsx` (rail, filter), `apps/expo/components/miniapp/MiniAppCard.tsx` + `MiniAppColumnRail.tsx` (lock state), `apps/expo/app/mini-app/[slug].tsx` (lock block), `apps/expo/components/explore/PinnedMiniAppBlock.tsx` (lock state)
- Create: `apps/expo/lib/miniapp-open.ts`, `apps/expo/components/miniapp/MiniAppLockNote.tsx`
- Test: `apps/expo/lib/__tests__/miniapp-open.test.ts`, `apps/expo/components/miniapp/__tests__/MiniAppLockNote.test.tsx`, `apps/expo/app/__tests__/mini-apps-store.test.tsx`

**Interfaces:**
- Consumes: Tasks 3 and 4; `useAccounts()` from `context/AccountContext.tsx` (`ownedAccounts` = the accounts this person belongs to; confirm in that file which roles it includes and use all of them).
- Produces:
  - `openDecision(app, held, ready: boolean): 'open' | 'locked' | 'wait'` — `wait` until the credentials are ready for an app with a required audience; apps without one are `open` at once.
  - `MiniAppLockNote` props `{ app: MiniApp }` — lock icon, `lockInfo(app).text`, and the link when there is one.
- Screen behaviour:
  - Rail **`Für dich`** above "Alle Apps" when `forYou(...)` is non-empty; hidden otherwise.
  - Filter chip **`Meine Vereine`** next to the existing section header, shown only when `myOrgApps(...)` is non-empty; when active the lists show only those apps.
  - A locked app stays visible in every list with a lock on its button (`Gesperrt` instead of `Öffnen`/`Laden`) and opens its detail page instead of the host.
  - Detail page: for a locked app the `Öffnen` button is disabled and `MiniAppLockNote` is shown under it.
  - Every place that mounts `MiniAppHost` (`app/mini-apps.tsx`, `app/mini-app/[slug].tsx`, `PinnedMiniAppBlock`; find the rest with `grep -rn "<MiniAppHost" apps/expo`) asks `openDecision` first; `locked` routes to the detail page.
- No `track` call may include the matched reference, the rail name or the filter state.

- [ ] **Step 1: Write the failing tests**

```ts
it('an app without an audience opens at once', () => expect(openDecision(plain, [], false)).toBe('open'));
it('a required app waits for the credentials, then locks or opens', () => {
  expect(openDecision(citizensOnly, [], false)).toBe('wait');
  expect(openDecision(citizensOnly, ['guest'], true)).toBe('locked');          // Review Focus 2
  expect(openDecision(citizensOnly, ['citizen'], true)).toBe('open');
});
// MiniAppLockNote.test.tsx
it('shows the reason and the way in', …);                       // text 'Für Bürger:innen.' and a pressable 'Bürger:in werden'
// mini-apps-store.test.tsx (fetchLiveMiniApps and the hooks mocked)
it('shows no Für dich rail and no filter for a person without credentials or orgs', …);     // Review Focus 1: queryByText('Für dich') === null, queryByText('Meine Vereine') === null
it('shows Für dich with the matching app for a citizen', …);
it('marks a locked app as Gesperrt', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.** Lock icon: add one to `components/miniapp/hostIcons.tsx` in the style of the existing icons.
- [ ] **Step 4: Run to verify they pass**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): Für dich, Meine Vereine and locked mini apps in the store`, push.

---

### Task 6: Expo — the org's side

**Files:**
- Create: `apps/expo/lib/miniapp-org-binding.ts`, `apps/expo/app/org/mini-apps.tsx`
- Modify: `apps/expo/app/org/settings.tsx` (row `Mini-Apps`), `apps/expo/app/account/[id]/index.tsx` (rail `Mini-Apps`), `apps/expo/lib/miniapps.ts` (`fetchMiniAppsOfOrg(accountId: string): Promise<MiniApp[]>` — live, `org_account_id = accountId`, `org_binding = 'confirmed'`)
- Test: `apps/expo/lib/__tests__/miniapp-org-binding.test.ts`

**Interfaces:**
- Consumes: the org-binding route (Task 2); `signedOrSession` as in plan 1's `miniapp-token.ts`.
- Produces: `listOrgBindings(account: SessionSigner, orgAccountId: string): Promise<OrgBindingItem[]>`, `decideOrgBinding(account, appId: string, decision: 'confirm' | 'reject' | 'remove'): Promise<OrgBinding | null>`; `interface OrgBindingItem { id: string; slug: string; name: string; iconUrl: string | null; binding: OrgBinding }`; `bindingActions(b: OrgBinding): ('confirm' | 'reject' | 'remove')[]` — `requested` → confirm, reject; `confirmed` → remove; `rejected` → confirm.
- Screen `Mini-Apps` (owner and admin only, as the other rows of that settings screen are gated): explanation `Mini-Apps, die sagen, dass sie zu euch gehören. Erst nach eurer Bestätigung erscheinen sie auf eurer Seite.`, one row per app with its status (`Wartet auf Bestätigung`, `Bestätigt`, `Abgelehnt`) and the buttons `Bestätigen`, `Ablehnen`, `Trennen`. Empty state: `Noch keine Mini-App hat euch als Verein angegeben.`
- Org page: a horizontal rail `Mini-Apps` using `MiniAppColumnRail`, only when `fetchMiniAppsOfOrg` returns apps.

- [ ] **Step 1: Write the failing test**

```ts
it('a request can be confirmed or rejected', () => expect(bindingActions('requested')).toEqual(['confirm', 'reject']));
it('a confirmed binding can be removed', () => expect(bindingActions('confirmed')).toEqual(['remove']));
it('a rejected one can still be confirmed', () => expect(bindingActions('rejected')).toEqual(['confirm']));
it('a failed request returns null and does not throw', …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes**; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): orgs confirm their mini apps, org page shows them`, push.

---

### Task 7: Expo — suggestions on Erkunden

**Files:**
- Create: `apps/expo/lib/miniapp-suggestions.ts`, `apps/expo/components/explore/MiniAppSuggestionCard.tsx`
- Modify: the Erkunden screen that renders the layout blocks (find it with `grep -rn "PinnedMiniAppBlock" apps/expo/app apps/expo/components`)
- Test: `apps/expo/lib/__tests__/miniapp-suggestions.test.ts`, `apps/expo/components/explore/__tests__/MiniAppSuggestionCard.test.tsx`

**Interfaces:**
- Consumes: `isForYou`, `audienceState` (Task 4); `miniAppBlockId`, `useExploreLayout().save` (`lib/explore-layout.ts`); `useInstalledMiniApps`.
- Produces:
  - `SUGGESTED_KEY = 'miniapps.suggested.v1'` (AsyncStorage, a JSON array of slugs that were shown), `QUEUE_KEY = 'miniapps.suggestQueue.v1'` (org account ids).
  - `pickSuggestion(p: { apps: MiniApp[]; held: readonly string[]; myOrgIds: readonly string[]; pinned: readonly string[]; alreadySuggested: readonly string[]; queuedOrgIds: readonly string[] }): MiniApp | null` — candidates are apps that are for me, not locked, not pinned and not suggested before; an app of a queued org comes first, then manifest order; `null` when none.
  - `markSuggested(slug: string): Promise<void>`; `queueMiniAppSuggestion(orgAccountId: string): Promise<void>` — the hook the credential register's accept screen calls after a credential of that org was accepted ("accepting a credential can suggest the org's mini app once"). Nothing in this repo calls it yet.
  - `MiniAppSuggestionCard` props `{ app: MiniApp; onAccept(): void; onDismiss(): void }` — text `Passt zu dir: ${app.name}. Auf deine Startseite legen?`, buttons `Übernehmen` and `Nicht jetzt` (same pattern as `components/mecky/LayoutProposalCard.tsx`).
- Behaviour: at most one card, below the first block. `Übernehmen` → `save({ ...layout, order: [...layout.order, miniAppBlockId(app.slug)] })` and `markSuggested`; `Nicht jetzt` → `markSuggested` only. The suggestion is marked as soon as either button is tapped, not when it is merely shown.

- [ ] **Step 1: Write the failing tests**

```ts
it('suggests an app that is for me and not pinned', …);
it('never suggests a locked app, a pinned app or one suggested before', …);
it('prefers the app of an org whose credential was just accepted', …);       // queuedOrgIds: [ORG_B] → app of ORG_B before the earlier app
it('returns null for a person with nothing', () => expect(pickSuggestion({ apps, held: [], myOrgIds: [], pinned: [], alreadySuggested: [], queuedOrgIds: [] })).toBeNull());
// MiniAppSuggestionCard.test.tsx
it('Übernehmen calls onAccept, Nicht jetzt calls onDismiss', …);
```

- [ ] **Step 2: Run to verify they fail.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**; `./node_modules/.bin/jest lib/__tests__/explore-layout.test.ts --watchAll=false --no-watchman --ci` → still PASS; eslint on touched files.
- [ ] **Step 5: Commit** → `feat(expo): suggest fitting mini apps on Erkunden`, push.

---

### Task 8: SDK 0.4.0 release preparation

**Files:**
- Modify: `packages/miniapp-sdk/package.json` (`version`, scripts), `packages/miniapp-sdk/src/client.ts` (`SDK_VERSION`), `apps/web/src/lib/miniapp/ai/htmlPrompt.ts` (`SDK_VERSION`)
- Create: `packages/miniapp-sdk/scripts/release-check.mjs`, `packages/miniapp-sdk/CHANGELOG.md`
- Create (generated, checked in): `apps/web/public/sdk/miniapp-sdk-0.4.0.mjs`, updated `apps/web/public/sdk/miniapp-sdk.mjs`
- Delete: `packages/miniapp-sdk/netizen-labs-miniapp-sdk-0.2.0.tgz` if it is tracked by git (`git ls-files packages/miniapp-sdk | grep tgz`)
- Test: `packages/miniapp-sdk/test/release-check.test.ts`

**Interfaces:**
- Produces:
  - `checkRelease(paths: { pkgJson: string; clientTs: string; htmlPromptTs: string; dist: string; cdnDir: string }): string[]` exported from `release-check.mjs` — a list of problems, empty when: the three version strings are equal; `<cdnDir>/miniapp-sdk-<version>.mjs` exists and is byte-identical to `<dist>/index.js`; `<cdnDir>/miniapp-sdk.mjs` is identical too. Run as a script it prints the problems and exits 1 when there are any.
  - Scripts: `"release:check": "tsup && node scripts/release-check.mjs"`, `"release": "tsup && node scripts/sync-web.mjs && node scripts/release-check.mjs && npm publish"` (the owner runs `release`; npm and the CDN copy then come from the same build).
  - `CHANGELOG.md` entry 0.4.0: added `sdk.credentials.*`, `sdk.supports()`, `auth.signIn({ nonce })`, working `auth.getToken()`, read methods and `wallet_sendCalls` on the provider, `roebel.pay`, events `back` / `visibilityChanged` / `themeChanged` / `credentialsChanged`, `actions.ready({ handlesBack })`, manifest version 2 types; **changed**: errors thrown by the EIP-1193 provider now have a numeric `code` (4001, 4100, 4200, 4902, …) and the bridge code in `error.data.bridgeCode`; a chain switch away from Gnosis is an error.

- [ ] **Step 1: Write the failing test** (temp directory fixtures)

```ts
test('agreeing versions and identical files pass', () => assert.deepEqual(checkRelease(fixture({})), []));
test('a client.ts version that lags is reported', () => assert.match(checkRelease(fixture({ client: '0.3.1' })).join('\n'), /client\.ts/));
test('a stale AI-builder pin is reported', …);                  // /htmlPrompt/
test('a missing or different CDN copy is reported', …);         // /miniapp-sdk-0\.4\.0\.mjs/
test('a stale alias is reported', …);                           // /miniapp-sdk\.mjs/
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement**, bump the three versions to `0.4.0`, run `pnpm --filter @netizen-labs/miniapp-sdk sync-web`, then `pnpm --filter @netizen-labs/miniapp-sdk release:check` → exit 0.
- [ ] **Step 4: Run to verify it passes**; the whole SDK suite → PASS; web `tests/miniapp-*.test.ts` → PASS.
- [ ] **Step 5: Commit** (the version files, the script, the changelog and the two CDN files by path) → `chore(sdk): prepare 0.4.0, release check for npm and CDN`, push. Do not publish.

---

### Task 9: Docs — correct what is wrong, and keep it from drifting

**Files:**
- Modify: `packages/miniapp-sdk/README.md`, `packages/miniapp-sdk/DESIGN.md`, `apps/web/src/lib/miniapp/devdocs.ts`, `apps/web/src/lib/miniapp/publishDoc.ts`, `apps/web/src/app/developers/mini-apps/page.tsx`
- Test: `apps/web/tests/miniapp-devdocs.test.ts` (extend the file from plan 1)

**Interfaces:**
- The known errors (each must be fixed; verify each against the source before changing it):
  1. README says the pinned CDN file is `/sdk/miniapp-sdk-0.2.0.mjs` → `/sdk/miniapp-sdk-<version>.mjs`, current 0.4.0, and explain pinned versus `/sdk/miniapp-sdk.mjs`.
  2. README says the handshake falls back to mock mode after 1.5 s → 2 s (`HELLO_TIMEOUT_MS` in `src/bridge.ts`), re-sent every 400 ms.
  3. Events: docs list `back`, `visibilityChanged`, `themeChanged` as if they had always been sent → state that the Röbel app sends them from the release that ships plan 3, with their payloads, plus `walletChanged` and `credentialsChanged`.
  4. The MCP tool list in `devdocs.ts` names 9 tools; the server has 15 (`get_started`, `get_docs`, `validate_html`, `list_my_apps`, `get_app`, `publish_html_app`, `submit_external_app`, `register_app_url`, `update_app_manifest`, `get_app_analytics`, `get_app_content`, `set_app_content`, `import_images_from_url`, `delete_app_content`, `get_llms_full`).
  5. DESIGN.md tells developers to ship `netizen.manifest.ts` → the manifest file is `/.well-known/roebel-miniapp.json` (`WELL_KNOWN_PATH`); the TypeScript file is only the template's own source.
  6. Docs tell developers to use `auth.getToken`, `auth.signIn` and `roebel.pay` without saying they did not work in the app → they work from the releases of plans 1 to 3; `sdk.supports()` tells at runtime.
- Produces: the drift test below.

- [ ] **Step 1: Write the failing test**

```ts
test("every MCP tool is documented", () => {                                 // Review Focus 5
  const src = readFileSync(new URL("../src/app/api/[transport]/route.ts", import.meta.url), "utf8");
  const tools = [...src.matchAll(/server\.tool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(tools.length >= 15);
  const docs = getDocsSection("all");
  for (const t of tools) assert.ok(docs.includes(t), `tool ${t} missing from the docs`);
});
test("the docs name the SDK version the package has", () => {
  const { version } = JSON.parse(readFileSync(new URL("../../../packages/miniapp-sdk/package.json", import.meta.url), "utf8"));
  assert.ok(getDocsSection("sdk").includes(`miniapp-sdk-${version}.mjs`));
});
test("the docs name the manifest path the indexer reads", () => assert.ok(getDocsSection("publish").includes(WELL_KNOWN_PATH)));
test("the README states the real handshake time", () => {
  const readme = readFileSync(new URL("../../../packages/miniapp-sdk/README.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /1\.5\s?s/); assert.match(readme, /2\s?s/); assert.doesNotMatch(readme, /miniapp-sdk-0\.2\.0/);
});
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Fix the six errors** in all five files. Where `devdocs.ts` builds a section from `ai/htmlPrompt.ts`, fix the source there.
- [ ] **Step 4: Run to verify it passes.** → PASS.
- [ ] **Step 5: Commit** → `docs: correct the mini-app developer docs, add a drift test`, push.

---

### Task 10: Docs — the new chapters, for people and for agents

**Files:**
- Modify: `apps/web/src/lib/miniapp/devdocs.ts` (`DocsSection`, `getDocsSection`, `buildLlmsFullTxt`, `buildLlmsIndexTxt`), `apps/web/src/lib/miniapp/publishDoc.ts`, `apps/web/src/app/api/[transport]/route.ts` (`get_docs` section enum, `get_started` text), `apps/web/src/app/developers/mini-apps/page.tsx`, `packages/miniapp-sdk/README.md`
- Test: extend `apps/web/tests/miniapp-devdocs.test.ts`, `apps/web/tests/miniapp-publish-doc.test.ts`

**Interfaces:**
- Produces: `DocsSection` += `"identity" | "verify" | "credentials" | "wallet" | "gasless" | "issuer" | "store"`; each is part of `"all"` and of `llms-full.txt`; `llms.txt` lists each with a one-line description; the MCP `get_docs` tool accepts each.
- What each chapter must contain (facts from plans 1 to 4; write no code that is not runnable):
  - **identity** — manifest version "2" `identity` (the JSON shape with a full example), the consent sheet and what a declined item means, the per-app pseudonym, `context.user` for version 1 versus 2, withdrawal, the review rule.
  - **verify** — `sdk.auth.getToken()` → send to your server → `verifyUserToken(token, { issuer: "https://id.roebel.app", slug })` from `@netizen-labs/miniapp-verify`; the claim list; the 10-minute lifetime; passing the token to Röbel's routes as `Authorization: Bearer`; `sdk.auth.signIn()` + `verifySignIn` as the alternative that does not depend on our issuer, and why a plain signature check is not enough for these accounts.
  - **credentials** — reference syntax (`citizen`, `attester`, `guest`, `org:<orgId>:<localId>`, `org:<orgId>:*`), `list` / `has` / `request` / `onChange`, private credentials, the mock config, reading public credentials from the chain with `holdsCredential` and the exported ABIs.
  - **wallet** — the provider's method list (reads with their limits, signing methods, `wallet_sendCalls` with capabilities), Gnosis only and error 4902, the numeric error codes, what the confirm sheet shows, `roebel.pay`, the events and `handlesBack`.
  - **gasless** — manifest `contracts` (shape, limits, forbidden contracts), review and the gas budget, what happens on an independent account versus the old sign-in, the three budget errors and their texts.
  - **issuer** — the recipe for a mini app that issues badges ("10 Trainings absolviert"): the org appoints the mini app server's key as a delegate for one credential type, the server issues with it. State plainly that this needs the credential register and is not available before it ships; no bridge method is involved.
  - **store** — manifest `audience` and `org`, required versus recommended, the org's confirmation, "Für dich" and "Meine Vereine", and that a lock in the app is a courtesy: check the credential on your server.
- `publish.md` gets one complete version-2 manifest example with `identity`, `contracts`, `audience`, `org`.

- [ ] **Step 1: Write the failing test**

```ts
for (const s of ["identity", "verify", "credentials", "wallet", "gasless", "issuer", "store"] as const)
  test(`section ${s} exists and is part of all`, () => { const t = getDocsSection(s); assert.ok(t.length > 400); assert.ok(getDocsSection("all").includes(t.slice(0, 80))); });
test("the SDK calls of 0.4.0 are documented", () => {
  const all = getDocsSection("all");
  for (const c of ["sdk.credentials.list", "sdk.credentials.has", "sdk.credentials.request", "sdk.credentials.onChange", "sdk.auth.getToken", "sdk.auth.signIn", "sdk.roebel.pay", "sdk.supports", "wallet_sendCalls", "eth_getLogs", "verifyUserToken", "verifySignIn", "holdsCredential", "handlesBack"])
    assert.ok(all.includes(c), `${c} missing`);
});
test("llms.txt lists every section", …);
test("the issuer chapter says it needs the credential register", () => assert.match(getDocsSection("issuer"), /credential register/i));
test("publish.md carries a version 2 manifest that validates", () => {
  const json = buildPublishMd("https://x").match(/```json\n([\s\S]*?"version": "2"[\s\S]*?)```/)![1];
  const file = JSON.parse(json); assert.doesNotThrow(() => validateManifest({ ...file.miniapp, slug: "beispiel" }));
});
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Write the chapters.** One source: `devdocs.ts`; the website page, `llms.txt`, `llms-full.txt` and the MCP read from it.
- [ ] **Step 4: Run to verify it passes**; `tests/miniapp-*.test.ts` → PASS.
- [ ] **Step 5: Commit** → `docs: identity, verification, credentials, wallet, gasless, issuer and store chapters`, push.

---

### Task 11: The template shows it working

**Files:**
- Modify: `apps/mini-apps/_template/app/page.tsx`, `apps/mini-apps/_template/package.json` (`@netizen-labs/miniapp-verify: workspace:*`), `apps/mini-apps/_template/README.md`, `apps/mini-apps/_template/netizen.manifest.ts`
- Create: `apps/mini-apps/_template/public/.well-known/roebel-miniapp.json`, `apps/mini-apps/_template/app/api/me/route.ts`, `apps/mini-apps/_template/lib/me.ts`
- Test: `apps/mini-apps/_template/lib/me.test.ts`

**Interfaces:**
- Produces:
  - `whoAmI(authorization: string | null, verify: (token: string) => Promise<{ id: string; has(type: string): boolean }>): Promise<{ status: 200; body: { id: string; citizen: boolean } } | { status: 401; body: { error: string } }>` in `lib/me.ts`; the route wires `verifyUserToken` with `issuer` from `process.env.ROEBEL_ISSUER ?? "https://id.roebel.app"` and the template's slug.
  - Manifest file, version "2": `identity: { profile: true, address: false, credentials: [{ type: "citizen", reason: "Zeigt Bürger:innen einen eigenen Bereich." }] }`, permissions as today, no `contracts`, no `audience`. `netizen.manifest.ts` mirrors it and its header comment says the JSON file is what the registry reads.
  - Page: a block that is shown only when `await sdk.credentials.has("citizen")` (with the text `Nur für Bürger:innen sichtbar`) and a fallback line for everyone else; a button `Server fragen` that calls `sdk.auth.getToken()`, sends it to `/api/me` and shows the answer; both guarded by `sdk.supports(...)` so the template still runs in an older app. In mock mode the block is visible (the default mock credential is `citizen`) and the server call explains that it needs the Röbel app.

- [ ] **Step 1: Write the failing test** (`cd apps/mini-apps/_template && npx tsx --test lib/me.test.ts`)

```ts
test("a valid token answers with the pseudonym and the citizen flag", async () => {
  const r = await whoAmI("Bearer t", async () => ({ id: "nz_x", has: (t) => t === "citizen" }));
  assert.deepEqual(r, { status: 200, body: { id: "nz_x", citizen: true } });
});
test("no header is 401", async () => assert.equal((await whoAmI(null, async () => { throw new Error("x"); })).status, 401));
test("a token the verifier rejects is 401", …);
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify it passes**; `pnpm --filter ./apps/mini-apps/_template build` → exit 0; validate the manifest file: `cd apps/web && npx tsx -e 'import("./src/lib/miniapp/manifestFile.ts").then(async (m)=>{const f=JSON.parse((await import("node:fs")).readFileSync("../mini-apps/_template/public/.well-known/roebel-miniapp.json","utf8"));m.parseManifestFile(f,new URL(f.miniapp.homeUrl).origin);console.log("ok")})'` → prints `ok`.
- [ ] **Step 5: Commit** → `feat(template): credential-gated content and a verified server call`, push.

---

## Owner gates

1. Apply `supabase/migrations/20261117c_mini_app_audience_org.sql` through the Supabase MCP (confirm the project ref first).
2. Before moving the CDN alias: check which live apps load the unpinned file, for example `select slug from mini_apps a join mini_app_versions v on v.mini_app_id = a.id where a.status = 'live' and v.html like '%/sdk/miniapp-sdk.mjs%'`, and ask the external developers. Decide Open question 1.
3. Release the SDK: `pnpm --filter @netizen-labs/miniapp-sdk release` (builds, syncs the CDN copy, checks, publishes to npm), then deploy web so the CDN serves the same build. Publish `@netizen-labs/miniapp-verify` if plan 2's gate has not done it.
4. Deploy the template (it needs the published verify package or the workspace build).
5. Expo OTA. Device pass: a guest sees a citizens-only app as locked with "Bürger:in werden"; a citizen sees it under "Für dich" and gets one suggestion on Erkunden; an org admin confirms a binding and the app appears on the org page.

## Self-review (done while writing)

- Spec 5.6: `audience` and org binding (1, 2, 6), "Für dich" / "Meine Vereine" / locked apps (4, 5), on-device matching (3, 4), Erkunden suggestions and the credential-accept hook (7). Spec 5.7: SDK 0.4.0 to npm and CDN in one step (8), docs corrected (9) and extended incl. agent docs and the MCP (10), template (11); the capability list and SDK tests came with plans 1 and 2. Spec 5.4 last bullet (mini apps as issuers) → the `issuer` chapter in Task 10.
- The register is reached only through `apps/expo/lib/miniapp-credentials.ts` (Task 3) on the device and `apps/web/src/lib/miniapp/credentialSource.ts` (plan 2) on the node.
- Names checked across tasks: `MiniAppAudience`, `audienceState`, `isForYou`, `forYou`, `myOrgApps`, `lockInfo`, `openDecision`, `nextBinding`, `OrgBinding`, `bindingActions`, `pickSuggestion`, `queueMiniAppSuggestion`, `checkRelease`.
