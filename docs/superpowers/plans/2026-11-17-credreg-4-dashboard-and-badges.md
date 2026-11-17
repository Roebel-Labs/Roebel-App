# Credential Register 4 — Web Dashboard and Event Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give orgs a browser dashboard at `/dashboard/credentials` (types, people and import, batches and status, delegates, the members-public switch) and turn event attendance (door check-ins and Smart Event QR claims) into Abzeichen with one tap, optionally instantly through a node key the org appoints.

**Architecture:** The dashboard is a set of client pages in `apps/web` that call the plan-2 routes with a signed request from the browser's account, exactly as the members page talks to the `org-membership` function. Nothing is sent on chain from the browser: every change becomes a plan-2 action that the phone confirms. Event badges are a thin layer over plan 2: one more lib module that finds attendees, builds `createType` + `addBatch` steps in one action, and an optional cron that issues small batches with a node-held delegate key.

**Tech Stack:** Next.js 15 (App Router, client components, Tailwind CSS), viem ^2.47, `@netizen-labs/credential-registry`, node:test via tsx, Expo SDK 56 for one small app task.

**Spec:** `docs/superpowers/specs/2026-11-17-credential-register-design.md` (sections 5.4, 5.5, 5.8). Server contract: `docs/superpowers/plans/2026-11-17-credreg-2-backend.md` (Tasks 3 to 8 — names used below are defined there). Phone side: `docs/superpowers/plans/2026-11-17-credreg-3-expo.md` (Task 6, the approve screen).

**Depends on:** plans 1 to 3 on the base branch. The owner decisions and the update note at the top of plan 1 apply, in particular decision 4: badges arrive when the organiser issues them; instant only when the org appoints the node key.

## Open questions for the owner

1. **Badge claim window.** Spec 5.5 says "the event's time window". *Default: from the event day 00:00 to 14 days after its last day 23:59 (Europe/Berlin), so latecomers and people who scan the next morning still get it. After that the badge can no longer be claimed publicly; private acceptance stays possible.*
2. **Who counts as attended.** *Default: a ticket with `status = 'checked_in'` for the event, or a `reward_claims` row with `action = 'event_attend'` and `status <> 'rejected'` whose `reference_id` is a `reward_events.id` linked to the event (`reward_events.event_id`). Refunded or void tickets never count.*
3. **The node badge key.** *Default: one EOA for all orgs (`CREDENTIAL_BADGE_DELEGATE_KEY`), funded by Max, which can only be a delegate of the badge types whose orgs appointed it; a kill switch `app_settings.credentials_badge_delegate_enabled`; at most one batch of at most 500 people per type every 5 minutes, only from 1 hour before the event starts until 6 hours after it ends.*
4. **Browser accounts.** The web dashboard signs with the account the browser is logged in with. An account that only exists as a passkey on the phone cannot log in to the web dashboard today; it uses Ortis Studio (plan 5) instead. *Default: accept that; no new web login in this plan.*

## Global Constraints

- UI text German, code and comments English. Tailwind in `apps/web`. Primary colour `#00498B`, secondary text `#6B7280`, borders `#B4B8C1`. Never show a wallet address: people are shown by display name, a node key as "Röbel-Server (sofortige Abzeichen)".
- "Röbel Münzen" by name. No vendor names in user-facing text.
- The browser never sends a transaction: every change is a prepared action confirmed on the phone (plan 2 Task 4).
- The only server-held key that can write to the register is the badge delegate key, and only for types whose org appointed it on chain.
- Modules loaded by `npx tsx --test` use relative imports. Web tests: `cd apps/web && npx tsx --test tests/<file>`. Lint touched files with `npx next lint --file <path>`.
- Supabase changes are migration files; applying them is an owner gate.
- Expo (Task 8 only): `StyleSheet.create()` + `useTheme()`, eslint plus jest on touched files, no full `tsc`.
- Work in a git worktree: `git worktree add .worktrees/credreg-4 -b feat/credreg-4-dashboard` from the credreg-3 branch (or `main` once merged), `pnpm install --frozen-lockfile`. Stage by explicit path; every task ends with commit + `git push -u origin feat/credreg-4-dashboard`. Never merge to `main`, never deploy.
- Commit convention: `feat(web): …`, `feat(expo): …`, `test(web): …`.

