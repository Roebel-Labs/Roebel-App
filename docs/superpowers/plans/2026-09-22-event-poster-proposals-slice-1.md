# Event Poster Proposals — Slice 1 (core + admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every upcoming event can get two AI-proposed DIN-A posters (reformatted original or newly designed from event data) that an admin reviews and applies from the web admin dashboard; the same service is exposed as HTTP routes for the chat slices.

**Architecture:** One server-side library `apps/web/src/lib/poster/*` (pure modules with node:test coverage + thin server modules for Claude vision, OpenAI image rendering, Supabase storage/rows). Admin server actions and three API routes wrap one `proposePosters()` service. New table `event_poster_proposals` + five columns on `events`. Admin UI = overview page with a client-driven batch runner and a per-event review page built on a shared `PosterProposalPair` component.

**Tech Stack:** Next.js 15 App Router (`apps/web`), AI SDK 6 (`ai`, `@ai-sdk/anthropic` for vision/copy), raw `fetch` to OpenAI Images API (`gpt-image-2.5-sunburst`), `image-size` (new dep) for pixel dimensions, Supabase (admin client, `images` bucket), Tailwind + existing `components/ui`, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-22-event-poster-proposals-design.md`

## Global Constraints

- Render size `1440x2032` (DIN A within 0.2 %), quality `high`, model default `gpt-image-2.5-sunburst`, env override `POSTER_IMAGE_MODEL` and `app_settings.poster_image_model`.
- Ratio tolerance: h/w within ±8 % of √2 counts as A-format.
- Dates, times, prices, places on posters come ONLY from deterministic code (`buildPosterContent`), never from an LLM.
- Design mode variant A is always "Plakativ" (Max's preference); variant B is category-specific.
- German UI copy, English identifiers and comments (repo rule). No em-dashes in copy.
- Every generated file is JPEG and marked with `markSyntheticImage(bytes, "Röbel App / OpenAI <model>")` (AI Act Art. 50).
- Reference images only from the project's Supabase storage host (SSRF guard); sent to OpenAI as bytes.
- The Expo app never calls OpenAI; `OPENAI_API_KEY` stays server-side.
- Abuse control: kill switch `app_settings.poster_proposals_enabled`, budget `app_settings.poster_daily_budget_usd` (default 20), per draft max 2 batches, per account max 10 batches/day (admins exempt from the last two).
- Tests: `cd apps/web && pnpm exec tsx --test tests/poster-*.test.ts`. Type check of the new files only: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/(lib/poster|components/poster|app/actions/poster-proposals|app/admin/dashboard/events/poster|app/api/posters)|scripts/poster-batch"` must print nothing (the repo baseline has ~1235 unrelated errors).
- Commit after every task, stage only the task's files, push after each commit (global rule).

---

## File map

| Path | Responsibility |
|---|---|
| `apps/web/src/lib/poster/constants.ts` | sizes, tolerances, model default, storage names, cap numbers, setting keys |
| `apps/web/src/lib/poster/types.ts` | shared TS types (analysis, content, proposals, results) |
| `apps/web/src/lib/poster/ratio.ts` | pure: `classifyRatio`, `RATIO_LABELS` |
| `apps/web/src/lib/poster/reference-guard.ts` | pure: `isAllowedReferenceUrl` |
| `apps/web/src/lib/poster/cost.ts` | pure: `estimateCostUsd` from OpenAI usage |
| `apps/web/src/lib/poster/content.ts` | pure: deterministic German poster lines |
| `apps/web/src/lib/poster/directions.ts` | pure: the two style directions per mode/category |
| `apps/web/src/lib/poster/prompts.ts` | pure: reformat + design prompts |
| `apps/web/src/lib/poster/decide.ts` | pure: `decideMode` |
| `apps/web/src/lib/poster/caps.ts` | pure: `evaluateCaps` |
| `apps/web/src/lib/poster/copy.ts` | pure: copy schema + prompt + normalizer |
| `apps/web/src/lib/poster/analyze.ts` | server: fetch source image + dimensions |
| `apps/web/src/lib/poster/ai.ts` | server: Claude vision classification + copy draft |
| `apps/web/src/lib/poster/openai-image.ts` | server: OpenAI Images API renderer |
| `apps/web/src/lib/poster/service.ts` | server: `proposePosters`, `selectProposal`, `keepOriginal`, `linkDraftProposals`, settings/spend |
| `apps/web/src/lib/poster/auth.ts` | server: actor resolution for API routes |
| `supabase/migrations/20260922_event_poster_proposals.sql` | table + event columns + settings seed |
| `apps/web/src/app/actions/poster-proposals.ts` | admin server actions |
| `apps/web/src/components/poster/AFrame.tsx` | A-ratio image box |
| `apps/web/src/components/poster/PosterLightbox.tsx` | dialog lightbox with prev/next |
| `apps/web/src/components/poster/PosterProposalPair.tsx` | two variants + actions (shared with chat slices) |
| `apps/web/src/app/admin/dashboard/events/poster/page.tsx` + `_components/PosterOverview.tsx` | overview + batch runner |
| `apps/web/src/app/admin/dashboard/events/poster/[eventId]/page.tsx` + `_components/PosterReview.tsx` | review/apply page |
| `apps/web/src/components/admin/admin-sidebar.tsx`, `apps/web/src/app/admin/dashboard/events/page.tsx` | nav link + per-row link |
| `apps/web/src/app/api/posters/{propose,select,link}/route.ts` | HTTP routes for the chat slices |
| `apps/web/scripts/poster-batch.ts` | CLI batch for the current backlog |

---

### Task 1: constants, types, ratio classifier

**Files:**
- Create: `apps/web/src/lib/poster/constants.ts`, `apps/web/src/lib/poster/types.ts`, `apps/web/src/lib/poster/ratio.ts`
- Test: `apps/web/tests/poster-ratio.test.ts`

**Interfaces:**
- Produces: `classifyRatio(width:number,height:number): RatioClass` with `RatioClass = "ok"|"landscape"|"square"|"too_short"|"too_tall"`; `RATIO_LABELS: Record<RatioClass,string>`; all constants listed below; types `PosterMode`, `PosterAnalysis`, `PosterEventInput`, `PosterContent`, `PosterCopy`, `PosterDirection`, `PosterProposal`, `ProposeResult`, `PosterCheck`.

- [ ] **Step 1: Write the failing test** `apps/web/tests/poster-ratio.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRatio, RATIO_LABELS } from "../src/lib/poster/ratio";

test("A-format posters within 8 percent are ok", () => {
  assert.equal(classifyRatio(794, 1123), "ok");   // 1.414
  assert.equal(classifyRatio(1080, 1512), "ok");  // 1.400
  assert.equal(classifyRatio(1000, 1333), "ok");  // 1.333 (-5.7 %)
  assert.equal(classifyRatio(1080, 1557), "ok");  // 1.442 (+2 %)
});

test("landscape and square images are flagged", () => {
  assert.equal(classifyRatio(1200, 800), "landscape");
  assert.equal(classifyRatio(498, 436), "landscape");
  assert.equal(classifyRatio(856, 856), "square");
  assert.equal(classifyRatio(1000, 1200), "square"); // 1.2 < 1.25
});

test("portrait outside the band is too short or too tall", () => {
  assert.equal(classifyRatio(1000, 1290), "too_short"); // 1.29 = -8.8 %
  assert.equal(classifyRatio(1080, 2097), "too_tall");  // 1.94
  assert.equal(classifyRatio(774, 1600), "too_tall");   // 2.07
});

test("invalid dimensions throw", () => {
  assert.throws(() => classifyRatio(0, 100));
  assert.throws(() => classifyRatio(100, Number.NaN));
});

test("labels are German and cover every class", () => {
  assert.equal(RATIO_LABELS.ok, "A-Format");
  assert.equal(RATIO_LABELS.landscape, "Querformat");
  assert.equal(Object.keys(RATIO_LABELS).length, 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-ratio.test.ts`
Expected: FAIL (cannot find module `../src/lib/poster/ratio`)

- [ ] **Step 3: Write the modules**

`apps/web/src/lib/poster/constants.ts`:

```ts
// Shared constants for the event poster proposals (Plakat-Vorschläge).
// Spec: docs/superpowers/specs/2026-09-22-event-poster-proposals-design.md

/** Render size: DIN A portrait within 0.2 % (1440/2032 = 1:1.411). Both multiples of 16. */
export const POSTER_WIDTH = 1440;
export const POSTER_HEIGHT = 2032;
export const POSTER_RENDER_SIZE = `${POSTER_WIDTH}x${POSTER_HEIGHT}`;

/** DIN A series height/width. */
export const A_SERIES_RATIO = Math.SQRT2;
/** ±8 % around √2 still counts as A-format (cover crops at most ~4 % per side). */
export const RATIO_TOLERANCE = 0.08;
/** Shortest side below this is treated as low resolution. */
export const LOW_RES_MIN_SIDE = 700;

export const DEFAULT_POSTER_MODEL = "gpt-image-2.5-sunburst";
export const DEFAULT_POSTER_QUALITY = "high";
export const OPENAI_IMAGES_BASE = "https://api.openai.com/v1/images";

export const POSTER_STORAGE_BUCKET = "images";
export const POSTER_STORAGE_FOLDER = "posters";
export const posterGeneratorLabel = (model: string) => `Röbel App / OpenAI ${model}`;

export const MAX_BATCHES_PER_DRAFT = 2;
export const MAX_BATCHES_PER_ACCOUNT_PER_DAY = 10;
export const DEFAULT_DAILY_BUDGET_USD = 20;
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

export const SETTING_ENABLED = "poster_proposals_enabled";
export const SETTING_BUDGET = "poster_daily_budget_usd";
export const SETTING_MODEL = "poster_image_model";
```

`apps/web/src/lib/poster/types.ts`:

```ts
import type { RatioClass } from "./ratio";

export type PosterMode = "reformat" | "design";
export type PosterImageKind = "poster" | "photo" | "logo" | "graphic" | "screenshot";
export type PosterImageQuality = "ok" | "low_res" | "blurry";
export type PosterRequester = "admin" | "org" | "submitter";
export type PosterProposalStatus = "proposed" | "selected" | "rejected";

/** What Claude vision says about the uploaded event image. */
export interface PosterAnalysis {
  kind: PosterImageKind;
  hasEventInfo: boolean;
  visibleText: string[];
  hasUiChrome: boolean;
  brandColors: string[];
  styleNotes: string;
  quality: PosterImageQuality;
}

/** The event fields the poster pipeline reads (events row or a pre-submit draft). */
export interface PosterEventInput {
  title: string;
  date?: string | null;
  time?: string | null;
  end_time?: string | null;
  location?: string | null;
  category?: string | null;
  ticket_price?: number | string | null;
  organizer_name?: string | null;
  description?: string | null;
  website_url?: string | null;
  image_url?: string | null;
}

/** Deterministic German lines; null = not on the poster. */
export interface PosterContent {
  title: string;
  dateLine: string | null;
  timeLine: string | null;
  placeLine: string | null;
  priceLine: string | null;
  organizerLine: string | null;
  websiteLine: string | null;
  category: string | null;
}

/** LLM-drafted optional text (never facts). */
export interface PosterCopy {
  subline: string;
  highlights: string[];
}

export interface PosterDirection {
  id: string;
  label: string;
  brief: string;
}

/** Stored per event after every analysis run (events.poster_check). */
export interface PosterCheck {
  checkedAt: string;
  width: number | null;
  height: number | null;
  ratio: RatioClass | null;
  mode: PosterMode | "skip";
  analysis: PosterAnalysis | null;
}

/** Row of event_poster_proposals as the UI needs it. */
export interface PosterProposal {
  id: string;
  batch_id: string;
  event_id: string | null;
  draft_id: string | null;
  account_id: string | null;
  requested_by: PosterRequester;
  mode: PosterMode;
  variant: 1 | 2;
  direction: string;
  source_image_url: string | null;
  image_url: string;
  status: PosterProposalStatus;
  cost_usd: number | null;
  created_at: string;
}

export type ProposeResult =
  | { skipped: "ratio_ok_poster" | "nothing_to_design"; check: PosterCheck | null }
  | {
      batchId: string;
      mode: PosterMode;
      check: PosterCheck | null;
      proposals: PosterProposal[];
      costUsd: number;
    };
```

`apps/web/src/lib/poster/ratio.ts`:

```ts
// Pure ratio classification against the DIN A portrait ratio.
import { A_SERIES_RATIO, RATIO_TOLERANCE } from "./constants";

export type RatioClass = "ok" | "landscape" | "square" | "too_short" | "too_tall";

export function classifyRatio(width: number, height: number): RatioClass {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`classifyRatio: invalid dimensions ${width}x${height}`);
  }
  const ratio = height / width;
  const deviation = ratio / A_SERIES_RATIO;
  if (deviation >= 1 - RATIO_TOLERANCE && deviation <= 1 + RATIO_TOLERANCE) return "ok";
  if (ratio < 1) return "landscape";
  if (ratio < 1.25) return "square";
  if (ratio < A_SERIES_RATIO) return "too_short";
  return "too_tall";
}

export const RATIO_LABELS: Record<RatioClass, string> = {
  ok: "A-Format",
  landscape: "Querformat",
  square: "Quadratisch",
  too_short: "Zu niedrig",
  too_tall: "Zu hoch",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-ratio.test.ts`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/poster/constants.ts apps/web/src/lib/poster/types.ts apps/web/src/lib/poster/ratio.ts apps/web/tests/poster-ratio.test.ts
