# Mini-App Store v2 — installed state, World-style store, notification opt-in

**Date:** 2026-07-05 · **Scope:** `apps/expo` + Supabase (`wwbeqhkslxdxhktqzqti`)
**Source of truth for the platform:** `docs/superpowers/specs/2026-07-03-netizen-mini-apps-design.md`

The user provided two reference screenshots (World App Mini Apps store + Remix
notification prompt) and a precise change list. This doc records the design as
implemented; the request itself is the approved spec.

## 1. Installed state

- New lib `apps/expo/lib/miniapp-installs.ts`: AsyncStorage-backed set of
  installed slugs (`miniapps.installed.v1`), module cache + subscriber model,
  `useInstalledMiniApps()` hook → `{ isInstalled(slug), markInstalled(slug) }`.
- An app becomes **installed the first time its host is opened** (store hero,
  row button, grid tile, or detail CTA). First install fires a
  `mini_app_events` row `event='install'`.
- Buttons: not installed → **„Laden"** (App-Store convention) and the tap goes
  to the preview page; installed → **„Öffnen"** and the tap launches
  `MiniAppHost` directly (no preview). Store + Explore grid mount their own
  host instance for that.

## 2. Supabase changes (applied via Supabase MCP; SQL mirrored in repo)

File: `apps/expo/supabase/migrations/mini_app_store_v2.sql`

- `mini_apps.feature_image_url text` — hero artwork for the featured carousel;
  gray placeholder when null.
- `mini_app_notification_optins`: `(mini_app_id, wallet)` unique, `enabled`
  bool, `source`. RLS: anon insert/update/select (same trust tier as
  `mini_app_events`; wallet is smart-account derived, low sensitivity). The
  web dashboard will later read this server-side to gate
  `/api/mini-apps/notifications`.
- RPC `get_mini_app_stats(p_mini_app_id uuid)` → `(views, citizens)`:
  security-definer counts over `mini_app_events` (`app_open` count + distinct
  non-null wallets). Grant execute to anon/authenticated. Powers the detail
  stats „Aufrufe" and „Genutzt von".

## 3. Store page (`app/mini-apps.tsx`) — World-style

- Header: large left-aligned **„Apps"** title + circular ⓘ button (German
  explainer alert). Search bar + category chips removed (few live apps).
- **Hero carousel**: full-width paged cards (feature image or gray
  placeholder), bottom scrim row inside the card: app icon, name, one-line
  tagline, black pill „Laden"/„Öffnen". Page dots below. Featured apps first,
  falls back to all apps.
- **„Top-Apps"** rows (icon 56, name, one-line subtitle, gray pill button),
  first 5 + „Alle anzeigen" expander.
- **„Neu & bemerkenswert"**: 5 newest by `created_at` (new `createdAt` field
  in the `MiniApp` mapping).

## 4. Preview/detail page (`app/mini-app/[slug].tsx`)

- Tagline `numberOfLines={1}`; headlines smaller (name 26→20, section titles
  20→16).
- Stats row: **left-aligned**, horizontally swipeable ScrollView; cells:
  Erstellt von · Aufrufe (RPC) · Genutzt von (N Bürger:innen) · Kategorie.
  „Berechtigungen" cell removed (the permission list block stays).
- Screenshots: 1:1, `width - 64` wide so image 1 fills the viewport and
  image 2 peeks; `snapToInterval` paging.
- Opening the app marks it installed.

## 5. Notification opt-in sheet (`components/miniapp/MiniAppNotificationSheet.tsx`)

- Floating card modal — 12px side/bottom margins, **rounded on all corners**
  (28), NOT flush to the screen bottom. Content per reference: app icon +
  ✕ circle, „Benachrichtigungen einschalten" / „für {App}", divider, gray
  body, full-width dark pill „Benachrichtigungen aktivieren".
- Shown by `MiniAppHost` once the splash hides, only when the app manifest has
  the `notifications` permission, a wallet is connected, and no prior decision
  exists (local decision map `miniapps.notifDecision.v1` via
  `lib/miniapp-notifications.ts`).
- Enable → upsert `mini_app_notification_optins (enabled=true)` + local
  `enabled`; ✕ → local `dismissed` (no re-prompt). Both tracked as events.
- Sending notifications stays server-side (`/api/mini-apps/notifications`,
  future apps/web work); this ships only the opt-in capture.
