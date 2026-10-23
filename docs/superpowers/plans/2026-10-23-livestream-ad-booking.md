# Livestream Ad Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisations book and pay for ad slots in a livestream (DanceCup 2026-11-07) from the Röbel App and the web org dashboard; Max reviews them in the admin dashboard; approved ads are ready for the studio.

**Architecture:** New Supabase tables rooted in a shared `livestreams` table (later sub-projects add Cloudflare, chat and donations to it). Booking follows the Stripe Connect ticket pattern exactly: a locking reserve RPC, wallet-signed API routes in `apps/web`, a direct-charge Checkout Session on the livestream's beneficiary connected account, settlement in the existing Connect webhook. Media goes to a private storage bucket through server-minted signed upload URLs, so web and Expo upload the same way.

**Tech Stack:** Supabase (Postgres, RLS, Storage, pg_cron) · Next.js 15 route handlers · Stripe Connect (`stripe` SDK, `lib/stripe-connect.ts`) · thirdweb signing (web `useActiveAccount`, Expo `SigningAccount`) · Expo SDK 56 (`expo-image-picker`, `expo-file-system/legacy`) · tests with `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-22-roebel-studio-livestream-design.md` (§5.1, §6, §7.1)

## Global Constraints

- Code and comments English; all UI copy German. Ads are always called "Werbung"; donations never "Spende".
- Expo: `StyleSheet.create()` + `useTheme()`; no NativeWind. Web: Tailwind.
- Never show a raw wallet address in any UI (show org display names).
- Stripe: direct charges only (`{ stripeAccount }`), fee via `application_fee_amount` = `platformFeeCents(amount)`, cards only, `locale: "de"`, refunds with `refund_application_fee: true`. Never route Münzen/crypto through Stripe.
- Beneficiary for DanceCup = Max's Kleinunternehmen org account (already onboarded); it is a per-livestream column, never hard-coded.
- New surfaces are OFF by default: `app_settings.livestream_ads_enabled` (`'true'` or a comma-separated wallet allowlist), checked server-side on every org route and client-side to hide entry points.
- Supabase via MCP only. Before any write, run `get_project_url` and confirm project ref `wwbeqhkslxdxhktqzqti`. Revoke EXECUTE on new functions from `public, anon, authenticated`.
- No native dependencies in Expo (ships OTA on the current runtime). Max runs every `eas update` himself.
- pnpm only. Commit with pathspecs only (`git commit -- <files>`); check `git branch --show-current` before every commit; push after each commit.
- Deadline: bookable in production by **2026-10-28**.

## Review Focus

1. **Two organisations race for the last place of a package** → exactly one gets it, the other sees "Leider ausgebucht." (Task 1 smoke: concurrent reserve on capacity 1.)
2. **Payment lands after the 35-minute hold expired** → booking still becomes `paid`, flagged `late_payment = true` so Max sees it might exceed capacity; never silently lost. (Task 3 test.)
3. **Checkout requested before the upload finished or with a different file** → refused with `MEDIA_MISSING`; the stored object's size/MIME is checked server-side, not trusted from the client. (Task 4 test.)
4. **Wrong file type or oversize file** (e.g. SVG, 500 MB MOV, 30 MB PNG) → rejected before upload on the client and again on the server with a German message. (Task 2 tests.)
5. **Booking after the deadline, on a draft/ended livestream, or when the beneficiary can't take payments** → clear German refusal, no Stripe session, no held place left behind. (Task 1 smoke + Task 4 test.)

---

### Task 1: Schema, RLS, reserve RPC, storage bucket

**Files:**
- Create: `supabase/migrations/20261023_livestream_ads.sql`

