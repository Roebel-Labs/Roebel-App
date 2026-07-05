# Sommer Camp Mini-App Hackathon — Design

Date: 2026-07-05 · Status: approved (user approved approach + landing mockup; "go build")
Event: Mini-App Hackathon at Schule Röbel, **Fr 10. Juli – Fr 17. Juli 2026**. Printed
roll-ups (2, one per entrance) carry a QR code pointing at **https://roebel.app/sommercamp**.
Prizes: 1. Platz 100 €, 2. Platz 50 €, 3. Platz 50 €.

Four independently mergeable workstreams, all in this repo.

## W1 — Landing page `/sommercamp` + registration

**Route**: `apps/web/src/app/sommercamp/` (server `page.tsx` + `layout.tsx` metadata/OG),
client components in `apps/web/src/components/sommercamp/`. German copy. Modeled on
`landesmeisterschaft/` structurally; visuals match the roll-ups.

**Theme (user amendment)**: the page has BOTH roll-up looks.
- Day (≈06:00–20:00 local): light — yellow→sky gradient hero, dark text.
- Night: dark — navy night sky, gold accents, registration section fades into gold.
- Manual sun/moon toggle on the page overrides the time-based default (state is
  page-local, not the site theme; persisted in `localStorage`).
- Implementation: `data-mode="day|night"` attribute on the page root + conditional
  Tailwind classes; initialized client-side (default day, effect sets by hour +
  stored override).

**Sections**: Hero (RÖBEL APP badge, SOMMER CAMP, Mini-App Hackathon, chip
"10. JULI – 17. JULI", "Baue Apps für Röbel und gewinne 100 €", CTA scrolls to
`#mitmachen`) → Video (YouTube embed behind `SOMMERCAMP_VIDEO_ID` constant; styled
"Video folgt in Kürze" placeholder while empty) → Was ist das? → Preise (100/50/50 €)
→ Ablauf (Fr 10.07. Kickoff Schule Röbel · Bauwoche mit KI-Baukasten · Fr 17.07.
Finale & Siegerehrung; times editable placeholders) → Anmeldung → FAQ → footer links
Impressum/Datenschutz/AGB.

**Registration** (`#mitmachen`): custom-styled thirdweb connect (reuse existing web
wallet login). When connected: Name (required), Alter (required, 6–99), Datenschutz +
AGB checkboxes (required, link existing pages), Newsletter (optional; when checked an
email field appears; goes through existing double-opt-in `subscribeToNewsletter`).
Submit → `POST /api/sommercamp/register`:
- upsert `developers` row for wallet (display_name = Name) — registration IS developer onboarding
- upsert `hackathon_registrations` (unique event+wallet)
- per-IP in-memory rate limit (newsletter pattern)
- success → redirect `/dashboard/mini-apps?welcome=sommercamp` (one-time welcome banner
  pointing at "Mit KI erstellen"). Reconnecting registered users see "Du bist
  angemeldet" + "Zum Baukasten" instead of the form.

**Table** (checked into `supabase/migrations/` AND applied via Supabase MCP):

```sql
create table hackathon_registrations (
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
-- RLS on, service-role only (no anon policies)
```

**Admin**: `/admin/dashboard/sommercamp` — count + table (name, age, date, newsletter
opt-in). Display names only, never raw wallet addresses.

## W2 — AI editor becomes external `/editor`

Move the builder workspace from `apps/web/src/app/dashboard/mini-apps/new/` to
top-level `apps/web/src/app/editor/` (components/lib move with it). `?app=<slug>`
reopens an existing app (unchanged behavior). `/dashboard/mini-apps/new` becomes a
redirect to `/editor` preserving query params. Dashboard keeps all stateful surfaces
(list, detail, config, budget, images) and links out: "Mit KI erstellen" → `/editor`,
per-app "KI-Editor" → `/editor?app=<slug>`. Editor stays wallet-gated (AuthGuard),
full-viewport, outside the dashboard layout. Publish flow unchanged; after publish
link back to the dashboard app detail.

## W3 — Nano Banana 2 icons + store previews + screenshots

**Model**: KIE `nano-banana-2` (Google Gemini 3.1 Flash Image), same
`createTask`/`recordInfo` job API as `generate-menu-image`. 1:1 aspect, png.

