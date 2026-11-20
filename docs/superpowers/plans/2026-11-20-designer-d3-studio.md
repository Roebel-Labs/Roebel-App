# Designer D3 — Studio Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Ortis Studio's "Ausweise" section a treasurer opens a template, edits the card freely (drag, resize, rotate, text, logo upload, dynamic name field, shine per element), previews it, saves drafts, sends a test to the phone and publishes or updates it.

**Architecture:** React components under `apps/studio/src/credentials/designer/*` on the Studio branch. The canvas is a CanvasKit surface drawn by `@roebel/card-design` (`drawDesign`), with a DOM overlay for selection handles. All state changes go through the pure reducers of `@roebel/card-design/edit` plus an undo stack. Server calls go to `/api/credentials/designs` (D2) with the pairing token, through `credentials/api.ts`.

**Tech Stack:** React 19 + Vite renderer, `canvaskit-wasm` (wasm loaded via `?url`), vitest, Studio i18n (`t()` German source + `src/i18n/en/credentials.ts`).

**Spec:** `docs/superpowers/specs/2026-11-20-credential-designer-design.md` §2, §6, §8. **Depends on:** D1 and D2 on `feat/card-designer`.

## Global Constraints

- Work on branch `feat/card-designer-studio` created from `origin/feat/ortis-studio-desktop`, worktree `.worktrees/card-designer-studio`. Task 1 merges `origin/feat/card-designer` into it (brings the package; main → studio direction only). **Never merge into main.**
- No change under `apps/studio/electron/` (ships as an interface OTA). No new dependency except `canvaskit-wasm` and the workspace package.
- Studio UI rules: no drop shadows in the chrome (the card art itself may be anything), warm stone greys, one primary action per view, `--w-accent`. All strings through `t()` with English entries; `coverage.test.ts` must pass.
- German product language ("Ausweis", "Entwurf", "Veröffentlichen"); never NFT/Token/Wallet/Blockchain; never an address.
- Nothing suggests a publish is done before the phone confirmed it: after "Veröffentlichen" the existing `PendingCard` is shown.
- Tests `cd apps/studio && pnpm test`, `pnpm typecheck`. Commits `feat(studio): …` with the Co-Authored-By line.

## Review Focus

1. **The register is off but the designer is on** (production today) — the Typen tab shows drafts and the designer; "Veröffentlichen" is disabled with "Veröffentlichen geht, sobald eure Organisation im Register eingetragen ist."; test in Task 1.
2. **Unsaved changes when leaving** (tab switch, org switch, window close) — autosave every 2 s after the last change and on unmount; a failed save shows "Nicht gespeichert – erneut versuchen" and keeps the local state; test in Task 3.
3. **Draft conflict from the phone** (409 `DRAFT_CONFLICT`) — dialog "Auf einem anderen Gerät geändert": keep mine (save over the newer revision) or load theirs; test in Task 3.
4. **Huge logo upload or wrong file type** — the server message is shown, the editor stays usable; test in Task 4.
5. **Browser version without WebGL** — CanvasKit falls back to its software surface; the editor still draws (no blank canvas); test in Task 2 via the factory choosing `MakeSWCanvasSurface` when `MakeWebGLCanvasSurface` returns null.

---

### Task 1: Merge, API client, drafts list in Typen

**Files:**
- Merge `origin/feat/card-designer` into `feat/card-designer-studio`; Modify: `apps/studio/package.json` (`@roebel/card-design: workspace:*`, `canvaskit-wasm`), `apps/studio/src/credentials/api.ts`, `types.ts`, `TypesTab.tsx`, `CredentialsSection.tsx`, `src/i18n/en/credentials.ts`
- Test: `apps/studio/src/credentials/__tests__/designs-api.test.ts`

**Interfaces — Produces (`api.ts`):** `designCall<T>(action, payload, token)` → `POST /api/credentials/designs`, same error mapping as `credCall`; wrappers `fetchDrafts(token, accountId)`, `fetchDraft(token, draftId)`, `saveDraft(token, p)`, `deleteDraft(token, draftId)`, `sendDraftTest(token, draftId)`, `publishDraft(token, draftId)`, `uploadDesignAsset(token, accountId, kind, file: File): Promise<AssetView>` (multipart to `/api/credentials/designs/assets`), `fetchDesignOrgs(token)`. `fetchStatus` returns `designer: boolean`. Types `DraftView`, `AssetView` copied field for field from D2.
- `CredentialsSection`: when `status.designer` is true the section opens even if the register is off; then only the Typen tab is offered and orgs come from `fetchDesignOrgs(token)` (D2 action `design_orgs`); with the register on, `orgs_list` as today.
- `TypesTab`: list = published types (as today, when the register is on) merged with drafts (badge "Entwurf", "Änderungen nicht veröffentlicht"); "Neuer Ausweis" opens the template picker (Task 2) instead of the old form; the old `TypeEditor` stays for retiring a type only.

- [ ] **Step 1: Failing tests** — `designCall` posts `{ action, payload }` with the bearer token; 409 `DRAFT_CONFLICT` maps to `CredentialsApiError` with `code` and the server draft in `data`; `uploadDesignAsset` sends multipart with `accountId` and `kind`; with `designer: true` and `enabled: false` the section renders the Typen tab only.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS incl. i18n coverage.
- [ ] **Step 5: Commit** — `feat(studio): card design drafts in Ausweise`.

---

### Task 2: Canvas, template picker and preview modes