**Interfaces:**
- Produces tables:
  - `livestreams(id uuid pk, event_id uuid unique → events on delete cascade, beneficiary_account_id uuid not null → accounts, title text 1–120, status text 'draft'|'scheduled'|'live'|'ended' default 'draft', ads_enabled bool default false, created_at, updated_at)`
  - `livestream_ad_packages(id, livestream_id → livestreams cascade, name 1–80, description ≤500 null, kind 'logo_banner'|'video_spot'|'main_partner', price_cents int > 0, capacity int null > 0, accepts text[] non-empty ⊆ {'image','video'}, max_video_seconds int null > 0, booking_deadline timestamptz null, sort_order int default 0, is_active bool default true, created_at, updated_at)`
  - `livestream_ad_bookings(id uuid pk, livestream_id, package_id, buyer_account_id → accounts, buyer_wallet text, display_name 1–60, media_kind 'image'|'video', media_mime text, media_path text unique, media_bytes bigint null, amount_cents int, application_fee_cents int default 0, currency 'eur', livemode bool, stripe_account_id, stripe_checkout_session_id (partial unique), stripe_payment_intent_id (partial index), status 'pending'|'paid'|'approved'|'refunded'|'expired'|'cancelled' default 'pending', late_payment bool default false, review_note ≤300 null, expires_at, created_at, paid_at, reviewed_at, reviewed_by_wallet, refunded_at)`
  - `livestream_air_log(id, livestream_id → livestreams cascade, booking_id null → livestream_ad_bookings, item_kind text, started_at timestamptz not null, ended_at null)` (written by the studio in sub-project 3)
- Produces RPC `reserve_livestream_ad(p_booking_id uuid, p_package_id uuid, p_buyer_account_id uuid, p_buyer_wallet text, p_display_name text, p_media_kind text, p_media_mime text, p_media_path text, p_hold_minutes int default 35) returns livestream_ad_bookings`, raising exactly one of: `not_on_sale`, `deadline_passed`, `livestream_not_bookable`, `media_kind_not_accepted`, `too_many_pending`, `sold_out`.
- Produces `expire_livestream_ad_bookings() returns integer` + pg_cron job `expire-livestream-ad-bookings` `*/10 * * * *`.
- Produces private bucket `livestream-ads` (`file_size_limit` 209715200, `allowed_mime_types` `image/png, image/jpeg, image/webp, video/mp4, video/quicktime`).

- [ ] **Step 1: Check the storage limit first.** Via MCP `execute_sql`: `select id, file_size_limit from storage.buckets limit 5;` and check the project's global upload limit in the Supabase dashboard (Storage → Settings). If the global limit is below 200 MB, ask Max to raise it to 200 MB before continuing (video spots need it).
- [ ] **Step 2: Write the migration.** Model it on `supabase/migrations/20260921_stripe_connect_tickets.sql`. RLS on all four tables. Policies: `livestreams` select where `status <> 'draft'`; `livestream_ad_packages` select where `is_active` and the parent livestream has `status in ('scheduled','live')` and `ads_enabled`. `revoke all` on bookings + air log from `anon, authenticated`; revoke insert/update/delete on the two readable tables. RPC rules, in order: lock package `for update`; package missing/inactive → `not_on_sale`; deadline past → `deadline_passed`; livestream not (`scheduled`|`live`) or `ads_enabled` false → `livestream_not_bookable`; `p_media_kind` not in `accepts` → `media_kind_not_accepted`; ≥2 unexpired `pending` for the same `buyer_account_id` on this package → `too_many_pending`; capacity counts `paid`, `approved` and unexpired `pending` → `sold_out`. Insert with `amount_cents = price_cents`, `buyer_wallet = lower(p_buyer_wallet)`, `expires_at = now() + p_hold_minutes`. Expire function sets `pending` past `expires_at` to `expired`. Create the bucket with `insert into storage.buckets … on conflict (id) do nothing`.
- [ ] **Step 3: Apply.** `get_project_url` → confirm ref; `apply_migration` name `livestream_ads`. Then `list_tables` shows the four tables.
- [ ] **Step 4: Smoke test in a rolled-back block.** One `execute_sql` `do $$ … $$` that: picks any approved event and any account; inserts a `scheduled` livestream with `ads_enabled` and a package with `capacity 1`, `accepts '{image}'`; reserves once (ok); second reserve by a different account → expect `sold_out`; reserve with `video` → `media_kind_not_accepted`; set deadline to past → `deadline_passed`; set livestream `draft` → `livestream_not_bookable`; then `raise exception 'SMOKE_OK'`. Expected: the call fails with exactly `SMOKE_OK` (all asserts passed, nothing persisted). Any other message = fix and re-run.
- [ ] **Step 5: Verify grants.** `select has_function_privilege('anon','reserve_livestream_ad(uuid,uuid,uuid,text,text,text,text,text,integer)','execute');` → `false`. `get_advisors` (security) shows no new RLS warnings for these tables.
- [ ] **Step 6: Commit** `supabase/migrations/20261023_livestream_ads.sql` — `feat(db): livestreams + ad packages/bookings schema`.

