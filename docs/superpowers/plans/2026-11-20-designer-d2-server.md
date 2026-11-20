# Designer D2 — Server: Drafts, Assets, Publish and Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store card design drafts per org, accept image assets, send a draft to the creator's phone for testing, publish a draft as an immutable design version whose URL is written to the register through the existing phone confirmation, and serve the live design to holders.

**Architecture:** New `apps/web/src/lib/credentials/designs/*` modules with a store interface (in-memory for tests, Supabase for production), one action route `/api/credentials/designs` using `authenticateCaller` (app signature and Studio pairing session), one multipart asset route, and public immutable routes `/api/credentials/designs/<sha>` (metadata JSON) and `/<sha>/image` (PNG). Publishing reuses `prepareTypeAction` with a `metadataURI` that points at the version; the version becomes live when the action is confirmed.

**Tech Stack:** Next.js 15 route handlers (nodejs runtime), Supabase (Postgres + storage bucket `images`), `@roebel/card-design` (D1), node:test via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-credential-designer-design.md` §6, §7, §10. **Depends on:** D1 merged into `feat/card-designer`.

## Global Constraints

- Branch `feat/card-designer` (same worktree as D1). Never merge into main; the owner merges.
- Migration file `supabase/migrations/20261120cda_card_designs.sql`; RLS on, no anon/authenticated grants (service role only, like `20261117cra`). **Do not apply it to production** — owner gate.
- Switch `app_settings.credential_designer_enabled` (string `'true'`) gates every draft action; absent/other = refused with 403 `DESIGNER_OFF` "Der Ausweis-Designer ist noch nicht freigeschaltet.". Drafts do **not** need `credentialDeps()`, the registry, the org being on chain, or `credentials_enabled`. Publishing needs all of them (existing checks).
- Rights: org owner or admin (`orgContextFor` in `lib/credentials/people.ts`), same German 403 text as there.
- Public design JSON and preview PNG never contain a holder value: render with `mode: 'public'`.
- Server texts German; never a wallet address in any response; never the words NFT/Token/Blockchain.
- Tests: `cd apps/web && npx tsx --test tests/<file>.test.ts`. Commit `feat(web): …` with the Co-Authored-By line.

## Review Focus

1. **Two editors save the same draft at once** (Studio and phone) — `draft_save` takes `baseRevision`; a stale save returns 409 `DRAFT_CONFLICT` "Der Entwurf wurde inzwischen geändert." and the newer draft; test in Task 2.
2. **Publishing while an earlier publish of the same type is still awaiting the phone** — 409 `ALREADY_PENDING` (existing text style); test in Task 4.
3. **The publish action is cancelled or expires** — the previous live version stays live, the draft stays editable; test in Task 4.
4. **An asset that is not an image, or 20 MB** — refused (`png|jpeg|webp|svg+xml`, ≤ 8 MB; SVG sanitised: no `<script>`, no `on*=`, no external `href`); test in Task 3.
5. **A design references an asset of another org** — `draft_save` refuses asset ids not owned by the account (built-ins allowed); test in Task 2.

---

### Task 1: Migration and the design store

**Files:**
- Create: `supabase/migrations/20261120cda_card_designs.sql`, `apps/web/src/lib/credentials/designs/store.ts`, `apps/web/src/lib/credentials/designs/store-supabase.ts`
- Test: `apps/web/tests/designs-store.test.ts`

**Tables:**
- `credential_design_drafts (id uuid pk default gen_random_uuid(), account_id uuid not null, type_id text null unique, name text not null, kind text not null check (kind in ('role','membership','badge')), template text null, design jsonb not null, revision int not null default 1, test_sent_at timestamptz, updated_by text not null, updated_at timestamptz default now(), created_at timestamptz default now())`
- `credential_design_versions (sha text pk, draft_id uuid not null references credential_design_drafts on delete cascade, type_id text null, version int not null, design jsonb not null, preview_path text not null, action_id text null, status text not null check (status in ('pending','live','superseded','abandoned')), created_by text not null, created_at timestamptz default now())`, unique `(draft_id, version)`
- `credential_design_assets (sha text pk, account_id uuid not null, kind text not null check (kind in ('logo','sticker','background','image')), storage_path text not null, mime text not null, width int, height int, ai boolean not null default false, prompt text, created_by text not null, created_at timestamptz default now())`
- `app_settings` row `credential_designer_enabled = 'false'` (insert on conflict do nothing).

**Interfaces — Produces (`store.ts`):** `DraftRow`, `VersionRow`, `AssetRow` (camelCase of the columns); `interface DesignStore { getDraft(id); listDrafts(accountId); insertDraft(row); updateDraft(id, patch, expectRevision): Promise<DraftRow | 'conflict'>; deleteDraft(id); insertVersion(row); getVersion(sha); versionsOf(draftId); setVersionStatus(sha, status, actionId?); liveVersionOfType(typeId); versionByAction(actionId); getAsset(sha); insertAsset(row); assetsOf(accountId) }`; `class InMemoryDesignStore implements DesignStore`; `designerEnabled(read: () => Promise<string | null>): Promise<boolean>`.

- [ ] **Step 1: Failing tests** — `updateDraft` with a stale revision returns `'conflict'`, with the current one bumps `revision`; `liveVersionOfType` returns the newest `live`; `versionByAction` finds the pending version.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** both stores and the migration. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(web): card design tables and store`.