**Files:** Create `src/credentials/designer/skia.ts`, `CardCanvas.tsx`, `TemplatePicker.tsx`, `PreviewModes.tsx`; Test `__tests__/designer-skia.test.ts`

**Interfaces — Produces:**
- `loadSkia(): Promise<{ ck: CanvasKit; api: SkiaApi; fonts: FontSet }>` — one shared instance; wasm via `import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url'`; fonts via `?url` imports of `@roebel/card-design/fonts/*`.
- `makeSurface(ck, canvas: HTMLCanvasElement): Surface` — WebGL, else software.
- `<CardCanvas design mode values width shine="loop"|"pointer"|"static" images onPointer… />` — redraws on `requestAnimationFrame` only while shine is animating; `pointer` mode maps pointer position to `tilt`; `prefers-reduced-motion` → static.
- `<TemplatePicker onPick(template: CardTemplate) />` — grid of `TEMPLATES` rendered live, plus "Leere Karte".
- `<PreviewModes design />` — switcher "Karte", "In der Hand" (slow loop + pointer tilt), "Im Wallet" (three stacked cards, the design in front), "Hell / Dunkel" (background swap); name field filled with "Vorname Nachname".

- [ ] **Step 1: Failing tests** — `makeSurface` falls back to the software surface when WebGL returns null (mock `ck`); `loadSkia` is called once for two canvases.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; manual: `pnpm dev`-free check in the browser build later (Task 5).
- [ ] **Step 5: Commit** — `feat(studio): card canvas, templates and previews`.

---

### Task 3: The editor (selection, drag, panels, undo, autosave)

**Files:** Create `designer/Designer.tsx`, `designer/state.ts`, `designer/Overlay.tsx`, `designer/AddPanel.tsx`, `designer/PropsPanel.tsx`; Test `__tests__/designer-state.test.ts`

**Interfaces — Produces (`state.ts`):** `type EditorState = { design: CardDesign; selected: string | null; past: CardDesign[]; future: CardDesign[]; dirty: boolean; revision: number }`; `editorReducer(s, a)` with actions `select`, `apply` (wraps a `@roebel/card-design` edit helper; pushes history, max 100), `undo`, `redo`, `saved(revision)`, `replace(design, revision)`; `useAutosave(state, save: (d, baseRevision) => Promise<DraftView>, delayMs = 2000)`.
- `Designer`: three columns like the approved mockup — left `AddPanel` (Vorlagen, Oberfläche: presets + "Bild hochladen", Logo, Text, Feld: "Vor- und Nachname", "Gültig bis", "Mitglied seit", Sticker: upload), centre canvas with `Overlay` (handles: move, resize corners, rotate knob; snapping to card edges, centre lines and other layers via `snap`; arrow keys move 1 / Shift 10; Delete removes; ⌘Z/⇧⌘Z), right `PropsPanel` (text, font from the seven `FontId`s, size, colour, alignment, uppercase, letter spacing, opacity, rotation, "Glanz" toggle, layer order, delete). Hints (never blocking): "Text schwer lesbar" (contrast < 3:1 against the background sample under the layer), "Logo unscharf" (asset smaller than layer at 2×), "Teil liegt außerhalb der Karte".
- Header: name field, kind (Mitgliedschaft / Amt / Abzeichen; fixed after first publish), save state ("Gespeichert" / "Speichert …" / "Nicht gespeichert – erneut versuchen"), "Auf mein Handy senden", primary "Veröffentlichen" / "Update veröffentlichen" → `publishDraft` → `PendingCard`.

- [ ] **Step 1: Failing tests** — undo after two applies restores the first design; redo cleared by a new apply; history capped at 100; autosave fires once 2 s after the last of several rapid changes (fake timers) and passes `baseRevision`; a 409 result yields `conflict` state holding the server draft.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(studio): card designer editor`.

---

### Task 4: Uploads, publish flow, conflict dialog

**Files:** Modify `designer/AddPanel.tsx`, `designer/Designer.tsx`; Create `designer/ConflictDialog.tsx`; Test `__tests__/designer-flow.test.ts`

- Uploads: drag a file onto the canvas or use the panel buttons → `uploadDesignAsset` → new image layer (`role` from the button: logo, sticker, background replaces `background` with `{ kind: 'image', fit: 'cover' }`); errors shown in the section notice.
- Publish: disabled with the Review-Focus-1 text when the org is not `ready` or the register is off; otherwise `publishDraft` → `PendingCard` (existing) → on final `done` the list reloads; 409 `NO_CHANGES` shown as a quiet notice.
- Conflict dialog per Review Focus 3.

- [ ] **Step 1: Failing tests** — publish button disabled + text when `org.onChain !== 'ready'`; a rejected upload leaves the design unchanged and calls `onError`; choosing "Meine Version behalten" saves with the server's revision.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(studio): designer uploads, publishing and conflicts`.

---

### Task 5: Browser-build check and version

- [ ] **Step 1:** Run the browser build locally (`npx vite --port 5181`), with `/api/credentials/*` mocked in-page (designer on, register off, one org): open Ausweise → Neuer Ausweis → template "Bürger" → change the title, add a name field, toggle shine on the logo, undo/redo, preview modes; no console errors. Screenshot each step.
- [ ] **Step 2:** `pnpm test && pnpm typecheck` — PASS. Bump `apps/studio/package.json` version to the next patch.
- [ ] **Step 3: Commit** — `feat(studio): <version> Ausweis-Designer`; push `feat/card-designer-studio`. (Merging into `feat/ortis-studio-desktop` and the OTA release are owner steps.)