## Review Focus

1. **"Abzeichen vergeben" tapped twice, or again after latecomers.** Expected: the second batch contains only people who are not in an earlier batch of that badge type. Test in Task 5.
2. **A refunded ticket or a rejected QR claim.** Expected: never a badge. Test in Task 5.
3. **The node key keeps issuing after the org removed it.** Expected: the cron reads `isDelegate` on chain before every batch and stops. Test in Task 6.
4. **The dashboard opened for an org that is not on chain yet, or by a member.** Expected: one explanation card, no form that would fail at confirmation time. Test in Task 1.
5. **A 70-row import with five broken rows.** Expected: the preview shows 65 people and the five rows with the reason; nothing is prepared until the admin confirms the preview. Test in Task 3.

---

### Task 1: Client, status route, navigation and the org gate

**Files:**
- Create: `apps/web/src/lib/credentials/client.ts`
- Create: `apps/web/src/app/api/credentials/status/route.ts`
- Create: `apps/web/src/app/dashboard/credentials/layout.tsx`, `page.tsx` (overview)
- Create: `apps/web/src/components/credentials/OrgGateCard.tsx`, `PendingActionPanel.tsx`
- Modify: `apps/web/src/types/account.ts` (`SubTypeFeatures.credentials: boolean`, `true` for every org sub-type), `apps/web/src/components/org-dashboard/org-sidebar.tsx` (item "Ausweise", `href: "/dashboard/credentials"`, after "Mitglieder", `visible: features.credentials && credentialsEnabled`)
- Test: `apps/web/tests/credentials-client.test.ts`, `apps/web/tests/sub-type-features.test.ts` (extend)

**Interfaces:**
- Consumes: `CREDENTIALS_SCOPE`, `CredentialAction`, `buildSignedMessage` (`apps/web/src/lib/signed-request/message.ts`); `SigningAccount` (`apps/web/src/lib/org-membership/client.ts`).
- Produces (`client.ts`): `credentialsRequest<T>(account: SigningAccount, route: "org" | "actions" | "me", action: CredentialAction, payload: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string; status: number }>` — body `{ scope, action, wallet, timestampSec, payload, signature }`, never throws (network error → `code: "NETWORK_ERROR"`); `pollAction(account, actionId, onUpdate: (a: ActionView) => void, opts?: { intervalMs?: number; signal?: AbortSignal }): Promise<ActionView>` — polls `action_get` every 5 s until the status is not `awaiting_confirmation` / `submitted`.
- Produces (`status/route.ts`): public `GET` → `{ enabled: boolean; configured: boolean }` (`enabled` = `app_settings.credentials_enabled === 'true'`, `configured` = `registryConfig() !== null`), cached 60 s.
- Produces: `OrgGateCard` props `{ state: "ready" | "org_not_registered" | "no_chain_authority" | "forbidden" }` with the two 409 texts of plan 2 Task 4 and, for `forbidden`, "Nur Inhaber:innen und Admins können Ausweise verwalten."; `PendingActionPanel` props `{ action: ActionView }` — "Bestätige jetzt in der Röbel App auf deinem Handy" with the summary lines, a live status ("Wartet", "Wird eingetragen", "Erledigt", "Fehlgeschlagen: …", "Abgelaufen"), and "Verwerfen".
- The layout reads the active org from `useAccount()` (`apps/web/src/lib/context/AccountContext`), calls `orgs_list` once and renders `OrgGateCard` instead of children unless the active org's `onChain` is `ready`.

- [ ] **Step 1: Write the failing tests**

```ts
test("credentialsRequest signs scope:action:wallet:ts:hash and posts to /api/credentials/<route>", …);
test("a network failure returns NETWORK_ERROR and does not throw", …);
test("pollAction stops at done, failed, cancelled and expired and reports every change once", …);
test("every org sub-type has credentials: true", …);
```

