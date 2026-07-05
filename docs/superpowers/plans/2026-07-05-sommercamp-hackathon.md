# Sommer Camp Hackathon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Sommer Camp hackathon stack: `/sommercamp` landing page with wallet registration, the AI editor externalized to `/editor`, Nano Banana 2 icon/preview generation with in-editor screenshots, and an Expo developer-mode mini-app preview.

**Architecture:** Four independently mergeable workstreams in one branch (`feat/sommercamp-hackathon`). All web work lives in apps/web (Next.js 15 App Router, Tailwind); image generation calls KIE `nano-banana-2` from Next API routes with client polling; Expo work is a self-contained AsyncStorage-backed mode.

**Tech Stack:** Next.js 15, Tailwind, thirdweb wallet auth, Supabase (service-role via existing helpers, `images` bucket), KIE jobs API, Expo/expo-router + react-native-webview.

**Spec:** `docs/superpowers/specs/2026-07-05-sommercamp-hackathon-design.md`

## Global Constraints

- All UI copy German; currency wording "Röbel-Münzen" only, never CRC/Circles.
- Never show raw wallet addresses in UI — display names only.
- Primary color `#00498B`; roll-up palette: night navy `#0E1A38/#101F42`, gold `#FFD84D`, sky `#9CC4EA`.
- Web styling = Tailwind; Expo styling = `StyleSheet.create()` + `useTheme()` (NO NativeWind).
- pnpm only. Commit convention `feat(web): …` / `feat(expo): …`.
- No real API keys in the repo; `.env.example` placeholders only.
- Verification = lint changed files + drive the dev server (no unit-test infra in apps/web; ~431 pre-existing tsc errors are NOT ours to fix).
- Supabase schema changes go through the Supabase MCP AND are checked into `supabase/migrations/`.

---

### Task 1 (W2): Externalize the AI editor to `/editor`

**Files:**
- Move: `apps/web/src/app/dashboard/mini-apps/new/` → `apps/web/src/app/editor/` (page.tsx, components/, lib/)
- Create: `apps/web/src/app/dashboard/mini-apps/new/page.tsx` (redirect stub)
- Modify: `apps/web/src/app/dashboard/mini-apps/page.tsx` (links), `apps/web/src/app/dashboard/mini-apps/[id]/page.tsx` (KI-Editor link if present)

**Interfaces:**
- Produces: editor at route `/editor`, reopen via `/editor?app=<slug>`. All later tasks link to these URLs.

- [ ] Step 1: `git mv apps/web/src/app/dashboard/mini-apps/new apps/web/src/app/editor`; fix any imports that referenced the old depth (search `../../` chains and `@/` aliases inside moved files).
- [ ] Step 2: Redirect stub preserving query:

```tsx
// apps/web/src/app/dashboard/mini-apps/new/page.tsx
import { redirect } from "next/navigation";

export default async function LegacyNewMiniApp({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") params.set(k, v);
  }
  const qs = params.toString();
  redirect(qs ? `/editor?${qs}` : "/editor");
}
```

- [ ] Step 3: Update dashboard links: "Mit KI erstellen" → `/editor`; per-app "KI-Editor" → `/editor?app=<slug>`.
- [ ] Step 4: Verify: `pnpm dev:web`; open `/editor` (new app boots), `/dashboard/mini-apps/new?app=x` redirects to `/editor?app=x`; dashboard links work.
- [ ] Step 5: Commit `feat(web): move AI mini-app editor to external /editor route`.

### Task 2 (W1a): `hackathon_registrations` migration

**Files:**
- Create: `supabase/migrations/20260705_hackathon_registrations.sql`

**Interfaces:**
- Produces: table `hackathon_registrations` (DDL below) used by Task 3/5.

- [ ] Step 1: Write DDL (spec §W1, RLS on, no anon policies):

```sql
create table if not exists hackathon_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null default 'sommercamp-2026',
  wallet text not null,
  name text not null,
  age int,
  privacy_accepted_at timestamptz not null,
  agb_accepted_at timestamptz not null,
  newsletter_opt_in boolean not null default false,
  unique (event, wallet)
);
alter table hackathon_registrations enable row level security;
```

- [ ] Step 2: Apply via Supabase MCP `apply_migration` (project wwbeqhkslxdxhktqzqti); confirm with `list_tables`.
- [ ] Step 3: Commit `feat(web): hackathon_registrations table for Sommer Camp signup`.

### Task 3 (W1b): Registration API route

