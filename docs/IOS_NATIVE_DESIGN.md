# iOS-native design for the Röbel app

State: 2026-11-14, branch `feat/ios-native-design`. Read this before touching
the tab bar, `GlassSurface`, or screen headers in `apps/expo`.

Goal: iPhone users get the navigation and controls iOS itself draws (Liquid
Glass, system tab bar, system sheets and menus). Android keeps its own look;
the two platforms are allowed to differ.

## Facts this plan rests on

Checked against the installed packages, not against docs for a newer SDK.

| Fact | Where it was checked |
|---|---|
| The app is on Expo SDK 56 (expo-router 56.2.20, react-native-screens 4.26.2, RN 0.85.3). | `apps/expo/package.json`, `node_modules` |
| `expo-glass-effect` 56.0.4, `expo-symbols` 56.0.7 and `@expo/ui` 56.0.26 are **already compiled into the 3.9.0 binaries**: expo-router depends on them and Expo autolinks them. | `npx expo-modules-autolinking resolve --platform ios` |
| So the system tab bar, Liquid Glass views, SF Symbols, native headers/toolbars, form sheets and link previews need **no new store build**. They can ship as an update to runtime 3.9.0. | follows from the row above |
| `eas.json` sets no build image, so iOS builds use the SDK 56 default (Xcode 26.4) and are linked against the iOS 26 SDK. Liquid Glass is on; `UIDesignRequiresCompatibility` is not set. | `eas.json`, `app.config.ts` |
| NativeTabs wraps every tab in its own `SafeAreaProvider`, and creates all tabs at launch. | `expo-router/build/native-tabs/NativeTabsView.ios.js` |
| The tab router treats `replace` as a tab switch. A `replace('/profile')` from a screen pushed above the tabs creates a second tab controller. | `react-navigation/routers/TabRouter.js`, `layouts/StackClient.js` |
| This Mac has Xcode 16.4 and no iOS 26 simulator. **Nothing here was run on iOS.** | `xcodebuild -version` |

## What this branch changes (slice 1)

1. **System tab bar on iOS.** Austausch, Erkunden and Profil moved to
   `app/(tabs)/` (URLs unchanged). On iOS the group is a `NativeTabs`
   navigator: floating Liquid Glass pill on iOS 26+, shrinks on scroll, SF
   Symbols, tab state kept, tap-active-tab scrolls to top. On Android and web
   the group is a stack of instant cuts and each section still draws
   `components/BottomNavigation.tsx` — the behaviour from before.
2. **One switch:** `NATIVE_TABS` in `lib/navigation/tabBar.ts`. With it on,
   `BottomNavigation` renders nothing and `BOTTOM_NAV_HEIGHT` is 0, because a
   tab's `useSafeAreaInsets().bottom` already contains the system bar.
3. **`goToTab()`** replaces all 71 `router.replace('/')`-style jumps to a
   section. Android/web run the exact call the site made before; iOS pops back
   to the existing tab bar instead of stacking a second one.
4. **Launch.** The app still opens on Erkunden. On iOS the feed and the
   profile are placeholders until first opened (`useTabShown`), so launch does
   not build three screens.
5. **Pushed list screens** (Veranstaltungen, Kalender, Bürgerumfragen, Touren,
   ÖPNV, Blog, Tierwelt, Nachrichten) lose the repeated bottom bar on iOS and
   become normal pushes with the back swipe.
6. **Liquid Glass for our own floating controls.** `GlassSurface` takes
   `liquidRadius`; on iOS 26+ it renders a real `GlassView` (account pill in
   the profile header, the round map buttons, the map's Erkunden pill).
   Falls back to the existing blur on Android, older iOS, older binaries, and
   when the user has Reduce Transparency on (`lib/liquidGlass.ts`).
7. **Theme sync.** A forced Hell/Dunkel in the app is passed to iOS
   (`Appearance.setColorScheme`), so system-drawn UI matches our palette.

## Device pass (iPhone, iOS 26, preview channel on a 3.9.0 build)

Not yet done. In order of risk:

- [ ] Cold start lands on Erkunden; the tab bar shows Erkunden selected.
- [ ] Austausch tab: feed loads on first tap, header still hides on scroll,
      the compose button sits just above the tab bar.
- [ ] Bottom of every tab: last content scrolls clear of the bar, nothing is
      cut off, no double gap. (This is the inset assumption in row 5 above.)
- [ ] Tab bar shrinks on scroll in Erkunden and Profil. In the feed it may
      not (known NativeTabs limit with list views) — acceptable.
- [ ] From a pushed screen, anything that returns to a section (logout in
      Einstellungen, "Fertig" after org creation, profile icon) lands on the
      right tab with ONE tab bar, and back does not reveal a second one.
- [ ] Push notification tap on cold start still opens its target.
- [ ] Erkunden: map pill and audio mini player sit above the tab bar.
- [ ] Live mini player (drag it to a bottom corner) clears the tab bar.
- [ ] Profile account pill and map buttons show Liquid Glass; with Reduce
      Transparency on they show the frosted fallback.
- [ ] App set to Dunkel on a light-mode phone: tab bar is dark.
- [ ] iOS 17/18 device or simulator: classic tab bar, same checks.
- [ ] Android: nothing changed (same bar, same cuts, same back behaviour).
      Partly checked 2026-11-14 on an Android 13 emulator with this branch's
      bundle inside the 3.9.0 binary: consent → Erkunden, cold start lands on
      Erkunden, Austausch and Profil open, no JS crash. Pushed screens and
      back were not reached (the emulator kept dying on this Mac).

## Next slices (each ships as an update unless marked)

2. **Bottom accessory.** Move the audio mini player (and the live mini
   player) into `NativeTabs.BottomAccessory`, the slot Apple Music uses.
3. **Native headers.** Detail screens get `headerShown` + `Stack.Toolbar`
   (glass back button, share/favourite/menu in one glass group, large titles
   on list screens). Removes most of the ~250 hand-built back buttons. Start
   with `event/[id]`, `post/[id]`, `settings`.
4. **Native sheets.** Simple bottom sheets and `Modal`s move to
   `presentation: 'formSheet'` with detents (glass on iOS 26 automatically).
   Keep `@gorhom/bottom-sheet` only where drag behaviour is custom (map).
5. **Menus and previews.** `Link.Preview` / `Link.Menu` on feed and event
   cards; `@expo/ui` `ContextMenu` for the other long-press sheets (65
   `onLongPress` handlers today).
6. **Polish.** SF Symbols via `expo-symbols` for system-meaning icons, swipe
   actions on list rows, `fullScreenGestureEnabled` (check carousels and maps
   first), Icon Composer app icon with dark/tinted/clear variants (new build),
   widgets and Live Activities with `expo-widgets` (new build).
7. **SDK 58.** Stable `expo-router/native-tabs`, the prominent "create" tab,
   iPad sidebar. Needed before iOS-27-SDK builds, which ignore
   `UIDesignRequiresCompatibility`.

## Rules for later work

- Liquid Glass only on controls that float above content. Never on a
  full-width bar or on content. Never fade a glass view or its parent with
  `opacity` — the material stops rendering below 1.
- Anything that jumps to a section uses `goToTab()`, never
  `router.replace('/')`.
- Inside a tab, bottom clearance is `BOTTOM_NAV_HEIGHT + insets.bottom`.
  Overlays above the navigator use `ROOT_TAB_BAR_CLEARANCE`.
- New native modules still need a new build and a runtime-version bump.
  The three listed above do not, because they are already in 3.9.0.
