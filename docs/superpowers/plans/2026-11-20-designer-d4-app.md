# Designer D4 — Röbel App: Skia Cards, Test Preview and Touch Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app draws credential cards from their design with Skia and a tilt-following shine, shows a test draft only to its creator, and lets an org admin create and edit card designs with a touch editor that replaces today's type form.

**Architecture:** `@shopify/react-native-skia` with the D1 adapter `createRnSkiaApi`; one `<DesignedCard>` component used by the wallet, the profile card stack and the credential detail; tilt from `expo-sensors` `DeviceMotion` driving a Reanimated shared value; the editor reuses `@roebel/card-design/edit` reducers and calls D2's `/api/credentials/designs` through the existing signed-request client in `lib/credreg/api.ts`.

**Tech Stack:** Expo SDK 56 / RN 0.85, `@shopify/react-native-skia` (installed with `npx expo install`), Reanimated 4, `expo-sensors`, `expo-image-picker` (already present? check `package.json`; install with `npx expo install` if not), Jest (`jest-expo`) with Skia's headless CanvasKit.

**Spec:** `docs/superpowers/specs/2026-11-20-credential-designer-design.md` §6–§9. **Depends on:** D1, D2 on `feat/card-designer`.

## Global Constraints

- Branch `feat/card-designer` (same worktree). The native package means this reaches users only with the next store build (3.10.0) — the owner runs EAS; never run `eas build`/`eas update`.
- `StyleSheet.create()` + `useTheme()`, **no NativeWind**; Mona Sans tokens from `constants/theme.ts`; German UI, English code.
- Never show a wallet address; never the words NFT/Token/Blockchain; "Ausweis", "Abzeichen", "Entwurf".
- The holder name field is filled on the device only: verified citizens from the locally stored verification data (`lib/onboarding-storage.ts` / `citizen-commitment` preimage), everyone else from their display name. Never sent to the server.
- Feature gate: the designer screens only when `GET /api/credentials/status` says `designer: true`; designed cards render wherever a credential carries a `design`, otherwise the existing PNG art (no behaviour change for the four community cards until they get designs).
- Reduced motion (`AccessibilityInfo.isReduceMotionEnabled`) → static shine, no sensor subscription.
- Expo tsc: run with a 12 GB heap and check the exit code (`NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit; echo $?`). Commits `feat(expo): …` with the Co-Authored-By line.

## Review Focus

