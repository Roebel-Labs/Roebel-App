# Account-aware Nav + Org Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Account-dependent bottom bar (personal 3 tabs / org 4 tabs), branded switch flow with contrast pill, glass default, a per-day analytics backbone, and an org Dashboard tab + redesigned org Profil with real charts.

**Architecture:** One expo-router `Tabs` navigator holds all five sections; a pure `shellTabsFor()` decides which ones the bar shows. Tracking is one append-only `analytics_events` table plus an `analytics_daily` rollup written in the same RPC; dashboards read only rollups through role-checked RPCs. Charts are hand-built on `react-native-svg` (no new chart dependency).

**Tech Stack:** Expo SDK 55, expo-router, React Native StyleSheet + `useTheme()`, react-native-svg 15, reanimated, jest-expo; Supabase Postgres + pg_cron (via Supabase MCP).

**Spec:** `docs/superpowers/specs/2026-11-24-account-aware-nav-and-org-analytics-design.md`

## Global Constraints

- Styling: `StyleSheet.create()` + `useTheme()`; NO NativeWind.
- UI copy German; code identifiers English.
- Primary `#00498B`; body font Inter, headings Plus Jakarta Sans.
- No drop shadows on cards; the contrast pill is the only exception (y 8, blur 24, black 25%).
- Org account = `isOrgAccount(account)` (`account.account_type === 'organisation'`, `lib/types.ts:595`).
- Roles: `AccountRole = 'owner' | 'admin' | 'member'`. Full org shell + analytics only for owner/admin.
- Personal shell: `home, explore, profile`. Org owner/admin: `home, dashboard, chat, profile`. Org member: `home, chat, profile`.
- Range pills: `7 Tage · 28 Tage · 90 Tage · 365 Tage · Zeitraum`; default 28 Tage.
- Kill switches in `app_settings`: `org_shell_enabled` (default true), `analytics_tracking_enabled` (default true).
- View = every appearance, 10 s per-object throttle per device; uniques separate. Logged-out viewers: counted in totals, excluded from uniques.
- No viewer identity stored: `viewer_hash = sha256(viewer_account_id || daily_salt)`, computed server-side; raw events purged after 90 days.
- Tracking is fire-and-forget: never awaited by UI, errors swallowed.
- Never show wallet addresses in UI. Never log the user out on switch.
- Supabase changes only through the Supabase MCP (`apply_migration`, `execute_sql`); migration files also committed under `supabase/migrations/`.
- Run tests: `cd apps/expo && npx jest <path> --watchAll=false`.
- After each task: `git add <files>` (only changed files), commit with conventional message + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, `git push`.

## Review Focus

1. Double-tapping the switch pill or tapping it while a switch is running → exactly one switch, one overlay.
2. Switch fails (offline / RPC error) → overlay closes, toast "Wechsel fehlgeschlagen", old account and shell intact.
3. Org with zero events in range → every chart shows "Noch keine Daten in diesem Zeitraum", no NaN/Infinity in paths or Δ% (previous 0 → show "neu", not "+∞ %").
4. Custom range with end before start or longer than 730 days → range sheet refuses (button disabled), RPC rejects too.
5. Active account removed / role downgraded to member while on Dashboard → shell recomputes, user lands on Austausch, RPC returns 403-style error rather than data.

---

## Phase 1 — Shell, pill, switch flow

### Task 1: Shell tab model + glass default

**Files:**
- Create: `apps/expo/lib/navigation/shell-tabs.ts`
- Modify: `apps/expo/lib/navigation/goToTab.ts` (widen `MainTab`)
- Modify: `apps/expo/lib/nav-bar-style.ts:20` (`DEFAULT_NAV_BAR_STYLE = 'glass'`)
- Test: `apps/expo/lib/__tests__/shell-tabs.test.ts`, existing nav-bar-style test if present

**Interfaces:**
- Produces: `type MainTab = 'home' | 'explore' | 'dashboard' | 'chat' | 'profile'` (goToTab.ts);
  `shellTabsFor(input: { account: Account | null; role: AccountRole | null; orgShellEnabled: boolean }): MainTab[]`;
  `landingTabAfterSwitch(tabs: MainTab[]): MainTab` (returns `'profile'`, falls back to `tabs[0]`);
  `isTabInShell(tab: MainTab, tabs: MainTab[]): boolean`;
  `useShellTabs(): MainTab[]` (reads `useAccount()` + cached `org_shell_enabled`).

