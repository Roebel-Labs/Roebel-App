# Designer D5 — AI Backgrounds and Stickers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A treasurer types a short description and gets a generated card background or a sticker with a transparent background, stored as a design asset marked as AI-generated, in Studio and in the app.

**Architecture:** Two server actions on `/api/credentials/designs` call the existing kie.ai image pipeline (`lib/images/kie.ts` `generateKieImage`, `markSyntheticImage`, `recordAiUsage`), store results through D2's `storeAsset` with `ai: true` and the prompt, and enforce a daily limit per org. Stickers get their background removed by a kie.ai background-removal model. Both editors add one panel entry each.

**Tech Stack:** Next.js route handlers, kie.ai (via `apps/web/src/lib/images/*`), Studio React, Expo.

**Spec:** `docs/superpowers/specs/2026-11-20-credential-designer-design.md` §8 (AI help), §12 (limits). **Depends on:** D2 (server), D3 (Studio), D4 (app).

## Global Constraints

- Server and app on `feat/card-designer`; Studio part on `feat/card-designer-studio`. Never merge into main or run EAS.
- Limits per org and Berlin day: 20 backgrounds, 20 stickers (constants `AI_DAILY_LIMITS` in `designs/ai.ts`); over the limit → 429 `AI_LIMIT` "Für heute sind alle KI-Bilder eurer Organisation verbraucht. Morgen geht es weiter.".
- Every AI asset: `markSyntheticImage` before storing, `ai: true`, prompt stored; layers placed from it carry `ai: true`; public metadata `properties.aiGenerated = true` when any layer or the background is AI (D2 already derives it — verify); the app's credential detail shows "Enthält KI-generierte Bilder".
- Prompt 3–300 characters; the server prepends a fixed style instruction and never forwards personal data; prompts are not shown to members.
- Commits `feat(web|studio|expo): …` with the Co-Authored-By line.

## Review Focus

1. **kie.ai slow or failing** — the call returns within 60 s budget or 504 `AI_TIMEOUT` "Das Bild braucht gerade zu lange. Bitte versuche es noch einmal." and nothing counts against the limit; test in Task 1.
2. **Two admins generating at the same time near the limit** — the count is checked in the same transaction as the insert (no 21st image); test in Task 1 with the in-memory store simulating the race by ordering.
3. **Background-removal model unavailable** — the sticker is stored as-is with a notice "Hintergrund konnte nicht entfernt werden."; test in Task 1.
4. **Generated background with the wrong aspect** — stored as `fit: 'cover'`, cropped centrally by the renderer; test in Task 1 that the action returns the layer suggestion with `fit: 'cover'`.
5. **Offline in the app while generating** — the sheet shows the network message and keeps the prompt text; test in Task 3.

---

### Task 1: Server actions

**Files:** Create `apps/web/src/lib/credentials/designs/ai.ts`; Modify `apps/web/src/app/api/credentials/designs/route.ts`, `apps/web/src/lib/signed-request/message.ts` (`"design_ai_background" | "design_ai_sticker"`); Test `apps/web/tests/designs-ai.test.ts`

**Interfaces — Produces:** `generateBackground(d, c, p: { accountId; prompt; tileable?: boolean }) => Result<{ asset: AssetView; background: Background }>` (kie aspect ratio closest to 924:580, i.e. `16:9`, prompt prefix "Kartenhintergrund, ruhige Fläche ohne Text, hochwertige Textur:"); `generateSticker(d, c, p: { accountId; prompt }) => Result<{ asset: AssetView; layer: Layer; notice?: string }>` (square, prefix "Einzelnes Sticker-Motiv, flach, freigestellt, ohne Text:", then background removal via a kie.ai background-removal model resolved with `resolveKieModel`; the model id is a constant in `ai.ts`); `aiUsageToday(store, accountId, kind, now)`. Generation goes through an injected `generate(input) => Promise<Uint8Array>` so tests run without kie.ai.

- [ ] **Step 1: Failing tests** — happy path stores an asset with `ai: true` and the prompt; 21st call → 429 `AI_LIMIT`; generator timeout → 504 and usage unchanged; removal failure → asset stored + `notice`; prompt of 2 chars → 400; designer switch off → 403.
- [ ] **Step 2: Run** `npx tsx --test tests/designs-ai.test.ts` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(web): AI backgrounds and stickers for card designs`.

---

### Task 2: Studio panel

**Files (on `feat/card-designer-studio`, after merging `origin/feat/card-designer`):** Modify `apps/studio/src/credentials/api.ts` (`generateDesignBackground`, `generateDesignSticker`), `designer/AddPanel.tsx`, `src/i18n/en/credentials.ts`; Test `apps/studio/src/credentials/__tests__/designer-ai.test.ts`

- In Oberfläche and Sticker: a text field ("Beschreibe das Bild", placeholder "Müritz bei Sonnenuntergang, ruhig, blau") and "Erzeugen"; while running a progress line "Wird erzeugt … (bis zu einer Minute)"; result applied as background / new sticker layer centred at 30 % of the card width; the KI marker "KI" on the layer in the layers list.

- [ ] **Step 1: Failing tests** — the result background replaces `design.background`; a sticker becomes a new top layer with `ai: true`; 429 text shown via `onError`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(studio): AI backgrounds and stickers in the designer`; push.

---

### Task 3: App sheet and the AI notice

**Files:** Modify `apps/expo/lib/credreg/api.ts`, `apps/expo/components/credentials/designer/AddSheet.tsx`, `apps/expo/components/profile/CredentialDetailSheet.tsx`; Test `apps/expo/components/credentials/__tests__/designer-ai.test.tsx`

- Same two entries as Studio in the bottom sheet; network failure keeps the prompt; credential detail shows "Enthält KI-generierte Bilder" when `design` has any `ai` layer or an AI background asset.

- [ ] **Step 1: Failing tests** — offline error keeps the entered prompt; detail shows the AI line for a design with an `ai` layer and not otherwise.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; tsc (12 GB heap) exit 0.
- [ ] **Step 5: Commit** — `feat(expo): AI images in the touch designer`; push.