- [ ] **Step 2: Run** `cd apps/web && npx tsx --test tests/credentials-client.test.ts tests/sub-type-features.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(web): credentials dashboard shell, client and org gate`.

---

### Task 2: Types — templates, create, edit, retire

**Files:**
- Create: `apps/web/src/app/dashboard/credentials/types/page.tsx`, `types/[typeId]/page.tsx`
- Create: `apps/web/src/lib/credentials/type-form.ts`
- Test: `apps/web/tests/credentials-type-form.test.ts`

**Interfaces:**
- Consumes: `TYPE_TEMPLATES` (plan 2 Task 3), actions `types_list`, `type_prepare`.
- Produces (`type-form.ts`):

```ts
export type TypeForm = { template: keyof typeof TYPE_TEMPLATES | "eigener"; name: string; description: string; imageUrl: string | null; benefits: string[]; kind: "role" | "membership" | "badge"; supplyCap: string; claimStart: string; claimEnd: string };
export function formFromTemplate(t: keyof typeof TYPE_TEMPLATES): TypeForm;
export function validateTypeForm(f: TypeForm): Record<string, string>;   // German messages per field; {} = valid
export function typeFormToPayload(f: TypeForm, op: "create" | "update", typeId?: string): Record<string, unknown>;   // the type_prepare payload of plan 2
```

  Validation: name 2–60 characters; description ≤ 300; at most 6 benefits of ≤ 80 characters; `supplyCap` empty or an integer 1–100000; claim end after claim start when both are given; a `badge` needs nothing else; `kind` cannot change on `update` (the field is read-only there).
- Pages: the list shows each type with image, kind label ("Amt", "Mitgliedschaft", "Abzeichen"), the recognised seal, counts ("12 angenommen · 3 offen", from `types_list`) and a draft badge "Noch nicht bestätigt" while `chain_status = 'draft'`. "Neuer Ausweis-Typ" opens a template picker (Mitglied, Vorstand, Mitarbeiter:in, Ehrenmitglied, Stadtvertreter:in, Eigener). Images upload through the existing `/api/upload-image` route. "Stilllegen" asks "Alle Ausweise dieses Typs verlieren sofort ihre Gültigkeit. Das kann nicht rückgängig gemacht werden." After any submit, `PendingActionPanel`.
- A "Stadtvertreter:in" type shows the note "Als offizielles Amt erkennt die Stadtgemeinschaft diesen Typ gesondert an." (recognition is the contract owner's step, not the org's).

- [ ] **Step 1: Write the failing tests**