- [ ] **Step 1: Write failing tests** — `shellTabsFor`: null account → `['home','explore','profile']`; personal → same; org+owner → `['home','dashboard','chat','profile']`; org+admin → same; org+member → `['home','chat','profile']`; org+owner with `orgShellEnabled:false` → personal set; org with role `null` (still loading) → `['home','chat','profile']`. `landingTabAfterSwitch(['home','chat','profile'])` → `'profile'`. `parseNavBarStyle(undefined)` → `'glass'`.
- [ ] **Step 2: Run** `npx jest lib/__tests__/shell-tabs.test.ts --watchAll=false` → FAIL (module missing).
- [ ] **Step 3: Implement** shell-tabs.ts; widen `MainTab` (update `tabSwitchAction`/`goToTab` route map: `dashboard → '/(tabs)/dashboard'`, `chat → '/(tabs)/chat'`); flip default. Add `fetchOrgShellEnabled(): Promise<boolean>` and `fetchAnalyticsTrackingEnabled(): Promise<boolean>` to `lib/supabase-app-settings.ts` following `fetchXmtpDmsEnabled` (missing row → true).
- [ ] **Step 4: Run** tests → PASS (also existing goToTab / nav-bar-style tests).
- [ ] **Step 5: Commit** `feat(expo): account-aware shell tab model, glass nav default`

### Task 2: Five-section Tabs + account-aware BottomNavigation

**Files:**
- Modify: `apps/expo/app/(tabs)/_layout.tsx` (add `dashboard`, `chat` screens)
- Create: `apps/expo/app/(tabs)/dashboard.tsx` (placeholder screen "Dashboard" + bottom nav; filled in Task 9)
- Create: `apps/expo/app/(tabs)/chat.tsx` (renders the agent chat home component extracted from `app/chat/index.tsx`, plus BottomNavigation)
- Modify: `apps/expo/app/chat/index.tsx` (export the body as `components/chat/ChatHome.tsx`, keep the route rendering it)
- Modify: `apps/expo/components/BottomNavigation.tsx`, `apps/expo/components/navigation/GlassTabBar.tsx`
- Create: `apps/expo/assets/icons/bottom-nav/{dashboard,dashboard-filled,chat,chat-filled}.svg` (from Figma file `gy9pkojEQ4pktQhubjI57e`, frame `3128-1148`, via `mcp__figma__download_assets`)
- Create: `apps/expo/lib/navigation/useShellGuard.ts`

**Interfaces:**
- Consumes: `useShellTabs()`, `isTabInShell`, `MainTab` (Task 1).
- Produces: `TabKey = MainTab`; `BottomNavigation` renders `useShellTabs()` in order with labels `Austausch, Erkunden, Dashboard, Chat, Profil`;
  `useShellGuard(tab: MainTab): void` — called at the top of each tab screen; if the tab is not in the shell, `goToTab('home')` (covers the personal-account `/dashboard` deep link and role downgrade).

