# Credential Register 5 — Ortis Studio "Ausweise" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a section "Ausweise" to Ortis Studio so an org admin can manage credential types, import people, issue batches, follow the phone confirmation, download letters, run event badges and manage delegates from the desktop, using only the server routes of plans 2 and 4.

**Architecture:** Studio holds no wallet. It already has a 30-day chat session token from device pairing (`apps/studio/src/workspace/session.ts`), and plan 2's `authenticateCaller` accepts that token for every dashboard action (not for the holder actions). The section is a set of React components on branch `feat/ortis-studio-desktop` that call `/api/credentials/*` with `Authorization: Bearer <token>`; every change becomes a prepared action that the phone confirms, exactly like Studio's agent approvals.

**Tech Stack:** Electron + Vite + React 19 renderer (`apps/studio`), vitest, the Studio i18n (`t()` with German source strings and English dictionaries under `src/i18n/en/*.ts`, checked by `src/i18n/__tests__/coverage.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-17-credential-register-design.md` section 5.8. Server contract: `docs/superpowers/plans/2026-11-17-credreg-2-backend.md` (Tasks 3–8) and `docs/superpowers/plans/2026-11-17-credreg-4-dashboard-and-badges.md` (Tasks 3–6: `people_preview`, `event_badges_list`, `event_badge_prepare`, `event_badge_auto`, `actions_list` with batches). Read `docs/STATE_OF_ORTIS_STUDIO.md` first.

**Depends on:** plans 2 and 4 deployed to `www.roebel.app` (the routes and the CORS entry for `/api/credentials/:path*` of plan 2 Task 3).

## Open questions for the owner

1. **Which Studio build ships it.** The section is renderer-only (no `electron/*.cjs` change). *Default: an interface OTA (`pnpm ota:publish`, Max's Mac) after the next installer, plus the browser version.*
2. **Visibility of the section.** *Default: the rail entry "Ausweise" appears only when `orgs_list` returns at least one org and `GET /api/credentials/status` says `enabled`; otherwise it is absent, not greyed out.*

## Global Constraints

- **Branch rules:** code lives only on `feat/ortis-studio-desktop`. Work in a worktree based on it: `git worktree add .worktrees/credreg-5 -b feat/credreg-5-studio origin/feat/ortis-studio-desktop`, `pnpm install --frozen-lockfile`. Push `feat/credreg-5-studio`; the owner merges it into `feat/ortis-studio-desktop`. **Never merge into `main`, never open a pull request against `main`.** Do not check out the Studio branch in the main working copy.
- No change under `apps/studio/electron/` (so the section can ship as an interface OTA). No new dependencies.
- Every user-facing string goes through `t()` (German source) and gets an English entry in `apps/studio/src/i18n/en/credentials.ts`; the coverage test must pass.
- German product language as in the app: "Ausweis", "Abzeichen", "Röbel Münzen". Never the words NFT, Token, Wallet, Blockchain or Chain; never a wallet address.
- Studio cannot sign: no screen may suggest that a change is done before the phone confirmed it.
- Follow the Studio UI rules: no drop shadows, warm stone greys, one primary action per view, `--w-accent` for the accent.
- Tests: `cd apps/studio && pnpm test` (vitest). Commit convention: `feat(studio): …`.

## Review Focus

1. **The session token expired while an action waits.** Expected: a 401 shows the existing sign-in prompt; after pairing again the pending action is still listed (it lives on the server). Test in Task 1.
2. **A holder-only action sent from Studio.** Expected: 403 `APP_ONLY` is shown as "Das geht nur in der Röbel App.", never as a crash. Test in Task 1.
3. **A CSV in Windows-1252 with umlauts.** Expected: names arrive intact. Test in Task 3.
4. **The browser version (no `window.studio`).** Expected: letters download through a normal file download; nothing calls Electron APIs. Test in Task 4.
5. **Two admins confirm the same action.** Expected: the second phone sees "bereits erledigt"; Studio shows the final state once. Test in Task 4.

---

### Task 1: API client and section scaffold

**Files:**
- Create: `apps/studio/src/credentials/api.ts`, `apps/studio/src/credentials/types.ts`
- Modify: `apps/studio/src/ui/shell/nav.ts` (`Section` gains `'credentials'`; `SECTIONS` entry `{ id: 'credentials', label: 'Ausweise' }` after `'apps'`), `apps/studio/src/ui/shell/icons.tsx` (`SECTION_ICONS.credentials`, a card outline), `apps/studio/src/ui/App.tsx` (render `CredentialsSection`)
- Create: `apps/studio/src/credentials/CredentialsSection.tsx` (org picker + tabs: Typen, Personen, Ausstellungen, Veranstaltungen, Einstellungen)
- Create: `apps/studio/src/i18n/en/credentials.ts`
- Test: `apps/studio/src/credentials/__tests__/api.test.ts`, `apps/studio/src/ui/shell/__tests__/nav.test.ts` (extend)

**Interfaces:**
- Consumes: `apiBase()`, `loadSession()` (`src/workspace/session.ts`).
- Produces (`api.ts`): `class CredentialsApiError extends Error { status: number; code: string }`; `credCall<T>(route: 'org' | 'actions' | 'me', action: string, payload: Record<string, unknown>, token: string): Promise<T>` — `POST ${apiBase()}/api/credentials/${route}` with body `{ action, payload }` and `Authorization: Bearer <token>`; maps plan 2 error bodies `{ ok: false, code, message }` to `CredentialsApiError` (German message from the server); `401` → code `session`; `403 APP_ONLY` → message "Das geht nur in der Röbel App."; network failure → code `network`, "Server nicht erreichbar. Internetverbindung prüfen.". One typed wrapper per action used in this plan: `fetchStatus` (`GET /api/credentials/status`), `fetchOrgs`, `fetchTypes`, `prepareType`, `previewPeople`, `prepareBatch`, `fetchPeople`, `prepareRevocation`, `fetchActions`, `cancelAction`, `downloadLetters`, `fetchEventBadges`, `prepareEventBadge`, `setEventBadgeAuto`, `prepareDelegate`, `prepareMembersPublic`.
- Produces (`types.ts`): the response shapes of the named actions, copied field for field from plans 2 and 4 (`OrgListItem`, `TypeRow`, `PersonRow`, `ActionView` with `batches`, `PreviewResult`, `EventBadgeListItem`).
- `CredentialsSection`: loads the session (none → the existing sign-in screen), `fetchStatus` + `fetchOrgs`, an org picker when there is more than one org, and for an org that is not `ready` the two explanation texts of plan 2 Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
it('posts { action, payload } with the bearer token to /api/credentials/<route>', …);
it('maps 401 to code session, 403 APP_ONLY to the app-only message, a network error to code network', …);
it('parseSection accepts credentials and SECTIONS lists Ausweise after Mini-Apps', …);
```

- [ ] **Step 2: Run** `cd apps/studio && pnpm test` — Expected: FAIL. **Step 3: Implement**; add every new `t()` string to `en/credentials.ts`. **Step 4: Run** — Expected: PASS, including `coverage.test.ts`.
- [ ] **Step 5: Commit** — `feat(studio): Ausweise section scaffold and credentials API client`.

---

### Task 2: Types

**Files:**
- Create: `apps/studio/src/credentials/TypesTab.tsx`, `TypeEditor.tsx`, `templates.ts`
- Test: `apps/studio/src/credentials/__tests__/templates.test.ts`

**Interfaces:**
- Produces (`templates.ts`): `STUDIO_TEMPLATES` with the six templates of plan 2 Task 3 (`mitglied`, `vorstand`, `mitarbeiter`, `ehrenmitglied`, `stadtvertreter`, `abzeichen`) as display entries (label, kind, short description); `validateType(form)` with the same rules and messages as plan 4 Task 2's `validateTypeForm` (copied, since Studio cannot import from `apps/web`; the test pins the messages).
- `TypesTab`: list (image, kind label, seal, counts, "Noch nicht bestätigt" for drafts), "Neuer Ausweis-Typ" → template picker → `TypeEditor` (name, description, image URL or upload through the existing chat upload route, benefits, limit, claim window) → `prepareType` → the pending card of Task 4.

- [ ] **Step 1: Write the failing test** — `validateType` returns the same German messages as plan 4 for: empty name, 61-character name, cap `0`, end before start.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(studio): credential types in Ausweise`.

---

### Task 3: People — import with preview and issue

**Files:**
- Create: `apps/studio/src/credentials/PeopleTab.tsx`, `ImportDrop.tsx`, `read-text.ts`
- Test: `apps/studio/src/credentials/__tests__/read-text.test.ts`

**Interfaces:**
- Produces (`read-text.ts`): `readTextFile(file: File): Promise<string>` — decodes UTF-8; when the result contains U+FFFD and the bytes are not valid UTF-8, decodes as `windows-1252` (`TextDecoder`); strips a BOM. Files over 1 MB are refused ("Die Datei ist zu groß (höchstens 1 MB).").
- `PeopleTab`: type picker; drag-and-drop or file picker for `.csv`/`.txt`, or a text area to paste; "Alle aktuellen Mitglieder"; optional "Gültig bis"; "Vorschau" → `previewPeople` (server parses, plan 4 Task 3) and shows counts, rejected rows with reasons and the "already valid" count; one primary button "<n> Ausweise ausstellen" → `prepareBatch` with the same `csv` / `fromMemberList` / `validUntil` → pending card. Below: the people list (`fetchPeople`) with state filter and multi-select "Widerrufen".

- [ ] **Step 1: Write the failing tests**

```ts
it('reads UTF-8 with BOM', …);
it('falls back to windows-1252 for "Müller;mueller@example.org" saved by Excel', …);
it('refuses files over 1 MB', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(studio): import people and issue credentials from Ausweise`.

---

### Task 4: Batches, phone confirmation and letters

**Files:**
- Create: `apps/studio/src/credentials/BatchesTab.tsx`, `PendingCard.tsx`, `poll.ts`, `save-file.ts`
- Test: `apps/studio/src/credentials/__tests__/poll.test.ts`, `save-file.test.ts`

**Interfaces:**
- Produces (`poll.ts`): `watchActions(fetchOnce: () => Promise<ActionView[]>, onChange: (a: ActionView[]) => void, opts?: { intervalMs?: number; signal?: AbortSignal }): void` — polls every 5 s while any action is `awaiting_confirmation` or `submitted`, every 60 s otherwise, stops on abort, calls `onChange` only when a status changed.
- Produces (`save-file.ts`): `saveBlob(blob: Blob, filename: string): void` — creates an object URL and clicks a temporary `<a download>` (works in the Electron renderer and the browser build; no `window.studio` call).
- `PendingCard`: "Bestätige jetzt in der Röbel App auf deinem Handy", the summary lines, live status, "Verwerfen" while awaiting. `BatchesTab`: history with counts, "Briefe herunterladen (PDF)" (`downloadLetters` → `saveBlob(…, "ausweise-<datum>.pdf")`), "Ganze Ausstellung widerrufen".

- [ ] **Step 1: Write the failing tests**

```ts
it('polls fast while something is pending and slows down when all are final', …);    // fake timers
it('reports each status change once, including done after another admin confirmed', …);
it('saveBlob clicks an anchor with the download name and revokes the URL', …);
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(studio): batches, phone confirmation status and letters`.

---

### Task 5: Event badges, delegates and the members switch

**Files:**
- Create: `apps/studio/src/credentials/EventsTab.tsx`, `SettingsTab.tsx`
- Test: `apps/studio/src/credentials/__tests__/events-view.test.ts`
- Create: `apps/studio/src/credentials/events-view.ts`

**Interfaces:**
- Produces (`events-view.ts`): `eventRows(items: EventBadgeListItem[], nowMs: number): { eventId: string; title: string; when: string; line: string; primary: { label: string; disabled: boolean } }[]` — upcoming first, then past (newest first); `line` = "<a> Teilnehmende · <i> eingeladen · <c> angenommen"; primary labels identical to plan 4 Task 7.
- `EventsTab`: the rows; primary → `prepareEventBadge` → pending card; per row the switch "Sofort vergeben, während die Veranstaltung läuft" (`setEventBadgeAuto`).
- `SettingsTab`: "Mitglieder dürfen öffentlich sichtbar sein" (`prepareMembersPublic`, help text as in plan 3 Task 6), delegates list with "Entziehen" and "Türscanner-Konto berechtigen" (member picker by display name).

- [ ] **Step 1: Write the failing test** — ordering, the count line, and the three primary states from fixed inputs.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test` — Expected: all PASS including the i18n coverage test.
- [ ] **Step 5: Commit** — `feat(studio): event badges, delegates and members switch in Ausweise`.

---

## Owner gates (Max)

1. Merge `feat/credreg-5-studio` into `feat/ortis-studio-desktop` (never into `main`).
2. Ship as an interface OTA (`pnpm ota:publish` on Max's Mac) and redeploy the browser version (`ortis-studio-web`); update `docs/STATE_OF_ORTIS_STUDIO.md` with the new section.

## Self-review notes

- Spec 5.8: Studio section "Ausweise" on its own branch, same server routes as the browser dashboard; screens types, people, batches with pending confirmation, event badges, delegates (Tasks 1–5). Spec 5.4 step 3: Studio hands the batch to the phone (Task 4).
- Studio duplicates two small pure helpers (`validateType`, template labels) because it cannot import from `apps/web`; their tests pin the same messages as plan 4.