---

### Task 2: Draft actions and the route

**Files:**
- Create: `apps/web/src/lib/credentials/designs/drafts.ts`, `apps/web/src/app/api/credentials/designs/route.ts`
- Modify: `apps/web/src/app/api/credentials/status/route.ts` (response gains `designer: boolean` from `credential_designer_enabled`, same 60 s cache; Studio and the app gate the designer on it)
- Modify: `apps/web/src/lib/signed-request/message.ts` (`CredentialAction` gains `"design_orgs" | "design_drafts_list" | "design_draft_get" | "design_draft_save" | "design_draft_delete" | "design_test_send" | "design_publish" | "design_assets_list"`), `apps/web/src/lib/credentials/caller.ts` (export `DESIGN_ACTIONS`)
- Test: `apps/web/tests/designs-drafts.test.ts`

**Interfaces — Produces (`drafts.ts`):** each `(d: DesignDeps, c: Caller, p) => Promise<Result<…>>` with `DesignDeps = { store: DesignStore; credStore: CredentialStore; settings: () => Promise<string | null>; now: () => number }`:
- `listDesignOrgs()` → `{ accountId, name, avatarUrl, role: 'owner'|'admin' }[]` of the caller's owner/admin orgs, from the database only (works with the registry unconfigured)
- `listDrafts(p: { accountId })` → `DraftView[]` = `{ id, name, kind, template, typeId, revision, updatedAt, liveVersion: number | null, pendingVersion: number | null, hasUnpublishedChanges: boolean, testSentAt }`
- `getDraft(p: { draftId })` → `DraftView & { design: CardDesign }`
- `saveDraft(p: { accountId; draftId?; baseRevision?; name; kind; template?; design })` → `DraftView & { design }`; validates with `validateDesign`, name 2–60 chars (message "Der Name muss 2 bis 60 Zeichen lang sein."), every non-builtin `assetId` must be an asset of `accountId`.
- `deleteDraft(p: { draftId })` — only while `typeId` is null (else 409 "Veröffentlichte Ausweise lassen sich nicht löschen, nur stilllegen.").
- Route: `POST /api/credentials/designs` `{ action, payload }` → `jsonOk/jsonFail` exactly like `api/credentials/org/route.ts`; `runtime = "nodejs"`; CORS is already covered by `/api/credentials/:path*`.

