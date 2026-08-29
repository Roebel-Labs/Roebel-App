# SDK 56 + Observe Upgrade — Kickoff

**Written 2026-08-29 · for the agent executing the Expo SDK 55 → 56 migration of `apps/expo`.**
Read this fully before touching code. It encodes a week of hard-won production lessons.

## Mission

Upgrade `apps/expo` from Expo SDK 55 to SDK 56 to unlock, in priority order:

1. **EAS Observe Navigation + Events + Errors** — hard SDK 56 gates (dashboard says so
   explicitly). Per-route Cold TTR / Warm TTR / TTI, `Observe.logEvent`, error tracking.
2. **Observe API migration** — SDK 55 uses the legacy names (`AppMetricsRoot.wrap`,
   `AppMetrics.markInteractive`, re-exported from `expo-app-metrics`); SDK 56 renames to
   `ObserveRoot.wrap` + `useObserve()`. Touch points: `app/_layout.tsx` (wrap + the
   `markInteractive()` call in `handleSplashFinish`), `components/consent/ObserveConsentGate.tsx`.
3. **RN core `backdrop-filter` evaluation** — IF the new RN version ships it, it is the
   compositor-level path to MULTI-surface Android glass (header bars, story chrome). Until
   proven, the current expo-blur single-sampler recipe stays (see “Glass” below).
4. **NativeTabs** (`(tabs)` group) — the single biggest native-feel win from the 08-22 audit:
   `components/BottomNavigation.tsx` is duplicated on 12 screens doing `router.push` full
   remounts. Optional in this migration; do NOT bundle it into the same risky commit as the
   SDK bump — separate, after the upgrade is green.

## Non-negotiable process rules (all learned the hard way this week)

- **Work on a branch.** Native dep changes on `main` broke builds three times this week.
- **`npx expo install --fix` FIRST.** Skipping it when adding `expo-observe` caused the
  expo-updates-interface saga (below). The repo was ~24 packages behind the SDK 55 patch
  line; expect the same drift.
- **Never trust semver for Expo native packages.** `expo-updates-interface` 55.1.6 was a
  Kotlin-BREAKING patch release (added an abstract member) that older `expo-updates` could
  not compile against, and the Maven coordinate is published NOWHERE — it resolves only via
  autolinking from node_modules. Fix class: move consumers to the versions the SDK manifest
  expects (`curl https://api.expo.dev/v2/sdks/56.0.0/native-modules` is the source of truth),
  never pnpm-override a native interface package.
- **Metro's transform cache makes babel-config changes NON-ATOMIC.** Files unchanged since
  before a config flip keep their old transforms until something busts the cache. After the
  upgrade, clear the cache (`npx expo start -c` once, or rm the metro cache) before the first
  export, or “it worked last week” proves nothing.
- **React Compiler × Reanimated worklets** (`experiments.reactCompiler` is ON): the compiler
  hoists static lambdas out of AUTO-workletized hook callbacks into module-level `_temp`
  functions that don't serialize to the UI runtime → release-only crash
  ("Array.prototype.map() requires a callable argument", FeedTabBar incident cb8c9864).
  Explicit `'worklet'` directives make the compiler bail. AUDIT after the upgrade: compile
  every reanimated-importing file with a Metro-like caller (`supportsReactCompiler: true`),
  regex the `init_data={code:...}` blocks, flag closure captures that get invoked. The
  session scratchpad script pattern is described in
  `memory/feedback_worklet_directive_ota_testing.md`; rebuild it if needed (~40 lines).