git commit -m "feat(web): poster proposals — constants, types and DIN-A ratio classifier"
git push
```

---

### Task 2: reference guard and cost estimator

**Files:**
- Create: `apps/web/src/lib/poster/reference-guard.ts`, `apps/web/src/lib/poster/cost.ts`
- Test: `apps/web/tests/poster-guard-cost.test.ts`

**Interfaces:**
- Produces: `isAllowedReferenceUrl(url: string, supabaseUrl: string | undefined): boolean`; `estimateCostUsd(usage: ImageUsage | null | undefined): number`; `interface ImageUsage`.

- [ ] **Step 1: Write the failing test** `apps/web/tests/poster-guard-cost.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedReferenceUrl } from "../src/lib/poster/reference-guard";
import { estimateCostUsd } from "../src/lib/poster/cost";

const BASE = "https://wwbeqhkslxdxhktqzqti.supabase.co";

test("only public storage objects on our Supabase host pass", () => {
  assert.equal(isAllowedReferenceUrl(`${BASE}/storage/v1/object/public/images/event-images/a.jpg`, BASE), true);
  assert.equal(isAllowedReferenceUrl(`${BASE}/storage/v1/object/public/news-images/b.jpeg`, BASE), true);
  assert.equal(isAllowedReferenceUrl(`http://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/a.jpg`, BASE), false);
  assert.equal(isAllowedReferenceUrl("https://evil.example/storage/v1/object/public/images/a.jpg", BASE), false);
  assert.equal(isAllowedReferenceUrl(`${BASE}/rest/v1/events`, BASE), false);
  assert.equal(isAllowedReferenceUrl("not a url", BASE), false);
  assert.equal(isAllowedReferenceUrl(`${BASE}/storage/v1/object/public/images/a.jpg`, undefined), false);
});

