# AI Mini-App Builder v2 — single-file, chat-iterative, standalone (2026-07-04)

Replaces the file-plan AI builder at `/dashboard/mini-apps/new` with a v0.dev-style
standalone workspace that generates **single-file HTML mini apps** for the Röbel App.
Supersedes §"AI builder" of `2026-07-03-netizen-mini-apps-design.md` for the AI path only —
the manual submit flow, review queue, rewards rail, and the multi-file Next.js app format
(`apps/mini-apps/*`, used by `roebel-data` and external devs) are untouched.

## Why replace the current builder

Research across open-source v0 alternatives (Dyad, bolt.diy, Onlook, LlamaCoder/open-v0):
only the **LlamaCoder pattern** — chat panel → streamed code → sandboxed live preview →
iterate — embeds inside an existing Next.js dashboard. bolt.diy needs WebContainers, Dyad is
an Electron app, Onlook needs the CodeSandbox SDK.

The current builder has three structural dead-ends:

1. **Single prompt, no iteration** — the core v0 loop (refine via chat) is missing.
2. **Preview is a static server render** (`node:vm` + `renderToStaticMarkup`) — no
   interactivity, no real bridge traffic.
3. **Publish writes generated files to the server filesystem** (`apps/mini-apps/<slug>/`) —
   impossible on Vercel's read-only FS, and deploy is stubbed behind a Vercel Deploy Button.
   Nothing an end user builds can actually go live.

## Core decision: generated artifact = one self-contained HTML document

A mini app only needs to be *a web page that speaks the Netizen bridge*. The published
`@netizen-labs/miniapp-sdk@0.1.0` resolves as a browser ES module via esm.sh (verified), so a
single HTML file with `<script type="module">` can run the **real SDK** — in the builder's
preview iframe, in the admin Playground, and in the Expo WebView. Consequences:

- **Interactive preview, client-side only**: iframe `srcdoc` + the existing
  `createWebMiniAppHost` (apps/web `src/lib/miniapp-host/`) = real `ready()`/context/balance/
  track calls. No server preview route, no TS transpile in `node:vm`.
- **Publish that actually ships**: HTML stored in Supabase (`mini_app_versions.html`),
  served by a new `GET /mini/[slug]` route in apps/web. `home_url` points at the web app
  itself. Works on Vercel; the Expo host loads it like any URL. No deploy pipeline needed.
- **Chat iteration is cheap**: one file = the model regenerates the full document each turn
  (LlamaCoder approach), no diff bookkeeping.

Stack inside the generated file: Tailwind Play CDN (config injected with the Röbel tokens),
Mona Sans via CDN, SDK from esm.sh (pinned `@0.1.0`), vanilla ES-module JS by default
(preact+htm via esm.sh allowed for heavy state). German copy, mobile-first 360px.

## Components

1. **Prompt module** `apps/web/src/lib/miniapp/ai/htmlPrompt.ts`
   System prompt = role + hard rules (must `sdk.actions.ready()`, catch-guard for no-host,
   untrusted context, copy rules: German / no wallet addresses / "Röbel-Münzen" never CRC)
   + `DESIGN.md` content + condensed `NetizenSDK` surface + a minimal valid skeleton app.
   Design + SDK reference are inlined as constants (mirroring the frozen contracts) — the
   old builder read them from the monorepo FS at runtime, which breaks on Vercel lambdas.
   Output contract: a complete HTML document, no markdown fences.

2. **Generate route** `POST /api/mini-apps/generate` (rewrite)
   Body `{messages: [{role, content}][≤24], html?: string, complexity?: "default"|"hard"}`.
   `streamText` via `@ai-sdk/anthropic` (unchanged model wiring: `claude-sonnet-5`,
   `claude-opus-4-8` for "hard"); prior turns passed as text (old code versions elided
   client-side), current `html` embedded in the final user turn. Streams raw text.

3. **Manifest route** `POST /api/mini-apps/manifest` (new)
   `generateObject` → draft manifest (name, slug, description, category, tags, permissions,
   inline-SVG data-URI icon) from the HTML + conversation. Prefills the publish form;
   user edits before publishing.

4. **Publish route** `POST /api/mini-apps/publish` (rewrite, replaces FS publish)
   Body `{html, manifest}` + `x-wallet-address` → `resolveDeveloper`. Validates manifest
   (existing zod `manifestSchema`) + HTML size cap. New app: insert `mini_apps`
   (status `pending`, source `ai_builder`, budget 0) + `mini_app_versions` row with `html`.
   Same-developer existing slug: new version row + `mini_apps` back to `pending` (re-publish).
   Foreign slug: 409. `home_url = ${origin}/mini/<slug>`.

5. **Serve route** `GET /mini/[slug]` (new)
   Latest version's `html` via admin client; 404 unknown, 410 suspended/rejected;
   `text/html` + short s-maxage cache.

6. **Builder page** `/dashboard/mini-apps/new` (rebuild, standalone)
   Full-viewport workspace outside the dashboard chrome (pathname-based bypass in
   `dashboard/layout.tsx` + mini-apps layout, same idiom as the existing org-gate exemption;
   `AuthGuard` stays). Empty state: centered composer + example chips. Workspace: chat panel
   left (history, streaming status, version pills with restore); right pane tabs
   **Vorschau** (phone frame, iframe `srcdoc`, wired to `createWebMiniAppHost` with the real
   wallet/user context, splash until `ready()`) and **Code** (read-only, streams in live).
   Top bar: back link, title, model toggle, Veröffentlichen button → manifest sheet →
   success panel with live `home_url`. Preview re-renders when a generation completes.

7. **DB migration** (Supabase MCP): `alter table mini_app_versions add column html text`.
   RLS unchanged (service-role only; serve route is server-side).

8. **Removals** (superseded, after import check): `generate/preview/route.ts`,
   `lib/miniapp/ai/preview.ts`, `systemPrompt.ts`, `template.ts`, old `publish.ts`,
   `new/components/LivePreview.tsx`, `GeneratedFiles.tsx`, `new/lib/streamParse.ts`.
   `filePlan.ts` shrinks to the manifest schema.

## Error handling

- Generate: stream abort supported (Stop button); non-HTML/fenced output stripped
  defensively client-side; empty result → retriable error bubble in chat.
- Publish: uniform `MiniAppError` JSON (`slug_taken` 409, `unauthorized` 401, size 400).
- Serve: apps never cached long (s-maxage 60) so review-state flips take effect quickly.
- Preview: SDK calls settle through the real host; reward calls against the unpublished
  preview app id fail soft (host replies with bridge errors, shown in a call log strip).

## Testing

Repo has no web test infra; verification = `pnpm build` (web), dev-server smoke of
generate/manifest/publish/serve with a seeded row, and an end-to-end manual drive of the
page (generate → iterate → preview bridge traffic → publish → open `/mini/<slug>`).
