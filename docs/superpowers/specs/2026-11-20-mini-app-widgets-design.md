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

## Design

**Settings screen** `app/settings/widget.tsx`, row "Widget" in the
`ERSCHEINUNGSBILD` section of `app/settings.tsx`. Lists live mini apps (from
`fetchLiveMiniApps`, installed ones first) with a toggle each, drag/arrow reorder for
selected ones, max 8. Short hint how to add the widget to the home screen (per platform).

**Shared selection** `lib/widget-sync.ts` — single source of truth, persisted locally
(AsyncStorage key `widget.miniapps.v1`, list of slugs). `syncWidget()` resolves slugs →
`{ slug, name, primaryColor, icon }`, downloads/resizes icons, writes the payload for the
platform, and asks the OS to reload widgets. Called on save in the settings screen and on
app foreground (keeps names/icons fresh, drops apps that went offline).

**Default** when the user has never chosen: the installed mini apps
(`lib/miniapp-installs.ts`), up to 8; if none, featured live apps. Empty state in the
widget: "Mini Apps auswählen" → opens `roebel://settings/widget`.

**iOS** — `apple-targets` widget target `targets/widget/` (SwiftUI, WidgetKit), App Group
`group.com.maxbrych.roebelonchain.widgets` on both app and extension. Payload JSON in the
App Group `UserDefaults` via `ExtensionStorage`; icons as PNG files in the App Group
container (`Paths.appleSharedContainers` from expo-file-system). Reload via
`ExtensionStorage.reloadWidget()`. Sizes: small = first app, medium = 4, large = 8.

**Android** — `react-native-android-widget` config plugin + widget task handler
registered in `index.js`. Widget rendered in JSX from the same payload (AsyncStorage);
icons as local file URIs / data URIs. `requestWidgetUpdate()` after sync. Sizes: 1×1 → 1,
4×1/4×2 → 4, 4×3+ → 8.

**Look** — Röbel brand: title "Röbel Mini Apps", rounded icon tiles on a light / dark
background (follows system), app name under each icon (1 line, truncated). No shadows.

**Taps** — deep link `roebel://mini-app/<slug>`; the existing mini-app route handles
locked / audience-restricted apps.

## Left to the builder

- Exact tile sizing, spacing and icon size per widget family.
- Icon format details (resize to ~120 px PNG; fallback tile with initial + primary color
  when an icon fails to download).
- Reorder UI mechanics (drag vs. up/down buttons).
- Widget preview/description strings in German (gallery text).

## Release notes

- Add to the 3.10.0 build list (`project_store_build_310_pending`). Native → no OTA to 3.9.0.
- First EAS iOS build will ask to create credentials for the widget target.
