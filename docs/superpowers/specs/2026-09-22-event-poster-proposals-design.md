# Event poster proposals (Plakat-Vorschläge) — design

**Status:** Slice 1 (core + admin) SHIPPED 2026-09-22 on `feat/event-poster-proposals` (merged to main the same day). Slices 2 and 3 (Expo chat, web chat) pending. Model choice and assumptions in §8 approved by Max on 2026-09-22 (variant A of designed posters = Plakativ).
**Probe page:** see the "Plakat-Probe Röbel" artifact (three real events rendered by the recommended model, plus the ratio census).

## 1. Problem

Since `1718e892` (2026-09-21) the Expo explore rails, the event detail page and the story viewer present every event image as a DIN-A portrait poster (`POSTER_ASPECT_RATIO = 210/297`, `contentFit="cover"` in `apps/expo/components/HorizontalEventCard.tsx`). Images that are not in that ratio get cropped (landscape, square) or lose their top and bottom (very tall), and images that are only a logo or a theme photo look like a mistake in a poster slot.

Census of the 29 upcoming approved events on 2026-09-22 (all have an image):

| Class | Count | Examples |
|---|---|---|
| A-format already (h/w within ±8 % of 1.414) | 9 | Filmklub posters 794×1123, Läusealarm 1080×1512 |
| Landscape | 11 | heartCHOR photo 1600×1069, Bücherflohmarkt photo 1047×530, Weihnachtsmarkt 1170×868 |
| Square-ish | 7 | PSV crest 856×856 (5 HEIMSPIEL events), AQUA-POWER 640×640 |
| Far too tall | 2 | Strandbad = phone screenshot of a PDF reader 1080×2097 |

Several are also tiny (498×436, 529×352, 640×640). Content-wise three classes exist: a real poster with the event information (wrong ratio, sometimes with UI chrome), a logo or theme photo without information, and posters that are already fine.

## 2. Goal

1. Every event can get **two proposed A-format posters** that carry the event information clearly and look professional (agency-grade print look, not "AI kitsch").
2. **Existing posters** in the wrong ratio are **extended or re-laid-out** with every text kept verbatim, logos and photos kept.
3. **Theme images / logos** get **two newly designed posters** from the event data, with the uploaded image used as logo or photo element.
4. Surfaces: **admin dashboard** (batch for all current events + review), **Expo AI submission chat** and **web AI submission chat** (two big variants right before the final submit, lightbox, download both, pick one in the chat).
5. The chosen poster becomes `events.image_url`; the original is kept.

Non-goals (v1): editing posters by hand, animated/story formats, changing the explore layout, migrating the existing org "Flyer" tool.

## 3. Model decision (researched 2026-09-22)

**Recommendation: OpenAI `gpt-image-2.5-sunburst` via the Images API (`/v1/images/edits` with the source image as reference, `/v1/images/generations` when there is no image).**

Evidence:

- Arena rankings of 2026-09-07 (arena.ai, 6.1 M / 29.5 M votes): `gpt-image-2.5-sunburst` is #1 on Text-to-Image (1421) and #1 on Single-Image Edit (1520), `gpt-image-2.5-flare` #2 on both, `gpt-image-2` #3. `gemini-3-pro-image` (Nano Banana Pro) is 9th on edit (1390), `seedream-5.0-pro` 8th/10th. Sunburst is OpenAI's "editing precision" variant; flare is the faster generation variant.
- Verified with the project's `OPENAI_API_KEY` (`apps/web/.env.local`, already on Vercel): the key lists `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`, `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`. Organisation verification is satisfied (the probe calls succeeded).
- Custom sizes: multiples of 16, ratio between 1:3 and 3:1, edge ≤ 3840 px, 0.66–8.3 MP. **1440×2032 = ratio 1.411, i.e. DIN A within 0.2 %** (the current kie.ai flyer path can only do 2:3 = 1.5). Print upgrade later: 2048×2896 (5.9 MP, flagged "experimental" above 2560×1440).
- Probe on three real events (raw outputs, see artifact): Strandbad screenshot → clean A4 poster with all 11 text lines verbatim, logo unchanged, UI chrome removed (37 s). HEIMSPIEL from data + crest → two distinct professional posters, crest reproduced exactly, all umlauts and numbers correct (35–37 s each).
- Measured cost at `quality=high`, 1440×2032: 2010 output image tokens ($30/M) + ~1400–1900 input tokens (image $8/M, text $5/M) = **$0.070–0.075 per image, ≈ $0.15 per pair**. All 20 current non-A events ≈ $3.30. `xhigh`/`max` exist (≈ 2–4× cost) and are not needed by the probe results.
- Multipart contract used: `model`, `image[]` (bytes, up to 16), `prompt`, `size`, `quality`, `output_format=jpeg`, `output_compression`, `moderation`; response `data[0].b64_json` + `usage` (token counts → cost per row).

