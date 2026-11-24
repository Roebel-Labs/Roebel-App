# Account-aware navigation, switch flow and org analytics — design

Date: 2026-11-24 · Scope: `apps/expo` + Supabase (`wwbeqhkslxdxhktqzqti`) · Status: approved 2026-11-24

## Intent

The Expo app should feel like two tools in one: a citizen app when the personal account is active,
and a working tool for an org (Verein, Unternehmen, …) when an org account is active. Switching
accounts switches the whole shell — bottom bar, tabs, profile — with a deliberate, branded moment
in between (like Airbnb's "Switching to traveling"). Org accounts get real numbers: today most
dashboards and Anzeigen pages show 0 because nothing is ever counted.

## Goals

1. **Account-aware bottom bar.** Personal: Austausch · Erkunden · Profil. Org: Austausch · Dashboard · Chat · Profil.
2. **Glass bottom bar is the default.**
3. **"Account wechseln" contrast pill** floating just above the bar: 100% rounded, near-black with a
   subtle vertical gradient, hairline lighter border, soft shadow, avatar left, label, ⇆ icon right
   (Figma node `3137:2815`). Same treatment for the Karte/Erkunden pill on Erkunden, moved closer to the bar.
4. **QR moves** from the floating FAB to a plain icon in the header of the personal Profil.
5. **Switch flow.** One personal + one org → tap pill → full-screen loader (Röbel logo, "Wechsle zu
   {Name}") → new shell. Two or more orgs → existing `AccountSwitchSheet` first, then the loader.
6. **Org Profil redesign** (Figma profile frame `3128-1148`): org header + +1-Münze pill, "KI Helfer —
   Deine Stadt-Helfer" banner (agent illustrations from Figma), quick actions, then a compact
   metrics overview (key numbers + one trend chart) linking to Dashboard.
7. **Dashboard tab** with every chart: overview, content (posts, Anzeigen, events), audience
   (profile views, followers), engagement (likes, comments, shares, clicks), mini-apps.
   Range pills: **7 Tage · 28 Tage · 90 Tage · 365 Tage · Zeitraum** (custom). Comparison to the
   previous period (+/- %). Metric picker on the main chart. Breakdown by content type and a
   ranked "Top-Inhalte" list. As much slicing as the data supports.
8. **Chat tab** (org shell) = the agent chat (existing `app/chat` agents experience).
9. **Track a lot**: views, impressions, clicks, link taps, shares, follows/unfollows, profile views,
   Anzeige views/clicks, event views/interest, mini-app opens, ticket views — for every
   org-owned object.

## Non-goals

- No per-person viewer/follower lists ("who viewed you"). Totals only (decided: option A).
- No web dashboard in this pass (Expo only; web has no citizen UI anyway).
- No change to personal-account tabs beyond the pill/QR/glass changes.
- No NativeWind (StyleSheet + `useTheme()` only).

## Anti-goals

- Switching must not log anyone out or lose the wallet session.
- Tab switching must stay as fast as after the 2026-11-21 work (mounted, frozen sections).
- Tracking must never block or slow UI (fire-and-forget, batched, swallow errors).
- No personal data in analytics tables (no wallet addresses or account ids of viewers stored in
  plain form).

## Constraints

- Tabs live in `app/(tabs)/_layout.tsx` (expo-router `Tabs`, `tabBar={() => null}`, sections draw
  `components/BottomNavigation` themselves, switching via `lib/navigation/goToTab`).
- Active account: `context/AccountContext.tsx` (`activeAccount`, `ownedAccounts`, `switchAccount`).
- Nav style: `lib/nav-bar-style.ts` (`DEFAULT_NAV_BAR_STYLE`), glass bar `components/navigation/GlassTabBar.tsx`.
- Existing tracking: `lib/viewTracker.ts` (batched `increment_post_views` RPC, cumulative only),
  `increment_listing_views` for marketplace; PostHog client in `lib/analytics.ts` (product analytics,
  not org-facing). `business_deals.views_count/clicks_count` are **never incremented** — root cause
  of the 0s on Anzeigen/analytics pages. Those pages also resolve the business via owner wallet,
  not the active org account.
- New event tracking only produces data from the build that ships it → needs an OTA/EAS release;
  history starts empty (no backfill except existing cumulative totals as a "seit Beginn" number).
- UI text German. Primary `#00498B`. Ortis UI rules: no drop shadows on cards, stone greys, one CTA
  (the contrast pill is the explicit exception: it gets a soft shadow, per Max's request).

## Approaches

**Bottom bar per account**
- (a) **Chosen.** One `Tabs` navigator with all five sections (index, explore, dashboard, chat,
  profile); `BottomNavigation` takes its tab list from the active account kind. Hidden sections
  are never reachable from the bar. Keeps mounted/frozen sections and all deep links.
- (b) Two route groups `(personal)` / `(org)`. Rejected: every switch rebuilds everything, links
  must know their side, undoes the tab-speed work.

**Tracking backbone**
- (a) **Chosen.** One append-only event table + daily rollup table; dashboards read rollups only.
  One pattern for every object type; new metric = one call site.
- (b) More counter columns per table. Rejected: totals only, no time series, so no 7/28/90-day charts.

## Design

### 1. Shell

- `TabKey = 'home' | 'explore' | 'dashboard' | 'chat' | 'profile'`.
- `useShellTabs()` (new, `lib/navigation/shell-tabs.ts`): `activeAccount.type === 'org'` →
  `[home, dashboard, chat, profile]`, else `[home, explore, profile]`. Pure function + hook, unit-tested.
- `app/(tabs)/dashboard.tsx` and `app/(tabs)/chat.tsx` added. Chat renders the existing agent chat
  home (reuse the screen component, not a redirect, so it stays a mounted tab).
- If the current tab is not in the new shell after a switch → land on `home` (Austausch).
- Nav icons for Dashboard/Chat from Figma (bar-chart, chat bubble), stroke + filled variants
  like the existing ones in `assets/icons/bottom-nav/`.

### 2. Glass default

- `DEFAULT_NAV_BAR_STYLE = 'glass'`. Users who explicitly chose "standard" keep it.

### 3. Contrast pill (`components/ContrastPill.tsx`)

- Shared component used by "Account wechseln" and the Erkunden Karte/Liste toggle.
- Height 48, radius 999, fill linear gradient top→bottom `#2E2E2E → #161616` (dark mode: same,
  slightly lifted `#3A3A3A → #1F1F1F`), 1px border `rgba(255,255,255,0.14)`, soft shadow
  (y 8, blur 24, black 25%), white label Inter SemiBold 17, optional 28px avatar left, trailing icon.
- Press: scale 0.97 spring + haptic.
- Position: centered, bottom = glass bar top + 12px (use `lib/glass-tab-geometry`).
- "Account wechseln": shown on the Profil tab only, only when `ownedAccounts.length > 1`.
  The avatar shows the account you would switch TO when there's exactly one other; otherwise the
  current one.
- Erkunden: the existing Karte/Liste pill (`MapFAB`) re-skinned with ContrastPill and moved to
  the same offset above the bar.

### 4. QR

- Remove `qrFab` from personal Profil; add a header-right icon button (`qr-code.svg`) opening the
  same scanner/QR screen. Org Profil header: no QR in this pass.

### 5. Switch flow

- Tap pill → if exactly one other account → loader directly; if 2+ others → `AccountSwitchSheet`,
  selection → loader.
- `AccountSwitchOverlay` (new, mounted once in root layout above the tabs): full-screen
  `colors.background`, centered Röbel logo (navy windmill app-icon mark, SVG/PNG from repo assets
  or Figma), text "Wechsle zu {Name}" (Plus Jakarta Sans). Fade in 150ms; while visible:
  `await switchAccount(id)`, reset tab to the new shell's home/profile, prefetch the new account's
  dashboard summary. Minimum visible 900ms, maximum until switch resolves; fade out 200ms.
- On error: overlay closes, toast "Wechsel fehlgeschlagen", stay on old account.
- Land on **Profil** of the new account after switching (the pill lives there, so the user sees
  the change in place). My call — easy to flip to Austausch.

### 6. Tracking backbone (Supabase)

Tables (new migration):
- `analytics_events` — `id bigserial`, `occurred_at timestamptz default now()`,
  `owner_account_id uuid` (the org/person the object belongs to), `object_type text`
  (`post|deal|listing|event|profile|mini_app|ticket|link|org`), `object_id text`,
  `metric text` (`view|impression|click|link_tap|share|like|comment|follow|unfollow|open|interest|save`),
  `surface text null` (feed, explore, map, search, deeplink…), `viewer_hash text null`.
  `viewer_hash` = sha256(viewer account id + daily server salt) computed **server-side** in the RPC,
  used only for unique counts; the salt rotates daily so it cannot be joined across days.
  Raw events deleted after 90 days.
- `analytics_daily` — `(owner_account_id, object_type, object_id, metric, day)` PK,
  `count int`, `uniques int`. Kept forever.
- RPC `track_events(p_events jsonb)` — security definer, validates types, resolves
  `owner_account_id` from the object (never trusted from client), inserts, and upserts
  `analytics_daily` (count +1) in the same call. Uniques recomputed by a pg_cron job every
  hour for today and once nightly for yesterday.
- RPC `get_account_analytics(p_account_id, p_from, p_to, p_metrics, p_object_type, p_group_by)`
  — returns series per day plus totals and previous-period totals; only callable by members of
  that account (existing role check).
- RPC `get_top_objects(p_account_id, p_from, p_to, p_metric, p_limit)`.
- Existing counters (`increment_post_views`, `views_count` columns) keep working; `track_events`
  also bumps the legacy columns so old screens get real numbers immediately.

Client (`lib/analytics/track.ts`): `trackEvent({objectType, objectId, metric, surface})`, batched
like `viewTracker` (3s / 10 items, per-object throttle for views), flush on app background.
`viewTracker` becomes a thin wrapper around it. Call sites added for every metric in goal 9
(deal/listing/event/post detail open, card impressions via viewability, link taps, share sheet,
follow toggles, mini-app open, profile open, ticket page).

Fix: Anzeigen/analytics pages resolve the business from the **active org account**, not the
owner wallet.

### 7. Dashboard tab (`app/(tabs)/dashboard.tsx`)

- Header "Dashboard"; segmented tabs **Übersicht · Inhalte · Publikum · Interaktionen · Mini-Apps**.
- Range pills: 7 Tage · 28 Tage · 90 Tage · 365 Tage · Zeitraum (date-range sheet). Default 28 Tage.
- Übersicht: key-metric tiles (Beitragsaufrufe, Profilaufrufe, Likes, Kommentare, Teilen, Klicks,
  Neue Follower), each with Δ% vs previous period; tapping a tile selects it for the main line
  chart (area fill, dotted gridlines, 3 y-ticks, start/end date labels — like the reference).
  Toggle "Vorperiode vergleichen" draws the previous period as a dashed line.
- Inhalte: filter by type (Beiträge, Anzeigen, Veranstaltungen, Mini-Apps), stacked bar per day,
  Top-Inhalte list (thumbnail, title, metric, sparkline), tap → per-object detail chart.
- Publikum: profile views, followers net (bar ±), unique viewers.
- Interaktionen: engagement rate (interactions / views), breakdown donut by metric, by surface.
- Charts: one chart kit in `components/charts/` built on what the repo already uses for the
  economy tab (visx/Skia — reuse, don't add a new library). Empty state per chart: "Noch keine
  Daten in diesem Zeitraum".
- Data via TanStack Query (or the repo's existing query layer), cached per range.

### 8. Org Profil (`app/(tabs)/profile.tsx`, org branch)

- Org header row (avatar, name, "Zum Profil ›", +1 Münze pill — existing component).
- KI-Helfer banner card with agent mascots (Figma assets) → opens Chat tab.
- Quick actions grid (Veranstaltung einsenden, Anzeige erstellen, Dienstleistung anbieten …,
  existing actions).
- "Überblick" card: 4 key numbers (28 Tage) + one mini trend chart + "Zum Dashboard ›".
- Remaining existing org sections (Verwaltung, Einstellungen, …) below as list rows.
- Contrast pill "Account wechseln" floating above the bar.

### 9. Figma assets

Extract via Figma MCP from file `gy9pkojEQ4pktQhubjI57e` (profile frame `3128-1148`, pill
`3137-2815`): nav icons, quick-action 3D icons, agent mascot banner art, ⇆ icon. Save to
`apps/expo/assets/…` as SVG where vector, PNG @2x/@3x otherwise.

## Settled after builder review (calls marked "my call" are Claude's, correctable)

- **Object → org mapping.** `posts`, `events`, `marketplace_listings` have `account_id`;
  `mini_apps` has `org_account_id`; follows via `account_follows.target_account_id`.
  `businesses` only has `owner_wallet_address` → phase 2 adds `businesses.account_id` (FK accounts),
  backfilled where the owner wallet owns exactly one org account; ambiguous ones get linked the first
  time an owner opens Anzeigen while acting as that org. `business_deals` resolve via `business_id`.
  Tickets resolve via their event. (Verified against the live schema 2026-11-24.)
- **Kill switch (my call).** `app_settings.org_shell_enabled` (default true) and
  `app_settings.analytics_tracking_enabled` (default true). Off → old 3-tab shell / no tracking calls.
- **What a view is (my call).** Every appearance counts (X-style, like today's post views) with a
  10s per-object throttle per device; `uniques` is a separate metric. Legacy counters get the same
  counts, so old screens only go up.
- **Deep links outside the shell (my call).** Show the screen anyway as a pushed screen; the bar
  keeps the current shell. No auto account switch. Personal account hitting `/dashboard` → Austausch.
- **Chat tab = the person's own agents (decided by Max).** Reuses the existing agent chat screen.
  Org-owned agents (shared memory/tools acting as the org) are a separate later project.
- **Roles (decided by Max).** Inhaber + Admin get the full org shell (Austausch · Dashboard · Chat ·
  Profil) and the analytics RPCs. Plain Mitglied gets Austausch · Chat · Profil and no analytics access.
- **Logged-out viewers (my call).** Counted in totals (no `viewer_hash`), excluded from uniques.

## Delivery order

1. Shell + glass default + contrast pill + QR header + switch flow/loader + Chat tab (shippable via OTA).
2. Tracking backbone: migration, RPCs, client tracker, call sites, deal-counter + active-org fixes.
3. Dashboard tab + org Profil redesign.

Each phase committed and pushed to `main` on completion; Max runs OTA/EAS.

## Left to the builder

- Exact chart component structure, query keys, skeleton layouts.
- Which existing org quick actions appear on the redesigned org Profil, in what order.
- Icon/illustration export formats per asset.
