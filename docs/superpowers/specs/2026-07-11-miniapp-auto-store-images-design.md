# Auto-generated store images on mini-app publish (Nano Banana 2)

**Date:** 2026-07-11
**Surface:** apps/web — Mini-App builder (`/editor`) + existing `/api/mini-apps/images*` routes

## Problem

Publishing an AI-built mini app today stores a **model-drafted SVG data URI** as
the app icon and leaves the store hero (`feature_image_url`) and the 1:1 store
previews (`screenshots[]`) empty. The dashboard "Bilder" section can generate
all three with Nano Banana 2 (KIE.ai), but only via manual button presses, and
the 1:1 "Aus Screenshot" path requires the developer to have manually captured
editor screenshots first.

Goal: **when a mini app is published, everything the store card needs is
generated automatically** —

1. a real raster app icon (replacing the SVG placeholder),
2. the big 16:9 store hero artwork,
3. one 1:1 store preview per app screen, each generated with a fresh
   screenshot of that screen as the NB2 image reference.

## Approaches considered

- **A — Client-side orchestration in the editor after publish (chosen).**
  The editor already has (a) the full published HTML, (b) `parseScreens()` /
  `buildScreenDoc()` to render each `data-screen` section in isolation, and
  (c) the `netizen:capture` postMessage bridge baked into every generated app
  (html-to-image, PNG at 2×). After a successful publish, a runner component
  renders each screen in a hidden sandboxed srcdoc iframe, captures it,
  uploads it as a `shot`, then drives the existing `/api/mini-apps/images`
  (createTask) + `/status` (poll → persist) endpoints. Zero new server
  dependencies, real-browser rendering, reuses every existing pipeline piece.
  Trade-off: the tab must stay open (~1–2 min); progress is shown and the
  images that finish are persisted incrementally.
- **B — Server-side headless Chromium in the publish route.** Rejected:
  ~50 MB lambda dep, this repo has a documented history of Vercel build OOM
  with heavy server deps, `maxDuration` limits for polling, duplicated screen
  rendering logic.
- **C — Supabase Edge Function / external screenshot API.** Rejected: Deno
  can't render HTML; a third-party screenshot vendor adds a key + cost and
  can't isolate per-screen sections without extra serving plumbing.

## Design (Approach A)

### New: `apps/web/src/app/editor/lib/autoStoreImages.ts` (client lib)

Pure orchestration, no React:

- `captureScreenShot(container, doc)` — mounts one hidden
  `sandbox="allow-scripts …"` srcdoc iframe (390×780), waits for load +
  ~1.2 s settle, posts `netizen:capture`, resolves the PNG data URL
  (12 s timeout), removes the iframe.
- `runAutoStoreImages({ html, slug, wallet, container, onProgress })`:
  1. `GET /api/mini-apps/<slug>` → current row. Work list:
     - **icon** if `icon_url` is null **or a `data:` URI** (the SVG draft);
       an existing https raster icon is never overwritten (republish-safe),
     - **feature** if `feature_image_url` is null,
     - **previews** for the empty `screenshots[]` slots (max 5 total),
       one per app screen in document order (`parseScreens`; apps without
       the screen contract fall back to one full-document capture).
  2. Kick off icon + feature NB2 tasks immediately (no reference needed).
  3. Capture screens sequentially; upload each as `kind=shot` (also feeds
     the existing "Aus Screenshot" pool), then start the preview task for
     its slot with the shot URL as `referenceUrl`.
  4. Poll `/status` until each task persists. **Preview polls run strictly
     sequentially** — `applyImageToApp` does a read-modify-write on
     `screenshots[]`, so concurrent persists would race. Icon and feature
     write separate columns and poll in parallel.
  5. Every state change emits a progress snapshot
     (`pending | running | done | error | skipped` per item).

### New: `apps/web/src/app/editor/components/AutoStoreImages.tsx`

Runner UI mounted by the editor page after `onPublished`:

- offscreen capture container (`fixed left-[-9999px]`, real layout so
  rendering happens),
- floating bottom-right status card: item list (Icon, Store-Artwork,
  Vorschau 1…n) with spinner/check/error icons, a "Tab geöffnet lassen"
  hint while running, dismiss button, auto-hides a few seconds after
  completion. German copy, no crypto jargon.

### Changed: `apps/web/src/app/editor/page.tsx`

`onPublished` additionally sets an auto-images job (`html`, `slug`, run id);
the runner renders keyed by run id when a wallet is connected. Re-publishing
starts a new run (which then only fills what's missing).

### Changed: `PublishDialog.tsx` success copy

One sentence pointing at the status card ("Store-Bilder werden automatisch
erstellt…").

## Error handling

- A failed screen capture skips that preview (marked `error`) and continues.
- KIE failures/timeouts mark the single item `error`; everything else
  proceeds. The manual "Bilder" section remains the fallback for retries.
- Daily NB2 limit (20/app) still enforced server-side; a full publish uses
  at most 2 + 5 tasks.
- Closing the tab mid-run loses only the not-yet-persisted images (each
  poll persists its image as soon as KIE finishes).

## v2 additions (same day)

- **AI edit mode** — `POST /api/mini-apps/images` accepts `mode: "edit"`:
  `referenceUrl` is the CURRENT image, `prompt` the requested change;
  `buildEditPrompt` keeps per-kind constraints (icon stays an icon, hero
  stays 16:9 text-free, preview stays 1:1 store-look). The dashboard
  "Bilder" section gets "Mit KI bearbeiten" on the filled icon/hero (and a
  pencil overlay on filled preview slots); the shared "Wunsch" field is the
  edit instruction and the buttons stay disabled until it has text.
  `data:`-URI icons (the SVG draft) can't be edited — KIE needs an https
  reference — so the button only shows for stored raster images.
- **Manual regenerate-all** — the auto-run gained `force` (icon + hero
  regenerated regardless, previews rebuilt from slot 0, fresh captures).
  Editor toolbar shows a "Store-Bilder" button for published apps behind a
  confirm dialog (it replaces existing images). `quickUpdate` (one-click
  republish) now also triggers the normal fill-missing run.

## v3 additions (2026-07-12) — KI-Studio + text rules

- **KI-Studio sidebar** (`components/mini-apps/ImageStudio.tsx`) for every
  target (icon / hero / each preview slot), mirroring the Speisekarte
  AiImageEditor: variants generate as PREVIEWS (`/status?preview=1` stores
  them under `mini-apps/<id>/variants/` without touching the row), compare
  slider vs. the current image, explicit commit via new
  `POST /api/mini-apps/images/commit` (URL must live in the app's own
  storage folder). Variants persist in localStorage per target (limit 6).
  Base options: fresh prompt / edit current image / screenshot reference
  (previews). ImagesSection keeps upload+delete inline; all AI goes through
  the studio.
- **Text rules:** hero artwork prompts carry a hard "NO TEXT" instruction
  (generation + edit); previews built FROM a screenshot explicitly get a
  short German caption (2–6 words) describing the screen — all other
  preview/icon prompts stay text-free.

## Testing

- Lint + scoped typecheck on the changed files (repo has known pre-existing
  tsc noise elsewhere).
- Manual E2E (requires KIE_API_KEY + wallet): publish a multi-screen app in
  `/editor`, watch the card fill icon → hero → previews; verify the store
  row in the dashboard "Bilder" section and that a republish overwrites
  nothing that already exists.
