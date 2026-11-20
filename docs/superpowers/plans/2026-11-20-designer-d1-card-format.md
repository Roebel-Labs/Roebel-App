# Designer D1 — Card Format and Drawing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace package `@roebel/card-design` that defines the card design document, validates and hashes it, ships the templates, and draws a design with Skia — the same module on the web/Node (CanvasKit) and in the app (React Native Skia, adapter used by D4).

**Architecture:** Pure TypeScript package in `packages/card-design`. The drawing code is written once against a small `SkiaApi` adapter interface; `adapters/canvaskit.ts` implements it for CanvasKit (Studio, server) and `adapters/rn-skia.ts` for `@shopify/react-native-skia` (app). Golden PNGs rendered in Node pin the output; D4 compares the app adapter against the same PNGs.

**Tech Stack:** TypeScript, `canvaskit-wasm` (dependency), `@noble/hashes` (sha256), node:test via `tsx --test`, `pngjs` + `pixelmatch` (devDependencies).

**Spec:** `docs/superpowers/specs/2026-11-20-credential-designer-design.md` (§5 document, §7 fields, §9 rendering).

## Global Constraints

- Branch `feat/card-designer` from `origin/main`, worktree `.worktrees/card-designer`; `pnpm install`. Never touch `feat/ortis-studio-desktop` in this plan.
- Card units: `CARD_W = 924`, `CARD_H = 580`, `STAMP_SIZE = 580`; corner radius `CARD_RADIUS = 48` (= 24 at width 462, `apps/expo/components/profile/credential-art.ts`).
- Fonts are OFL only, shipped as TTF in `packages/card-design/fonts/`: Mona Sans (Regular, Bold), Mona Sans SemiCondensed Bold, Barlow Condensed (SemiBold, ExtraBold), Playfair Display Bold, Space Grotesk Bold. No other fonts.
- Code and comments in English; any user-facing default text in German.
- No personal data in a design: field layers carry only `sampleText`.
- Commit convention `feat(card-design): …`, each commit ends with the Co-Authored-By line.

## Review Focus

1. **A design from an older client with unknown fields or a future `schema`** — `validateDesign` rejects `schema !== 1` with a clear error and strips unknown keys; test in Task 1.
2. **Huge or hostile input** (10 000 layers, 50 kB text, NaN coordinates, `javascript:` in colours) — rejected by limits, never thrown; test in Task 1.
3. **Same design, different key order** — identical `designHash`; test in Task 1.
4. **A missing asset or font at draw time** — the layer is skipped, the rest draws, no throw; test in Task 3.
5. **Holder field with no value in public mode** — draws nothing (no "undefined", no sample name); test in Task 2.

---

### Task 1: Package, schema, validation, hash

**Files:**
- Create: `packages/card-design/package.json` (name `@roebel/card-design`, `"type": "module"`, `main`/`types`/`exports` → `src/index.ts`, scripts `test: tsx --test test/*.test.ts`, `typecheck: tsc --noEmit`), `tsconfig.json` (copy `packages/credential-registry/tsconfig.json`)
- Create: `src/schema.ts`, `src/validate.ts`, `src/hash.ts`, `src/index.ts`
- Test: `test/validate.test.ts`, `test/hash.test.ts`

**Interfaces — Produces (`schema.ts`):**
```ts
export const CARD_W = 924, CARD_H = 580, STAMP_SIZE = 580, CARD_RADIUS = 48;
export type DesignFormat = 'card' | 'stamp';
export type PresetId = 'silver' | 'navy' | 'gold' | 'black' | 'paper' | 'holo' | 'matte' | 'glass';
export type FontId = 'mona' | 'mona-bold' | 'mona-condensed' | 'barlow' | 'barlow-black' | 'playfair' | 'grotesk';
export type FieldId = 'holderName' | 'validUntil' | 'memberSince';
export type Background =
  | { kind: 'preset'; preset: PresetId; color?: string }          // color tints matte/navy
  | { kind: 'image'; assetId: string; fit: 'cover' | 'tile' };
interface LayerBase { id: string; x: number; y: number; w: number; h: number; rotation: number; opacity: number; shine: boolean; ai?: boolean }
export type TextStyle = { font: FontId; size: number; color: string; align: 'left' | 'center' | 'right'; uppercase: boolean; letterSpacing: number };
export type Layer =
  | (LayerBase & { type: 'text'; text: string } & TextStyle)
  | (LayerBase & { type: 'field'; field: FieldId; sampleText: string } & TextStyle)
  | (LayerBase & { type: 'image'; assetId: string; role: 'logo' | 'sticker' | 'image' });
export interface CardDesign { schema: 1; format: DesignFormat; background: Background; shine: { enabled: boolean; intensity: number }; border?: { color: string; width: number }; layers: Layer[] }
```
`assetId` is either 64 lowercase hex (sha256 of an uploaded asset) or `builtin:<name>` (Task 4).