- [ ] **Step 1: Failing tests** — status JSON has `designer`; designer switch off → 403 `DESIGNER_OFF`; non-admin → 403; save → get round-trip; stale `baseRevision` → 409 `DRAFT_CONFLICT` with the current draft in `data`; foreign asset id → 400; delete of a published draft → 409; `design_orgs` lists only owner/admin orgs with `credentialDeps()` null.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(web): card design drafts`.

---

### Task 3: Assets, public design routes and preview rendering

**Files:**
- Create: `apps/web/src/lib/credentials/designs/assets.ts`, `apps/web/src/lib/credentials/designs/render.ts`, `apps/web/src/app/api/credentials/designs/assets/route.ts`, `apps/web/src/app/api/credentials/designs/[sha]/route.ts`, `apps/web/src/app/api/credentials/designs/[sha]/image/route.ts`, `apps/web/src/app/api/credentials/designs/assets/[sha]/route.ts`
- Modify: `apps/web/package.json` (`@roebel/card-design: workspace:*`, `canvaskit-wasm`), `apps/web/next.config.mjs` (`serverExternalPackages: ['canvaskit-wasm']` and include its `.wasm` in the output file tracing for these routes)
- Test: `apps/web/tests/designs-assets.test.ts`

**Interfaces — Produces:**
- `storeAsset(d, c, p: { accountId; kind; bytes: Uint8Array; mime; ai?: boolean; prompt?: string }) => Result<AssetView>`; `AssetView = { sha, kind, url, width, height, ai }`; storage path `credential-designs/<accountId>/<sha>.<ext>` in bucket `images`; SVG sanitised and rasterised to PNG (2048 px max side) before storing so every renderer only sees bitmaps.
- `POST /api/credentials/designs/assets` multipart (`accountId`, `kind`, `file`) with Bearer pairing token or the app's signed headers (`authenticateCaller` with action `design_asset_upload` — add it to `CredentialAction`).
- `GET /api/credentials/designs/assets/<sha>` → 302 to the public storage URL (immutable).
- `renderPreview(design, images: loader): Promise<Uint8Array>` — `@roebel/card-design` `renderPng` at width 924, `mode: 'public'`, `shinePhase: 0.35`.
- `GET /api/credentials/designs/<sha>` → `{ name, description, image: "<base>/api/credentials/designs/<sha>/image", properties: { kind, organisation, aiGenerated: boolean, designVersion, design } }`, `Cache-Control: public, max-age=31536000, immutable`; 404 for unknown sha. `/image` serves the stored preview PNG.

- [ ] **Step 1: Failing tests** — PNG accepted and deduplicated by sha; 9 MB refused ("Das Bild ist zu groß (höchstens 8 MB)."); `text/html` refused; SVG with `<script>` is stored without it; `renderPreview` of a design with a `holderName` field and `values` never draws the value (compare to a render without the field: identical bytes).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `pnpm --filter web build` succeeds (canvaskit traced).
- [ ] **Step 5: Commit** — `feat(web): design assets, public design routes and preview`.

---

### Task 4: Test-send, publish, update and going live

**Files:**
- Create: `apps/web/src/lib/credentials/designs/publish.ts`
- Modify: `apps/web/src/lib/credentials/actions.ts` (`prepareTypeAction` input gains `metadataURI?: string`; when given it replaces `metadataUrl(t.typeId)` in the config and is compared in the update diff, so a new URI alone emits an `updateType` step; the "display written at once" rule stays for name/description only), `apps/web/src/lib/credentials/sync.ts` (after an action is applied as confirmed: `promoteDesignVersion(actionId)`; on cancel/expire: `abandonDesignVersion(actionId)`), `apps/web/src/lib/credentials/metadata.ts` (`typeMetadataJson` adds `properties.design` and `image` from the live version when there is one), `apps/web/src/lib/credentials/holder.ts` (`mine` items gain `design: CardDesign | null`, `designSha: string | null`), `apps/web/src/lib/credentials/notify.ts` (one push kind `design_test`)
- Test: `apps/web/tests/designs-publish.test.ts`

**Interfaces — Produces (`publish.ts`):**
- `sendTest(d, c, p: { draftId })` → `{ sentAt }`: sets `test_sent_at`, pushes "Entwurf zum Testen: <name>" to the caller's own devices (and to the org's other owners/admins) with deep link `roebel://org/credentials/design-test?draft=<id>`; no register write.
- `publishDraft(d, c, p: { draftId })` → `{ actionId, version, sha }`: freezes the draft design, renders and stores the preview, inserts version `status: 'pending'`, then `prepareTypeAction` with `op: 'create'` (first time: name, kind, template, `metadataURI`) or `op: 'update'` (`typeId`, `metadataURI`) and `via` from the caller; stores `action_id`; for create, writes the new `typeId` on the draft. Refuses with 409 `ALREADY_PENDING` "Eine Veröffentlichung wartet schon auf Bestätigung." while a version of the draft is `pending`, and 409 `NO_CHANGES` "Keine Änderungen seit der letzten Veröffentlichung." when `designHash` equals the live sha.
- `promoteDesignVersion(store, credStore, actionId)`: pending → live, previous live → superseded, and the type row's `imageUrl` becomes the version's preview URL (older app builds keep showing a picture). `abandonDesignVersion(store, actionId)`: pending → abandoned.
- Route actions `design_test_send`, `design_publish` added to `/api/credentials/designs`.

- [ ] **Step 1: Failing tests** (with `InMemoryCredentialStore` + `InMemoryDesignStore`, fake receipt as in `tests/credentials-actions.test.ts`) — first publish prepares a `createType` step whose config `metadataURI` ends with `/api/credentials/designs/<sha>`; confirming it makes the version live and `mine` returns that design; a second publish prepares exactly one `updateType` step with the new URI; while pending → 409; cancelling → old version still live, new one `abandoned`, draft still editable; unchanged design → 409 `NO_CHANGES`; `sendTest` writes nothing to `credential_actions`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** all `tests/credentials-*.test.ts` and `tests/designs-*.test.ts` — PASS.
- [ ] **Step 5: Commit** — `feat(web): publish card designs as register updates`; push.