```ts
test("formFromTemplate('vorstand') is a role named Vorstand with no cap", …);
test("validateTypeForm reports name, cap and window errors in German", …);
test("typeFormToPayload for update omits kind and carries the typeId", …);
test("typeFormToPayload turns empty cap and dates into 0 / absent", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (4).
- [ ] **Step 5: Lint and commit** — `feat(web): credential type management in the dashboard`.

---

### Task 3: People — search, import with preview, member list, issue

**Files:**
- Create: `apps/web/src/app/dashboard/credentials/people/page.tsx`
- Create: `apps/web/src/components/credentials/ImportPreview.tsx`, `PeopleTable.tsx`
- Modify: `apps/web/src/lib/credentials/batch.ts`, `people.ts`, `apps/web/src/app/api/credentials/org/route.ts`, `apps/web/src/lib/signed-request/message.ts` (add `"people_preview"` to `CredentialAction`; mirror in `apps/expo/lib/signed-request.ts`)
- Test: `apps/web/tests/credentials-people-preview.test.ts`

**Interfaces:**
- Produces: action `people_preview` `{ accountId, typeId, csv?: string, recipients?: RecipientInput[], fromMemberList?: boolean, validUntil?: string }` → `{ app: number; link: number; skipped: number; rejected: { row: number; reason: string }[]; rows: { displayName: string; channel: "app" | "link" | "mail" }[] }` — the same normalisation and skip rules as `prepareBatch`, nothing written. `prepareBatch` accepts `csv` as well (parsed with `parsePeopleCsv` + `normaliseRecipients`), so Studio and the browser share one parser on the server.
- The page: pick a type; three ways to add people side by side — "Personen suchen" (`people_search`, adds app users as `account` recipients), "Liste einfügen oder hochladen" (textarea or `.csv` file read in the browser, sent as `csv`), "Alle aktuellen Mitglieder" (`fromMemberList`); optional "Gültig bis" date; "Vorschau" calls `people_preview` and renders `ImportPreview` ("65 Personen: 40 bekommen eine Nachricht in der App, 25 einen persönlichen Link oder Brief. 5 Zeilen übersprungen:" + the rejected rows, + "3 haben schon einen gültigen Ausweis"); one button "<n> Ausweise ausstellen" calls `batch_prepare` with the same input and shows `PendingActionPanel`. `PeopleTable` lists `people_list` with filters by state and the row action "Widerrufen" (multi-select → `revoke_prepare`).
- No email address is ever shown back in the table after the invitation was sent (plan 2 erases it).

- [ ] **Step 1: Write the failing tests**

```ts
test("people_preview counts app, link and skipped exactly as batch_prepare would and writes nothing", …);
test("a 70-row csv with 5 rows without a name previews 65 people and lists rows 3, 9, 20, 41, 66", …);
test("batch_prepare with csv builds the same root as with the equivalent recipients array", …);   // same rand seed
test("people_preview is allowed with a chat session (Studio)", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** the server additions, then the page. **Step 4: Run** this file and `tests/credentials-batch.test.ts` — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(web): issue credentials from the dashboard with import preview`.

---

### Task 4: Batches, letters, delegates and the members switch

**Files:**
- Create: `apps/web/src/app/dashboard/credentials/batches/page.tsx`, `settings/page.tsx`
- Test: `apps/web/tests/credentials-batches-view.test.ts`
- Create: `apps/web/src/lib/credentials/views.ts`

**Interfaces:**
- Produces (`views.ts`): `batchRows(actions: ActionView[], batches: BatchView[]): { id: string; title: string; when: string; state: "Wartet auf Bestätigung" | "Eingetragen" | "Widerrufen" | "Verworfen" | "Abgelaufen" | "Fehlgeschlagen"; counts: { invited: number; accepted: number; revoked: number }; letters: boolean }[]` (newest first; `letters` true when the batch has open claim-key invitations); `delegateRows(rows: { delegate: string; label: string | null; displayName: string | null; typeName: string }[]): { who: string; typeName: string }[]` where `who` is the display name, else the label, else "Unbekanntes Konto" — never the address.
- `actions_list` must also return each action's batches with counts (extend the plan-2 `ActionView` with `batches: BatchView[]`, `BatchView = { id: string; typeId: Hex; count: number; status: string; invited: number; accepted: number; revoked: number; hasOpenLinks: boolean }`).
- Batches page: the rows; "Briefe herunterladen (PDF)" calls `letters` and saves the file; "Ganze Ausstellung widerrufen" → `revoke_prepare { batchId }`.
- Settings page: the switch **"Mitglieder dürfen öffentlich sichtbar sein"** (from `orgs_list().membersMayBePublic`, `members_public_prepare`; help text as in plan 3 Task 6); the delegates list with "Entziehen" and "Türscanner-Konto berechtigen" (type picker + member picker from the org's `account_owners` by display name, `delegate_prepare`).

- [ ] **Step 1: Write the failing tests**

```ts
test("batchRows maps statuses to the German labels and sorts newest first", …);
test("letters is offered only while open claim-key invitations exist", …);
test("delegateRows never outputs an address-looking string", …);       // assert no /0x[0-9a-f]{6}/i in any field
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (3).
- [ ] **Step 5: Lint and commit** — `feat(web): credential batches, letters, delegates and members switch`.

---

### Task 5: Event badges — attendees, one tap, repeatable

**Files:**
- Create: `supabase/migrations/20261117crb_credential_event_badges.sql`
- Create: `apps/web/src/lib/credentials/event-badges.ts`
- Modify: `apps/web/src/app/api/credentials/org/route.ts` (`event_badges_list`, `event_badge_setup`, `event_badge_get`, `event_badge_prepare`, `event_badge_auto`; `/api/credentials/me` gets `badge_nudge`; add `"event_badges_list" | "event_badge_setup" | "badge_nudge"` to `CredentialAction` in web and Expo)
- Test: `apps/web/tests/credentials-event-badges.test.ts`

**Interfaces:**
- Produces (migration): `alter table credential_types add column if not exists auto_badges boolean not null default false, add column if not exists last_auto_at timestamptz;` and a unique index `credential_types_event_badge_uq on credential_types (event_id) where kind = 'badge' and event_id is not null and not retired` (one badge type per event); `app_settings` row `credentials_badge_delegate_enabled` = `'false'`.
- Produces (`event-badges.ts`):

```ts
export async function attendeesOf(store: CredentialStore, eventId: string): Promise<{ wallet: string; source: "ticket" | "qr" }[]>;   // deduplicated, lowercase
export function badgeWindow(ev: { date: string; end_date?: string | null }): { claimStart: number; claimEnd: number };      // open question 1
export async function eventBadgesList(d: Deps, c: Caller, p: { accountId: string }): Promise<Result<{ eventId: string; title: string; date: string; badge: { typeId: Hex; name: string; chain: "draft" | "onchain"; auto: boolean } | null; attendees: number; issued: number; accepted: number }[]>>;
export async function eventBadgeGet(d: Deps, c: Caller, p: { eventId: string }): Promise<Result<{ attendees: number; notYetIssued: number; issued: number; accepted: number; badge: … | null }>>;
export async function prepareEventBadge(d: Deps, c: Caller, p: { eventId: string; name?: string; imageUrl?: string }): Promise<Result<{ actionId: string; typeId: Hex; count: number }>>;
export async function setupEventBadge(d: Deps, c: Caller, p: { eventId: string; enabled: boolean; name?: string; imageUrl?: string; supplyCap?: number }): Promise<Result<{ typeId: Hex | null }>>;   // action event_badge_setup: writes or retires the draft badge row only, no chain step (used by the event create/edit toggle); on an on-chain type, enabled false prepares retireType
export async function prepareEventBadgeAuto(d: Deps, c: Caller, p: { eventId: string; enabled: boolean }): Promise<Result<{ actionId: string }>>;
```

Rules:
- The caller must be owner or admin of `events.account_id` (reuse `orgContextFor`).
- `prepareEventBadge`: if the event has no badge type yet, create the `credential_types` row (template `abzeichen`, `kind: "badge"`, name default `` `Dabei: ${event.title}` `` cut to 60 characters, image default `events.image_url`, `event_id`, claim window from `badgeWindow`, `publicClaim: true`). Recipients = `attendeesOf` minus everyone who already has an invitation of this type (any status). Steps in **one** action: `createType` (only while `chain_status = 'draft'`) then `addBatch`. Zero new recipients and the type already on chain → `409 NOTHING_TO_ISSUE` ("Alle Teilnehmenden haben ihr Abzeichen schon bekommen."). Batch `source = "event"`. Summary title `` `${n} Abzeichen vergeben: ${name}` ``.
- `prepareBatch` (plan 2) must accept a type that is still `draft` when the same action creates it: give `prepareAction` the pre-steps and let `prepareBatch` append its `addBatch` step (add an internal option `preSteps: RegisterStep[]`). `stepsConfirmedBy` already checks order.
- `prepareEventBadgeAuto(enabled: true)` → one `setDelegate(typeId, badgeDelegateAddress(), true)` step with the label "Röbel-Server (sofortige Abzeichen)" and sets `auto_badges = true` once the sync sees `DelegateSet`; `enabled: false` → `setDelegate(…, false)` and `auto_badges = false` immediately (stopping must not wait for the chain). `503 NOT_CONFIGURED` when `badgeDelegateAddress()` is null.

- [ ] **Step 1: Write the failing tests**

```ts
test("attendees = checked-in tickets plus non-rejected event_attend claims, each wallet once", …);
test("refunded and void tickets and rejected claims never count", …);
test("the first tap creates the type and the batch in one action with createType before addBatch", …);
test("a second tap issues only latecomers; with none left it is 409 NOTHING_TO_ISSUE", …);
test("badgeWindow: event day 00:00 Berlin to 14 days after the last day 23:59:59", …);
test("only owners and admins of the event's org may prepare", …);
test("turning auto off clears auto_badges at once and prepares setDelegate(false)", …);
test("a second badge type for the same event is refused by the store", …);
test("event_badge_setup stores a draft with name, poster image and limit, and the first prepare puts it on chain", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** this file plus `tests/credentials-batch.test.ts tests/credentials-actions.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(web): event badges from check-ins and Smart Event QR claims`.

---

### Task 6: Instant badges through the node delegate (opt-in)

**Files:**
- Create: `apps/web/src/lib/credentials/badge-delegate.ts`
- Create: `apps/web/src/app/api/cron/credentials-badges/route.ts`
- Modify: `apps/web/vercel.json` (`{ "path": "/api/cron/credentials-badges", "schedule": "*/5 * * * *" }`)
- Test: `apps/web/tests/credentials-badge-delegate.test.ts`

**Interfaces:**
- Produces:

```ts
export function badgeDelegateAddress(): Address | null;                 // from CREDENTIAL_BADGE_DELEGATE_KEY
export const AUTO_MAX_RECIPIENTS = 500;
export function inAutoWindow(ev: { starts: number; ends: number }, nowSec: number): boolean;   // starts - 3600 <= now <= ends + 6 * 3600
export async function runAutoBadges(d: AutoDeps): Promise<{ type: Hex; issued: number; skipped?: "window" | "not_delegate" | "kill_switch" | "low_balance" | "nothing_new" | "pending_batch" }[]>;
export async function nudgeAutoBadges(d: AutoDeps, c: Caller, p: { eventId: string }): Promise<Result<{ ran: boolean }>>;   // action badge_nudge (app only, route /api/credentials/me): runs runAutoBadges for that event's type when the caller attended, auto_badges is on and the last node batch of that type is older than 60 s (compare-and-set on credential_types.last_auto_at); otherwise { ran: false }
export type AutoDeps = { store: CredentialStore; reader: CredentialRegistryReader; send: (call: { to: Address; data: Hex }) => Promise<Hex>; balance: () => Promise<bigint>; killSwitch: () => Promise<boolean>; now: () => number; registry: Address; minBalanceWei: bigint };
```

Rules per type with `auto_badges = true`: kill switch on → skip all; outside `inAutoWindow` → skip; `reader.isDelegate(typeId, node)` false → skip and set `auto_badges = false`; a batch of this type from the node still `prepared` → skip (`pending_batch`, wait for the sync); balance below `minBalanceWei` (default 0.01 xDAI) → skip with a log line; otherwise build a batch of at most 500 new attendees (same exclusion as Task 5), store it with `source: "node_delegate"` and an action `prepared_via: "node"` in status `submitted`, send `addBatch` from the node key, store the hash. Invitations are delivered by the sync (plan 2 Task 6) when `BatchAdded` arrives, so the attendee gets the push within minutes. The node key never calls anything but `addBatch`.

- [ ] **Step 1: Write the failing tests**

```ts
test("issues one batch for new attendees inside the window and records it as node_delegate", …);
test("does nothing outside the window, with the kill switch on, or below the balance floor", …);
test("stops and clears auto_badges when the org removed the delegate on chain", …);
test("waits while its previous batch is not yet on chain", …);
test("caps a batch at 500 and takes the rest next run", …);
test("only ever sends addBatch to the registry address", …);                // inspect every send call
test("badge_nudge runs at most once per type per 60 s and only for an attendee", …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement**; the cron route uses the same authorisation check as `apps/web/src/app/api/cron/vorhaben/route.ts` and a viem wallet client on Gnosis for `send`. **Step 4: Run** — Expected: PASS (7).
- [ ] **Step 5: Commit** — `feat(web): optional instant event badges through a node delegate`.

---

### Task 7: Dashboard event tab "Abzeichen"

**Files:**
- Create: `apps/web/src/components/org-dashboard/EventBadgePanel.tsx`
- Modify: `apps/web/src/app/dashboard/events/[id]/edit/page.tsx` (a tab "Abzeichen" next to "Statistik", about line 252)
- Create: `apps/web/src/app/dashboard/credentials/events/page.tsx` (all events with badge state, from `event_badges_list`)
- Test: `apps/web/tests/credentials-event-panel.test.ts`
- Create: `apps/web/src/lib/credentials/event-panel.ts`

**Interfaces:**
- Produces (`event-panel.ts`): `eventPanelState(g: EventBadgeGetResult, now: number): { primary: { label: string; enabled: boolean } ; lines: string[] }` — no badge yet → "Abzeichen für Teilnehmende einrichten"; attendees not yet issued → `` `Abzeichen vergeben (${n})` ``; all issued → disabled "Alle haben ihr Abzeichen"; lines: "<a> Teilnehmende · <i> eingeladen · <c> angenommen".
- Panel: name and image fields (prefilled from the event), the primary button (calls `event_badge_prepare` → `PendingActionPanel`), the switch "Sofort vergeben, während die Veranstaltung läuft" with the help text "Dafür darf der Röbel-Server dieses Abzeichen in eurem Namen ausstellen, sonst nichts. Ihr könnt das jederzeit beenden." (`event_badge_auto`).

- [ ] **Step 1: Write the failing tests** — the three primary states and the count line, from fixed inputs.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS (3).
- [ ] **Step 5: Lint and commit** — `feat(web): event badge tab in the org dashboard`.

---

### Task 8: In the app — organiser button and attendee hint

**Files:**
- Modify: `apps/expo/app/org/event-tickets/[id].tsx` (a row "Abzeichen vergeben (<n>)" when the gate is open and the caller is owner or admin)
- Modify: `apps/expo/app/e/[id].tsx` (after a successful `event_attend` claim: the line "Du bekommst ein Abzeichen, sobald der Veranstalter es vergibt." when the event has a badge type)
- Modify: `apps/expo/lib/credreg/api.ts` (`fetchEventBadge`, `prepareEventBadge`), `apps/expo/lib/signed-request.ts` (the two new actions)
- Test: `apps/expo/lib/credreg/__tests__/event-badge.test.ts`

**Interfaces:**
- Consumes: `event_badge_get`, `event_badge_prepare`; the approve screen `/org/credentials/approve/<actionId>` (plan 3 Task 6).
- Produces: `eventBadgeRow(g: EventBadgeGetResult | null): { label: string; disabled: boolean } | null` in `apps/expo/lib/credreg/org.ts` (null = no row; same labels as the web panel's primary button).

The attendee side needs nothing else: the badge invitation arrives as a push and goes through the accept screen of plan 3. A public acceptance is the attendee's own operation (one fingerprint); a private one needs none.

- [ ] **Step 1: Write the failing tests** — `eventBadgeRow` for: gate closed (null), no badge, n to issue, all issued; tapping prepares and navigates to the approve screen with the returned id.
- [ ] **Step 2: Run** `cd apps/expo && ./node_modules/.bin/jest lib/credreg/__tests__/event-badge.test.ts --watchAll=false --no-watchman --ci` — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Lint and commit** — `feat(expo): issue event badges from the door screen`.

---

### Task 9: Event page in the app — organiser and attendee (spec 5.6b)

**Files:**
- Create: `apps/web/src/app/api/credentials/events/[eventId]/badge/route.ts` (public `GET`)
- Modify: `apps/expo/app/submit-event.tsx`, `apps/expo/app/edit-event/[id].tsx` (section "Abzeichen für Teilnehmende")
- Modify: `apps/expo/app/event/[id].tsx` (organiser block and attendee block)
- Create: `apps/expo/components/credentials/EventBadgeOrganiser.tsx`, `EventBadgeAttendee.tsx`, `apps/expo/app/event/[id]/badge-qr.tsx` (full-screen QR)
- Create: `apps/expo/lib/credreg/event-page.ts`
- Test: `apps/web/tests/credentials-event-badge-public.test.ts`, `apps/expo/lib/credreg/__tests__/event-page.test.ts`

**Interfaces:**
- Produces (web route): `GET /api/credentials/events/<eventId>/badge` → `{ badge: { name: string; imageUrl: string | null; claimStart: number; claimEnd: number; collected: number } | null }` (collected = accepted invitations; no names), cached 30 s.
- Produces (`event-page.ts`): `attendeeBadgeState(p: { badge: PublicBadge | null; held: boolean; pending: boolean; nowSec: number }): { label: string; state: 'before' | 'collected' | 'pending' | 'over' } | null` — "Das bekommst du, wenn du dabei bist" (before), "Gesammelt" (held), "Wird eingetragen" (attended, no leaf yet), "Vorbei" (window over, not collected); `organiserBadgeView(g: EventBadgeGetResult): { count: string; primary: { label: string; disabled: boolean } }` reusing the labels of Task 7's `eventPanelState`.
- Create/edit toggle: switch "Abzeichen für Teilnehmende", name (default `Dabei: <Titel>`), art (default the event poster, changeable with the existing image picker), optional limit; on save it calls `event_badge_setup` after the event itself was saved.
- Event page, organiser (owner/admin of the event's org, gate open, badge set up): "Abzeichen-QR zeigen" opens `badge-qr.tsx` — the event's Smart Event QR (`https://www.roebel.app/e/<reward_event_id>`, white on black, screen kept awake with the existing keep-awake helper if present, otherwise brightness unchanged) with the event title above and the live count below; if the event has no `reward_events` row yet, it is created first through the existing `create-reward-event` edge function (the same call the org dashboard's QR panel makes). Live count = `event_badge_get` polled every 10 s while the screen is focused (`useIsFocused` from `@react-navigation/native`, not expo-router's, see the repo reference note). "Abzeichen vergeben (<n>)" → `event_badge_prepare` → approve screen.
- Event page, attendee: `EventBadgeAttendee` with the stamp art (`StampCard` from plan 3b Task 2 if merged, else a plain image) and the `attendeeBadgeState` label.

- [ ] **Step 1: Write the failing tests**

```ts
test("public badge route returns name, image, window and count, and null for events without a badge", …);   // web
it('attendee label: before, collected, pending, over', …);
it('organiser view counts and primary label match the web panel', …);
it('no label fails assertCleanCopy', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** both test files — Expected: PASS (4). Dev-build check: create an event with the toggle on, open the QR full screen, scan it with a second phone, watch the count change.
- [ ] **Step 5: Lint and commit** — `feat(web): public event badge route` and `feat(expo): event badge toggle, full-screen badge QR and attendee view`.

---

## Owner gates (Max)

1. Apply `20261117crb_credential_event_badges.sql` through the Supabase MCP.
2. For instant badges only: create the node EOA, put its key into Vercel production as `CREDENTIAL_BADGE_DELEGATE_KEY`, fund it with a little xDAI, then set `credentials_badge_delegate_enabled` to `true`. Without these the feature stays off and "Sofort vergeben" answers "Nicht eingerichtet".
3. Web deploy happens on merge to `main` (Vercel); the app part ships with the next OTA after plan 3.

## Self-review notes

- Spec 5.6b event page: organiser toggle on create/edit, full-screen badge QR, live count, "Abzeichen vergeben", attendee before/after (Task 9). The attendee's scan moment, collection and org profile are in plan 3b, which runs after this plan.
- Spec 5.8 screens: types (Task 2), people incl. import and status (Task 3), batches and pending confirmations (Tasks 1, 4), event badges (Tasks 5, 7), delegates (Task 4). Spec 5.4 steps 1–3 and 5 in the browser (Tasks 1–4). Spec 5.5: switch per event, attendees from both existing sources, one tap repeatable, optional node delegate (Tasks 5–8). `app/stamp-scan.tsx` untouched.
- Spec 5.5 says the attendee's badge claim rides "in the same sponsored operation as the Röbel Münzen for attending". The attendance Münzen are paid by the server (`claim-reward` edge function, funder wallet): there is no attendee operation to join, and the badge leaf usually does not exist yet when the QR is scanned. This plan therefore makes a public badge its own operation (one fingerprint) and a private one free.