**Produces (`validate.ts`):** `validateDesign(input: unknown): { ok: true; design: CardDesign } | { ok: false; errors: string[] }` — limits: ≤ 40 layers; text ≤ 120 chars; `x,y ∈ [-W, 2W]`, `w,h ∈ (0, 2W]` (W = 924 or 580 by format); `rotation ∈ [-360, 360]`; `opacity, intensity ∈ [0,1]`; `size ∈ [6, 200]`; `letterSpacing ∈ [-0.2, 1]`; colours `^#[0-9a-f]{6}([0-9a-f]{2})?$`i; unique layer ids `^[a-z0-9-]{1,32}$`; unknown keys dropped. Errors are English developer strings (the UI shows its own text).

**Produces (`hash.ts`):** `canonicalJson(v: unknown): string` (sorted keys, no whitespace); `designHash(d: CardDesign): string` = sha256 hex of `canonicalJson(d)` (`@noble/hashes/sha2`).

- [ ] **Step 1: Write the failing tests**
```ts
test('accepts a minimal card', () => assert.equal(validateDesign({ schema: 1, format: 'card', background: { kind: 'preset', preset: 'silver' }, shine: { enabled: true, intensity: 0.6 }, layers: [] }).ok, true));
test('rejects schema 2, 41 layers, a 121-char text, NaN x and colour "javascript:alert(1)"', …);  // each ok:false
test('drops unknown keys', …);   // validated design has no `foo`
test('designHash ignores key order and changes when a layer moves 1 unit', …);
```
- [ ] **Step 2: Run** `cd packages/card-design && pnpm test` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `schema.ts`, `validate.ts`, `hash.ts`; `index.ts` re-exports all.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(card-design): design schema, validation and hash`.

---

### Task 2: Fields and the document helpers

**Files:** Create `src/fields.ts`, `src/edit.ts`; Test `test/fields.test.ts`, `test/edit.test.ts`

**Produces (`fields.ts`):** `type FieldValues = Partial<Record<FieldId, string>>`; `resolveText(layer: Layer, mode: 'holder' | 'preview' | 'public', values: FieldValues): string | null` — text layers return `text`; field layers: `holder` → value or `null`, `preview` → value ?? `sampleText`, `public` → `null` always. `formatDate(iso: string, locale: 'de' | 'en'): string` (`de`: `31.12.2027`).

**Produces (`edit.ts`)** — pure reducers used by both editors (D3, D4):
`addLayer(d, layer): CardDesign` (appends on top, new id if taken), `updateLayer(d, id, patch): CardDesign`, `removeLayer(d, id)`, `moveLayer(d, id, to: 'up'|'down'|'top'|'bottom')`, `hitTest(d, x, y): string | null` (top-most layer whose rotated box contains the point), `snap(value: number, targets: number[], tolerance = 6): number`, `newLayerId(d): string`.

- [ ] **Step 1: Failing tests** — `resolveText` for each mode (public never returns a name; holder with no value → null); `formatDate('2027-12-31T22:59:59Z','de') === '31.12.2027'` (Europe/Berlin); `hitTest` on a 30°-rotated layer hits its centre and misses its bounding-box corner; `moveLayer('top')` puts the layer last; `snap(463, [462]) === 462`, `snap(470,[462]) === 470`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(card-design): field resolution and editing helpers`.

---

### Task 3: Drawing with Skia (CanvasKit adapter) and the shine shader

**Files:**
- Create: `src/draw/api.ts` (adapter interface), `src/draw/presets.ts`, `src/draw/shine.ts`, `src/draw/draw.ts`, `src/adapters/canvaskit.ts`, `src/adapters/rn-skia.ts`, `src/fonts.ts`
- Create: `fonts/*.ttf` (the seven OFL files from Global Constraints, with their `OFL.txt`)
- Test: `test/draw.test.ts`