**Dashboard UI** (`/dashboard/mini-apps/[id]` new "Bilder" section):
- Icon: 1:1 tile (current icon or gray placeholder) + "Hochladen" + "Mit KI generieren"
  (prompt built from name/description/category/primary color). Result →
  `mini_apps.icon_url`.
- Store-Vorschau: up to 5 gray 1:1 placeholder tiles → per tile: upload / NB2 generate /
  "aus Screenshot" (pick captured screenshot → NB2 edit with it as reference image,
  polished store-style composite). Results → `mini_apps.screenshots[]` (delete/replace
  supported).

**API** (apps/web, auth via `resolveDeveloper` + app ownership; admin session also allowed):
- `POST /api/mini-apps/images` `{appId, kind: 'icon'|'preview', prompt?, referenceUrl?}`
  → creates KIE task → `{taskId}` (no long-running function).
- `GET /api/mini-apps/images/status?taskId&appId&kind&slot` → polls KIE; on success
  downloads result → uploads to Supabase `images` bucket
  (`mini-apps/<appId>/{icon|preview-<slot>}_<ts>.png`) → updates `mini_apps` row →
  `{status, url}`.
- `POST /api/mini-apps/images/upload` — direct file upload, same bucket + row update.
- Rate limit: 20 generations/day/developer (in-memory + count vs `mini_app_events`
  not required; simple per-dev daily counter table NOT needed — keep in-memory best effort).
- Env: `KIE_API_KEY` in apps/web (Vercel + `.env.example`).

**Screenshot capture (SDK-bridge)**: the AI-builder HTML boilerplate
(`lib/miniapp/ai/htmlPrompt.ts`) gains a tiny built-in capture handler: on a
`netizen:capture` postMessage it renders `document.body` to PNG (html-to-image from
esm.sh, lazy-loaded) and posts back a dataURL. The editor preview toolbar gets
"Screenshot aufnehmen" → uploads via the upload route into a screenshot pool
(bucket `mini-apps/<appId>/shots/`) → shown in the dashboard Bilder section as
reference candidates. Externally hosted apps: manual upload only.

## W4 — Expo developer mode

- `context/DeveloperModeContext.tsx` (clone of `ExtendedModeContext`; key
  `@developer_mode_enabled`), registered in `app/_layout.tsx` provider tree.
- `app/settings.tsx`: new "Entwickler" section — `CustomToggle` row "Entwicklermodus";
  when on, row "Mini-App Vorschau" → `/settings/dev-mini-app`.
- `app/settings/dev-mini-app.tsx` (+ explicit screen registration next to other
  `settings/*` routes): https-URL input (last URL in AsyncStorage
  `@developer_mode_last_url`) + "Öffnen" → renders `<MiniAppHost>` with a synthetic
  `MiniApp` (`id/slug 'dev-preview'`, name "Dev Preview", homeUrl = input, all 5
  permissions, primaryColor #00498B). No DB row. Reward/API calls against the real
  backend will be rejected server-side for a non-live app — expected.

## Error handling

- Registration: field validation with German messages; real errors shown (form is
  user-facing); duplicate = friendly "schon angemeldet" state; rate-limit 429 message.
- Images: KIE fail/timeout → German error toast, tile returns to placeholder; status
  route validates ownership before writing.
- Editor redirect keeps old links working (bookmarks, welcome banner).
- Expo preview: invalid URL disabled button; WebView load errors show existing host
  error state.

## Testing / verification

- Repo has ~431 pre-existing tsc errors → verify via `pnpm lint` on changed files +
  running the web dev server and driving: /sommercamp (both modes, register flow),
  /editor (create + reopen + publish), dashboard Bilder (upload; NB2 gen if
  KIE_API_KEY present), expo dev-mode flow in simulator where feasible.
- Vercel remains the web build gate.

## Out of scope

- Judging/voting tooling for the finale; participant team support; NB2 for the Vite
  circles mini-app; hardening `resolveDeveloper` (known pre-existing gap, unchanged).

## Ops notes (user)

- Add `KIE_API_KEY` to the web app's Vercel env.
- Swap `SOMMERCAMP_VIDEO_ID` when the intro video is uploaded.
- QR on printed roll-ups must encode `https://roebel.app/sommercamp`.