Alternatives considered and rejected for v1:

- **Nano Banana 2 Lite via kie.ai** (current flyer default): weakest text rendering of the set, only 2:3, kie.ai account was out of credits on 2026-09-21. Keep for the existing flyer tool only.
- **Nano Banana Pro / Gemini 3 Pro Image**: strong text and 4K, but ranks clearly below 2.5 on edit, would add a Google or kie.ai dependency with no key in the project.
- **FLUX.2 Pro outpaint** (fal/BFL): pure canvas extension without a prompt, cannot remove screenshot chrome or re-layout, new provider.
- **Ideogram 4 / Recraft V4**: good typography but below GPT Image 2.5 in current rankings, new provider.

Operational notes: `gpt-image-1` sunsets 2026-10-23 and `gpt-image-1.5` 2026-12-01 (irrelevant, not used). Model id is a `POSTER_IMAGE_MODEL` env override (default sunburst; flare = cheaper/faster fallback). Complex prompts can take up to two minutes, so the route runs with `maxDuration = 300` (already used by `event-radio/generate` and `mini-apps/generate`).

## 4. Architecture

One server-side service in the web app, reused by admin server actions and by two HTTP routes for the chats. No image generation from the device (the Expo app must never hold the OpenAI key).

```
apps/web/src/lib/poster/
  ratio.ts          pure: classifyRatio(w,h) → 'ok' | 'landscape' | 'square' | 'too_tall' | 'too_short'
  analyze.ts        server: probeImage(url) → {w,h,bytes,mime}; classifyImage(bytes) via Claude Sonnet vision
  decide.ts         pure: decideMode(ratioClass, analysis) → 'skip' | 'reformat' | 'design'
  content.ts        pure: buildPosterContent(event) → deterministic German lines (weekday, date, time, place, price, organizer)
  copy.ts           server: draftPosterCopy(event, content) → {subline?, highlights[]} via Claude Sonnet (structured, strings only)
  directions.ts     pure: pickDirections(mode, category, analysis) → two {id,label,brief} style directions
  prompts.ts        pure: buildReformatPrompt(analysis, direction), buildDesignPrompt(content, copy, direction, hasReference)
  openai-image.ts   server-only: renderPoster({prompt, references[], size, quality}) → {bytes, usage, costUsd}
  service.ts        server: proposePosters(input, actor) → analyze → decide → 2× render in parallel → mark (XMP) → upload → rows
  caps.ts           pure + server: per-actor/per-draft/daily-budget limits
```

- `analyze.ts` reads dimensions with the `image-size` package (pure JS, no sharp) and asks `claude-sonnet-4-6` (`@ai-sdk/anthropic`, `generateObject`, strings/booleans only because the provider rejects numeric bounds) for:
  `{ kind: 'poster'|'photo'|'logo'|'graphic'|'screenshot', hasEventInfo, visibleText[] (verbatim lines), hasUiChrome, brandColors[] (hex), styleNotes, quality: 'ok'|'low_res'|'blurry' }`.
- `decideMode`: `skip` when ratio ok ∧ kind poster ∧ hasEventInfo ∧ ¬hasUiChrome ∧ quality ok; `reformat` when (kind poster ∨ screenshot) ∧ hasEventInfo; otherwise `design` (this includes A-format theme photos, as requested, and drafts without any image).
- Variants:
  - `reformat`: **"Originaltreu"** (keep design, colours, fonts, every text verbatim; extend/re-arrange to fill DIN A; remove chrome) and **"Aufgefrischt"** (same texts and brand colours, cleaner modern hierarchy).
  - `design`: two directions from a small per-category table (Sport: plakativ / editorial; Musik: Konzertplakat / clean; Kultur: editorial / verspielt; Kirchliches: ruhig-serif / modern; Stadt: amtlich-navy / festlich; default: modern / festlich). The uploaded image is passed as reference with "use as logo/photo, do not redraw". Dates, times, prices, places come only from `buildPosterContent` (never from the LLM) so nothing on the poster can be hallucinated; the LLM only drafts an optional subline and ≤3 highlights from the description.