### Task 2: Shared ad-booking domain helpers (web) + flag key

**Files:**
- Create: `apps/web/src/lib/livestream/ads.ts`, `apps/web/src/lib/livestream/ads.test.ts`
- Modify: `apps/web/src/lib/tickets/flags.ts` (add `"livestream_ads_enabled"` to `TicketFlagKey`)
- Modify: `apps/web/src/lib/signed-request/message.ts` (add scope + actions)

**Interfaces:**
- Produces in `message.ts`: `export const LIVESTREAM_SCOPE = "roebel-livestream-v1" as const;` and `export type LivestreamAction = "ad_booking_create" | "ad_booking_checkout" | "ad_bookings_mine";`
- Produces in `ads.ts`:
  - `export type AdMediaKind = "image" | "video";`
  - `export const AD_MEDIA_RULES: Record<AdMediaKind, { mimes: Record<string, string /* ext */>; maxBytes: number }>` = image `{image/png: png, image/jpeg: jpg, image/webp: webp}`, max 10 MB; video `{video/mp4: mp4, video/quicktime: mov}`, max 200 MB.
  - `export function validateAdMedia(input: { kind: string; mime: string; bytes: number }): { ok: true; ext: string } | { ok: false; code: "BAD_MEDIA_KIND" | "BAD_MIME" | "TOO_LARGE" | "EMPTY"; message: string }`
  - `export function adMediaPath(livestreamId: string, bookingId: string, ext: string): string` → `` `${livestreamId}/${bookingId}.${ext}` ``
  - `export const RESERVE_AD_ERRORS: Record<string, [number, string]>` mapping the six RPC errors to status + German copy (`sold_out` → 409 "Leider ausgebucht.", `deadline_passed` → 409 "Die Buchungsfrist ist abgelaufen.", `livestream_not_bookable` → 409 "Für diesen Livestream kann gerade keine Werbung gebucht werden.", `media_kind_not_accepted` → 400 "Dieses Paket erlaubt diese Dateiart nicht.", `too_many_pending` → 429 "Ihr habt schon offene Buchungen für dieses Paket. Bitte schließt sie zuerst ab.", `not_on_sale` → 409 "Dieses Paket ist gerade nicht buchbar.")
  - `export function adBookingStatusLabel(status: string): string` → pending "Zahlung offen", paid "Wird geprüft", approved "Freigegeben", refunded "Erstattet", expired "Abgelaufen", cancelled "Abgebrochen"
  - `export function sessionMatchesBooking(b: { stripe_account_id: string | null; stripe_checkout_session_id: string | null; amount_cents: number } | null, s: { id: string; amount_total: number | null }, eventAccount: string | null | undefined): boolean` (same binding rules as the ticket webhook)

- [ ] **Step 1: Write failing tests** in `ads.test.ts`:
  - `validateAdMedia({kind:"image",mime:"image/png",bytes:1_000})` → `{ok:true, ext:"png"}`
  - `image/svg+xml` → `BAD_MIME`; `{kind:"image", mime:"image/png", bytes: 10*1024*1024+1}` → `TOO_LARGE`; `{kind:"video",mime:"video/quicktime",bytes:500*1024*1024}` → `TOO_LARGE`; `{kind:"audio",…}` → `BAD_MEDIA_KIND`; `bytes: 0` → `EMPTY` ("Die Datei ist leer.")
  - `adMediaPath("L","B","mp4") === "L/B.mp4"`
  - every key of `RESERVE_AD_ERRORS` is one of the six RPC errors, and all six are present
  - `sessionMatchesBooking`: true when account, session id match and `amount_total >= amount_cents`; false on account mismatch, session mismatch, lower amount, or `null` booking