test("cost follows the published token rates", () => {
  // Measured probe: 342 text in, 1512 image in, 2010 image out → $0.0741
  const usd = estimateCostUsd({
    input_tokens: 1854,
    input_tokens_details: { image_tokens: 1512, text_tokens: 342 },
    output_tokens: 2010,
    output_tokens_details: { image_tokens: 2010, text_tokens: 0 },
  });
  assert.equal(usd, 0.0741);
  assert.equal(estimateCostUsd(null), 0);
  // Without details every input token is billed as image input (upper bound)
  assert.equal(estimateCostUsd({ input_tokens: 1000, output_tokens: 0 }), 0.008);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-guard-cost.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the modules**

`apps/web/src/lib/poster/reference-guard.ts`:

```ts
// SSRF guard: a source/reference image URL is only fetched server-side when it
// is a public storage object on the project's own Supabase host.
export function isAllowedReferenceUrl(url: string, supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    return (
      u.protocol === "https:" &&
      u.host === base.host &&
      u.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}
```

`apps/web/src/lib/poster/cost.ts`:

```ts
// Cost estimate from the OpenAI Images API usage block (gpt-image-2.5 rates,
// USD per million tokens: text in 5, image in 8, image out 30).
export interface ImageUsage {
  input_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
  output_tokens?: number;
  output_tokens_details?: { image_tokens?: number; text_tokens?: number };
}

const RATE_TEXT_IN = 5;
const RATE_IMAGE_IN = 8;
const RATE_IMAGE_OUT = 30;

export function estimateCostUsd(usage: ImageUsage | null | undefined): number {
  if (!usage) return 0;
  const textIn = usage.input_tokens_details?.text_tokens ?? 0;
  const imageIn =
    usage.input_tokens_details?.image_tokens ?? Math.max(0, (usage.input_tokens ?? 0) - textIn);
  const out = usage.output_tokens ?? 0;
  const usd = (textIn * RATE_TEXT_IN + imageIn * RATE_IMAGE_IN + out * RATE_IMAGE_OUT) / 1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-guard-cost.test.ts`
Expected: 2 passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/poster/reference-guard.ts apps/web/src/lib/poster/cost.ts apps/web/tests/poster-guard-cost.test.ts
git commit -m "feat(web): poster proposals — reference URL guard and cost estimate"
git push
```

---

### Task 3: deterministic poster content lines

**Files:**
- Create: `apps/web/src/lib/poster/content.ts`
- Test: `apps/web/tests/poster-content.test.ts`

**Interfaces:**
- Consumes: `PosterEventInput`, `PosterContent` (Task 1).
- Produces: `buildPosterContent(event: PosterEventInput): PosterContent`; `contentLines(c: PosterContent): string[]`; `formatGermanDate(iso: string): string | null`; `formatClock(t?: string|null): string | null`; `formatPriceLine(p?: number|string|null): string | null`.

- [ ] **Step 1: Write the failing test** `apps/web/tests/poster-content.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPosterContent,
  contentLines,
  formatGermanDate,
  formatClock,
  formatPriceLine,
} from "../src/lib/poster/content";

test("German long date with weekday", () => {
  assert.equal(formatGermanDate("2026-10-10"), "Samstag, 10. Oktober 2026");
  assert.equal(formatGermanDate("2026-09-25"), "Freitag, 25. September 2026");
  assert.equal(formatGermanDate("nope"), null);
});

test("clock trims seconds and pads", () => {
  assert.equal(formatClock("15:00:00"), "15:00");
  assert.equal(formatClock("9:30"), "09:30");
  assert.equal(formatClock(null), null);
});

test("price line: free, integer, decimal, unknown", () => {
  assert.equal(formatPriceLine(0), "Eintritt frei");
  assert.equal(formatPriceLine("0.00"), "Eintritt frei");
  assert.equal(formatPriceLine(12), "Eintritt 12 €");
  assert.equal(formatPriceLine("12.50"), "Eintritt 12,50 €");
  assert.equal(formatPriceLine(null), null);
  assert.equal(formatPriceLine("abc"), null);
});

test("buildPosterContent assembles lines and collapses whitespace", () => {
  const c = buildPosterContent({
    title: "Konzertsommer  im Bürgergarten",
    date: "2026-09-23",
    time: "19:00:00",
    end_time: "22:00:00",
    location: "Haus des Gastes Str. der Deutschen Einheit 7 17207 Röbel/Müritz",
    category: "Musik",
    ticket_price: "12.00",
    organizer_name: "Haus des Gastes Röbel/Müritz",
    website_url: "https://www.herb-rock.de/",
  });
  assert.equal(c.title, "Konzertsommer im Bürgergarten");
  assert.equal(c.dateLine, "Mittwoch, 23. September 2026");
  assert.equal(c.timeLine, "19:00 bis 22:00 Uhr");
  assert.equal(c.priceLine, "Eintritt 12 €");
  assert.equal(c.websiteLine, "herb-rock.de");
  assert.deepEqual(contentLines(c), [
    "Konzertsommer im Bürgergarten",
    "Mittwoch, 23. September 2026 · 19:00 bis 22:00 Uhr",
    "Haus des Gastes Str. der Deutschen Einheit 7 17207 Röbel/Müritz",
    "Eintritt 12 €",
    "Veranstalter: Haus des Gastes Röbel/Müritz",
    "herb-rock.de",
  ]);
});

test("missing fields are omitted, never invented", () => {
  const c = buildPosterContent({ title: "HEIMSPIEL", time: "15:00:00" });
  assert.equal(c.dateLine, null);
  assert.equal(c.timeLine, "15:00 Uhr");
  assert.deepEqual(contentLines(c), ["HEIMSPIEL", "15:00 Uhr"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-content.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the module** `apps/web/src/lib/poster/content.ts`

```ts
// Deterministic German poster lines built from event fields. This is the only
// source of dates, times, prices and places on a poster (never an LLM).
import type { PosterContent, PosterEventInput } from "./types";

const DE_LONG_DATE = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatGermanDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((isoDate ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(d.getTime())) return null;
  return DE_LONG_DATE.format(d);
}

export function formatClock(time?: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function formatPriceLine(price?: number | string | null): string | null {
  if (price === null || price === undefined || price === "") return null;
  const n = typeof price === "string" ? Number(price.replace(",", ".")) : price;
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return "Eintritt frei";
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
  return `Eintritt ${formatted} €`;
}

function clean(value?: string | null): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v || null;
}

function websiteHost(url?: string | null): string | null {
  const w = clean(url);
  if (!w) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    return u.host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function buildPosterContent(event: PosterEventInput): PosterContent {
  const start = formatClock(event.time);
  const end = formatClock(event.end_time);
  const timeLine = start ? (end ? `${start} bis ${end} Uhr` : `${start} Uhr`) : null;
  return {
    title: clean(event.title) ?? "",
    dateLine: event.date ? formatGermanDate(event.date) : null,
    timeLine,
    placeLine: clean(event.location),
    priceLine: formatPriceLine(event.ticket_price),
    organizerLine: clean(event.organizer_name),
    websiteLine: websiteHost(event.website_url),
    category: clean(event.category),
  };
}

/** The lines in poster order; date and time share one line. */
export function contentLines(c: PosterContent): string[] {
  const when =
    c.dateLine && c.timeLine ? `${c.dateLine} · ${c.timeLine}` : c.dateLine ?? c.timeLine;
  return [
    c.title,
    when,
    c.placeLine,
    c.priceLine,
    c.organizerLine ? `Veranstalter: ${c.organizerLine}` : null,
    c.websiteLine,
  ].filter((line): line is string => !!line);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-content.test.ts`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/poster/content.ts apps/web/tests/poster-content.test.ts
git commit -m "feat(web): poster proposals — deterministic German content lines"
git push
```

---

### Task 4: directions, decide, caps

**Files:**
- Create: `apps/web/src/lib/poster/directions.ts`, `apps/web/src/lib/poster/decide.ts`, `apps/web/src/lib/poster/caps.ts`
- Test: `apps/web/tests/poster-rules.test.ts`

**Interfaces:**
- Consumes: types from Task 1, `RatioClass`.
- Produces: `pickDirections(mode: PosterMode, category?: string|null): [PosterDirection, PosterDirection]` (+ exported `PLAKATIV`, `ORIGINALTREU`, `AUFGEFRISCHT`, `FESTLICH`); `decideMode(ratio: RatioClass|null, analysis: PosterAnalysis|null): PosterMode | "skip"`; `evaluateCaps(input: CapInput): CapResult`.

- [ ] **Step 1: Write the failing test** `apps/web/tests/poster-rules.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickDirections, PLAKATIV } from "../src/lib/poster/directions";
import { decideMode } from "../src/lib/poster/decide";
import { evaluateCaps } from "../src/lib/poster/caps";
import type { PosterAnalysis } from "../src/lib/poster/types";

const poster: PosterAnalysis = {
  kind: "poster", hasEventInfo: true, visibleText: ["Saisonabschluss"], hasUiChrome: false,
  brandColors: ["#1a73e8"], styleNotes: "", quality: "ok",
};

test("design mode always leads with Plakativ, second is category specific", () => {
  const [a, b] = pickDirections("design", "Sport");
  assert.equal(a.id, PLAKATIV.id);
  assert.equal(b.id, "editorial");
  assert.equal(pickDirections("design", "Kirchliches")[1].id, "ruhig");
  assert.equal(pickDirections("design", null)[1].id, "festlich");
  assert.equal(pickDirections("design", "Unbekannt")[1].id, "festlich");
});

test("reformat mode is originaltreu then aufgefrischt", () => {
  assert.deepEqual(pickDirections("reformat", "Musik").map((d) => d.id), ["originaltreu", "aufgefrischt"]);
});

test("decideMode: fine A-format poster is skipped", () => {
  assert.equal(decideMode("ok", poster), "skip");
});

test("decideMode: posters with info in the wrong ratio or with chrome are reformatted", () => {
  assert.equal(decideMode("landscape", poster), "reformat");
  assert.equal(decideMode("ok", { ...poster, hasUiChrome: true }), "reformat");
  assert.equal(decideMode("too_tall", { ...poster, kind: "screenshot" }), "reformat");
  assert.equal(decideMode("ok", { ...poster, quality: "low_res" }), "reformat");
});

test("decideMode: logos, photos and posters without info are designed", () => {
  assert.equal(decideMode("square", { ...poster, kind: "logo", hasEventInfo: false }), "design");
  assert.equal(decideMode("ok", { ...poster, kind: "photo", hasEventInfo: false }), "design");
  assert.equal(decideMode("landscape", { ...poster, hasEventInfo: false }), "design");
  assert.equal(decideMode(null, null), "design");
});

test("caps: kill switch and budget apply to everyone, per-draft and per-account only to non-admins", () => {
  const base = { enabled: true, budgetLimitUsd: 20, budgetSpentTodayUsd: 1, batchesForDraft: 0, batchesForAccountToday: 0 };
  assert.deepEqual(evaluateCaps({ ...base, requestedBy: "admin" }), { ok: true });
  assert.equal(evaluateCaps({ ...base, requestedBy: "admin", enabled: false }).ok, false);
  assert.equal(evaluateCaps({ ...base, requestedBy: "admin", budgetSpentTodayUsd: 20 }).ok, false);
  assert.deepEqual(evaluateCaps({ ...base, requestedBy: "admin", batchesForDraft: 5, batchesForAccountToday: 50 }), { ok: true });
  const draftLimit = evaluateCaps({ ...base, requestedBy: "submitter", batchesForDraft: 2 });
  assert.equal(draftLimit.ok, false);
  assert.equal(!draftLimit.ok && draftLimit.reason, "draft_limit");
  const accountLimit = evaluateCaps({ ...base, requestedBy: "org", batchesForAccountToday: 10 });
  assert.equal(!accountLimit.ok && accountLimit.reason, "account_limit");
  assert.deepEqual(evaluateCaps({ ...base, requestedBy: "org", batchesForDraft: 1, batchesForAccountToday: 9 }), { ok: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-rules.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the modules**

`apps/web/src/lib/poster/directions.ts`:

```ts
// The two style directions per mode. Design mode always leads with "Plakativ"
// (Max's pick from the probe); the second direction depends on the category.
import type { PosterDirection, PosterMode } from "./types";

export const PLAKATIV: PosterDirection = {
  id: "plakativ",
  label: "Plakativ",
  brief:
    "Kraftvolles Plakat: großflächige, fette serifenlose Typografie, hoher Kontrast, starke Diagonalen oder Farbflächen in den Markenfarben (aus dem Referenzbild, sonst passend zur Kategorie), ein einziger Farbakzent nur für Datum und Uhrzeit, flächig-grafisch, druckfähig.",
};

export const ORIGINALTREU: PosterDirection = {
  id: "originaltreu",
  label: "Originaltreu",
  brief:
    "Gestaltung, Farben, Schrift-Charakter, Foto und Logo des Originals beibehalten; nur so weit umbauen, dass das DIN-A-Hochformat komplett gefüllt ist (Flächen erweitern, Elemente neu anordnen), kein Rand, kein Letterboxing.",
};

export const AUFGEFRISCHT: PosterDirection = {
  id: "aufgefrischt",
  label: "Aufgefrischt",
  brief:
    "Gleiche Inhalte und Markenfarben wie das Original, aber eine aufgeräumte, moderne Hierarchie: Titel groß oben, Foto oder Motiv als ruhige Fläche in der Mitte, Datum und Uhrzeit als klarer Block, Details unten klein; Logo originalgetreu übernehmen.",
};

export const FESTLICH: PosterDirection = {
  id: "festlich",
  label: "Festlich",
  brief:
    "Festlich und einladend: warme, helle Farben, freundliche Illustrationselemente (Wimpel, Lichter, Blätter) sparsam eingesetzt, Titel groß und freundlich, klare Infoblöcke; wirkt wie das Plakat eines Stadt- oder Vereinsfests.",
};

const SECOND_BY_CATEGORY: Record<string, PosterDirection> = {
  Sport: {
    id: "editorial",
    label: "Editorial",
    brief:
      "Ruhiges, editoriales Layout: viel Weißraum, feines Raster, eine kräftige Grotesk für den Titel und eine leichte für Details, Logo zentriert oben, dezente Linien als Struktur, ein kleines fotografisches Detail als Akzent; wirkt wie das Programmheft eines Profivereins.",
  },
  Musik: {
    id: "konzert",
    label: "Konzertplakat",
    brief:
      "Konzertplakat-Charakter: großes stimmungsvolles Motiv (Bühne, Instrument, Lichter), Titel als Blickfang in kräftiger Display-Typografie, Datum und Ort in einem kontrastreichen Block, leicht körnige Drucktextur, kein Neon-Glühen.",
  },
  Kultur: {
    id: "verspielt",
    label: "Verspielt",
    brief:
      "Freundlich-illustrativ: warme Farben, eine charaktervolle Display-Schrift für den Titel, einfache illustrative Formen oder ein Ausschnitt des Fotos als Motiv, viel Luft, klare Infoblöcke; wirkt wie ein hochwertiges Theater- oder Kinoplakat.",
  },
  Kirchliches: {
    id: "ruhig",
    label: "Ruhig",
    brief:
      "Ruhig und würdig: helle Fläche, eine elegante Serifenschrift für den Titel, dezente Ornamente oder ein Lichtmotiv, gedämpfte Farben (tiefes Blau, Gold, Creme), großzügige Ränder, sehr gute Lesbarkeit.",
  },
  Stadt: {
    id: "amtlich",
    label: "Amtlich",
    brief:
      "Klar und offiziell: Röbel-Navy #00498B als Hauptfarbe auf Weiß, strenge Struktur mit Linien und Blöcken, serifenlose Typografie, sachliche Infozeilen; wirkt wie eine hochwertige Bekanntmachung der Stadt.",
  },
  "Essen & Trinken": {
    id: "appetitlich",
    label: "Appetitlich",
    brief:
      "Warm und appetitlich: fotografisches Motiv aus dem Referenzbild oder passend zum Anlass, cremige Flächen, eine freundliche Schrift, Preis und Ort deutlich; wirkt wie das Plakat eines guten Restaurants.",
  },
  Ausstellungen: {
    id: "galerie",
    label: "Galerie",
    brief:
      "Galerie-Look: sehr reduziert, viel Weiß, Motiv frei stehend, kleine präzise Typografie, ein Farbakzent; wirkt wie eine Museumsankündigung.",
  },
};

export function pickDirections(
  mode: PosterMode,
  category?: string | null,
): [PosterDirection, PosterDirection] {
  if (mode === "reformat") return [ORIGINALTREU, AUFGEFRISCHT];
  const second = (category && SECOND_BY_CATEGORY[category]) || FESTLICH;
  return [PLAKATIV, second];
}
```

`apps/web/src/lib/poster/decide.ts`:

```ts
// Which pipeline an event image needs. Spec §4: skip only a clean A-format
// poster with the event information; reformat any poster with information;
// design everything else (logos, photos, graphics, drafts without image).
import type { RatioClass } from "./ratio";
import type { PosterAnalysis, PosterMode } from "./types";

export function decideMode(
  ratio: RatioClass | null,
  analysis: PosterAnalysis | null,
): PosterMode | "skip" {
  if (!analysis || ratio === null) return "design";
  const posterLike = analysis.kind === "poster" || analysis.kind === "screenshot";
  if (posterLike && analysis.hasEventInfo) {
    const clean =
      ratio === "ok" && analysis.kind === "poster" && !analysis.hasUiChrome && analysis.quality === "ok";
    return clean ? "skip" : "reformat";
  }
  return "design";
}
```

`apps/web/src/lib/poster/caps.ts`:

```ts
// Pure cap evaluation. Every generation costs money (~$0.15 per pair), so the
// kill switch and the daily budget apply to everyone; per-draft and per-account
// limits apply to non-admin callers.
import { MAX_BATCHES_PER_ACCOUNT_PER_DAY, MAX_BATCHES_PER_DRAFT } from "./constants";
import type { PosterRequester } from "./types";

export interface CapInput {
  requestedBy: PosterRequester;
  enabled: boolean;
  budgetLimitUsd: number;
  budgetSpentTodayUsd: number;
  batchesForDraft: number;
  batchesForAccountToday: number;
}

export type CapResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "budget" | "draft_limit" | "account_limit"; message: string };

export function evaluateCaps(i: CapInput): CapResult {
  if (!i.enabled) {
    return { ok: false, reason: "disabled", message: "Plakat-Vorschläge sind derzeit deaktiviert." };
  }
  if (i.budgetSpentTodayUsd >= i.budgetLimitUsd) {
    return { ok: false, reason: "budget", message: "Das Tagesbudget für Plakat-Vorschläge ist aufgebraucht." };
  }
  if (i.requestedBy === "admin") return { ok: true };
  if (i.batchesForDraft >= MAX_BATCHES_PER_DRAFT) {
    return { ok: false, reason: "draft_limit", message: "Für diese Einreichung wurden schon zwei Vorschlagsrunden erzeugt." };
  }
  if (i.batchesForAccountToday >= MAX_BATCHES_PER_ACCOUNT_PER_DAY) {
    return { ok: false, reason: "account_limit", message: "Tageslimit für Plakat-Vorschläge erreicht. Bitte morgen weitermachen." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-rules.test.ts`
Expected: 6 passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/poster/directions.ts apps/web/src/lib/poster/decide.ts apps/web/src/lib/poster/caps.ts apps/web/tests/poster-rules.test.ts
git commit -m "feat(web): poster proposals — style directions, mode decision and caps"
git push
```

---

### Task 5: prompts and copy schema

**Files:**
- Create: `apps/web/src/lib/poster/prompts.ts`, `apps/web/src/lib/poster/copy.ts`
- Test: `apps/web/tests/poster-prompts.test.ts`

**Interfaces:**
- Consumes: `contentLines`, `buildPosterContent` (Task 3), directions (Task 4), types (Task 1).
- Produces: `buildReformatPrompt(analysis, direction, hint?)`, `buildDesignPrompt(content, copy, direction, { hasReference, referenceKind?, hint? })`, `POSTER_GUARD`; `posterCopySchema` (zod), `POSTER_COPY_SYSTEM`, `buildPosterCopyPrompt(event, content)`, `normalizePosterCopy(raw, content): PosterCopy`.

- [ ] **Step 1: Write the failing test** `apps/web/tests/poster-prompts.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReformatPrompt, buildDesignPrompt } from "../src/lib/poster/prompts";
import { buildPosterCopyPrompt, normalizePosterCopy } from "../src/lib/poster/copy";
import { buildPosterContent } from "../src/lib/poster/content";
import { pickDirections } from "../src/lib/poster/directions";
import type { PosterAnalysis } from "../src/lib/poster/types";

const analysis: PosterAnalysis = {
  kind: "screenshot", hasEventInfo: true,
  visibleText: ["Saisonabschluss", "Freitag, 25. September", "Eintritt FREI"],
  hasUiChrome: true, brandColors: ["#1a73e8", "#f5c400"], styleNotes: "blaue Wellen", quality: "ok",
};

test("reformat prompt keeps texts verbatim and strips chrome", () => {
  const [dir] = pickDirections("reformat", null);
  const p = buildReformatPrompt(analysis, dir, "Logo größer");
  assert.match(p, /Screenshot/);
  assert.match(p, /„Saisonabschluss“ \/ „Freitag, 25\. September“ \/ „Eintritt FREI“/);
  assert.match(p, /Wort für Wort/);
  assert.match(p, /Originaltreu/);
  assert.match(p, /Logo größer/);
  assert.match(p, /1:1,414/);
  assert.doesNotMatch(p, /erkennbaren Gesichtern/);
});

test("design prompt lists the deterministic lines and the reference rule", () => {
  const content = buildPosterContent({
    title: "HEIMSPIEL", date: "2026-10-10", time: "15:00:00", location: "Friesensportplatz",
    ticket_price: 3, organizer_name: "PSV Röbel/Müritz e. V.", category: "Sport",
  });
  const [a, b] = pickDirections("design", "Sport");
  const p = buildDesignPrompt(content, { subline: "Herren · Kreisoberliga", highlights: [] }, a, {
    hasReference: true, referenceKind: "logo",
  });
  assert.match(p, /- HEIMSPIEL\n- Samstag, 10\. Oktober 2026 · 15:00 Uhr\n- Friesensportplatz\n- Eintritt 3 €/);
  assert.match(p, /Logo des Veranstalters/);
  assert.match(p, /Herren · Kreisoberliga/);
  assert.match(p, /Plakativ/);
  assert.match(p, /erkennbaren Gesichtern/);
  const noRef = buildDesignPrompt(content, null, b, { hasReference: false });
  assert.match(noRef, /kein Referenzbild/);
  assert.match(noRef, /Editorial/);
});

test("copy prompt carries the description and normalizer clamps and dedupes", () => {
  const content = buildPosterContent({ title: "Konzert", description: "Popmusik von Herzen.\r\nEintritt frei." });
  const prompt = buildPosterCopyPrompt({ title: "Konzert", description: "Popmusik von Herzen." }, content);
  assert.match(prompt, /Popmusik von Herzen/);
  const copy = normalizePosterCopy(
    { subline: "  Popmusik von Herzen  ", highlights: ["Konzert", "Solos & Duette", "Solos & Duette", "x".repeat(80), "extra", "more"] },
    content,
  );
  assert.equal(copy.subline, "Popmusik von Herzen");
  assert.deepEqual(copy.highlights, ["Solos & Duette", "x".repeat(40)]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-prompts.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the modules**

`apps/web/src/lib/poster/prompts.ts`:

```ts
// Pure prompt builders for the two poster pipelines (German, like the probe
// prompts that produced the reference results on 2026-09-22).
import { contentLines } from "./content";
import type { PosterAnalysis, PosterContent, PosterCopy, PosterDirection } from "./types";

export const POSTER_GUARD = [
  "Anforderungen: druckfähiges Plakat im DIN-A-Hochformat (Seitenverhältnis 1:1,414), Format komplett gefüllt, kein Rand, kein Letterboxing.",
  "Alle Texte korrekt geschrieben, vollständig lesbar, nichts am Rand abgeschnitten, keine Texte erfinden, keine Platzhaltertexte, keine erfundenen Sponsoren oder Logos.",
  "Moderner Print-Look wie von einer Werbeagentur: klare Hierarchie, ruhige Flächen, präzise Typografie. Kein KI-Kitsch, kein übertriebenes Glühen, keine Wasserzeichen.",
].join("\n");

const DESIGN_GUARD = "Keine erfundenen Menschen mit erkennbaren Gesichtern.";

export function buildReformatPrompt(
  analysis: PosterAnalysis,
  direction: PosterDirection,
  hint?: string | null,
): string {
  const texts = analysis.visibleText.map((t) => `„${t.trim()}“`).filter((t) => t !== "„“").join(" / ");
  return [
    "Du bist ein professioneller Grafikdesigner. Das Eingabebild ist ein vorhandenes Veranstaltungsplakat, das nicht sauber im DIN-A-Hochformat vorliegt. Baue es auf DIN A um.",
    analysis.hasUiChrome
      ? "Das Bild ist ein Screenshot: entferne die gesamte App-Oberfläche (Kopfzeilen, Icons, Ränder, Seitenzahlen) und übernimm nur das Plakat."
      : "",
    texts
      ? `Alle Texte exakt beibehalten, Wort für Wort, gleiche Schreibweise: ${texts}. Keine neuen Texte erfinden.`
      : "Alle im Bild sichtbaren Texte exakt beibehalten, Wort für Wort. Keine neuen Texte erfinden.",
    "Logos und Fotos originalgetreu übernehmen, nicht neu zeichnen.",
    `Stilrichtung „${direction.label}“: ${direction.brief}`,
    analysis.quality !== "ok"
      ? "Das Original ist niedrig aufgelöst oder unscharf: Texte und Formen sauber und scharf neu setzen, Inhalt unverändert."
      : "",
    hint?.trim() ? `Zusätzlicher Hinweis der Redaktion: ${hint.trim()}` : "",
    POSTER_GUARD,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDesignPrompt(
  content: PosterContent,
  copy: PosterCopy | null,
  direction: PosterDirection,
  options: { hasReference: boolean; referenceKind?: string | null; hint?: string | null },
): string {
  const lines = contentLines(content);
  const extras = copy ? [copy.subline, ...copy.highlights].map((s) => s.trim()).filter(Boolean) : [];
  const referenceWhat =
    options.referenceKind === "logo"
      ? "das Logo des Veranstalters"
      : options.referenceKind === "photo"
        ? "ein Foto zur Veranstaltung"
        : "ein Bild des Veranstalters";
  return [
    "Du bist ein professioneller Grafikdesigner. Gestalte ein Veranstaltungsplakat im DIN-A-Hochformat für eine Veranstaltung in Röbel/Müritz.",
    options.hasReference
      ? `Das Eingabebild ist ${referenceWhat}: binde es originalgetreu ein (nicht verändern, nicht neu zeichnen), gut sichtbar, aber nicht als verzerrter Hintergrund.`
      : "Es gibt kein Referenzbild: gestalte ein passendes grafisches Motiv ohne eigenen Text.",
    "Inhalt (exakt so, deutsch, keine weiteren Fakten erfinden):",
    ...lines.map((l) => `- ${l}`),
    extras.length ? "Optional als Unterzeile oder kleine Highlights:" : "",
    ...extras.map((l) => `- ${l}`),
    "Hierarchie: Titel am größten, dann Datum und Uhrzeit, dann Ort; Preis und Veranstalter klein.",
    `Stilrichtung „${direction.label}“: ${direction.brief}`,
    options.hint?.trim() ? `Zusätzlicher Hinweis: ${options.hint.trim()}` : "",
    POSTER_GUARD,
    DESIGN_GUARD,
  ]
    .filter(Boolean)
    .join("\n");
}
```

`apps/web/src/lib/poster/copy.ts`:

```ts
// Optional LLM copy for designed posters: one subline + up to three short
// highlights, drafted from the description. Never facts (those come from
// content.ts). Schema is strings only (@ai-sdk/anthropic rejects numeric bounds).
import { z } from "zod";
import { contentLines } from "./content";
import type { PosterContent, PosterCopy, PosterEventInput } from "./types";

export const posterCopySchema = z.object({
  subline: z
    .string()
    .describe("Eine kurze Unterzeile (max. ~10 Wörter), die Lust auf die Veranstaltung macht. Leer, wenn nichts Sinnvolles."),
  highlights: z
    .array(z.string())
    .describe("0 bis 3 kurze Stichpunkte (je max. ~5 Wörter) aus der Beschreibung, z. B. „Livemusik“ oder „Kaffee und Kuchen“."),
});

export const POSTER_COPY_SYSTEM = `Du bist Meckys Grafik-Texter für die Stadt Röbel/Müritz.
Du lieferst nur ergänzenden Kurztext für ein Veranstaltungsplakat.
Regeln:
- Sprache: Deutsch, klar, einladend, nie werblich-übertrieben.
- Erfinde KEINE Fakten (Datum, Uhrzeit, Ort, Preis, Namen). Diese stehen bereits fest und dürfen nicht wiederholt werden.
- Keine Emojis, keine Ausrufezeichen-Ketten.
- Gib die Felder exakt gemäß Schema zurück.`;

const SUBLINE_MAX = 80;
const HIGHLIGHT_MAX = 40;
const HIGHLIGHTS_MAX = 3;

export function buildPosterCopyPrompt(event: PosterEventInput, content: PosterContent): string {
  const fixed = contentLines(content).map((l) => `- ${l}`).join("\n");
  const description = (event.description ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return [
    "Feststehende Zeilen auf dem Plakat (nicht wiederholen):",
    fixed,
    "",
    description ? `Beschreibung der Veranstaltung:\n${description}` : "Es gibt keine Beschreibung.",
    "",
    "Schreibe eine passende Unterzeile und bis zu drei Highlights.",
  ].join("\n");
}

export function normalizePosterCopy(
  raw: Partial<PosterCopy> | null | undefined,
  content: PosterContent,
): PosterCopy {
  const fixed = new Set(contentLines(content).map((l) => l.toLowerCase()));
  const clean = (s: unknown, max: number) =>
    String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const seen = new Set<string>();
  const highlights: string[] = [];
  for (const h of Array.isArray(raw?.highlights) ? raw.highlights : []) {
    const v = clean(h, HIGHLIGHT_MAX);
    const key = v.toLowerCase();
    if (!v || seen.has(key) || fixed.has(key)) continue;
    seen.add(key);
    highlights.push(v);
    if (highlights.length >= HIGHLIGHTS_MAX) break;
  }
  const subline = clean(raw?.subline, SUBLINE_MAX);
  return { subline: fixed.has(subline.toLowerCase()) ? "" : subline, highlights };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-prompts.test.ts`
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/poster/prompts.ts apps/web/src/lib/poster/copy.ts apps/web/tests/poster-prompts.test.ts
git commit -m "feat(web): poster proposals — reformat/design prompts and copy schema"
git push
```

---

### Task 6: migration (table, event columns, settings)

**Files:**
- Create: `supabase/migrations/20260922_event_poster_proposals.sql`

**Interfaces:**
- Produces: table `public.event_poster_proposals`, columns `events.original_image_url`, `events.poster_proposal_id`, `events.poster_reviewed_at`, `events.poster_checked_at`, `events.poster_check`; settings rows `poster_proposals_enabled='true'`, `poster_daily_budget_usd='20'`.

- [ ] **Step 1: Write the migration**

```sql
-- Event poster proposals (Plakat-Vorschläge): two AI-proposed DIN-A posters per
-- event, reviewed in the admin dashboard or picked in the submission chats.
-- Spec: docs/superpowers/specs/2026-09-22-event-poster-proposals-design.md
-- Written only through the service role (no RLS policies on purpose).

create table if not exists public.event_poster_proposals (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null,
  event_id         uuid references public.events(id) on delete cascade,
  draft_id         uuid,
  account_id       uuid references public.accounts(id) on delete set null,
  requested_by     text not null check (requested_by in ('admin','org','submitter')),
  mode             text not null check (mode in ('reformat','design')),
  variant          smallint not null check (variant in (1,2)),
  direction        text not null,
  source_image_url text,
  image_url        text not null,
  analysis         jsonb not null default '{}'::jsonb,
  prompt           text not null,
  model            text not null,
  usage            jsonb,
  cost_usd         numeric(8,4),
  status           text not null default 'proposed' check (status in ('proposed','selected','rejected')),
  created_at       timestamptz not null default now(),
  check (event_id is not null or draft_id is not null)
);

create index if not exists idx_event_poster_proposals_event
  on public.event_poster_proposals (event_id, created_at desc);
create index if not exists idx_event_poster_proposals_draft
  on public.event_poster_proposals (draft_id) where draft_id is not null;
create index if not exists idx_event_poster_proposals_batch
  on public.event_poster_proposals (batch_id);
create index if not exists idx_event_poster_proposals_created
  on public.event_poster_proposals (created_at desc);

alter table public.event_poster_proposals enable row level security;
revoke all on public.event_poster_proposals from anon, authenticated;

alter table public.events
  add column if not exists original_image_url text,
  add column if not exists poster_proposal_id uuid references public.event_poster_proposals(id) on delete set null,
  add column if not exists poster_reviewed_at timestamptz,
  add column if not exists poster_checked_at timestamptz,
  add column if not exists poster_check jsonb;

comment on column public.events.original_image_url is 'Image before a poster proposal was applied (set once).';
comment on column public.events.poster_check is 'Last poster analysis: {checkedAt,width,height,ratio,mode,analysis}.';

insert into public.app_settings (key, value)
values ('poster_proposals_enabled', 'true'), ('poster_daily_budget_usd', '20')
on conflict (key) do nothing;
```

- [ ] **Step 2: Apply it** with the Supabase MCP (`apply_migration`, name `event_poster_proposals`, project `wwbeqhkslxdxhktqzqti`; first confirm `get_project_url` returns that project). Then verify:

Run via MCP `execute_sql`: `select column_name from information_schema.columns where table_name='event_poster_proposals' order by ordinal_position;` and `select key, value from app_settings where key like 'poster_%';`
Expected: 18 columns; two settings rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260922_event_poster_proposals.sql
git commit -m "feat(db): event_poster_proposals table, poster columns on events, poster settings"
git push
```

---

### Task 7: image fetch + dimensions, Claude vision, OpenAI renderer

**Files:**
- Create: `apps/web/src/lib/poster/analyze.ts`, `apps/web/src/lib/poster/ai.ts`, `apps/web/src/lib/poster/openai-image.ts`
- Modify: `apps/web/package.json` (add `image-size`)

**Interfaces:**
- Consumes: guard, constants, cost, copy, types.
- Produces: `fetchSourceImage(url): Promise<FetchedImage | null>` with `FetchedImage = { bytes: Uint8Array; contentType: string; width: number; height: number }`; `classifyImage(img: FetchedImage): Promise<PosterAnalysis>`; `draftPosterCopy(event, content): Promise<PosterCopy>`; `renderPoster(input: RenderPosterInput): Promise<RenderedPoster>`; `class PosterRenderError`.

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && pnpm add image-size@^2.0.2`
Expected: `image-size` in `dependencies`. Verify import shape: `node -e "import('image-size').then(m=>console.log(typeof m.imageSize))"` → `function`.

- [ ] **Step 2: Write `analyze.ts`**

```ts
// Server: fetch the event image through the SSRF guard and read its pixel size.
import { imageSize } from "image-size";
import { MAX_REFERENCE_BYTES } from "./constants";
import { isAllowedReferenceUrl } from "./reference-guard";

export interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
}

const FETCH_TIMEOUT_MS = 20_000;

/** null when the URL is not ours, unreachable, not an image, too large or unreadable. */
export async function fetchSourceImage(url: string | null | undefined): Promise<FetchedImage | null> {
  const trimmed = url?.trim();
  if (!trimmed || !isAllowedReferenceUrl(trimmed, process.env.NEXT_PUBLIC_SUPABASE_URL)) return null;
  try {
    const res = await fetch(trimmed, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_REFERENCE_BYTES) return null;
    const dims = imageSize(buf);
    if (!dims.width || !dims.height) return null;
    return { bytes: buf, contentType, width: dims.width, height: dims.height };
  } catch (error) {
    console.warn("fetchSourceImage failed", error);
    return null;
  }
}
```

- [ ] **Step 3: Write `ai.ts`**

```ts
// Server: the two Claude calls of the poster pipeline (vision classification
// and optional copy). Model id follows the repo convention (claude-sonnet-4-6).
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { LOW_RES_MIN_SIDE } from "./constants";
import { buildPosterCopyPrompt, normalizePosterCopy, posterCopySchema, POSTER_COPY_SYSTEM } from "./copy";
import type { FetchedImage } from "./analyze";
import type { PosterAnalysis, PosterContent, PosterCopy, PosterEventInput } from "./types";

const MODEL = "claude-sonnet-4-6";

export const posterAnalysisSchema = z.object({
  kind: z.enum(["poster", "photo", "logo", "graphic", "screenshot"]),
  hasEventInfo: z.boolean().describe("true wenn Titel UND (Datum oder Uhrzeit) der Veranstaltung im Bild lesbar sind"),
  visibleText: z.array(z.string()).describe("Alle lesbaren Textzeilen wörtlich, in Leserichtung, ohne App-Oberfläche"),
  hasUiChrome: z.boolean().describe("true wenn Handy-/App-Oberfläche, PDF-Reader-Leisten, Browser-Rahmen oder Seitenzahlen sichtbar sind"),
  brandColors: z.array(z.string()).describe("2 bis 4 dominante Farben als Hex"),
  styleNotes: z.string().describe("Ein Satz zu Stil und Motiv"),
  quality: z.enum(["ok", "low_res", "blurry"]),
});

const ANALYSIS_PROMPT = `Analysiere dieses Veranstaltungsbild aus einer Stadt-App.
- kind: "poster" = gestaltetes Plakat/Flyer mit Text; "screenshot" = Bildschirmfoto, in dem ein Plakat steckt; "logo" = Wappen/Logo; "photo" = Foto ohne Gestaltung; "graphic" = Grafik/Illustration ohne Veranstaltungstext.
- visibleText: jede Textzeile wörtlich (Umlaute, Groß-/Kleinschreibung, Zahlen exakt), ohne Bedienelemente.
Antworte exakt gemäß Schema.`;

export async function classifyImage(img: FetchedImage): Promise<PosterAnalysis> {
  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: posterAnalysisSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: img.bytes, mediaType: img.contentType },
          { type: "text", text: `${ANALYSIS_PROMPT}\nBildgröße: ${img.width} × ${img.height} Pixel.` },
        ],
      },
    ],
  });
  const lowRes = Math.min(img.width, img.height) < LOW_RES_MIN_SIDE;
  return {
    ...object,
    visibleText: object.visibleText.map((t) => t.trim()).filter(Boolean).slice(0, 40),
    brandColors: object.brandColors.slice(0, 4),
    quality: lowRes && object.quality === "ok" ? "low_res" : object.quality,
  };
}

/** Never throws: an LLM hiccup must not block a poster. */
export async function draftPosterCopy(event: PosterEventInput, content: PosterContent): Promise<PosterCopy> {
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: posterCopySchema,
      system: POSTER_COPY_SYSTEM,
      prompt: buildPosterCopyPrompt(event, content),
    });
    return normalizePosterCopy(object, content);
  } catch (error) {
    console.warn("draftPosterCopy failed, continuing without copy", error);
    return { subline: "", highlights: [] };
  }
}
```

- [ ] **Step 4: Write `openai-image.ts`**

```ts
// Server: render one poster with the OpenAI Images API (gpt-image-2.5).
// References go as multipart bytes to /images/edits; without references we
// call /images/generations. Not imported by client code (no "server-only" so
// the CLI batch script can use it).
import {
  DEFAULT_POSTER_MODEL,
  DEFAULT_POSTER_QUALITY,
  OPENAI_IMAGES_BASE,
  POSTER_RENDER_SIZE,
} from "./constants";
import { estimateCostUsd, type ImageUsage } from "./cost";