- [ ] **Step 1: Write failing test** `lib/__tests__/bottom-nav-tabs.test.ts`: `bottomNavItems(['home','dashboard','chat','profile'])` returns labels `['Austausch','Dashboard','Chat','Profil']` (export `bottomNavItems(tabs: MainTab[])` from BottomNavigation's sibling `components/navigation/tab-items.ts`); `glassTabWidth` with 4 tabs is used (assert `bottomNavItems(...).length === 4`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** tab-items.ts, wire BottomNavigation + GlassTabBar to variable tab count (GlassTabBar already takes `tabs`; check highlight math uses `tabs.length`), add screens, guard hook.
- [ ] **Step 4: Run** `npx jest lib/__tests__ --watchAll=false` → all PASS (full tsc skipped mid-iteration; it OOMs in this repo).
- [ ] **Step 5: Commit** `feat(expo): org shell tabs — Dashboard and Chat sections`

### Task 3: ContrastPill + Erkunden Karte pill

**Files:**
- Create: `apps/expo/components/ContrastPill.tsx`
- Create: `apps/expo/lib/contrast-pill.ts` (pure geometry)
- Modify: `apps/expo/components/MapFAB.tsx`, `apps/expo/app/(tabs)/explore.tsx` (position)
- Test: `apps/expo/lib/__tests__/contrast-pill.test.ts`

**Interfaces:**
- Produces: `<ContrastPill label: string; onPress: () => void; leading?: ReactNode; trailing?: ReactNode; disabled?: boolean; accessibilityLabel?: string />`;
  `contrastPillBottom(insetBottom: number): number = glassBarFootprint(insetBottom) + 12`;
  `CONTRAST_PILL_HEIGHT = 48`.

- [ ] **Step 1: Failing test** — `contrastPillBottom(34) === glassBarFootprint(34) + 12`; `contrastPillBottom(0) === glassBarFootprint(0) + 12`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Visuals (spec §3, verbatim): height 48, radius 999, vertical gradient light `#2E2E2E → #161616`, dark `#3A3A3A → #1F1F1F` (use `expo-linear-gradient` if installed, else react-native-svg `LinearGradient` rect), border 1px `rgba(255,255,255,0.14)`, shadow y 8 / blur 24 / black 25 %, label Inter SemiBold 17 white, leading 28px circular avatar, trailing 20px icon (`arrow-data-transfer-horizontal` from Figma node `3137:2821`). Press: reanimated spring scale 0.97 + `Haptics.selectionAsync()`. MapFAB keeps its toggle logic, renders ContrastPill, absolute `bottom: contrastPillBottom(insets.bottom)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(expo): contrast pill, Erkunden map pill re-skinned and closer to nav`

### Task 4: Switch flow, overlay, profile header QR

**Files:**
- Create: `apps/expo/lib/account-switch-flow.ts` (pure)
- Create: `apps/expo/context/AccountSwitchFlowContext.tsx` (+ `components/AccountSwitchOverlay.tsx`)
- Modify: `apps/expo/app/_layout.tsx` (mount provider + overlay above tabs)
- Modify: `apps/expo/app/(tabs)/profile.tsx` (remove `qrFab` ~l.448/537, add header-right QR icon button opening the same target; add ContrastPill "Account wechseln" when `ownedAccounts.length > 1`; keep `AccountSwitchSheet`)
- Create: `apps/expo/assets/images/roebel-logo.svg` (navy windmill mark; take from app icon source or Figma)
- Test: `apps/expo/lib/__tests__/account-switch-flow.test.ts`

**Interfaces:**
- Consumes: `useAccount().switchAccount/ownedAccounts/activeAccount`, `shellTabsFor`, `landingTabAfterSwitch`, `goToTab`, `ContrastPill`.
- Produces: `decideSwitchStart(input: { activeId: string | null; accounts: Account[] }): { kind: 'direct'; targetId: string } | { kind: 'sheet' } | { kind: 'none' }` — `accounts` includes personal; others = accounts minus active; 0 others → none, 1 → direct, ≥2 → sheet.
  `pillAvatarAccount(activeId, accounts): Account | null` — the single other account, else the active one.
  `useAccountSwitchFlow(): { start(): void; switchTo(id: string): Promise<void>; isSwitching: boolean }`.
  Overlay constants: `MIN_VISIBLE_MS = 900`, fade-in 150 ms, fade-out 200 ms; text `Wechsle zu {name}`.

- [ ] **Step 1: Failing tests** — `decideSwitchStart`: [personal(active), org] → direct to org; [personal, orgA(active)] → direct to personal; [personal(active), orgA, orgB] → sheet; [personal(active)] → none. `switchTo` (with injected fake `switchAccount` + fake clock via jest timers): resolves after ≥900 ms even if switch resolves at 10 ms; second `switchTo` while `isSwitching` is ignored (switchAccount called once); rejected switch → `isSwitching` false and `onError` called once. Put the timing logic in `runSwitch({ switchAccount, now, sleep, onError })` in account-switch-flow.ts so it's testable without React.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** After a successful switch: `goToTab(landingTabAfterSwitch(newShell))`. Error toast `Wechsel fehlgeschlagen` via the repo's existing toast/ErrorDrawer pattern.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push** `feat(expo): account switch pill, branded switch overlay, QR in profile header`. Phase 1 is OTA-shippable; tell Max.

## Phase 2 — Tracking backbone

### Task 5: Analytics schema, RPCs, business→account link

**Files:**
- Create: `supabase/migrations/20261124_org_analytics.sql` (repo root `supabase/migrations/`), applied with `mcp__supabase__apply_migration` name `org_analytics`.

**Interfaces (SQL, exact):**
- `businesses.account_id uuid references accounts(id)`; backfill: set where `owner_wallet_address` owns exactly one `organisation` account (via the existing account-owner table — inspect with `list_tables` first).
- `analytics_events(id bigserial pk, occurred_at timestamptz not null default now(), owner_account_id uuid not null, object_type text not null check (object_type in ('post','deal','listing','event','profile','mini_app','ticket','link','org')), object_id text not null, metric text not null check (metric in ('view','impression','click','link_tap','share','like','comment','follow','unfollow','open','interest','save')), surface text, viewer_hash text)`; index `(owner_account_id, occurred_at)`. RLS on, no policies (RPC-only).
- `analytics_daily(owner_account_id uuid, object_type text, object_id text, metric text, day date, count int not null default 0, uniques int not null default 0, primary key (owner_account_id, object_type, object_id, metric, day))`; RLS on, no policies.
- `analytics_salt(day date primary key, salt text not null)`.
- `track_events(p_events jsonb, p_wallet text default null) returns void` security definer: max 50 events per call; each `{object_type, object_id, metric, surface?}`; resolves `owner_account_id` server-side (post→`posts.account_id`, event→`events.account_id`, listing→`marketplace_listings.account_id`, mini_app→`mini_apps.org_account_id`, deal→`businesses.account_id` via `business_deals.business_id`, profile/org→object_id itself, ticket→its event); unresolvable rows skipped; viewer_hash from `p_wallet`→account id + today's salt (null if no wallet); returns early if `app_settings.analytics_tracking_enabled = false`; upserts `analytics_daily.count += 1`; also bumps legacy counters (`increment_post_views` logic for post/view, `business_deals.views_count`/`clicks_count`, `marketplace_listings.views_count`).
- `get_account_analytics(p_account_id uuid, p_from date, p_to date, p_metrics text[], p_object_type text default null) returns table(day date, metric text, count bigint, uniques bigint)` — raises if caller is not owner/admin of `p_account_id` (reuse whatever check `getAccountRole` queries), if `p_to < p_from`, or if range > 730 days. Fills missing days with 0 (generate_series).
- `get_account_analytics_totals(p_account_id, p_from, p_to) returns table(metric text, current bigint, previous bigint)` — previous = same-length window directly before.
- `get_top_objects(p_account_id, p_from, p_to, p_metric text, p_limit int default 10) returns table(object_type text, object_id text, count bigint)`.
- pg_cron: hourly `refresh_analytics_uniques(current_date)`, 03:10 daily for yesterday; 03:20 daily `delete from analytics_events where occurred_at < now() - interval '90 days'`; daily salt insert.
- Auth note: callers identify by wallet like the rest of the app; follow the pattern `increment_post_views` already uses for `p_wallet` and whatever role-check pattern existing security-definer RPCs use (inspect one before writing).

- [ ] **Step 1:** Inspect `increment_post_views`, the account-owners table and one role-checked RPC with `execute_sql`.
- [ ] **Step 2: Write SQL test script** (run via `execute_sql` inside `begin … rollback`): insert a post for a test org, call `track_events` twice for view → `analytics_daily.count = 2`, `posts.views_count` +2; unknown object id → no row; `get_account_analytics` as a member wallet → raises; with `p_to < p_from` → raises; range with no events returns one zero row per day.
- [ ] **Step 3: Apply migration**; run the test script → all assertions hold; commit the SQL file and the test script as `supabase/tests/org_analytics_check.sql`.
- [ ] **Step 4: Commit** `feat(db): org analytics events, daily rollups, business account link`

### Task 6: Client tracker

**Files:**
- Create: `apps/expo/lib/analytics/track.ts`
- Modify: `apps/expo/lib/viewTracker.ts` (becomes `trackPostViews(ids) → ids.forEach(id => trackEvent({objectType:'post', objectId:id, metric:'impression', surface:'feed'}))`; keep exports)
- Test: `apps/expo/lib/__tests__/analytics-track.test.ts` (keep `view-tracker.test.ts` green, adapt RPC name expectations)

**Interfaces:**
- Produces: `type TrackObjectType`, `type TrackMetric` (same literals as Task 5);
  `trackEvent(e: { objectType: TrackObjectType; objectId: string; metric: TrackMetric; surface?: string }): void`;
  `setTrackerWallet(w: string | null): void`; `setTrackingEnabled(on: boolean): void`; `flushEvents(): void`; `resetTracker(): void` (tests).
  Batching: flush after 3000 ms or 10 queued; throttle 10 000 ms per `objectType:objectId:metric` only for `view`/`impression`; flush on AppState `background`. Calls `supabase.rpc('track_events', { p_events, p_wallet })`, errors swallowed. Tracks without wallet too (logged-out).

- [ ] **Step 1: Failing tests** — 10 events → one RPC call with 10; same view twice in 5 s → queued once; same `click` twice → twice; disabled → no call; RPC rejection does not throw.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Wire `setTrackerWallet` where `setViewTrackerWallet` is called and `setTrackingEnabled(await fetchAnalyticsTrackingEnabled())` at app start. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(expo): batched analytics event tracker`

### Task 7: Call sites + Anzeigen active-org fix

**Files (modify):** `app/post/[id].tsx` (view), `components/feed/FeedPostCard.tsx` (share, link_tap), `app/deals/[id].tsx` + `components/DealCard.tsx` (view, click), `app/marketplace/[id].tsx` (view; replace direct `increment_listing_views` call), `app/event/[id].tsx` (view, interest, share), `app/account/[id]/index.tsx` (profile view: objectType `'profile'`, objectId = account id; skip when viewing own active account), follow toggle helper (follow/unfollow), `app/mini-app/*` entry (open), ticket page (view), `app/org/ads.tsx` + `app/business/analytics.tsx` + `app/business/dashboard.tsx` (resolve business by `activeAccount.id` via new `fetchBusinessByAccount(accountId)` in `lib/supabase-businesses.ts`, fallback to owner wallet).
- Test: `apps/expo/lib/__tests__/supabase-businesses-account.test.ts` — `fetchBusinessByAccount` queries `businesses` with `.eq('account_id', id)` (mock supabase like neighbouring tests).

- [ ] **Step 1–2:** failing test for `fetchBusinessByAccount`, run → FAIL.
- [ ] **Step 3:** implement + add every call site above (one `trackEvent` line each, surface set to the screen name).
- [ ] **Step 4:** jest → PASS. Manual SQL check after Max's next dev run: `select metric, count(*) from analytics_events group by 1`.
- [ ] **Step 5: Commit** `feat(expo): track views, clicks, shares, follows across org content; Anzeigen use active org`

## Phase 3 — Dashboard + org Profil

### Task 8: Chart kit

**Files:**
- Create: `apps/expo/lib/charts/geometry.ts`, `apps/expo/lib/charts/ranges.ts`
- Create: `apps/expo/components/charts/{LineAreaChart,StackedBarChart,DonutChart,Sparkline,MetricTile,RangePills,DateRangeSheet}.tsx`
- Test: `apps/expo/lib/__tests__/chart-geometry.test.ts`, `chart-ranges.test.ts`

**Interfaces:**
- `type RangeKey = '7d' | '28d' | '90d' | '365d' | 'custom'`; `RANGE_LABELS = {'7d':'7 Tage','28d':'28 Tage','90d':'90 Tage','365d':'365 Tage',custom:'Zeitraum'}`;
  `rangeDates(key: RangeKey, today: Date, custom?: {from: Date; to: Date}): {from: string; to: string}` (inclusive, ISO date, 7d = today−6…today);
  `previousRange(r: {from; to}): {from; to}`; `isValidCustomRange(from, to): boolean` (to ≥ from, ≤ 730 days);
  `deltaPercent(current: number, previous: number): number | null` (previous 0 → null → UI "neu");
  `niceTicks(max: number, count = 3): number[]` (max 0 → `[0]`);
  `linePath(values: number[], width: number, height: number, maxY: number): string` (all zero / single value → flat line, never NaN);
  `formatCompact(n: number): string` (de-DE: 1.234 / 12,3 Tsd.).
- Components: `LineAreaChart{ series: {label: string; values: number[]; dashed?: boolean}[]; startLabel; endLabel }` (area fill primary at 15 %, dotted grid, 3 right-side ticks — like reference image), `MetricTile{ label; value; delta: number | null; selected; onPress }`, `RangePills{ value: RangeKey; onChange }`, empty state text `Noch keine Daten in diesem Zeitraum`.

- [ ] **Step 1: Failing tests** for every pure function above incl. Review Focus #3/#4 cases (`deltaPercent(5,0) === null`, `linePath([0,0,0],100,50,0)` contains no `NaN`, `isValidCustomRange(to<from) === false`, 731 days → false).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(expo): svg chart kit and range helpers`

### Task 9: Dashboard tab

**Files:**
- Create: `apps/expo/lib/analytics/queries.ts`
- Modify: `apps/expo/app/(tabs)/dashboard.tsx`
- Create: `apps/expo/components/dashboard/{OverviewSection,ContentSection,AudienceSection,EngagementSection,MiniAppsSection,ObjectDetailSheet}.tsx`
- Test: `apps/expo/lib/__tests__/analytics-queries.test.ts`

**Interfaces:**
- `fetchAnalyticsSeries(accountId, range, metrics: TrackMetric[], objectType?: TrackObjectType): Promise<Record<TrackMetric, {day: string; count: number; uniques: number}[]>>`;
  `fetchAnalyticsTotals(accountId, range): Promise<Record<TrackMetric, {current: number; previous: number}>>`;
  `fetchTopObjects(accountId, range, metric, limit = 10): Promise<{objectType; objectId; count; title: string; thumbnailUrl: string | null}[]>` (titles joined client-side from posts/deals/events/listings/mini_apps);
  `useDashboardData(range)` hook with per-range cache (reuse the repo's query layer if one exists in `lib/queries/`, else a small `useEffect` cache keyed by `accountId:range`).
- Sections (copy from spec §7): segmented `Übersicht · Inhalte · Publikum · Interaktionen · Mini-Apps`; Übersicht tiles `Beitragsaufrufe, Profilaufrufe, Likes, Kommentare, Teilen, Klicks, Neue Follower`; toggle `Vorperiode vergleichen` (dashed previous series); Inhalte type filter `Beiträge, Anzeigen, Veranstaltungen, Mini-Apps` + stacked bars + `Top-Inhalte`; Publikum: profile views, follower net (follow − unfollow bars), unique viewers; Interaktionen: engagement rate = (like+comment+share+click)/max(view+impression,1), donut by metric, list by surface; Mini-Apps: opens per app.

- [ ] **Step 1: Failing tests** — `fetchAnalyticsSeries` groups RPC rows into per-metric arrays in day order; `fetchAnalyticsTotals` with no rows → all metrics `{current:0, previous:0}`; RPC error → throws (screen shows error state, Review Focus #5).
- [ ] **Step 2–4:** FAIL → implement (screen + sections, `useShellGuard('dashboard')`, skeleton on first load) → PASS.
- [ ] **Step 5: Commit** `feat(expo): org Dashboard tab with range pills, comparisons and breakdowns`

### Task 10: Org Profil redesign + Figma assets

**Files:**
- Modify: `apps/expo/app/(tabs)/profile.tsx` (org branch), create `apps/expo/components/profile/org/{OrgProfileHeader,AgentHelperBanner,OrgQuickActions,OrgOverviewCard}.tsx`
- Create: assets under `apps/expo/assets/images/agents-banner/*.png` (@2x/@3x) and `apps/expo/assets/icons/quick-actions/*.png` from Figma frame `3128-1148` via `mcp__figma__download_assets`.
- Test: `apps/expo/lib/__tests__/org-overview.test.ts`

**Interfaces:**
- Consumes: `fetchAnalyticsTotals`, `fetchAnalyticsSeries`, `rangeDates('28d')`, `LineAreaChart`, `MetricTile`, `ContrastPill`, `goToTab('dashboard'|'chat')`.
- Produces: `orgOverviewMetrics(totals): {label: string; value: number; delta: number | null}[]` — exactly 4: `Beitragsaufrufe, Profilaufrufe, Neue Follower, Interaktionen`.
- Layout (spec §8): header row (avatar, name, `Zum Profil ›`, existing +1 Münze pill) → `AgentHelperBanner` (`KI Helfer` / `Deine Stadt-Helfer`, mascots right; tap → `goToTab('chat')`) → quick actions grid (existing org actions) → `OrgOverviewCard` (4 numbers, 28-day mini line chart, `Zum Dashboard ›`; hidden for members) → existing org list rows → ContrastPill `Account wechseln`.

- [ ] **Step 1–2:** failing test for `orgOverviewMetrics` (4 labels in order; zero previous → delta null) → FAIL.
- [ ] **Step 3:** implement + export assets. **Step 4:** PASS.
- [ ] **Step 5: Commit + push** `feat(expo): org Profil redesign with agent banner and metrics overview`. Update `docs/STATE` docs + memory; tell Max Phase 3 is OTA-ready (Phase 2 tracking needs the OTA too).