- [ ] **Step 2: Run, expect FAIL** — `cd apps/web && npx tsx --test src/lib/livestream/ads.test.ts` → module not found.
- [ ] **Step 3: Implement** `ads.ts`, the message.ts additions, and the flag key.
- [ ] **Step 4: Run, expect PASS** — same command; also `npx tsx --test src/lib/tickets/flags.test.ts` still passes.
- [ ] **Step 5: Commit** the four files — `feat(web): livestream ad booking domain helpers`.

### Task 3: Settlement in the Stripe Connect webhook

**Files:**
- Create: `apps/web/src/lib/livestream/settle.ts`, `apps/web/src/lib/livestream/settle.test.ts`
- Modify: `apps/web/src/app/api/webhooks/stripe-connect/route.ts`

**Interfaces:**
- Consumes: `sessionMatchesBooking` (Task 2).
- Produces: `export async function markAdBookingPaid(admin: SupabaseClient, bookingId: string, opts: { paymentIntentId: string | null; sessionId: string }): Promise<"paid" | "already">` — sets `status='paid'`, `paid_at`, `stripe_payment_intent_id`; if the row was `expired` or `cancelled` (late payment) it still becomes `paid` with `late_payment = true`; a row already `paid|approved|refunded` returns `"already"` and changes nothing.

- [ ] **Step 1: Failing tests** with a stub admin (pattern: `src/lib/tickets/flags.test.ts`): pending → `"paid"` with update payload `{status:"paid", late_payment:false, …}`; expired → `"paid"` with `late_payment: true`; approved → `"already"` and no update call.
- [ ] **Step 2: Run, expect FAIL** — `npx tsx --test src/lib/livestream/settle.test.ts`.
- [ ] **Step 3: Implement `markAdBookingPaid`.**
- [ ] **Step 4: Webhook branches.** In the existing switch, next to each `event_ticket` branch, add `metadata.kind === "livestream_ad"` handling with `metadata.booking_id`: completed/async-succeeded → load booking, `sessionMatchesBooking(booking, s, event.account)` else flag `settlement_mismatch` exactly like tickets, else `markAdBookingPaid`; `expired`/`async_payment_failed` → pending row to `expired`/`cancelled`; `charge.refunded` → if no ticket order matches the payment intent, look up `livestream_ad_bookings` by `stripe_payment_intent_id` and set `refunded` + `refunded_at`. Ticket behaviour must not change.
- [ ] **Step 5: Run all web lib tests** — `npx tsx --test src/lib/livestream/*.test.ts src/lib/tickets/*.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(web): settle livestream ad bookings in the Connect webhook`.

### Task 4: Org API routes (book, checkout, mine)

**Files:**
- Create: `apps/web/src/app/api/livestream/ads/book/route.ts`, `.../ads/checkout/route.ts`, `.../ads/mine/route.ts`
- Create: `apps/web/src/lib/livestream/checkout-guard.ts`, `apps/web/src/lib/livestream/checkout-guard.test.ts`
- Create: `apps/web/src/app/livestream/return/page.tsx` (Stripe needs https return URLs: this page reads `return_to` + `cancelled`, accepts only the two whitelisted targets below, and redirects there; the Expo auth session closes when it hits `roebel://`. Model it on `apps/web/src/app/tickets/return`.)