1. **Wallet with many cards** — only the front card animates; cards behind are drawn once (static picture) and sensors run only while a card screen is focused (`useIsFocused` from `@react-navigation/native`, not expo-router's — see the known trap); test in Task 2.
2. **Old app build receives a credential with a design** — the API keeps `imageUrl` (the preview PNG) so older builds show the picture; test in Task 1 that `mine` items still carry `imageUrl` (D2 sets it to the preview URL).
3. **A design asset fails to load (offline)** — the card draws without that layer and retries on the next focus; no crash, no blank card; test in Task 1.
4. **Test link opened by someone who is not an admin of that org** — "Dieser Entwurf ist nur für die Verwaltung der Organisation sichtbar."; test in Task 3.
5. **Pinch and rotate on a tiny layer** — minimum layer size 24 card units; handles stay reachable (hit slop 12 pt); test in Task 4 on the reducer level.

---

### Task 1: Skia adapter, asset cache and `<DesignedCard>`

**Files:**
- Modify: `apps/expo/package.json` (`@shopify/react-native-skia`, `@roebel/card-design: workspace:*`), `apps/expo/metro.config.js` only if the workspace package or `.ttf` assets need it (see `reference_metro_workspace_imports`)
- Create: `apps/expo/lib/card-design/skia.ts`, `apps/expo/lib/card-design/assets.ts`, `apps/expo/components/credentials/DesignedCard.tsx`
- Test: `apps/expo/lib/card-design/__tests__/golden.test.ts`, `apps/expo/components/credentials/__tests__/designed-card.test.tsx`

**Interfaces — Produces:**
- `useCardSkia(): { api: SkiaApi; fonts: FontSet } | null` — fonts from the package `fonts/*.ttf` via `useFonts` of Skia (`matchFont`/`Skia.Typeface.MakeFreeTypeFaceFromData`).
- `useDesignImages(design): Map<string, SkImage>` — loads `builtin:*` from bundled assets and sha assets from `GET /api/credentials/designs/assets/<sha>` with an on-disk cache (`expo-file-system`, key = sha); failures leave the id out.
- `<DesignedCard design width mode values? animate="tilt"|"static" />` — Skia `<Canvas>` whose drawing calls `drawDesign` (via `Picture`/`useDrawCallback`); `animate="tilt"` feeds `tilt` and `shinePhase` from a Reanimated value updated by `DeviceMotion` (60 Hz, smoothed).
- Golden test: render each `TEMPLATES` entry with `createRnSkiaApi` in Jest headless (`LoadSkiaWeb` from `@shopify/react-native-skia/lib/commonjs/web`) at width 462 and compare to `packages/card-design/test/golden/<id>.png` with the same tolerance as D1 (≤ 0.5 % pixels).

- [ ] **Step 1: Failing tests** — golden comparison for all templates; `DesignedCard` with a missing asset renders without throwing; `mode: 'holder'` with `values.holderName` draws it (pixel diff vs. without).
- [ ] **Step 2: Run** `cd apps/expo && npx jest lib/card-design components/credentials/__tests__/designed-card.test.tsx` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(expo): Skia card renderer with tilt shine`.

---

### Task 2: Designed cards in wallet, profile and detail

**Files:** Modify `apps/expo/components/profile/CredentialCard.tsx`, `CredentialCardStack.tsx`, `CredentialDetailSheet.tsx`, `apps/expo/lib/credreg/held.ts` (carry `design`/`designSha` from `mine`), `apps/expo/lib/credreg/types.ts`; Create `apps/expo/lib/card-design/holder-values.ts`; Test `apps/expo/lib/card-design/__tests__/holder-values.test.ts`

**Interfaces — Produces:** `holderValues(input: { verifiedName: { first: string; last: string } | null; displayName: string | null; validUntil: string | null; acceptedAt: string | null }): FieldValues` — `holderName` = verified "First Last" else display name else omitted; dates via `formatDate(…, 'de')`.
- `CredentialCard`: a credential with `design` renders `<DesignedCard mode="holder">`; front card in the stack `animate="tilt"` only while focused; others static. Without `design` → today's PNG/`imageUrl` path unchanged.

- [ ] **Step 1: Failing tests** — `holderValues` prefers the verified name, falls back to display name, omits when both are missing; formats `validUntil` German.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; tsc (12 GB heap) exit 0.
- [ ] **Step 5: Commit** — `feat(expo): designed credential cards in wallet and profile`.

---

### Task 3: Test preview screen

**Files:** Create `apps/expo/app/org/credentials/design-test.tsx`; Modify `apps/expo/lib/credreg/api.ts` (signed actions `design_draft_get`, `design_drafts_list`, `design_draft_save`, `design_test_send`, `design_publish`, `design_orgs`, asset upload), push routing for kind `design_test` (where existing credential pushes are routed); Test `apps/expo/lib/credreg/__tests__/design-api.test.ts`

- Screen: big `<DesignedCard mode="preview" animate="tilt">` with the user's own `holderValues`, banner "Entwurf · nur für dich", buttons "Im Designer öffnen" and (admins, register on) "Veröffentlichen" → existing approve flow for the prepared action (`app/org/credentials/approve`). Non-admin/403 → Review-Focus-4 text.

- [ ] **Step 1: Failing tests** — each new action is signed with its action name and payload; 403 maps to the German message.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(expo): card design test preview`.

---

### Task 4: Touch editor

**Files:** Create `apps/expo/app/org/credentials/designer.tsx`, `apps/expo/components/credentials/designer/{EditorCanvas,Handles,AddSheet,PropsSheet,TemplateSheet}.tsx`, `apps/expo/lib/card-design/editor-state.ts`; Modify `apps/expo/app/org/credentials/types-new.tsx` (redirects to the designer when `designer: true`, keeps the old form otherwise), `apps/expo/app/org/credentials/index.tsx` (drafts with "Entwurf" badge); Test `apps/expo/lib/card-design/__tests__/editor-state.test.ts`

**Interfaces — Produces (`editor-state.ts`):** same contract as Studio's `state.ts` (D3 Task 3): `editorReducer`, actions `select|apply|undo|redo|saved|replace`, history cap 100, plus `pinch(id, scale, rotation)` enforcing the 24-unit minimum; `useAutosave` 2 s.
- Gestures (`react-native-gesture-handler`): tap selects (`hitTest`), pan moves, pinch scales, two-finger rotate; snapping via `snap`. Bottom sheets: Vorlagen, Oberfläche (presets, "Foto wählen" via `expo-image-picker` → asset upload), Logo, Text, Feld, Sticker; properties sheet for the selected layer incl. "Glanz". Header: name, save state, "Auf mein Handy senden" (here: opens the preview directly), primary "Veröffentlichen"/"Update veröffentlichen" → approve flow. Conflict handling as Studio (keep mine / load theirs).

- [ ] **Step 1: Failing tests** — reducer parity with Studio's tests (undo/redo/cap/autosave debounce/conflict); `pinch` never goes below 24 units.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** full `npx jest lib/card-design lib/credreg components/credentials` — PASS; tsc exit 0.
- [ ] **Step 5: Commit** — `feat(expo): touch card designer`; push.