export interface RenderPosterInput {
  prompt: string;
  references?: Array<{ bytes: Uint8Array; contentType: string }>;
  size?: string;
  quality?: string;
  model?: string;
}

export interface RenderedPoster {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  usage: ImageUsage | null;
  costUsd: number;
  model: string;
}

export class PosterRenderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "PosterRenderError";
  }
}

const TIMEOUT_MS = 170_000;
const RETRY_DELAY_MS = 3_000;

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

async function callOnce(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

export async function renderPoster(input: RenderPosterInput): Promise<RenderedPoster> {
  if (typeof window !== "undefined") throw new PosterRenderError("renderPoster is server-only");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new PosterRenderError("OPENAI_API_KEY fehlt");
  const model = input.model || process.env.POSTER_IMAGE_MODEL || DEFAULT_POSTER_MODEL;
  const size = input.size || POSTER_RENDER_SIZE;
  const quality = input.quality || DEFAULT_POSTER_QUALITY;
  const refs = input.references ?? [];

  const buildRequest = (): { url: string; init: RequestInit } => {
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (refs.length > 0) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", input.prompt);
      form.set("size", size);
      form.set("quality", quality);
      form.set("output_format", "jpeg");
      form.set("output_compression", "92");
      form.set("n", "1");
      refs.forEach((ref, i) => {
        form.append(
          "image[]",
          new Blob([ref.bytes], { type: ref.contentType }),
          `reference-${i + 1}.${extensionFor(ref.contentType)}`,
        );
      });
      return { url: `${OPENAI_IMAGES_BASE}/edits`, init: { method: "POST", headers, body: form } };
    }
    return {
      url: `${OPENAI_IMAGES_BASE}/generations`,
      init: {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: input.prompt,
          size,
          quality,
          output_format: "jpeg",
          output_compression: 92,
          n: 1,
        }),
      },
    };
  };

  let res: Response;
  const first = buildRequest();
  res = await callOnce(first.url, first.init);
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const second = buildRequest();
    res = await callOnce(second.url, second.init);
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: Array<{ b64_json?: string }>; usage?: ImageUsage; error?: { message?: string } }
    | null;
  if (!res.ok || !json?.data?.[0]?.b64_json) {
    const message = json?.error?.message || `OpenAI Images API ${res.status}`;
    throw new PosterRenderError(message, res.status);
  }
  const bytes = new Uint8Array(Buffer.from(json.data[0].b64_json, "base64"));
  const usage = json.usage ?? null;
  return { bytes, contentType: "image/jpeg", usage, costUsd: estimateCostUsd(usage), model };
}
```

- [ ] **Step 5: Type check the three files**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/poster/"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json ../../pnpm-lock.yaml apps/web/src/lib/poster/analyze.ts apps/web/src/lib/poster/ai.ts apps/web/src/lib/poster/openai-image.ts
git commit -m "feat(web): poster proposals — image fetch, Claude vision analysis, OpenAI gpt-image-2.5 renderer"
git push
```