**Interfaces:**
- All three: `verifySignedRequest(body, { scope: LIVESTREAM_SCOPE, actions: [<action>], headers })`, then `assertTicketsEnabled(admin, "livestream_ads_enabled", v.wallet)` → 503 `DISABLED` "Diese Funktion ist derzeit nicht verfügbar.", then `canManage(await roleInAccount(admin, buyer_account_id, v.wallet))` → else 403 `FORBIDDEN` "Nur Inhaber:innen oder Admins der Organisation können Werbung buchen.".
- `POST /api/livestream/ads/book` action `ad_booking_create`, payload `{ package_id, buyer_account_id, display_name, media_kind, media_mime, media_bytes }` → `validateAdMedia`; `crypto.randomUUID()` booking id; RPC `reserve_livestream_ad` (map errors via `RESERVE_AD_ERRORS`); `admin.storage.from("livestream-ads").createSignedUploadUrl(path)` → `jsonOk({ booking_id, expires_at, amount_cents, upload: { signed_url, token, path } })`.
- `POST /api/livestream/ads/checkout` action `ad_booking_checkout`, payload `{ booking_id }` → booking must be `pending`, unexpired, owned by an account the wallet manages; `checkStoredMedia` must pass; beneficiary `connectedAccountRow(...).charges_enabled` else cancel booking + 409 `CONNECT_REQUIRED` "Der Livestream kann gerade keine Zahlungen annehmen."; Checkout Session as in `api/tickets/checkout/route.ts` with `metadata: { kind: "livestream_ad", booking_id, livestream_id }`, product name `` `Werbung: ${package.name} – ${livestream.title}` ``, `expires_at` = booking `expires_at`, success/cancel → `` `${webBaseUrl()}/livestream/return?booking_id=…&return_to=…` `` (+ `&cancelled=true` on cancel) where `return_to` comes from the payload and must be exactly `roebel://org/livestream-ads` (Expo) or `/dashboard/ads/livestream` (web), else 400 → `jsonOk({ url })`.
- `POST /api/livestream/ads/mine` action `ad_bookings_mine`, payload `{ buyer_account_id }` → `{ bookings: Array<{ id, status, status_label, package_name, livestream_title, display_name, amount_cents, created_at, review_note, aired_count, aired_seconds }> }` (air stats summed from `livestream_air_log`).
- Produces in `checkout-guard.ts`: `export async function checkStoredMedia(admin: SupabaseClient, path: string, expected: { kind: AdMediaKind; mime: string }): Promise<{ ok: true; bytes: number } | { ok: false; code: "MEDIA_MISSING" | "BAD_MIME" | "TOO_LARGE"; message: string }>` — reads the object's metadata via `admin.storage.from("livestream-ads").list(dir, { search: file })`, re-runs `validateAdMedia` with the **stored** `metadata.mimetype` and `metadata.size`, and requires stored MIME === expected MIME (an `EMPTY` result is reported as `MEDIA_MISSING`). On ok, the route writes `media_bytes`.

- [ ] **Step 1: Failing tests** for `checkStoredMedia` with a stub storage: object absent → `MEDIA_MISSING` ("Bitte lade zuerst deine Datei hoch."); stored mime `image/jpeg` but expected `image/png` → `BAD_MIME`; stored size 300 MB video → `TOO_LARGE`; matching → `{ok:true, bytes}`.
- [ ] **Step 2: Run, expect FAIL** — `npx tsx --test src/lib/livestream/checkout-guard.test.ts`.
- [ ] **Step 3: Implement `checkStoredMedia`** and the three routes.
- [ ] **Step 4: Run tests, expect PASS;** then `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "src/(app/api/livestream|lib/livestream)"` → no output (judge only the new files; the repo has a known baseline).
- [ ] **Step 5: Commit** — `feat(web): signed org routes for livestream ad booking`.

### Task 5: Admin API + admin page (Max sets up packages and reviews)

**Files:**
- Create: `apps/web/src/app/api/livestream/admin/route.ts`, `.../admin/packages/route.ts`, `.../admin/bookings/route.ts`
- Create: `apps/web/src/lib/livestream/refund.ts`
- Create: `apps/web/src/app/admin/dashboard/livestream/page.tsx`
- Modify: the admin dashboard nav (where `hoeren` / `ki-kosten` are linked) to add "Livestream"

