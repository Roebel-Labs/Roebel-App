# Mini-App Widgets (iOS + Android) — Design

Date: 2026-11-20 · Ships in: 3.10.0 store build (native change, not OTA-able)

## Intent

A home-screen widget on iOS and Android that shows the user's chosen mini apps as
tappable icons — a launcher for mini apps. The user decides which apps appear, and
chooses them in the Röbel app under profile settings.

## Goals

- One widget kind ("Röbel Mini Apps") in three sizes on iOS (small / medium / large)
  and a resizable equivalent on Android.
- The user picks and orders the apps in a new settings screen; every widget on the
  phone shows that one list.
- Tapping an icon opens that mini app in Röbel (`roebel://mini-app/<slug>`).
- A red dot (top-right of the icon, no count) when the mini app has unread notifications,
  in the widget and on the mini-app icons inside the app.
- Opening from the widget keeps the user signed in to the mini app with their Röbel account.

## Non-goals

- Per-widget configuration through the phone's own widget editor (iOS App Intents /
  Android configure activity). Possible follow-up if users ask.
- Live content from inside a mini app (scores, balances, …). Icons + names only.
- Live Activities, lock-screen / StandBy widgets.

## Anti-goals

- No wallet addresses, balances or other personal data on the home screen.
- Must not break login state or any existing native module (3.10.0 already carries a
  lot of native change).

## Constraints

- Expo SDK 56, CNG (ios/android are generated, gitignored) → everything via config plugins
  in `apps/expo/app.config.ts`.
- Widgets cannot fetch remote images at render time → the app downloads the icons and
  hands them to the widget.
- iOS small widgets support a single tap target (whole widget); medium/large support one
  link per icon.
- iOS needs a second target (widget extension) + App Group → one extra provisioning
  profile, created by EAS on the next `eas build` (Max confirms once).

## Approaches considered

1. **iOS: Swift widget via `@bacons/apple-targets` + Android: `react-native-android-widget`**
   — chosen. Proven Expo path, ~150 lines of SwiftUI, easy local-image loading from the
   App Group; Android widget written in JSX.
2. iOS via `expo-widgets` 56.x (JSX through `@expo/ui`, no Swift) — rejected: still young,
   adds `@expo/ui` as another native dep, local-image support for icons uncertain.
3. Fully native Kotlin (Glance) + Swift — rejected: double the work, no user benefit.

## Decided by Max

- User customizes which mini apps appear (2026-11-20).
- Customization lives inside the Röbel app, not the phone's widget editor.
- The option sits in the profile settings (`app/settings.tsx`).
- Tech: approach 1.
- Unread red dot on widget icons and in-app mini-app icons (2026-11-20).
- Widget-opened mini apps must keep the Röbel-account sign-in (2026-11-20).

## Design

**Settings screen** `app/settings/widget.tsx`, row "Widget" in the
`ERSCHEINUNGSBILD` section of `app/settings.tsx`. Lists live mini apps (from
`fetchLiveMiniApps`, installed ones first) with a toggle each, drag/arrow reorder for
selected ones, max 15 (the 16th slot is the store tile). Short hint how to add the widget to the home screen (per platform).

**Shared selection** `lib/widget-sync.ts` — single source of truth, persisted locally
(AsyncStorage key `widget.miniapps.v1`, list of slugs). `syncWidget()` resolves slugs →
`{ slug, name, primaryColor, icon }`, downloads/resizes icons, writes the payload for the
platform, and asks the OS to reload widgets. Called on save in the settings screen and on
app foreground (keeps names/icons fresh, drops apps that went offline).

**Default** when the user has never chosen: the installed mini apps
(`lib/miniapp-installs.ts`), up to 15; if none, featured live apps. Empty state in the
widget: "Mini Apps auswählen" → opens `roebel://settings/widget`.

**iOS** — `apple-targets` widget target `targets/widget/` (SwiftUI, WidgetKit), App Group
`group.com.maxbrych.roebelonchain.widgets` on both app and extension. Payload JSON in the
App Group `UserDefaults` via `ExtensionStorage`; icons as base64 PNG (≈96 px, resized with
expo-image-manipulator) inside the same JSON — one code path for both platforms; builder's
call over files in the App Group container. Reload via
`ExtensionStorage.reloadWidget()`. Sizes: small = 2×2 (3 apps + Alle, one tap target → opens the Mini-Apps store), medium = 4×2 (7 + Alle), large = 4×4 (15 + Alle).