(Run the `git add` from the repo root with the correct relative paths: `apps/web/package.json pnpm-lock.yaml ...`.)

---

### Task 8: the service

**Files:**
- Create: `apps/web/src/lib/poster/service.ts`

**Interfaces:**
- Consumes: everything above, `createAdminClient` (`@/lib/supabase/admin`), `markSyntheticImage` (`@/lib/images/ai-marking`).
- Produces:
  - `proposePosters(input: ProposeInput, ctx: ProposeContext): Promise<ProposeResult>` with `ProposeInput = { kind: "event"; eventId: string } | { kind: "draft"; draftId: string; draft: PosterEventInput }` and `ProposeContext = { requestedBy: PosterRequester; accountId?: string | null; hint?: string | null; force?: boolean }`.
  - `selectProposal(proposalId: string, apply: boolean): Promise<{ ok: true; eventId: string | null; imageUrl: string } | { ok: false; error: string }>`
  - `keepOriginal(eventId: string): Promise<{ ok: boolean; error?: string }>`
  - `linkDraftProposals(draftId: string, eventId: string): Promise<{ ok: boolean; linked: number }>`
  - `getPosterSettings(): Promise<{ enabled: boolean; budgetLimitUsd: number; model: string | null }>`, `spentTodayUsd(): Promise<number>`
  - `class PosterServiceError extends Error { code: "caps" | "not_found" | "render" | "upload" }`

- [ ] **Step 1: Write `service.ts`**

```ts
// Server: the poster proposal pipeline. Reads/writes only through the admin
// client (event_poster_proposals has no RLS policies on purpose).
import { createAdminClient } from "@/lib/supabase/admin";
import { markSyntheticImage } from "@/lib/images/ai-marking";
import { fetchSourceImage, type FetchedImage } from "./analyze";
import { classifyImage, draftPosterCopy } from "./ai";
import { evaluateCaps } from "./caps";
import {
  DEFAULT_DAILY_BUDGET_USD,
  POSTER_STORAGE_BUCKET,
  POSTER_STORAGE_FOLDER,
  SETTING_BUDGET,
  SETTING_ENABLED,
  SETTING_MODEL,
  posterGeneratorLabel,
} from "./constants";
import { buildPosterContent } from "./content";
import { decideMode } from "./decide";
import { pickDirections } from "./directions";
import { renderPoster, type RenderedPoster } from "./openai-image";
import { buildDesignPrompt, buildReformatPrompt } from "./prompts";
import { classifyRatio, type RatioClass } from "./ratio";
import type {
  PosterAnalysis,
  PosterCheck,
  PosterCopy,
  PosterEventInput,
  PosterMode,
  PosterProposal,
  PosterRequester,
  ProposeResult,
} from "./types";

export type ProposeInput =
  | { kind: "event"; eventId: string }
  | { kind: "draft"; draftId: string; draft: PosterEventInput };

export interface ProposeContext {
  requestedBy: PosterRequester;
  accountId?: string | null;
  hint?: string | null;
  /** Generate even when the analysis says the current image is fine. */
  force?: boolean;
}

export class PosterServiceError extends Error {
  constructor(message: string, public code: "caps" | "not_found" | "render" | "upload") {
    super(message);
    this.name = "PosterServiceError";
  }
}

type Admin = ReturnType<typeof createAdminClient>;

const EVENT_COLUMNS =
  "id, title, date, time, end_time, location, category, ticket_price, organizer_name, description, website_url, image_url, account_id";

export async function getPosterSettings(admin: Admin = createAdminClient()) {
  const { data } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", [SETTING_ENABLED, SETTING_BUDGET, SETTING_MODEL]);
  const map = new Map((data ?? []).map((r: { key: string; value: string | null }) => [r.key, r.value]));
  const budget = Number(map.get(SETTING_BUDGET));
  return {
    enabled: map.get(SETTING_ENABLED) !== "false",
    budgetLimitUsd: Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_DAILY_BUDGET_USD,
    model: map.get(SETTING_MODEL)?.trim() || null,
  };
}

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function spentTodayUsd(admin: Admin = createAdminClient()): Promise<number> {
  const { data } = await admin
    .from("event_poster_proposals")
    .select("cost_usd")
    .gte("created_at", startOfUtcDay());
  return (data ?? []).reduce((sum: number, r: { cost_usd: number | null }) => sum + Number(r.cost_usd ?? 0), 0);
}

async function countBatches(admin: Admin, column: "draft_id" | "account_id", value: string, todayOnly: boolean) {
  let q = admin.from("event_poster_proposals").select("batch_id").eq(column, value);
  if (todayOnly) q = q.gte("created_at", startOfUtcDay());
  const { data } = await q;
  return new Set((data ?? []).map((r: { batch_id: string }) => r.batch_id)).size;
}

async function loadEvent(admin: Admin, eventId: string) {
  const { data, error } = await admin.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
  if (error || !data) throw new PosterServiceError("Veranstaltung nicht gefunden", "not_found");
  return data as PosterEventInput & { id: string; account_id: string | null };
}

async function uploadPoster(admin: Admin, scope: string, rendered: RenderedPoster): Promise<string> {
  const marked = markSyntheticImage(rendered.bytes, posterGeneratorLabel(rendered.model));
  const path = `${POSTER_STORAGE_FOLDER}/${scope}/${crypto.randomUUID()}.jpg`;
  const { error } = await admin.storage
    .from(POSTER_STORAGE_BUCKET)
    .upload(path, Buffer.from(marked.bytes), { contentType: "image/jpeg", upsert: false });
  if (error) throw new PosterServiceError(`Upload fehlgeschlagen: ${error.message}`, "upload");
  return admin.storage.from(POSTER_STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function referenceKind(analysis: PosterAnalysis | null): string | null {
  if (!analysis) return null;
  if (analysis.kind === "logo") return "logo";
  if (analysis.kind === "photo") return "photo";
  return "image";
}

async function analyze(imageUrl: string | null | undefined): Promise<{
  image: FetchedImage | null;
  ratio: RatioClass | null;
  analysis: PosterAnalysis | null;
}> {
  const image = await fetchSourceImage(imageUrl);
  if (!image) return { image: null, ratio: null, analysis: null };
  const ratio = classifyRatio(image.width, image.height);
  const analysis = await classifyImage(image);
  return { image, ratio, analysis };
}

async function renderWithRetry(prompt: string, image: FetchedImage | null, model: string | null) {
  const input = {
    prompt,
    references: image ? [{ bytes: image.bytes, contentType: image.contentType }] : [],
    model: model ?? undefined,
  };
  try {
    return await renderPoster(input);
  } catch (first) {
    console.warn("renderPoster failed once, retrying", first);
    return renderPoster(input);
  }
}

export async function proposePosters(input: ProposeInput, ctx: ProposeContext): Promise<ProposeResult> {
  const admin = createAdminClient();
  const settings = await getPosterSettings(admin);

  const event =
    input.kind === "event" ? await loadEvent(admin, input.eventId) : { ...input.draft, id: null, account_id: ctx.accountId ?? null };
  const eventId = input.kind === "event" ? input.eventId : null;
  const draftId = input.kind === "draft" ? input.draftId : null;
  const accountId = ctx.accountId ?? event.account_id ?? null;

  const caps = evaluateCaps({
    requestedBy: ctx.requestedBy,
    enabled: settings.enabled,
    budgetLimitUsd: settings.budgetLimitUsd,
    budgetSpentTodayUsd: await spentTodayUsd(admin),
    batchesForDraft: draftId ? await countBatches(admin, "draft_id", draftId, false) : 0,
    batchesForAccountToday: accountId ? await countBatches(admin, "account_id", accountId, true) : 0,
  });
  if (!caps.ok) throw new PosterServiceError(caps.message, "caps");

  const { image, ratio, analysis } = await analyze(event.image_url);
  const decided = decideMode(ratio, analysis);
  const check: PosterCheck | null = image
    ? { checkedAt: new Date().toISOString(), width: image.width, height: image.height, ratio, mode: decided, analysis }
    : { checkedAt: new Date().toISOString(), width: null, height: null, ratio: null, mode: decided, analysis: null };

  if (eventId) {
    await admin
      .from("events")
      .update({ poster_checked_at: check.checkedAt, poster_check: check })
      .eq("id", eventId);
  }

  if (decided === "skip" && !ctx.force) return { skipped: "ratio_ok_poster", check };
  const mode: PosterMode = decided === "skip" ? "reformat" : decided;
  if (mode === "design" && !(event.title ?? "").trim()) return { skipped: "nothing_to_design", check };

  const content = buildPosterContent(event);
  const copy: PosterCopy | null = mode === "design" ? await draftPosterCopy(event, content) : null;
  const directions = pickDirections(mode, event.category);
  const prompts = directions.map((direction) =>
    mode === "reformat" && analysis
      ? buildReformatPrompt(analysis, direction, ctx.hint)
      : buildDesignPrompt(content, copy, direction, {
          hasReference: !!image,
          referenceKind: referenceKind(analysis),
          hint: ctx.hint,
        }),
  );

  const rendered = await Promise.all(prompts.map((p) => renderWithRetry(p, image, settings.model)));

  const batchId = crypto.randomUUID();
  const scope = eventId ?? `draft/${draftId}`;
  const rows = [];
  for (let i = 0; i < rendered.length; i++) {
    const imageUrl = await uploadPoster(admin, scope, rendered[i]);
    rows.push({
      batch_id: batchId,
      event_id: eventId,
      draft_id: draftId,
      account_id: accountId,
      requested_by: ctx.requestedBy,
      mode,
      variant: i + 1,
      direction: directions[i].id,
      source_image_url: event.image_url ?? null,
      image_url: imageUrl,
      analysis: analysis ?? {},
      prompt: prompts[i],
      model: rendered[i].model,
      usage: rendered[i].usage,
      cost_usd: rendered[i].costUsd,
      status: "proposed",
    });
  }
  const { data, error } = await admin.from("event_poster_proposals").insert(rows).select("*");
  if (error || !data) throw new PosterServiceError(`Speichern fehlgeschlagen: ${error?.message}`, "upload");
  const proposals = (data as PosterProposal[]).sort((a, b) => a.variant - b.variant);
  return { batchId, mode, check, proposals, costUsd: rendered.reduce((s, r) => s + r.costUsd, 0) };
}

export async function selectProposal(proposalId: string, apply: boolean) {
  const admin = createAdminClient();
  const { data: p } = await admin.from("event_poster_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (!p) return { ok: false as const, error: "Vorschlag nicht gefunden" };
  const proposal = p as PosterProposal;
  await admin.from("event_poster_proposals").update({ status: "rejected" }).eq("batch_id", proposal.batch_id).neq("id", proposalId);
  await admin.from("event_poster_proposals").update({ status: "selected" }).eq("id", proposalId);
  if (apply && proposal.event_id) {
    const { data: ev } = await admin.from("events").select("image_url, original_image_url").eq("id", proposal.event_id).maybeSingle();
    const now = new Date().toISOString();
    const { error } = await admin
      .from("events")
      .update({
        image_url: proposal.image_url,
        original_image_url: ev?.original_image_url ?? ev?.image_url ?? null,
        poster_proposal_id: proposal.id,
        poster_reviewed_at: now,
        updated_at: now,
      })
      .eq("id", proposal.event_id);
    if (error) return { ok: false as const, error: error.message };
  }
  return { ok: true as const, eventId: proposal.event_id, imageUrl: proposal.image_url };
}

export async function keepOriginal(eventId: string) {
  const admin = createAdminClient();
  await admin.from("event_poster_proposals").update({ status: "rejected" }).eq("event_id", eventId).eq("status", "proposed");
  const { error } = await admin
    .from("events")
    .update({ poster_reviewed_at: new Date().toISOString() })
    .eq("id", eventId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function linkDraftProposals(draftId: string, eventId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_poster_proposals")
    .update({ event_id: eventId })
    .eq("draft_id", draftId)
    .is("event_id", null)
    .select("id, image_url, status");
  if (error) return { ok: false, linked: 0 };
  const selected = (data ?? []).find((r: { status: string }) => r.status === "selected") as { id: string } | undefined;
  if (selected) {
    await admin
      .from("events")
      .update({ poster_proposal_id: selected.id, poster_reviewed_at: new Date().toISOString() })
      .eq("id", eventId);
  }
  return { ok: true, linked: data?.length ?? 0 };
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/poster/"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/poster/service.ts
git commit -m "feat(web): poster proposals — proposePosters service, select/keep/link"
git push
```