**Interfaces:**
- Every route starts with `requireAdmin()` from `@/lib/dev-tickets/api`.
- `GET /api/livestream/admin` → livestreams with event title + beneficiary name + `charges_enabled`; plus `beneficiaries`: org accounts whose `stripe_connected_accounts.charges_enabled` is true (id + display name). `POST` `{ id?, event_id, beneficiary_account_id, title, status, ads_enabled }` upsert.
- `POST /api/livestream/admin/packages` `{ livestream_id, packages: Array<{ id?, name, description?, kind, price_cents, capacity?, accepts, max_video_seconds?, booking_deadline?, sort_order?, is_active? }> }` upsert (never delete; deactivate instead).
- `GET /api/livestream/admin/bookings?livestream_id=` → bookings with package name, buyer org display name, status label, `late_payment`, and a 1-hour signed download URL per media. `POST { booking_id, decision: "approve" | "reject", note? }`: approve only from `paid`; reject only from `paid|approved` → `refundAdBooking`.
- Produces `export async function refundAdBooking(admin: SupabaseClient, bookingId: string, note: string, reviewerWallet: string | null): Promise<void>` — `stripeConnect.refunds.create({ payment_intent, refund_application_fee: true }, { stripeAccount })`, then status `refunded`, `refunded_at`, `review_note`, `reviewed_at`. The webhook's `charge.refunded` branch is idempotent with this.

- [ ] **Step 1: Implement routes + `refund.ts`.**
- [ ] **Step 2: Build the admin page** (Tailwind, German): livestream selector + form (event, beneficiary dropdown, title, status, "Werbung buchbar"); package editor table (Name, Art: Logo im Banner / Videospot / Hauptpartner, Preis €, Plätze, Dateiarten, max. Videolänge, Buchungsfrist, aktiv); bookings list with media preview (`<img>`/`<video controls>`), org name, Paket, Betrag, status, a "Zahlung nach Ablauf" badge when `late_payment`, buttons "Freigeben" / "Ablehnen & erstatten" (reject asks for a note and confirms).
- [ ] **Step 3: Verify in dev.** `pnpm dev:web`, log into `/admin`, open `/admin/dashboard/livestream`: create a draft livestream for any event with the Kleinunternehmen beneficiary, add one package, reload → values persist. Then set it back to `draft`.
- [ ] **Step 4: Commit** — `feat(web): admin livestream + ad review dashboard`.

### Task 6: Web org dashboard booking page

**Files:**
- Create: `apps/web/src/lib/signed-request/client.ts`
- Create: `apps/web/src/app/dashboard/ads/livestream/page.tsx`
- Modify: `apps/web/src/app/dashboard/ads/page.tsx` (an entry card "Werbung im Livestream" linking to the new page, shown only when bookable packages exist)

**Interfaces:**
- Produces `export async function postSignedWeb<T>(path: string, account: { address: string; signMessage: (a: { message: string }) => Promise<string> }, action: string, payload: Record<string, unknown>, scope: string): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }>` — builds `buildSignedMessage(scope, action, wallet, ts, payload)` from `message.ts`, signs, POSTs `{ scope, action, wallet, timestampSec, payload, signature }`.
- Consumes Task 4 routes; packages read directly with the browser Supabase client (`livestream_ad_packages` joined to `livestreams(title, event_id)`).