**Android** — `react-native-android-widget` config plugin + widget task handler
registered in `index.js`. Widget rendered in JSX from the same payload (AsyncStorage);
icons as `data:image/png;base64` URIs (same payload as iOS). `requestWidgetUpdate()` after sync. Columns/rows derived from widget size: 2×2 up to 4×4
(max 15 apps + Alle); every tile has its own tap target.

**Look** — same as the Mini-Apps section on Erkunden (`MiniAppGridTile` / `AppIcon`):
rounded-square icon (corner radius 24 % of the size, `primaryColor` behind it, first letter
when no icon), app name centered underneath in one line, 4-column grid. White / `#18191B`
background following system light/dark, no title bar, no shadows (decided by Max
2026-11-20: "like the explore section, icon + title below, 4×4 grid"). The last tile in
every size is "Alle" with the store icon (`assets/illustration/mini-app-store.png`) and
opens the Mini-App store (`roebel://mini-apps`) — as on Erkunden (Max, 2026-11-20).

**Taps** — deep link `roebel://mini-app/<slug>?open=1`: launches the MiniAppHost directly
(no store preview page); the existing route still handles locked / audience-restricted
apps. Cold start from the widget: the route must wait until the thirdweb wallet has
auto-reconnected (`useActiveWalletConnectionStatus` ≠ connecting, account present or
definitively absent) before mounting the host, so identity grant + user token resolve
for the right account — otherwise the app would load as logged out.

**Unread dot** — source: `notifications` rows with `type='mini_app'`, `is_read=false`,
`recipient_wallet` = user, grouped by `metadata->>slug` (one query, no schema change).
`syncWidget()` adds `unread: boolean` per app to the payload. Cleared by marking that
app's `mini_app` notifications read when the host opens it. Refresh points: app
foreground/background, mini-app host open/close, push received while the app runs; on
Android additionally every 30 min while the app is closed (widget `updatePeriodMillis`;
the headless widget task re-runs the unread query for the stored wallet — builder's call,
since mini-app pushes carry a notification payload, which never wakes JS when the app is killed). iOS with the app fully
closed: dot appears on next app open (accepted — the push itself is the real-time
signal; no background-wake pushes). Same dot on mini-app icons inside the app
(store/list + Erkunden), from the same query. Logged-out: no dots.

## Left to the builder

- Exact tile sizing, spacing and icon size per widget family.
- Icon format details (resize to ~120 px PNG; fallback tile with initial + primary color
  when an icon fails to download).
- Reorder UI mechanics (drag vs. up/down buttons).
- Widget preview/description strings in German (gallery text).
- Dot size/position per tile size; whether the in-app query reuses the existing
  notifications realtime subscription.

## Release notes

- Add to the 3.10.0 build list (`project_store_build_310_pending`). Native → no OTA to 3.9.0.
- First EAS iOS build will ask to create credentials for the widget target.

## Status (2026-11-20)

Built on `feat/miniapp-widgets` (plan `docs/superpowers/plans/2026-11-20-mini-app-widgets.md`), merged
to main for the 3.10.0 store build. Native → only works in binaries ≥ 3.10.0 (JS requires the
native modules lazily, so an older runtime never crashes).

- iOS: `apps/expo/targets/widget/` (SwiftUI), App Group `group.com.maxbrych.roebelonchain.widgets`,
  `ios.appleTeamId` 88879TXSXK. The first EAS iOS build asks to register the App Group and the
  widget target's bundle id (`com.maxbrych.roebelonchain.widget`) + profile.
- Android: `apps/expo/widgets/` + task handler registered in `index.js`; receiver `.widget.MiniApps`.
- Settings: `app/settings/widget.tsx` (Einstellungen → Erscheinungsbild → Widget).
- Verified: jest (payload, sync, autoopen, Android layout; full suite green except 2 suites already
  failing on main), iOS prebuild + `xcodebuild -target RoebelWidget` (simulator) succeeds, Android
  prebuild manifest. Not yet seen on a device — test on the 3.10.0 preview build.