---

### Task 9: admin server actions

**Files:**
- Create: `apps/web/src/app/actions/poster-proposals.ts`

**Interfaces:**
- Consumes: service (Task 8), `isAuthenticated` (`@/lib/auth/session`), `createAdminClient`.
- Produces (all `"use server"`, admin-gated, return `{ success: false, error }` when not admin):
  - `listPosterOverviewAction(): Promise<{ success: true; events: PosterOverviewEvent[]; spentTodayUsd: number; budgetLimitUsd: number; enabled: boolean } | { success: false; error: string }>`
  - `interface PosterOverviewEvent { id; title; date; status; image_url; poster_reviewed_at; poster_proposal_id; original_image_url; poster_check: PosterCheck | null; openBatch: boolean }`
  - `proposeForEventAction(eventId: string, opts?: { hint?: string; force?: boolean }): Promise<{ success: true; result: ProposeResult } | { success: false; error: string }>`
  - `getPosterReviewAction(eventId: string): Promise<{ success: true; event: PosterReviewEvent; proposals: PosterProposal[] } | { success: false; error: string }>` with `PosterReviewEvent = PosterOverviewEvent & { location; time; organizer_name; category }`
  - `selectPosterAction(proposalId: string): Promise<{ success: boolean; error?: string }>`
  - `keepOriginalAction(eventId: string): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Write the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPosterSettings,
  keepOriginal,
  proposePosters,
  PosterServiceError,
  selectProposal,
  spentTodayUsd,
} from "@/lib/poster/service";
import type { PosterCheck, PosterProposal, ProposeResult } from "@/lib/poster/types";

export interface PosterOverviewEvent {
  id: string;
  title: string;
  date: string;
  status: string;
  image_url: string | null;
  poster_reviewed_at: string | null;
  poster_proposal_id: string | null;
  original_image_url: string | null;
  poster_check: PosterCheck | null;
  openBatch: boolean;
}

export interface PosterReviewEvent extends PosterOverviewEvent {
  location: string | null;
  time: string | null;
  organizer_name: string | null;
  category: string | null;
}

const OVERVIEW_COLUMNS =
  "id, title, date, status, image_url, poster_reviewed_at, poster_proposal_id, original_image_url, poster_check";

async function guard(): Promise<string | null> {
  return (await isAuthenticated()) ? null : "Nicht angemeldet";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listPosterOverviewAction() {
  const denied = await guard();
  if (denied) return { success: false as const, error: denied };
  const admin = createAdminClient();
  const [{ data: events, error }, { data: open }, settings, spent] = await Promise.all([
    admin
      .from("events")
      .select(OVERVIEW_COLUMNS)
      .gte("date", today())
      .in("status", ["approved", "pending"])
      .order("date", { ascending: true }),
    admin.from("event_poster_proposals").select("event_id").eq("status", "proposed").not("event_id", "is", null),
    getPosterSettings(admin),
    spentTodayUsd(admin),
  ]);
  if (error) return { success: false as const, error: error.message };
  const openIds = new Set((open ?? []).map((r: { event_id: string }) => r.event_id));
  const list: PosterOverviewEvent[] = (events ?? []).map((e: Omit<PosterOverviewEvent, "openBatch">) => ({
    ...e,
    openBatch: openIds.has(e.id),
  }));
  return {
    success: true as const,
    events: list,
    spentTodayUsd: spent,
    budgetLimitUsd: settings.budgetLimitUsd,
    enabled: settings.enabled,
  };
}

export async function proposeForEventAction(eventId: string, opts?: { hint?: string; force?: boolean }) {
  const denied = await guard();
  if (denied) return { success: false as const, error: denied };
  try {
    const result: ProposeResult = await proposePosters(
      { kind: "event", eventId },
      { requestedBy: "admin", hint: opts?.hint ?? null, force: opts?.force ?? false },
    );
    revalidatePath("/admin/dashboard/events/poster");
    revalidatePath(`/admin/dashboard/events/poster/${eventId}`);
    return { success: true as const, result };
  } catch (error) {
    console.error("proposeForEventAction failed", error);
    const message =
      error instanceof PosterServiceError ? error.message : "Vorschläge konnten nicht erzeugt werden.";
    return { success: false as const, error: message };
  }
}

export async function getPosterReviewAction(eventId: string) {
  const denied = await guard();
  if (denied) return { success: false as const, error: denied };
  const admin = createAdminClient();
  const [{ data: event, error }, { data: proposals }] = await Promise.all([
    admin
      .from("events")
      .select(`${OVERVIEW_COLUMNS}, location, time, organizer_name, category`)
      .eq("id", eventId)
      .maybeSingle(),
    admin
      .from("event_poster_proposals")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .order("variant", { ascending: true }),
  ]);
  if (error || !event) return { success: false as const, error: "Veranstaltung nicht gefunden" };
  const list = (proposals ?? []) as PosterProposal[];
  return {
    success: true as const,
    event: { ...(event as Omit<PosterReviewEvent, "openBatch">), openBatch: list.some((p) => p.status === "proposed") },
    proposals: list,
  };
}

export async function selectPosterAction(proposalId: string) {
  const denied = await guard();
  if (denied) return { success: false, error: denied };
  const res = await selectProposal(proposalId, true);
  if (!res.ok) return { success: false, error: res.error };
  revalidatePath("/admin/dashboard/events");
  revalidatePath("/admin/dashboard/events/poster");
  if (res.eventId) revalidatePath(`/admin/dashboard/events/poster/${res.eventId}`);
  return { success: true };
}

export async function keepOriginalAction(eventId: string) {
  const denied = await guard();
  if (denied) return { success: false, error: denied };
  const res = await keepOriginal(eventId);
  revalidatePath("/admin/dashboard/events/poster");
  revalidatePath(`/admin/dashboard/events/poster/${eventId}`);
  return res.ok ? { success: true } : { success: false, error: res.error };
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/(lib/poster|app/actions/poster-proposals)"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/actions/poster-proposals.ts
git commit -m "feat(web): poster proposals — admin server actions"
git push
```

---

### Task 10: shared components (A-frame, lightbox, proposal pair)

**Files:**
- Create: `apps/web/src/components/poster/AFrame.tsx`, `apps/web/src/components/poster/PosterLightbox.tsx`, `apps/web/src/components/poster/PosterProposalPair.tsx`

**Interfaces:**
- Consumes: `Dialog*` from `@/components/ui/dialog`, `Button`, `Badge`, `downloadImage` + `slugForFile` from `@/lib/flyer/ui`, `PosterProposal`, `RATIO_LABELS`/`classifyRatio`.
- Produces:
  - `<AFrame src alt fit?="cover"|"contain" className? onClick? badge?: ReactNode />`
  - `<PosterLightbox images: {url,label}[] index: number|null onClose onIndexChange />`
  - `<PosterProposalPair proposals: PosterProposal[] fileBase: string selectedId?: string|null busy?: boolean onSelect(p: PosterProposal) onKeepOriginal?() onRegenerate?(hint: string) selectLabel?: string />` and exported `DIRECTION_LABELS: Record<string,string>`.

- [ ] **Step 1: Write `AFrame.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";

/** DIN A portrait box (210:297) exactly like the Expo poster card; cover shows the crop the app does. */
export function AFrame({
  src,
  alt,
  fit = "cover",
  className = "",
  onClick,
  badge,
}: {
  src: string | null;
  alt: string;
  fit?: "cover" | "contain";
  className?: string;
  onClick?: () => void;
  badge?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[8px] border border-border bg-muted aspect-[210/297] ${onClick ? "cursor-zoom-in" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {src ? (
        <img src={src} alt={alt} className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Kein Bild</div>
      )}
      {badge ? <div className="absolute left-2 top-2">{badge}</div> : null}
    </div>
  );
}
```

- [ ] **Step 2: Write `PosterLightbox.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface LightboxImage {
  url: string;
  label: string;
}

export function PosterLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? images[index as number] : null;
  const prev = () => open && onIndexChange(((index as number) - 1 + images.length) % images.length);
  const next = () => open && onIndexChange(((index as number) + 1) % images.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(96vw,900px)] p-2 sm:p-3">
        <DialogTitle className="sr-only">{current?.label ?? "Großansicht"}</DialogTitle>
        {current ? (
          <div className="flex flex-col gap-2">
            <img src={current.url} alt={current.label} className="mx-auto max-h-[85vh] w-auto max-w-full rounded-[6px] object-contain" />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" onClick={prev} disabled={images.length < 2} aria-label="Vorheriges Bild">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>{current.label}{images.length > 1 ? ` · ${(index as number) + 1} von ${images.length}` : ""}</span>
              <Button variant="ghost" size="sm" onClick={next} disabled={images.length < 2} aria-label="Nächstes Bild">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `PosterProposalPair.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Download, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { downloadImage, slugForFile } from "@/lib/flyer/ui";
import type { PosterProposal } from "@/lib/poster/types";
import { AFrame } from "./AFrame";
import { PosterLightbox } from "./PosterLightbox";

export const DIRECTION_LABELS: Record<string, string> = {
  plakativ: "Plakativ",
  originaltreu: "Originaltreu",
  aufgefrischt: "Aufgefrischt",
  editorial: "Editorial",
  konzert: "Konzertplakat",
  verspielt: "Verspielt",
  ruhig: "Ruhig",
  amtlich: "Amtlich",
  appetitlich: "Appetitlich",
  galerie: "Galerie",
  festlich: "Festlich",
};

const VARIANT_LETTER = ["A", "B"];