- [ ] **Step 1: Implement `postSignedWeb`.**
- [ ] **Step 2: Build the page** for the active org (`useAccount()`, signer `useActiveAccount()`): packages grouped by livestream (Name, Beschreibung, Preis, freie Plätze if capacity, Frist); booking form: Anzeigename (prefilled with org name, max 60), file drop zone (accept by `AD_MEDIA_RULES` of the package's `accepts`; client-side `validateAdMedia` before upload); flow = `ad_booking_create` → `supabase.storage.from("livestream-ads").uploadToSignedUrl(path, token, file, { contentType })` with progress → `ad_booking_checkout` (`return_to: "/dashboard/ads/livestream"`) → redirect to Stripe. Below: "Eure Buchungen" from `ad_bookings_mine` with status label, Prüfhinweis, and after the event "Lief X-mal (Y Min.)". Copy note on the form: "Eure Werbung wird im Livestream als „Werbung“ gekennzeichnet und vor der Ausstrahlung geprüft."
- [ ] **Step 3: Verify in dev** with the flag set to Max's wallet (`app_settings.livestream_ads_enabled`) against Stripe **sandbox** (`apps/web/.env.local`): book with a PNG → Checkout opens → pay `4242 4242 4242 4242` → back on the page the booking shows "Wird geprüft" (needs the webhook; if not forwarded locally, verify this step in Task 8 on the preview deployment instead and note it).
- [ ] **Step 4: Commit** — `feat(web): org dashboard page to book livestream ads`.

### Task 7: Expo booking screen

**Files:**
- Create: `apps/expo/lib/livestream-ads.ts`, `apps/expo/app/org/livestream-ads.tsx`
- Modify: `apps/expo/lib/signed-request.ts` (add `LIVESTREAM_SCOPE = 'roebel-livestream-v1'`, `LivestreamAction`, include it in `SignedAction`)
- Modify: `apps/expo/lib/supabase-app-settings.ts` (`isLivestreamAdsEnabled(opts?: { walletAddress?: string | null }): Promise<boolean>`, same semantics as `isStripeConnectEnabled`)
- Modify: `apps/expo/app/org/ads.tsx` (entry card "Werbung im Livestream" when enabled and packages exist)

**Interfaces:**
- Produces in `lib/livestream-ads.ts`: `fetchBookableAdPackages(): Promise<AdPackageRow[]>`, `createAdBooking(account, input)`, `uploadAdMedia(signedUrl: string, fileUri: string, mime: string): Promise<boolean>`, `startAdCheckout(account, bookingId)` (passes `return_to: 'roebel://org/livestream-ads'`), `fetchMyAdBookings(account, buyerAccountId)`, plus a mirrored `AD_MEDIA_RULES` / `validateAdMedia` (same values as Task 2).
- `uploadAdMedia` uses `FileSystem.uploadAsync(signedUrl, fileUri, { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': mime } })` from `expo-file-system/legacy` (streams from disk; never base64 a 200 MB video).

- [ ] **Step 1: Implement lib + screen** (`StyleSheet` + `useTheme()`, German): same sections as the web page; file via `expo-image-picker` (images, or videos when the package accepts video, no compression of videos); upload progress state; checkout through `WebBrowser.openAuthSessionAsync(url, 'roebel://org/livestream-ads')`, then refetch "Eure Buchungen".
- [ ] **Step 2: Verify** — `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "livestream-ads|org/ads.tsx|signed-request|supabase-app-settings"` → no output. Then run on the Android emulator (preview channel config) with the flag on Max's wallet: screen opens, packages list, picking a PNG passes validation.
- [ ] **Step 3: Commit** — `feat(expo): book livestream ads from the org area`.

### Task 8: End-to-end in production + DanceCup setup

**Files:** none (operational), plus memory/doc notes.

- [ ] **Step 1: Deploy.** Push to `main`; wait for the Vercel production deployment of `roebel-web` to be READY (Vercel MCP `list_deployments`).
- [ ] **Step 2: Live E2E with a 1 € test package** (flag = Max's wallet only): book from the **web** dashboard as one of Max's orgs with a PNG → pay with a real card → booking turns "Wird geprüft" (webhook) → admin "Ablehnen & erstatten" → Stripe shows the refund on the Kleinunternehmen account, booking "Erstattet". Repeat once from the **Expo** app (preview build/OTA by Max) with a short MP4, then "Freigeben". Delete nothing; deactivate the test package.
- [ ] **Step 3: DanceCup setup with Max:** livestream for the DanceCup event (status `scheduled`, `ads_enabled`), beneficiary = Kleinunternehmen, packages and prices as Max decides, deadline as Max decides (≤ 2026-11-05).
- [ ] **Step 4: Open it.** Set `app_settings.livestream_ads_enabled = 'true'`. Hand Max the exact `eas update` command for the Expo change (he runs it).
- [ ] **Step 5: Record** state in a memory file (`project_roebel_studio_livestream.md`: what is live, flag, test bookings, next sub-project) and commit any doc touch-ups.