**Interfaces — Produces:**
- `SkiaApi` (in `api.ts`): the subset both libraries share — `makePaint()`, `makeRRect(x,y,w,h,r)`, `makeLinearGradient(p0,p1,colors,positions)`, `makeRadialGradient(c,r,colors,positions)`, `makeRuntimeShader(sksl, uniforms)`, `makeImage(bytes): SkImageLike | null`, `makeParagraph(text, style: TextStyle, width, fonts): ParagraphLike`, `colorFromHex(hex)`; `CanvasLike`: `save/restore/translate/rotate/scale/clipRRect/drawRect/drawRRect/drawImageRect/drawParagraph`.
- `drawDesign(api: SkiaApi, canvas: CanvasLike, design: CardDesign, opts: { width: number; mode: 'holder'|'preview'|'public'; values?: FieldValues; images: Map<string, SkImageLike>; fonts: FontSet; shinePhase: number; tilt?: { x: number; y: number }; reducedMotion?: boolean }): void` — scales card units to `width`, clips to the rounded card (or circle for `stamp`), draws background preset/image, layers bottom→top, then the card-wide shine; a layer with `shine: true` gets the shine shader masked to its own pixels. Missing image or font → layer skipped.
- `SHINE_SKSL` (in `shine.ts`): one runtime effect, uniforms `phase` (0..1), `tilt` (vec2), `intensity`, `size`; a soft diagonal highlight band (soft-light look of the existing cards). `reducedMotion` → fixed phase 0.35, tilt 0.
- `presets.ts`: gradient stops per `PresetId`, taken from the existing card PNGs (silver = Gast, navy = Bürger, gold = Bescheiniger with a `#C9A748` rim, black = PSV).
- `createCanvasKitApi(ck: CanvasKit): SkiaApi`, `loadFontSet(api, loader: (file: string) => Promise<Uint8Array>): Promise<FontSet>`, `renderPng(design, opts & { width }): Promise<Uint8Array>` (Node/web convenience: CanvasKit surface → PNG).
- `createRnSkiaApi(Skia: typeof import('@shopify/react-native-skia').Skia): SkiaApi` — type-only import (`import type`), so the package never pulls React Native into web/Node; D4 tests it.

- [ ] **Step 1: Failing tests** — `renderPng` of a silver card at width 462 returns a 462×290 PNG; pixel (2,2) is transparent (rounded corner) and pixel (231,145) is opaque; a design whose image layer references a missing asset renders without throwing; `shinePhase` 0.2 and 0.8 produce different PNG bytes; `reducedMotion` makes them equal.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(card-design): Skia drawing, presets and shine shader`.

---

### Task 4: Built-in assets, templates and golden images

**Files:**
- Create: `assets/builtin/*.png` (`roebel-mark`, `roebel-mark-dark`, `person-laurel`, `person-laurel-dark` at 4× resolution, transparent), `src/builtin.ts`, `src/templates.ts`
- Create: `test/golden/*.png`, `scripts/update-golden.ts` (`pnpm golden` re-renders references)
- Test: `test/templates.test.ts`, `test/golden.test.ts`

**Interfaces — Produces:**
- `BUILTIN_ASSETS: Record<string, string>` (`builtin:roebel-mark` → file path) and `builtinAssetBytes(id): Promise<Uint8Array>`. Source the art from the Figma file `gy9pkojEQ4pktQhubjI57e` (cards frame) via the Figma MCP export as SVG → PNG 4×; if unavailable, cut it from `apps/expo/assets/cards/png/*@3x.png`.
- `CardTemplate = { id: string; label: string; format: DesignFormat; design: CardDesign }`; `TEMPLATES: CardTemplate[]` in this order: `gast` (silver), `buerger` (navy), `bescheiniger` (gold), `schwarz` (black, logo slot top right), `papier` (paper, no shine), `matt` (matte, no shine), `glas` (glass), `holo-stempel` (stamp format, holo). Every card template has: title text layer at x=52,y=72, Barlow Condensed ExtraBold, size 44, uppercase (≈ "BÜRGER" on the existing card); a logo/image layer top right (built-in person-laurel on the community ones, an empty `role: 'logo'` slot elsewhere); "Röbel / Müritz" text at x=52,y=480, Barlow SemiBold 32; the Röbel App mark bottom right; a `holderName` field layer (sampleText "Vorname Nachname") at x=52,y=400 on the four non-community templates.
- `TEMPLATES` labels German: "Gast", "Bürger", "Bescheiniger", "Schwarz", "Papier", "Matt", "Glas", "Holografischer Stempel".

- [ ] **Step 1: Failing tests** — every template passes `validateDesign`; ids unique; `golden.test.ts` renders each template at width 462, `preview` mode, `shinePhase` 0.35, and compares to `test/golden/<id>.png` with `pixelmatch` threshold 0.1, ≤ 0.5 % differing pixels.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** templates, built-ins; run `pnpm golden` once, open the PNGs and compare `gast`/`buerger`/`bescheiniger` side by side with `apps/expo/assets/cards/png/*@2x.png` (same layout, title smaller than before is expected).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** — `feat(card-design): templates, built-in art and golden images`; push the branch.