export function PosterProposalPair({
  proposals,
  fileBase,
  selectedId,
  busy,
  onSelect,
  onKeepOriginal,
  onRegenerate,
  selectLabel = "Übernehmen",
}: {
  proposals: PosterProposal[];
  fileBase: string;
  selectedId?: string | null;
  busy?: boolean;
  onSelect: (p: PosterProposal) => void;
  onKeepOriginal?: () => void;
  onRegenerate?: (hint: string) => void;
  selectLabel?: string;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [hint, setHint] = useState("");
  const [showHint, setShowHint] = useState(false);
  const sorted = [...proposals].sort((a, b) => a.variant - b.variant);
  const images = sorted.map((p, i) => ({
    url: p.image_url,
    label: `Variante ${VARIANT_LETTER[i] ?? i + 1} · ${DIRECTION_LABELS[p.direction] ?? p.direction}`,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sorted.map((p, i) => {
          const label = images[i].label;
          const isSelected = selectedId === p.id || p.status === "selected";
          return (
            <div key={p.id} className="space-y-2">
              <AFrame
                src={p.image_url}
                alt={label}
                fit="cover"
                onClick={() => setLightbox(i)}
                className={isSelected ? "ring-2 ring-primary" : ""}
                badge={<Badge variant="secondary" className="text-[11px]">KI-generiert</Badge>}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {isSelected ? (
                  <span className="inline-flex items-center gap-1 text-xs text-primary"><Check className="h-3.5 w-3.5" /> gewählt</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy || isSelected} onClick={() => onSelect(p)}>
                  {selectLabel}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadImage(p.image_url, `${slugForFile(fileBase)}-plakat-${VARIANT_LETTER[i] ?? i + 1}.jpg`)}
                >
                  <Download className="mr-1 h-4 w-4" /> Herunterladen
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {onKeepOriginal || onRegenerate ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            {onRegenerate ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowHint((s) => !s)}>
                <RefreshCw className="mr-1 h-4 w-4" /> Neu erzeugen
              </Button>
            ) : null}
            {onKeepOriginal ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onKeepOriginal}>
                Original behalten
              </Button>
            ) : null}
          </div>
          {onRegenerate && showHint ? (
            <div className="space-y-2">
              <Textarea
                id="poster-regenerate-hint"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Optionaler Hinweis, z. B. „Logo größer, weniger Rot“"
                rows={2}
              />
              <Button size="sm" disabled={busy} onClick={() => onRegenerate(hint)}>
                Zwei neue Vorschläge erzeugen
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <PosterLightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onIndexChange={setLightbox} />
    </div>
  );
}
```

- [ ] **Step 4: Type check**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/components/poster/"`
Expected: no output (confirm `Textarea` is exported from `@/components/ui/textarea`; if it is a default export, adjust the import).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/poster/AFrame.tsx apps/web/src/components/poster/PosterLightbox.tsx apps/web/src/components/poster/PosterProposalPair.tsx
git commit -m "feat(web): poster proposals — A-frame, lightbox and proposal pair components"
git push
```

---

### Task 11: admin overview page with batch runner + navigation

**Files:**
- Create: `apps/web/src/app/admin/dashboard/events/poster/page.tsx`, `apps/web/src/app/admin/dashboard/events/poster/_components/PosterOverview.tsx`
- Modify: `apps/web/src/components/admin/admin-sidebar.tsx` (nav item after "Veranstaltungen"), `apps/web/src/app/admin/dashboard/events/page.tsx` (header button + per-row link)

**Interfaces:**
- Consumes: `listPosterOverviewAction`, `proposeForEventAction` (Task 9), `AFrame`, `classifyRatio`, `RATIO_LABELS`.

- [ ] **Step 1: Write `page.tsx`** (server component so `maxDuration` applies to the actions invoked from it)

```tsx
import { PosterOverview } from "./_components/PosterOverview";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default function PosterOverviewPage() {
  return <PosterOverview />;
}
```

- [ ] **Step 2: Write `PosterOverview.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AFrame } from "@/components/poster/AFrame";
import { classifyRatio, RATIO_LABELS, type RatioClass } from "@/lib/poster/ratio";
import {
  listPosterOverviewAction,
  proposeForEventAction,
  type PosterOverviewEvent,
} from "@/app/actions/poster-proposals";

type State = "applied" | "kept" | "ready" | "fine" | "open";

function stateOf(e: PosterOverviewEvent): State {
  if (e.poster_proposal_id) return "applied";
  if (e.openBatch) return "ready";
  if (e.poster_reviewed_at) return "kept";
  if (e.poster_check?.mode === "skip") return "fine";
  return "open";
}

const STATE_LABEL: Record<State, string> = {
  applied: "Übernommen",
  kept: "Original behalten",
  ready: "Vorschläge bereit",
  fine: "Plakat passt",
  open: "Offen",
};

function ratioChip(ratio: RatioClass | null) {
  if (!ratio) return <Badge variant="outline" className="text-xs">nicht gemessen</Badge>;
  return (
    <Badge variant={ratio === "ok" ? "secondary" : "destructive"} className="text-xs">
      {RATIO_LABELS[ratio]}
    </Badge>
  );
}

export function PosterOverview() {
  const [events, setEvents] = useState<PosterOverviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [spent, setSpent] = useState(0);
  const [budget, setBudget] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [measured, setMeasured] = useState<Record<string, RatioClass>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ total: number; done: number } | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    const res = await listPosterOverviewAction();
    if (!res.success) {
      toast.error(res.error);
      setLoading(false);
      return;
    }
    setEvents(res.events);
    setSpent(res.spentTodayUsd);
    setBudget(res.budgetLimitUsd);
    setEnabled(res.enabled);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ratioFor = (e: PosterOverviewEvent): RatioClass | null =>
    e.poster_check?.ratio ?? measured[e.id] ?? null;

  const counts = useMemo(() => {
    const c = { fine: 0, needs: 0, ready: 0, applied: 0 };
    for (const e of events) {
      const s = stateOf(e);
      if (s === "applied") c.applied++;
      else if (s === "ready") c.ready++;
      else if (s === "fine" || (s === "open" && ratioFor(e) === "ok" && !e.poster_check)) c.fine++;
      else c.needs++;
    }
    return c;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, measured]);

  const proposeOne = async (eventId: string) => {
    setRunning((s) => new Set(s).add(eventId));
    const res = await proposeForEventAction(eventId);
    setRunning((s) => {
      const n = new Set(s);
      n.delete(eventId);
      return n;
    });
    if (!res.success) {
      toast.error(res.error);
      return false;
    }
    if ("skipped" in res.result) toast.message("Plakat passt bereits, nichts erzeugt.");
    else toast.success(`Zwei Vorschläge erzeugt (${res.result.costUsd.toFixed(2)} $)`);
    await load();
    return true;
  };

  const runBatch = async () => {
    const queue = events.filter((e) => stateOf(e) === "open").map((e) => e.id);
    if (queue.length === 0) {
      toast.message("Keine offenen Veranstaltungen.");
      return;
    }
    stopRef.current = false;
    setBatch({ total: queue.length, done: 0 });
    const workers = Array.from({ length: 2 }, async () => {
      while (queue.length > 0 && !stopRef.current) {
        const id = queue.shift();
        if (!id) break;
        await proposeOne(id);
        setBatch((b) => (b ? { ...b, done: b.done + 1 } : b));
      }
    });
    await Promise.all(workers);
    setBatch(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Plakate</h1>
          <p className="text-sm text-muted-foreground">
            Anstehende Veranstaltungen und ihre Bilder im DIN-A-Hochformat der Explore-Rails.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Heute {spent.toFixed(2)} $ von {budget.toFixed(0)} $ Budget
          </span>
          {batch ? (
            <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}>
              Stopp ({batch.done}/{batch.total})
            </Button>
          ) : (
            <Button size="sm" onClick={runBatch} disabled={!enabled}>
              Alle offenen erzeugen
            </Button>
          )}
        </div>
      </div>

      {!enabled ? (
        <p className="rounded-[8px] border border-border bg-muted p-3 text-sm">
          Plakat-Vorschläge sind über app_settings deaktiviert.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Plakat passt", counts.fine],
          ["Braucht Plakat", counts.needs],
          ["Vorschläge bereit", counts.ready],
          ["Übernommen", counts.applied],
        ].map(([label, n]) => (
          <div key={String(label)} className="rounded-[8px] border border-border bg-card p-3">
            <div className="text-2xl font-semibold tabular-nums">{n}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {events.map((e) => {
          const state = stateOf(e);
          const busy = running.has(e.id);
          return (
            <div key={e.id} className="flex gap-4 rounded-[10px] border border-border bg-card p-3">
              <div className="w-20 shrink-0">
                <AFrame src={e.image_url} alt={e.title} fit="cover" />
                {e.image_url && !e.poster_check?.ratio && !measured[e.id] ? (
                  <img
                    src={e.image_url}
                    alt=""
                    className="hidden"
                    onLoad={(ev) => {
                      const img = ev.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setMeasured((m) => ({ ...m, [e.id]: classifyRatio(img.naturalWidth, img.naturalHeight) }));
                      }
                    }}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium">{e.title}</h3>
                  {ratioChip(ratioFor(e))}
                  <Badge variant="outline" className="text-xs">{STATE_LABEL[state]}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {e.date} · {e.status}
                  {e.poster_check?.width ? ` · ${e.poster_check.width} × ${e.poster_check.height} px` : ""}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state === "ready" || state === "applied" || state === "kept" ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/dashboard/events/poster/${e.id}`}>Prüfen</Link>
                    </Button>
                  ) : null}
                  {state === "open" || state === "fine" || state === "kept" ? (
                    <Button size="sm" disabled={busy || !enabled} onClick={() => proposeOne(e.id)}>
                      {busy ? "Erzeuge…" : state === "fine" ? "Trotzdem vorschlagen" : "Vorschläge erzeugen"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Note: "Trotzdem vorschlagen" on a "fine" event must pass `force: true`. Implement `proposeOne(eventId, force?)` and call `proposeForEventAction(eventId, { force })`; for state `fine` pass `true`.

- [ ] **Step 3: Sidebar + events list link**

In `apps/web/src/components/admin/admin-sidebar.tsx`, import `Images` from `lucide-react` (add to the existing import list) and insert after the "Veranstaltungen" item:

```tsx
    {
      name: "Plakate",
      href: "/admin/dashboard/events/poster",
      icon: <Images className="h-5 w-5" />,
      badgeKey: null,
    },
```

In `apps/web/src/app/admin/dashboard/events/page.tsx`: add `import Link from "next/link"` and `Images` to the lucide import; in the row action bar (next to "Bearbeiten", around line 429) add:

```tsx
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/dashboard/events/poster/${event.id}`}>
                          <Images className="h-4 w-4 mr-1" /> Plakat
                        </Link>
                      </Button>
```

and in the page header (near the search input) a link button `<Button asChild variant="outline"><Link href="/admin/dashboard/events/poster">Plakate</Link></Button>`.

- [ ] **Step 4: Type check + dev smoke**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/(app/admin/dashboard/events|components/admin/admin-sidebar|components/poster|lib/poster|app/actions/poster-proposals)"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/dashboard/events/poster/page.tsx apps/web/src/app/admin/dashboard/events/poster/_components/PosterOverview.tsx apps/web/src/components/admin/admin-sidebar.tsx apps/web/src/app/admin/dashboard/events/page.tsx
git commit -m "feat(web): admin Plakate overview with batch runner, nav + per-event link"
git push
```

---

### Task 12: admin review page

**Files:**
- Create: `apps/web/src/app/admin/dashboard/events/poster/[eventId]/page.tsx`, `apps/web/src/app/admin/dashboard/events/poster/_components/PosterReview.tsx`

**Interfaces:**
- Consumes: `getPosterReviewAction`, `selectPosterAction`, `keepOriginalAction`, `proposeForEventAction` (Task 9); `PosterProposalPair`, `AFrame`, `PosterLightbox` (Task 10).

- [ ] **Step 1: Write `[eventId]/page.tsx`**

```tsx
import { PosterReview } from "../_components/PosterReview";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default async function PosterReviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <PosterReview eventId={eventId} />;
}
```

- [ ] **Step 2: Write `PosterReview.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AFrame } from "@/components/poster/AFrame";
import { PosterLightbox } from "@/components/poster/PosterLightbox";
import { PosterProposalPair, DIRECTION_LABELS } from "@/components/poster/PosterProposalPair";
import { RATIO_LABELS } from "@/lib/poster/ratio";
import type { PosterProposal } from "@/lib/poster/types";
import {
  getPosterReviewAction,
  keepOriginalAction,
  proposeForEventAction,
  selectPosterAction,
  type PosterReviewEvent,
} from "@/app/actions/poster-proposals";

export function PosterReview({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<PosterReviewEvent | null>(null);
  const [proposals, setProposals] = useState<PosterProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [originalOpen, setOriginalOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await getPosterReviewAction(eventId);
    if (!res.success) {
      toast.error(res.error);
      setLoading(false);
      return;
    }
    setEvent(res.event);
    setProposals(res.proposals);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !event) return <Skeleton className="h-64 w-full" />;

  const latestBatchId = proposals[0]?.batch_id ?? null;
  const latest = proposals.filter((p) => p.batch_id === latestBatchId);
  const older = proposals.filter((p) => p.batch_id !== latestBatchId);
  const original = event.original_image_url ?? event.image_url;
  const check = event.poster_check;

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const generate = (hint?: string) =>
    withBusy(async () => {
      const res = await proposeForEventAction(eventId, { hint, force: true });
      if (!res.success) toast.error(res.error);
      else if ("skipped" in res.result) toast.message("Nichts erzeugt.");
      else toast.success(`Zwei Vorschläge erzeugt (${res.result.costUsd.toFixed(2)} $)`);
      await load();
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/dashboard/events/poster"><ArrowLeft className="mr-1 h-4 w-4" /> Plakate</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-muted-foreground">
          {event.date}{event.time ? ` · ${event.time.slice(0, 5)} Uhr` : ""}{event.location ? ` · ${event.location}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {check?.ratio ? <Badge variant={check.ratio === "ok" ? "secondary" : "destructive"}>{RATIO_LABELS[check.ratio]}</Badge> : null}
          {check?.analysis ? <Badge variant="outline">{check.analysis.kind}{check.analysis.hasEventInfo ? " · mit Infos" : " · ohne Infos"}</Badge> : null}
          {check?.mode ? <Badge variant="outline">{check.mode === "skip" ? "passt" : check.mode}</Badge> : null}
          {event.poster_proposal_id ? <Badge>Vorschlag übernommen</Badge> : null}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Original</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <div className="overflow-hidden rounded-[8px] border border-border bg-muted">
              {original ? <img src={original} alt="Original" className="w-full cursor-zoom-in" onClick={() => setOriginalOpen(0)} /> : null}
            </div>
            <div className="text-xs text-muted-foreground">Hochgeladen{check?.width ? ` · ${check.width} × ${check.height} px` : ""}</div>
          </div>
          <div className="space-y-1">
            <AFrame src={original} alt="So sieht es in der App aus" fit="cover" onClick={() => setOriginalOpen(0)} />
            <div className="text-xs text-muted-foreground">In der App heute (A-Box, cover)</div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Vorschläge</h2>
          {latest.length === 0 ? (
            <Button size="sm" disabled={busy} onClick={() => generate()}>{busy ? "Erzeuge…" : "Vorschläge erzeugen"}</Button>
          ) : null}
        </div>
        {latest.length > 0 ? (
          <PosterProposalPair
            proposals={latest}
            fileBase={event.title}
            selectedId={event.poster_proposal_id}
            busy={busy}
            onSelect={(p) =>
              withBusy(async () => {
                const res = await selectPosterAction(p.id);
                if (!res.success) toast.error(res.error ?? "Fehler");
                else toast.success(`Variante ${DIRECTION_LABELS[p.direction] ?? p.direction} übernommen`);
                await load();
              })
            }
            onKeepOriginal={() =>
              withBusy(async () => {
                const res = await keepOriginalAction(eventId);
                if (!res.success) toast.error(res.error ?? "Fehler");
                else toast.success("Original behalten");
                await load();
              })
            }
            onRegenerate={(hint) => generate(hint)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Vorschläge für diese Veranstaltung.</p>
        )}
      </section>

      {older.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Frühere Runden</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {older.map((p) => (
              <div key={p.id} className="space-y-1">
                <AFrame src={p.image_url} alt={p.direction} fit="cover" className={p.status === "selected" ? "ring-2 ring-primary" : ""} />
                <div className="truncate text-[11px] text-muted-foreground">{DIRECTION_LABELS[p.direction] ?? p.direction} · {p.status}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <PosterLightbox
        images={original ? [{ url: original, label: "Original" }] : []}
        index={originalOpen}
        onClose={() => setOriginalOpen(null)}
        onIndexChange={setOriginalOpen}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type check**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/(app/admin/dashboard/events/poster|components/poster)"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/admin/dashboard/events/poster/[eventId]/page.tsx" apps/web/src/app/admin/dashboard/events/poster/_components/PosterReview.tsx
git commit -m "feat(web): admin poster review page (original, two variants, apply, keep, regenerate)"
git push
```

---

### Task 13: API routes for the chat slices

**Files:**
- Create: `apps/web/src/lib/poster/auth.ts`, `apps/web/src/app/api/posters/propose/route.ts`, `apps/web/src/app/api/posters/select/route.ts`, `apps/web/src/app/api/posters/link/route.ts`

**Interfaces:**
- Produces: `resolveActor(req: Request, body: { accountId?: string; wallet?: string }): Promise<Actor | null>` with `Actor = { requestedBy: "admin" } | { requestedBy: "org" | "submitter"; accountId: string; wallet: string }`.
- Routes (all `POST`, JSON, `runtime = "nodejs"`):
  - `/api/posters/propose` body `{ eventId?: string; draftId?: string; draft?: PosterEventInput; accountId?: string; wallet?: string; hint?: string }` → `200 { success: true, ...ProposeResult }` | `4xx { success: false, error }`.
  - `/api/posters/select` body `{ proposalId: string; apply?: boolean; accountId?; wallet? }` → `{ success, imageUrl?, eventId? }`.
  - `/api/posters/link` body `{ draftId: string; eventId: string; accountId?; wallet? }` → `{ success, linked }`.

- [ ] **Step 1: Write `auth.ts`**

```ts
// Actor resolution for the poster API routes: admin dashboard cookie, or a
// wallet that owns the given account (same weak pattern as api/mecky/story-draft;
// signed requests are a follow-up).
import { isAuthenticated } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type Actor =
  | { requestedBy: "admin" }
  | { requestedBy: "org" | "submitter"; accountId: string; wallet: string };

export async function resolveActor(
  req: Request,
  body: { accountId?: string; wallet?: string },
  kind: "org" | "submitter",
): Promise<Actor | null> {
  if (await isAuthenticated()) return { requestedBy: "admin" };
  const wallet = (req.headers.get("x-wallet-address") || body.wallet || "").trim().toLowerCase();
  const accountId = (body.accountId || "").trim();
  if (!wallet || !accountId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("account_owners")
    .select("role")
    .eq("account_id", accountId)
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (!data) return null;
  return { requestedBy: kind, accountId, wallet };
}

export async function accountOwnsEvent(accountId: string, eventId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("events").select("account_id").eq("id", eventId).maybeSingle();
  return !!data && data.account_id === accountId;
}
```

- [ ] **Step 2: Write `propose/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountOwnsEvent, resolveActor } from "@/lib/poster/auth";
import { proposePosters, PosterServiceError } from "@/lib/poster/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const draftSchema = z.object({
  title: z.string().min(1),
  date: z.string().nullish(),
  time: z.string().nullish(),
  end_time: z.string().nullish(),
  location: z.string().nullish(),
  category: z.string().nullish(),
  ticket_price: z.union([z.number(), z.string()]).nullish(),
  organizer_name: z.string().nullish(),
  description: z.string().nullish(),
  website_url: z.string().nullish(),
  image_url: z.string().nullish(),
});

const bodySchema = z.object({
  eventId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  draft: draftSchema.optional(),
  accountId: z.string().uuid().optional(),
  wallet: z.string().optional(),
  hint: z.string().max(400).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Ungültige Anfrage" }, { status: 400 });
  const body = parsed.data;

  if (body.eventId) {
    const actor = await resolveActor(req, body, "org");
    if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });
    if (actor.requestedBy !== "admin" && !(await accountOwnsEvent(actor.accountId, body.eventId))) {
      return NextResponse.json({ success: false, error: "Keine Berechtigung für diese Veranstaltung" }, { status: 403 });
    }
    return run(() =>
      proposePosters(
        { kind: "event", eventId: body.eventId as string },
        { requestedBy: actor.requestedBy, accountId: actor.requestedBy === "admin" ? null : actor.accountId, hint: body.hint },
      ),
    );
  }

  if (body.draftId && body.draft) {
    const actor = await resolveActor(req, body, "submitter");
    if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });
    return run(() =>
      proposePosters(
        { kind: "draft", draftId: body.draftId as string, draft: body.draft! },
        { requestedBy: actor.requestedBy, accountId: actor.requestedBy === "admin" ? null : actor.accountId, hint: body.hint },
      ),
    );
  }

  return NextResponse.json({ success: false, error: "eventId oder draftId + draft erforderlich" }, { status: 400 });
}

async function run(fn: () => ReturnType<typeof proposePosters>) {
  try {
    const result = await fn();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[api/posters/propose]", error);
    if (error instanceof PosterServiceError) {
      const status = error.code === "caps" ? 429 : error.code === "not_found" ? 404 : 502;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    return NextResponse.json({ success: false, error: "Vorschläge konnten nicht erzeugt werden." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write `select/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountOwnsEvent, resolveActor } from "@/lib/poster/auth";
import { selectProposal } from "@/lib/poster/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  proposalId: z.string().uuid(),
  apply: z.boolean().optional(),
  accountId: z.string().uuid().optional(),
  wallet: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Ungültige Anfrage" }, { status: 400 });
  const body = parsed.data;
  const actor = await resolveActor(req, body, "submitter");
  if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });

  if (actor.requestedBy !== "admin") {
    const admin = createAdminClient();
    const { data: p } = await admin
      .from("event_poster_proposals")
      .select("event_id, account_id")
      .eq("id", body.proposalId)
      .maybeSingle();
    if (!p) return NextResponse.json({ success: false, error: "Vorschlag nicht gefunden" }, { status: 404 });
    const owns = p.event_id ? await accountOwnsEvent(actor.accountId, p.event_id) : p.account_id === actor.accountId;
    if (!owns) return NextResponse.json({ success: false, error: "Keine Berechtigung" }, { status: 403 });
  }

  const res = await selectProposal(body.proposalId, body.apply ?? false);
  if (!res.ok) return NextResponse.json({ success: false, error: res.error }, { status: 400 });
  return NextResponse.json({ success: true, imageUrl: res.imageUrl, eventId: res.eventId });
}
```

- [ ] **Step 4: Write `link/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountOwnsEvent, resolveActor } from "@/lib/poster/auth";
import { linkDraftProposals } from "@/lib/poster/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  draftId: z.string().uuid(),
  eventId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  wallet: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Ungültige Anfrage" }, { status: 400 });
  const body = parsed.data;
  const actor = await resolveActor(req, body, "submitter");
  if (!actor) return NextResponse.json({ success: false, error: "Nicht berechtigt" }, { status: 401 });
  if (actor.requestedBy !== "admin" && !(await accountOwnsEvent(actor.accountId, body.eventId))) {
    return NextResponse.json({ success: false, error: "Keine Berechtigung" }, { status: 403 });
  }
  const res = await linkDraftProposals(body.draftId, body.eventId);
  return NextResponse.json({ success: res.ok, linked: res.linked }, { status: res.ok ? 200 : 400 });
}
```

- [ ] **Step 5: Type check**

Run: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/(app/api/posters|lib/poster)"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/poster/auth.ts apps/web/src/app/api/posters/propose/route.ts apps/web/src/app/api/posters/select/route.ts apps/web/src/app/api/posters/link/route.ts
git commit -m "feat(web): poster proposal API routes (propose, select, link) for the submission chats"
git push
```

---

### Task 14: CLI batch for the current backlog + run it

**Files:**
- Create: `apps/web/scripts/poster-batch.ts`

**Interfaces:**
- Consumes: `proposePosters` (Task 8), `createAdminClient`.

- [ ] **Step 1: Write the script**

```ts
// One-off/reusable batch: propose posters for every upcoming event that has no
// open batch and no review yet. Run from apps/web:
//   set -a; source .env.local; set +a; pnpm exec tsx scripts/poster-batch.ts [--limit N] [--dry]
import { createAdminClient } from "../src/lib/supabase/admin";
import { proposePosters } from "../src/lib/poster/service";

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("--limit") + 1]) || 100;
const dry = args.includes("--dry");

async function main() {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: events, error } = await admin
    .from("events")
    .select("id, title, date, image_url, poster_reviewed_at, poster_proposal_id")
    .gte("date", today)
    .in("status", ["approved", "pending"])
    .is("poster_reviewed_at", null)
    .order("date", { ascending: true });
  if (error) throw error;
  const { data: open } = await admin.from("event_poster_proposals").select("event_id").eq("status", "proposed");
  const openIds = new Set((open ?? []).map((r: { event_id: string | null }) => r.event_id));
  const queue = (events ?? []).filter((e) => !openIds.has(e.id)).slice(0, limit);
  console.log(`${queue.length} events to process${dry ? " (dry run)" : ""}`);
  let total = 0;
  for (const e of queue) {
    const started = Date.now();
    if (dry) {
      console.log(`- ${e.title} (${e.date})`);
      continue;
    }
    try {
      const res = await proposePosters({ kind: "event", eventId: e.id }, { requestedBy: "admin" });
      const secs = Math.round((Date.now() - started) / 1000);
      if ("skipped" in res) console.log(`= ${e.title}: skipped (${res.skipped}) ${secs}s`);
      else {
        total += res.costUsd;
        console.log(`+ ${e.title}: ${res.mode} ${res.proposals.map((p) => p.direction).join("/")} $${res.costUsd.toFixed(3)} ${secs}s`);
      }
    } catch (err) {
      console.error(`! ${e.title}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`done, $${total.toFixed(2)} spent`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Dry run, then a single real event**

Run: `cd apps/web && set -a && source .env.local && set +a && pnpm exec tsx scripts/poster-batch.ts --dry`
Expected: lists the upcoming events.

Run: `... scripts/poster-batch.ts --limit 1`
Expected: one line `+ <title>: <mode> ... $0.1x` or `= ... skipped`; verify in the DB: `select mode, variant, direction, cost_usd, image_url from event_poster_proposals order by created_at desc limit 2;` and open one `image_url` in the browser.

- [ ] **Step 3: Run the full backlog**

Run: `... scripts/poster-batch.ts` (≈ 20 events × ~45 s ≈ 15 min; ~$3.30). Record the per-event lines in the final report.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/poster-batch.ts
git commit -m "chore(web): poster batch script for the current event backlog"
git push
```

---

### Task 15: verification, review, docs

- [ ] **Step 1: Full poster test suite**

Run: `cd apps/web && pnpm exec tsx --test tests/poster-*.test.ts`
Expected: all passing (5 files).

- [ ] **Step 2: Type check of every new file** (command from Global Constraints) — expected no output.

- [ ] **Step 3: Dev-server smoke of the admin pages**

Run `cd apps/web && pnpm dev`, log in at `/admin/login`, open `/admin/dashboard/events/poster`: census tiles render, rows show ratio chips, "Prüfen" opens the review page with original + two variants, lightbox opens, "Herunterladen" saves a JPEG, "Übernehmen" updates `events.image_url` (verify via SQL) and sets `original_image_url`.

- [ ] **Step 4: Code review** via the `superpowers:requesting-code-review` skill on the slice 1 diff (`git diff main@{1}..HEAD` or the commit range), fix findings, commit.

- [ ] **Step 5: Docs** — append a "Poster proposals" paragraph to `docs/superpowers/specs/2026-09-22-event-poster-proposals-design.md` §7 marking slice 1 SHIPPED with the commit range, and update the memory file `project_event_poster_proposals.md`.

---

## Self-review notes

- Spec §4 lib map, §4.1 schema, §4.2 routes, §4.3 admin, §5 caps/marking, §6 tests, §7 slice 1 → Tasks 1–15. §4.4/§4.5 (chats) are slices 2 and 3 with their own plans after this one ships.
- Names used consistently: `proposePosters`, `selectProposal`, `keepOriginal`, `linkDraftProposals`, `PosterProposal`, `PosterCheck`, `classifyRatio`, `RATIO_LABELS`, `pickDirections`, `decideMode`, `evaluateCaps`, `buildReformatPrompt`, `buildDesignPrompt`, `buildPosterContent`, `contentLines`, `renderPoster`, `fetchSourceImage`, `classifyImage`, `draftPosterCopy`, `resolveActor`, `accountOwnsEvent`, `AFrame`, `PosterLightbox`, `PosterProposalPair`, `DIRECTION_LABELS`.
- `Textarea` import in Task 10 must match the actual export of `components/ui/textarea.tsx` (check on execution).