- **tsc discipline**: repo has ~724 pre-existing errors — compare COUNTS before/after, and
  NEVER skip typecheck on edits that add JSX elements (missing-`View`-import outage,
  89371b4e). `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.
- **ErrorBoundary logs to logcat in release** (d0418faa) — your best friend for silent
  white/empty screens: `adb logcat -d | grep "ErrorBoundary caught"`.
- **Max runs production builds and store submissions himself.** Preview builds/OTAs only,
  and only the ones he asks for. Never `eas build --profile production` unprompted.

## Runtime fence (CRITICAL — crash-loop prevention)

`runtimeVersion.policy = appVersion`; current version **3.6.0**. The SDK 56 build MUST bump
`version` to **3.7.0** in `app.config.ts` (`app.json` is an ignored mirror — keep it synced
anyway; `package.json` version too). Bump `ios.buildNumber` (last: 33) and
`android.versionCode` (last: 38) BY HAND — iOS `autoIncrement` was removed deliberately
(dynamic config made it re-increment from a stale base, producing duplicate build numbers).
JS from the SDK 56 tree must NEVER be published to runtime 3.6.0: `requireNativeModule` calls
at module scope throw on runtimes lacking the native module, expo-updates does NOT roll back
a crashing update, and the 3.5.0→3.6.0 fence already saved us twice. After the native build
is installed, OTA iteration on runtime 3.7.0 is safe.

## Fragile native surface (each broke a build at least once)

- **XMTP / SQLCipher**: `plugins/withXmtpThirdPartySQLite.js` sets
  `expo.updates.useThirdPartySQLitePod` so expo-updates uses the namespaced sqlite3 pod
  (system-module collision otherwise). Verify the flag still exists in SDK 56's expo-updates;
  iOS build is the proof. READ `docs/XMTP_INTEGRATION_STATE.md` before touching XMTP deps.
- **Mapbox**: `@rnmapbox/maps` pinned with `RNMapboxMapsVersion: '11.16.2'`. Check its RN
  0.8x compatibility matrix explicitly.
- **expo-build-properties**: compileSdk 36 / targetSdk 35 / NDK 27.1 / AGP 8.7.3 /
  `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`; iOS deploymentTarget 16.0 + OpenSSL-Universal
  pin. SDK 56 will want newer values — take Expo's defaults unless a plugin objects.
- **Sentry** (`@sentry/react-native/expo`), **thirdweb + polyfills** (`index.js` process/web
  shims, `metro.config.js` node polyfills + web excludes), **reanimated 4 + react-native-worklets**
  (check the SDK 56 pin — worklet serialization format changes have crashed release builds),
  **PagerView**, **expo-video `surfaceType="textureView"`** in `PostVideoPlayer` (load-bearing
  for glass — see below).
- **pnpm quirks**: install can leave duplicate native-package versions (the 55.1.3/55.1.6
  double); after install, `pnpm why <pkg>` every expo native package that autolinks, and
  check `npx expo-modules-autolinking resolve --platform android` points at ONE version.

## Glass / frosted chrome — current state (do not regress)

Real Android backdrop blur WORKS (overturned verdict, f598e670 + c64449b4) under a strict
recipe, all in `components/GlassSurface.tsx`:

1. **Exactly ONE `androidExperimentalBlur` GlassSurface per screen** — currently: bottom nav
   (glass-prop screens via `BottomNavigation`), feed's own nav bar (`FeedHome`), and the
   comment pill on post detail (`CommentInput`; that screen has no nav). Multiple samplers
   per `BlurTargetView` = screen content EATEN (invisible) on device.
2. `GlassProvider` per screen wraps BOTH the `GlassBackdrop` (target) and the bars.
3. Target-ref race guard (`targetReady` effect) — expo-blur binds `blurTarget.current` once
   at mount and never re-checks; check whether SDK 56's expo-blur fixed this before removing.
4. Feed videos MUST stay `surfaceType="textureView"` (SurfaceView in the target = the
   expo/expo#24572 HardwareRenderer crash).
5. Brightness knob = the Android wash layer + tint choice in GlassSurface, NOT `intensity`
   (intensity scales radius AND overlay together).

If RN backdrop-filter is available and proven on the Pixel 7, it may replace this whole
mechanism — prototype on ONE screen first, on-device, before any rollout.

## Observe specifics

- `expo-observe` SDK 56 pin: take from the SDK manifest. Consent gating MUST survive the API
  rename: dispatch stays tied to the `analytics` consent category
  (`ObserveConsentGate` — `configure()` is a FULL REPLACEMENT, restate every field), and the
  processor list in `constants/consent.ts` + Datenschutzerklärung still lack Expo/EAS — that
  legal update (PRIVACY_POLICY_VERSION bump → app-wide re-consent) is Max's explicit call,
  ask before shipping it.
- TTI mark: `AnimatedSplash` finish in `app/_layout.tsx` (ref-guarded) — keep the semantics.
- Verify with `npx eas-cli@latest observe:metrics-summary|routes|events --json --non-interactive`
  after the new build is on a device, consent accepted, and the app has been BACKGROUNDED
  (dispatch only happens on resign-active/terminate).
- Baseline to beat: cold TTR ~2.1s / TTI ~3.1s (Android, build 38).

## Verification workflow (use it, it works)

Emulator: `~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_33` (needs ~5GB
free disk). Install the EAS APK, drive with `adb shell input tap/swipe`, screenshot with
`adb exec-out screencap -p`, read crashes via `adb logcat` (`FATAL EXCEPTION`, boundary log).
Max's Pixel 7 over USB is the real oracle — emulators masked BOTH blur failure modes.
Monkey smoke: `adb shell monkey -p com.maxbrych.roebelonchain --pct-syskeys 0 --throttle 80 1500`.

## Suggested execution order

1. Branch `feat/sdk56-upgrade`; `npx expo install expo@^56` + `npx expo install --fix`;
   reconcile the fragile natives against the SDK 56 manifest; version → 3.7.0, versionCode
   39, buildNumber 34.
2. Observe API rename + ObserveConsentGate; worklet RC-audit; tsc count vs baseline.
3. EAS **preview** Android build → emulator gauntlet (feed, explore, profile, post detail,
   games, stories, glass surfaces) → Max's Pixel.
4. Observe dashboard: confirm Navigation + Events populate.
5. iOS preview build (XMTP pod flag is the risk) — never merged untested.
6. Merge; production builds/submission are Max's.
7. Separately, after green: NativeTabs spike; backdrop-filter spike.

## Key files

`app.config.ts` (authoritative config; app.json ignored) · `app/_layout.tsx` ·
`components/consent/ObserveConsentGate.tsx` · `components/GlassSurface.tsx` ·
`components/feed/PostVideoPlayer.tsx` · `plugins/*` (4 custom config plugins) ·
`eas.json` · `packages/blockchain/src/index.ts` (chain truth, untouched by this work) ·
memory: `project_eas_observe_setup`, `project_expo_native_feel_roadmap`,
`feedback_worklet_directive_ota_testing`.