- Every prompt ends with the legibility guard used by the flyer tool (German, no invented text, no watermark, no faces, format filled, nothing cut off) and states "Werbeagentur-Look, kein KI-Kitsch, kein Glühen".
- References are fetched server-side through an SSRF guard (only the Supabase storage host, https, image/*, ≤10 MB; generalised from `isAllowedReferenceUrl` in `actions/flyer.ts`) and sent as bytes.
- Output is JPEG, marked with the existing XMP AI Act marker (`markSyntheticImage(bytes, "Röbel App / OpenAI gpt-image-2.5-sunburst")`), uploaded to bucket `images` under `posters/<eventId | draft-<draftId>>/<uuid>.jpg`, `upsert:false`.

### 4.1 Data model (migration `20260922_event_poster_proposals.sql`)

```sql
create table public.event_poster_proposals (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null,                 -- pairs the two variants of one run
  event_id      uuid references public.events(id) on delete cascade,   -- null while the event is only a draft
  draft_id      uuid,                          -- client-generated id for pre-submit runs
  account_id    uuid references public.accounts(id) on delete set null,
  requested_by  text not null check (requested_by in ('admin','org','submitter')),
  mode          text not null check (mode in ('reformat','design')),
  variant       smallint not null check (variant in (1,2)),
  direction     text not null,                 -- 'originaltreu' | 'aufgefrischt' | 'plakativ' | ...
  source_image_url text,
  image_url     text not null,
  analysis      jsonb not null default '{}',
  prompt        text not null,
  model         text not null,
  usage         jsonb,
  cost_usd      numeric(8,4),
  status        text not null default 'proposed' check (status in ('proposed','selected','rejected')),
  created_at    timestamptz not null default now()
);
create index on public.event_poster_proposals (event_id, created_at desc);
create index on public.event_poster_proposals (draft_id) where draft_id is not null;
alter table public.event_poster_proposals enable row level security;   -- no policies: service role only

alter table public.events
  add column original_image_url text,                                            -- set once, when a proposal is applied
  add column poster_proposal_id uuid references public.event_poster_proposals(id) on delete set null,
  add column poster_reviewed_at timestamptz;                                     -- admin decided (applied or kept original)
```

`app_settings` keys: `poster_proposals_enabled` (kill switch, default true), `poster_daily_budget_usd` (default 20; the service refuses when today's summed `cost_usd` exceeds it), `poster_image_model` (optional override).

### 4.2 API (web, `runtime = "nodejs"`, `maxDuration = 300`)

- `POST /api/posters/propose` — body `{ eventId }` **or** `{ draftId, draft: { title, date, time, end_time, location, category, ticket_price, organizer_name, description, website_url, image_url? } }`, optional `{ hint, accountId }`. Returns `{ batchId, mode, ratio, analysisSummary, proposals: [{ id, variant, direction, image_url }] }` or `{ skipped: 'ratio_ok_poster' }`. Synchronous (≈ 40–80 s).
- `POST /api/posters/select` — `{ proposalId, apply }`. Marks the pair selected/rejected; with `apply` on an event-linked proposal sets `events.image_url`, `original_image_url` (only if null), `poster_proposal_id`, `poster_reviewed_at`.
- `POST /api/posters/link` — `{ draftId, eventId }`. After a draft was inserted, attaches its proposals (checks that `events.image_url` equals one of the pair's URLs or the caller owns the account).
- Auth: admin session cookie (`isAuthenticated()`), or org owner via `x-wallet-address` + `accountId` checked against `account_owners` (the pattern `api/mecky/story-draft` already uses), or submitter for drafts. Abuse control because every call costs money: per draft max 2 batches, per account 10 batches/day, per IP 5/hour for drafts, plus the daily budget and the kill switch. Signed wallet requests (as in the `org-membership` edge function) are a hardening follow-up; the same weakness exists in the story routes today.

Admin pages call `service.ts` through server actions (no HTTP hop).

### 4.3 Admin dashboard (web)

- New page **`/admin/dashboard/events/poster`** ("Plakate"): census header (A-Format ✓ / fehlt / Vorschläge bereit / übernommen), list of upcoming events (`date ≥ today`, status approved or pending). Per row: the image inside an A-box with `cover` (shows exactly the crop the app does today), ratio chip (Querformat 3:2, Quadratisch, A4 ✓, …), state chip, action "Vorschläge erzeugen" or "Prüfen". Button **"Alle fehlenden erzeugen"** runs a client-driven queue (one server action per event, concurrency 2, progress bar, resumable, skips events that already have an open batch).
- Review page **`/admin/dashboard/events/poster/[eventId]`**: original at natural ratio + "in der App heute" A-box crop, then Variante A and Variante B in large A-boxes. Click → lightbox (`Dialog`, prev/next, keyboard). Per variant: "Herunterladen" (existing `downloadImage` helper) and "Übernehmen". Footer: "Neu erzeugen" with a hint field (new batch), "Original behalten" (marks the pair rejected, sets `poster_reviewed_at`). Every generated image carries a small "KI-generiert" label.
- Existing list `/admin/dashboard/events` gets a per-row ratio/state chip linking to the review page. No other change there.

### 4.4 Expo AI submission chat (`apps/expo/components/ai/MinimalAIChat.tsx`)

- Flow today: `prepare_event_submission` tool → recap card → "Ja, einsenden" → `confirm_event_submission` → swipe-to-submit → client insert. New step between "Ja, einsenden" and the swipe control: the client calls `POST /api/posters/propose` with the draft (`draftId` = uuid generated per chat) and shows a new message kind `posterProposal`.
- `PosterProposalCard` (new component, StyleSheet + `useTheme`): heading "Zwei Plakat-Vorschläge", a horizontal paged carousel with two large A-ratio cards (≈ 78 % of the screen width each, page dots), a "KI-generiert" chip, loading skeleton in A-ratio while generating (with the German note that this takes about a minute). Tap → the existing `ImageZoomModal` with `images=[A,B]` (pinch zoom, prev/next). Buttons per card: "Diese wählen", "Speichern". Footer: "Original behalten", "Andere Vorschläge" (once per draft).
- Selection sets `eventRecap.image_url` to the chosen URL, appends "Variante A übernommen" and reveals the swipe control; after the insert the client calls `/api/posters/link`. Any failure or timeout of the proposal step falls back silently to the original image (short note), never blocks the submission.
- **Download:** "Speichern" = `FileSystem.downloadAsync` to cache, then `expo-media-library` `saveToLibraryAsync`. `expo-media-library` is not in the app today, so this part needs the **next EAS build**; in the current 3.7.0 runtime the button falls back to the system share sheet (iOS) / opening the image in the browser (Android). The rest of the feature is OTA-able.
- Base URL and headers follow `apps/expo/lib/story-api.ts` (extracted into a small `lib/web-api.ts`); the wallet address goes in `x-wallet-address`, the active account id in the body.

### 4.5 Web AI submission chat (`/app/submit-ai`)

Today the route (`api/chat/event-submission/route.ts`, `gpt-4o`, AI SDK 6) inserts the event inside the `submitEvent` tool and streams plain text, so the client cannot show anything structured before the insert. Change:

- Route switches to `toUIMessageStreamResponse()`; the client uses `useChat` from `@ai-sdk/react`. Tools: `searchLocation`, `extractFlyer` unchanged; `submitEvent` becomes `prepareEventSubmission` (validates, returns the payload, **no insert**).
- Client renders the recap on that tool part, then "Ja, weiter" → server action `proposeEventPosters(draft)` → shared component `PosterProposalPair` (two A-ratio cards, `Dialog` lightbox with prev/next, download links, select, keep original, regenerate once) → server action `submitPreparedEvent(draft, chosenImageUrl, accountId)` inserts with `status: 'pending'`, server-validated `account_id`, and links the proposals.
- `PosterProposalPair` is the same component the admin review page uses.

### 4.6 Explore display

Unchanged. Once images are DIN A, `cover` shows them edge to edge; the ±8 % tolerance means a residual crop of at most 4 % per side.

## 5. Cost, limits, compliance

- ≈ $0.15 per pair, ≈ $0.30 with one regeneration. Admin batch for the current backlog ≈ $3.30. Token usage and `cost_usd` are stored per row; the admin page shows today's spend.
- Daily budget (`app_settings.poster_daily_budget_usd`) and kill switch (`poster_proposals_enabled`) as in §4.1; per-actor caps as in §4.2.
- AI Act Art. 50(2): every generated file gets the XMP `trainedAlgorithmicMedia` marker (existing helper); UI shows "KI-generiert" on proposals. The app's event pages keep showing the chosen poster without a badge, like the flyers attached today.
- Storage: `posters/` is not in the orphan-GC whitelist (`20260829_storage_cleanup_helpers.sql`), so nothing is deleted automatically; both variants are kept. Adding `posters/` to the GC with `event_poster_proposals.image_url` as reference is a follow-up.

## 6. Testing

- `node:test` for the pure modules: `classifyRatio` (the 29 census cases), `decideMode`, `buildPosterContent` (German weekday/date, "Eintritt frei" for 0, omitted when null, end time), `pickDirections`, prompt builders (verbatim-text rule present in reformat prompts, no date text in design prompts other than the deterministic lines), cap arithmetic, cost calculation from `usage`.
- One opt-in integration script (`POSTER_SMOKE=1`) that renders one pair for a fixture event, like today's probe.
- Manual: admin batch on the 20 current events (review each pair); Expo flow on the emulator from the preview channel before any OTA (per the OTA rules in memory); web chat end to end on a Vercel preview.

## 7. Slices

1. **Core + admin** — SHIPPED 2026-09-22: lib `apps/web/src/lib/poster/*`, migration `20260922_event_poster_proposals.sql` (applied), service, admin pages `/admin/dashboard/events/poster` (+ `[eventId]`), API routes `/api/posters/{propose,select,link}`, batch script `apps/web/scripts/poster-batch.ts`. First run: 9 events got pairs (variant A applied live), 3 A-format posters skipped, run stopped when the OpenAI organisation ran out of prepaid credits (17 events open). Deviations: per-IP cap dropped (every caller must own an account); the events-list row got a link instead of a ratio chip; `keepOriginal` reverts an applied proposal.
2. **Expo chat** — `PosterProposalCard`, propose/select/link calls, fallback download; `expo-media-library` behind a build-gated flag.
3. **Web chat** — route/client restructure to the UI message stream, `PosterProposalPair`, `submitPreparedEvent`.
4. **Follow-ups** — classic form `/app/submit`, org dashboard event edit ("Plakat" tab beside "Flyer"), signed wallet requests, GC whitelist, print-size 2048×2896 option.

## 8. Decisions assumed (please confirm or change)

1. "Web submission" = the AI chat at `/app/submit-ai` first; the classic form `/app/submit` is slice 4.
2. Expo "download both" = save to Photos via `expo-media-library`, which needs a new EAS build; share/open fallback meanwhile.
3. Applying a proposal overwrites `events.image_url` and keeps the original in `original_image_url`; no separate `poster_url` column, so the Expo app needs no change to show it.
4. Render size 1440×2032 at quality `high`; no `xhigh`.
5. Drafts without any image also get two designed posters (design mode, no reference).
6. A-format theme photos (e.g. Friedenskonzert 1000×1333) get proposals too, because they are not posters.
7. Auth for the chat routes = wallet header + account ownership + caps (the existing story-route pattern), signed requests later.
8. The admin batch is run by hand from the new page, not automatically on every new approval.

## 9. Observations outside this scope (flag only)

- `EXPO_PUBLIC_ANTHROPIC_API_KEY` and `EXPO_PUBLIC_OPENAI_API_KEY` are compiled into the Expo bundle; the Expo AI submission talks to Anthropic directly from the device.
- `apps/web/middleware.ts` (unsigned JSON cookie) is a stale duplicate of `apps/web/src/middleware.ts` (HMAC-verified).
- `apps/expo/lib/tools/event-submission-tools.ts` inserts events without `account_id` (currently unreachable from the UI).
- `supabase/migrations/20260726_flyers.sql` line 1 still says "gpt-image-1".