**Files:**
- Create: `apps/web/src/app/api/sommercamp/register/route.ts`
- Read for reuse: `apps/web/src/lib/miniapp/http.ts` (developer upsert + service client), `apps/web/src/app/actions/newsletter-public.ts` (throttle + subscribe)

**Interfaces:**
- Consumes: `getOrCreateDeveloper`/service-role client from lib/miniapp; `subscribeToNewsletter(email)` behavior from newsletter action (extract/reuse its core, don't duplicate the double-opt-in logic).
- Produces: `POST /api/sommercamp/register` body `{ name: string; age: number; privacy: true; agb: true; newsletterOptIn?: boolean; email?: string }` + wallet header `x-wallet-address`. Responses: `200 {ok:true, already?:true}`, `400` field errors `{error}`, `429 {error}`. Also `GET /api/sommercamp/register?wallet=0x…` → `{registered: boolean}` for the "Du bist angemeldet" state.

- [ ] Step 1: Implement route: validate (name 2–80 chars, age 6–99 int, privacy/agb true), per-IP in-memory throttle (10/h, copy newsletter pattern), resolve wallet like other mini-app routes, upsert developer (set display_name if empty), upsert registration on `(event,wallet)` with timestamps, fire newsletter subscribe when opted in + email valid (errors there are non-fatal).
- [ ] Step 2: Verify with curl: happy path 200, missing checkbox 400, repeat wallet → `already:true`, GET reflects registration.
- [ ] Step 3: Commit `feat(web): Sommer Camp registration API (wallet + name/age + consents)`.

### Task 4 (W1c): Landing page `/sommercamp`

**Files:**
- Create: `apps/web/src/app/sommercamp/page.tsx`, `apps/web/src/app/sommercamp/layout.tsx`
- Create: `apps/web/src/components/sommercamp/SommercampPage.tsx` (mode state + sections), `RegistrationCard.tsx` (connect + form), `sections.tsx` (Hero/Video/Preise/Ablauf/FAQ) — split if any file exceeds ~300 lines.

**Interfaces:**
- Consumes: `POST/GET /api/sommercamp/register` (Task 3), existing thirdweb connect (same client/wallet config the dashboard's `useWallet` uses).
- Produces: public page at `/sommercamp`; `SOMMERCAMP_VIDEO_ID` exported constant (empty string = placeholder shown).

- [ ] Step 1: Invoke frontend-design skill; build page skeleton per approved mockup — sections Hero → Video → Was ist das? → Preise (100/50/50 €) → Ablauf (Fr 10.07. Kickoff Schule Röbel / Bauwoche / Fr 17.07. Finale & Siegerehrung) → Anmeldung `#mitmachen` → FAQ → footer links.
- [ ] Step 2: Day/night theming: `mode: 'day' | 'night'` state; init: `localStorage['sommercamp-mode']` else hour ≥ 6 && < 20 ? day : night (in effect, default day for SSR); sun/moon toggle persists override; `data-mode` on root, conditional Tailwind classes per approved palettes.
- [ ] Step 3: RegistrationCard: not connected → custom-styled connect button; connected → GET registered? "Du bist angemeldet ✓ → Zum Baukasten (`/dashboard/mini-apps`)" : form (Name, Alter, Datenschutz*, AGB*, Newsletter optional revealing Email field) → POST → success → `router.push('/dashboard/mini-apps?welcome=sommercamp')`. German validation errors inline.
- [ ] Step 4: `layout.tsx`: metadata title "Sommer Camp – Mini-App Hackathon | Röbel App", description, OG.
- [ ] Step 5: Verify in browser: both modes, toggle persists, register end-to-end (wallet connect on localhost), duplicate state, video placeholder.
- [ ] Step 6: Commit `feat(web): /sommercamp hackathon landing page (day/night, wallet registration)`.

### Task 5 (W1d): Admin registrations list + dashboard welcome banner

**Files:**
- Create: `apps/web/src/app/admin/dashboard/sommercamp/page.tsx` (follow an existing admin page's requireAdmin/session pattern)
- Modify: `apps/web/src/app/dashboard/mini-apps/page.tsx` (welcome banner)
- Modify: admin dashboard nav (wherever siblings register, e.g. admin dashboard layout/nav list)

**Interfaces:**
- Consumes: `hackathon_registrations` via service-role client (server component query).

- [ ] Step 1: Admin page: count headline + table (Name, Alter, Angemeldet am, Newsletter ✓/–). No wallet addresses.
- [ ] Step 2: Welcome banner on `/dashboard/mini-apps` when `?welcome=sommercamp`: „Willkommen beim Sommer Camp! Erstelle deine erste Mini-App mit KI." + CTA → `/editor`; dismiss = strip query.
- [ ] Step 3: Verify: admin login → list shows test registration; welcome banner renders + dismisses.
- [ ] Step 4: Commit `feat(web): Sommer Camp admin registrations + builder welcome banner`.

### Task 6 (W3a): KIE Nano Banana 2 client + images API

**Files:**
- Create: `apps/web/src/lib/miniapp/images/kie.ts`, `apps/web/src/lib/miniapp/images/storage.ts`
- Create: `apps/web/src/app/api/mini-apps/images/route.ts` (POST create task), `apps/web/src/app/api/mini-apps/images/status/route.ts` (GET poll+finalize), `apps/web/src/app/api/mini-apps/images/upload/route.ts` (POST direct upload)
- Modify: `apps/web/.env.example` (+`KIE_API_KEY=`)
- Read for reuse: `apps/expo/supabase/functions/generate-menu-image/index.ts` (KIE contract), `apps/web/src/lib/miniapp/http.ts` (auth/ownership)

**Interfaces:**
- Consumes: `resolveDeveloper(req)` + app-ownership check (developer_id match; admin session also allowed).
- Produces:
  - `createImageTask({prompt, referenceUrls?}): Promise<string /*taskId*/>` and `getImageTask(taskId): Promise<{state:'pending'|'success'|'fail', url?:string, error?:string}>` in kie.ts (model `nano-banana-2`, `aspect_ratio:'1:1'`, `output_format:'png'`, reference images via the model's image-input field per KIE docs).
  - `POST /api/mini-apps/images` `{appId, kind:'icon'|'preview', slot?:number(0-4), prompt?, referenceUrl?}` → `{taskId}`; server builds final prompt from app name/description/category/primaryColor (+user prompt), German errors; in-memory 20/day/developer limit → 429.
  - `GET /api/mini-apps/images/status?taskId=&appId=&kind=&slot=` → `{status:'pending'} | {status:'done', url} | {status:'error', error}`; on first success: download PNG → upload `images` bucket `mini-apps/<appId>/{icon|preview-<slot>}_<ts>.png` → update `mini_apps.icon_url` or `screenshots[slot]`.
  - `POST /api/mini-apps/images/upload` multipart `{appId, kind:'icon'|'preview'|'shot', slot?}` + file → same bucket paths (`shots/<ts>.png` for kind shot, no row update) → `{url}`; and `GET /api/mini-apps/images/upload?appId=` → `{shots: string[]}` (list bucket `mini-apps/<appId>/shots/`).

- [ ] Step 1: Implement kie.ts against the same `createTask`/`recordInfo` endpoints as generate-menu-image, Bearer `KIE_API_KEY`.
- [ ] Step 2: Implement the three routes (ownership + validation + limits as above).
- [ ] Step 3: Verify with curl (needs KIE_API_KEY in `.env.local`; without it, POST returns clear 503 „Bildgenerierung nicht konfiguriert"): create icon task → poll until done → `mini_apps.icon_url` updated; upload path works without KIE key.
- [ ] Step 4: Commit `feat(web): Nano Banana 2 image API for mini-app icons & store previews`.

### Task 7 (W3b): Dashboard „Bilder" section (1:1 tiles)

**Files:**
- Create: `apps/web/src/components/mini-apps/ImagesSection.tsx`
- Modify: `apps/web/src/app/dashboard/mini-apps/[id]/page.tsx` (mount section)

**Interfaces:**
- Consumes: Task 6 endpoints; app row (id, icon_url, screenshots, name).

- [ ] Step 1: Build UI: „App-Icon" 1:1 tile (icon or gray placeholder `bg-muted` + image icon) with „Hochladen" / „Mit KI generieren"; „Store-Vorschau" grid of 5 1:1 tiles (existing screenshots then gray placeholders) each offering Hochladen / KI generieren / „Aus Screenshot" (picker over `GET …/upload?appId` shots; selected shot = referenceUrl). Generation shows spinner tile + 2.5s polling; errors as toast, tile reverts.
- [ ] Step 2: Delete/replace: preview tile menu „Entfernen" → PATCH via existing `/api/mini-apps/[id]` manifest update (screenshots array without the URL).
- [ ] Step 3: Verify in browser: upload icon + preview, generate (if key), remove, 1:1 rendering, German copy.
- [ ] Step 4: Commit `feat(web): Bilder section — 1:1 icon & store previews with NB2 generation`.

### Task 8 (W3c): Screenshot capture in editor + HTML template

**Files:**
- Modify: `apps/web/src/lib/miniapp/ai/htmlPrompt.ts` (boilerplate gains capture handler)
- Modify: editor preview toolbar (moved in Task 1, `apps/web/src/app/editor/components/PreviewFrame.tsx`)

**Interfaces:**
- Produces: iframe protocol — parent sends `{type:'netizen:capture'}` via postMessage; document replies `{type:'netizen:capture:result', dataUrl}` or `{type:'netizen:capture:error', error}`. Editor button uploads result via `POST /api/mini-apps/images/upload` (kind `shot`; unsaved new apps: button disabled until app exists/published).

- [ ] Step 1: Add to the boilerplate `<head>` script (so ALL newly generated docs have it):

```html
<script>
window.addEventListener("message", async (e) => {
  if (e.data?.type !== "netizen:capture") return;
  try {
    const { toPng } = await import("https://esm.sh/html-to-image@1.11.11");
    const dataUrl = await toPng(document.body, { pixelRatio: 2 });
    parent.postMessage({ type: "netizen:capture:result", dataUrl }, "*");
  } catch (err) {
    parent.postMessage({ type: "netizen:capture:error", error: String(err) }, "*");
  }
});
</script>
```

- [ ] Step 2: PreviewFrame toolbar „Screenshot" button: postMessage into iframe, await result (10s timeout), dataURL → Blob → upload (kind shot) → toast „Screenshot gespeichert — im Dashboard unter Bilder". Note: apps generated before this ship lack the handler → show timeout toast „App neu generieren, um Screenshots zu aktivieren".
- [ ] Step 3: Verify: generate app in /editor → Screenshot → appears in dashboard „Aus Screenshot" picker; stylize path (shot as reference) produces preview if key set.
- [ ] Step 4: Commit `feat(web): in-editor mini-app screenshots via capture bridge`.

### Task 9 (W4): Expo developer mode + URL preview

**Files:**
- Create: `apps/expo/context/DeveloperModeContext.tsx` (clone ExtendedModeContext; key `@developer_mode_enabled`)
- Create: `apps/expo/app/settings/dev-mini-app.tsx`
- Modify: `apps/expo/app/_layout.tsx` (provider + screen registration next to other settings/* screens)
- Modify: `apps/expo/app/settings.tsx` (new „Entwickler" section)

**Interfaces:**
- Consumes: `MiniAppHost` (`components/miniapp/MiniAppHost.tsx`) with synthetic `MiniApp`; `CustomToggle` (`components/consent/CustomToggle.tsx`); `MiniApp` type from `lib/miniapps.ts`.
- Produces: `useDeveloperMode(): { isDeveloperMode: boolean; toggleDeveloperMode(): void }`.

- [ ] Step 1: Context provider (AsyncStorage-backed bool, same shape as ExtendedModeContext) + register in `_layout.tsx`.
- [ ] Step 2: Settings: section „Entwickler" with toggle row „Entwicklermodus" (description „Mini-Apps per URL testen"); when on, row „Mini-App Vorschau ›" → `router.push('/settings/dev-mini-app')`.
- [ ] Step 3: dev-mini-app screen (StyleSheet + useTheme): TextInput (autoCapitalize off, keyboardType url, prefill AsyncStorage `@developer_mode_last_url`), validate `^https?://`, „Öffnen" → save URL → render `<MiniAppHost app={syntheticApp} visible onClose>` with

```ts
const syntheticApp: MiniApp = {
  id: "dev-preview", slug: "dev-preview", name: "Dev Preview",
  iconUrl: null, homeUrl: url.trim(), description: null,
  category: "utility", tags: [], screenshots: [],
  permissions: ["wallet", "rewards", "notifications", "circles", "share"],
  primaryColor: "#00498B", featured: false, status: "live", authorName: null,
}; // match lib/miniapps.ts MiniApp shape exactly
```

- [ ] Step 4: Verify: expo ios simulator — toggle on, open `https://netizen-roebel-data.vercel.app/`, bridge context works, close returns; toggle off hides row.
- [ ] Step 5: Commit `feat(expo): developer mode — preview mini apps by URL`.

### Task 10: Final verification + integration

- [ ] Step 1: `pnpm lint` (web + expo scopes) — no NEW errors vs baseline.
- [ ] Step 2: Drive the four flows once more end-to-end (verify skill); fix anything found.
- [ ] Step 3: Push branch; invoke finishing-a-development-branch (merge to main is the default — Vercel deploys /sommercamp; remind user: `KIE_API_KEY` Vercel env, `SOMMERCAMP_VIDEO_ID` swap, QR = https://roebel.app/sommercamp).
