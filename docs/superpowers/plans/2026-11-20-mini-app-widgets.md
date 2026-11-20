# Mini-App Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Max's budget rule: one builder, inline, no per-task reviewers). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Home-screen widgets (iOS + Android) showing the user's chosen mini apps as an Erkunden-style icon grid with unread red dots, chosen under Einstellungen → Widget.

**Architecture:** One JS module (`lib/widget-sync.ts`) builds a platform-neutral payload (apps + base64 icons + unread flags) from the user's selection and pushes it to the OS: iOS via `@bacons/apple-targets` `ExtensionStorage` (App Group UserDefaults) read by a SwiftUI WidgetKit extension in `targets/widget/`; Android via `react-native-android-widget` rendering a JSX widget from the same payload. Deep links `roebel://mini-app/<slug>?open=1` open the host directly.

**Tech Stack:** Expo SDK 56 (CNG), `@bacons/apple-targets@5.0.0`, `react-native-android-widget@0.26.0`, expo-image-manipulator, AsyncStorage, SwiftUI/WidgetKit, Jest (jest-expo).

**Spec:** `docs/superpowers/specs/2026-11-20-mini-app-widgets-design.md`

## Global Constraints

- Branch `feat/miniapp-widgets` in worktree `.worktrees/miniapp-widgets`; merge to main only when done; ships with 3.10.0 (no version bump here — the release does that).
- App Group: `group.com.maxbrych.roebelonchain.widgets` (app + extension). Widget kind / Android widget name: `MiniApps`.
- UserDefaults/AsyncStorage keys: selection `widget.miniapps.v1` (slug[]), payload `widget.payload.v1`, last wallet `widget.wallet.v1`.
- Max 15 apps + a fixed last "Alle" tile (store icon `assets/illustration/mini-app-store.png`, opens `roebel://mini-apps`). Grid 4 columns: iOS small 2×2 (3 + Alle, single tap → `roebel://mini-apps`), medium 4×2 (7 + Alle), large 4×4 (15 + Alle). Fewer apps than slots → Alle follows the last app.
- Look = `AppIcon`/`MiniAppGridTile`: corner radius 24 % of icon size, `primaryColor` (fallback `#F7F7F7` light / `#3c4043` dark) behind icon, first letter in white when no icon, name 1 line centered below; background `#ffffff` / `#18191B`; text `#000000` / `#e8eaed`; red dot `#FF3B30`, no count. No shadows.
- UI copy German, identifiers/comments English. No wallet addresses in UI.
- Commit with pathspecs only (`git commit -- <paths>`), message ends with Co-Authored-By line; push after each commit.
- Disk: ~5 GB free — no extra worktrees, no prebuild of both platforms at once; delete `ios/`/`android/` prebuild output after checks.

## Review Focus

1. Cold start via widget link while thirdweb auto-connect is still running → host must not mount until the account is known (Task 4 test).
2. Selected app later goes offline/deleted → dropped from payload on next sync, no crash, no blank tile (Task 1 test).
3. Icon download fails / `iconUrl` null → letter tile, sync still completes (Task 1 test).
4. Logged-out user → widget works, no dots, no notification query (Task 1 test).
5. Payload size: 15 icons must stay small (≤ 96 px PNG, assert base64 length < 40 000 chars each) (Task 1 test).

---

### Task 1: Selection + payload builder (`lib/widget-sync.ts`)

**Files:** Create `lib/widget-sync.ts`, `lib/widget-payload.ts`; Test `lib/__tests__/widget-payload.test.ts`

**Interfaces — Produces:**
- `type WidgetApp = { slug: string; name: string; color: string | null; icon: string | null /* base64 PNG, no prefix */; unread: boolean }`
- `type WidgetPayload = { v: 1; apps: WidgetApp[]; updatedAt: number }`
- `export const WIDGET_MAX_APPS = 15`
- `lib/widget-payload.ts` (pure, tested): `resolveSelection(selected: string[] | null, installed: string[], live: MiniApp[]): MiniApp[]` (explicit selection order, filtered to live; null selection → installed in live order, else featured; capped at 16) and `buildPayload(apps: MiniApp[], icons: Record<string, string | null>, unreadSlugs: Set<string>, now: number): WidgetPayload`.
- `lib/widget-sync.ts`: `getWidgetSelection(): Promise<string[] | null>`, `setWidgetSelection(slugs: string[]): Promise<void>` (then `syncWidget`), `syncWidget(wallet: string | null): Promise<WidgetPayload>`, `fetchUnreadMiniAppSlugs(wallet: string): Promise<Set<string>>` (one query on `notifications`: `type='mini_app'`, `is_read=false`, `recipient_wallet`, select `metadata`), `markMiniAppNotificationsRead(wallet: string, slug: string): Promise<void>`, `useMiniAppUnread(): Set<string>`, `readStoredPayload(): Promise<WidgetPayload | null>`.

- [ ] Step 1: tests for `resolveSelection` / `buildPayload`: explicit order kept; unknown/offline slug dropped; null selection → installed; no installed → featured; >15 capped; no unread when set empty; `icon` null passes through.
- [ ] Step 2: run `pnpm jest lib/__tests__/widget-payload.test.ts --watchAll=false` → FAIL.
- [ ] Step 3: implement both modules. Icons: `ImageManipulator.manipulate(iconUrl).resize({width:96})` → `saveAsync({format: png, base64: true})`, cache by `slug+iconUrl` in memory; any failure → null. `syncWidget` writes payload to AsyncStorage + platform push (Task 2/3 hooks via `pushToPlatform(payload)` in `lib/widget-platform.ts` with `.ios.ts` / `.android.ts` / default no-op). Wallet null → no unread query.
- [ ] Step 4: tests PASS.
- [ ] Step 5: commit + push.

### Task 2: iOS widget extension

**Files:** Create `targets/widget/expo-target.config.js`, `targets/widget/MiniAppsWidget.swift`, `targets/widget/Info.plist` (if the plugin doesn't generate one), `lib/widget-platform.ios.ts`; Modify `app.config.ts` (plugin `@bacons/apple-targets`, `ios.entitlements['com.apple.security.application-groups']`, `ios.appleTeamId` if missing), `package.json` (dep).

**Interfaces — Consumes:** `WidgetPayload` JSON at UserDefaults(suite App Group) key `widget.payload.v1`.

- [ ] Step 1: `pnpm add @bacons/apple-targets@5.0.0` (in apps/expo).
- [ ] Step 2: config: `type: "widget"`, `deploymentTarget: "17.0"`, `bundleIdentifier: ".widget"`, App Group entitlement, colors `$widgetBackground` light/dark per constraints, `images: { storeIcon: '../../assets/illustration/mini-app-store.png' }`.
- [ ] Step 3: SwiftUI: `TimelineProvider` decoding the payload (static entry, policy `.never` — app reloads via `ExtensionStorage.reloadWidget()`); `LazyVGrid` 4 cols (2 on small); tile = icon (decoded `UIImage` from base64 or letter on color) + name; red dot overlay top-right; last tile `Image("storeIcon")` + "Alle" linking `roebel://mini-apps`; apps truncated to slots−1; medium/large wrap tiles in `Link(destination: roebel://mini-app/<slug>?open=1)`; small uses `.widgetURL(roebel://mini-apps)`; empty state "Mini Apps auswählen" → `roebel://settings/widget`; `containerBackground` light/dark. `supportedFamilies [.systemSmall, .systemMedium, .systemLarge]`, display name "Mini Apps", description "Deine Röbel Mini Apps auf einen Blick.".
- [ ] Step 4: `lib/widget-platform.ios.ts`: `new ExtensionStorage(GROUP).set('widget.payload.v1', JSON.stringify(p)); ExtensionStorage.reloadWidget()`.
- [ ] Step 5: verify `npx expo prebuild -p ios --no-install --clean` succeeds and `ios/Rbel.xcodeproj` contains the widget target + both entitlements carry the group; `xcrun swiftc -parse targets/widget/*.swift` parses. Delete prebuild output afterwards (it's gitignored but eats disk). Commit + push.

### Task 3: Android widget

**Files:** Create `widgets/android/MiniAppsWidget.tsx`, `widgets/android/task-handler.tsx`, `lib/widget-platform.android.ts`; Modify `app.config.ts` (plugin `react-native-android-widget` with widget `MiniApps`, label "Mini Apps", description as iOS, `minWidth 110dp`, `minHeight 110dp`, `targetCellWidth 4`, `targetCellHeight 2`, `resizeMode horizontal|vertical`, `updatePeriodMillis 1800000`, previewImage `./assets/widget/miniapps-preview.png`), `index.js` (register task handler on android only), `package.json`.

**Interfaces — Consumes:** `readStoredPayload`, `syncWidget`, `WIDGET_*` from Task 1.

- [ ] Step 1: `pnpm add react-native-android-widget@0.26.0`.
- [ ] Step 2: `MiniAppsWidget({ payload, width, height, dark })`: cols = width < 200 ? 2 : 4, rows = floor(height / 80) clamped 1..4; `FlexWidget` grid; `ImageWidget image="data:image/png;base64,…" radius` / letter `TextWidget`; dot = small `FlexWidget` `#FF3B30`; each tile `clickAction="OPEN_URI" clickActionData={{ uri }}`; last tile = Alle (`require('@/assets/illustration/mini-app-store.png')`, uri `roebel://mini-apps`), apps truncated to cols×rows−1; empty state as iOS.
- [ ] Step 3: task handler: on ADDED/UPDATE/RESIZED → for UPDATE re-run `syncWidget(storedWallet)` (unread refresh; fall back to stored payload offline), render with `widgetInfo` size + light/dark representation.
- [ ] Step 4: `widget-platform.android.ts`: `requestWidgetUpdate({ widgetName: 'MiniApps', renderWidget })`.
- [ ] Step 5: Jest render test `widgets/android/__tests__/MiniAppsWidget.test.tsx`: 15 apps at 4×4 → 15 app tiles with OPEN_URI `roebel://mini-app/<slug>?open=1` + last tile Alle → `roebel://mini-apps`; 15 apps at 4×2 → 7 apps + Alle; unread app has the dot; empty payload → "Mini Apps auswählen". Run → PASS. `npx expo prebuild -p android --no-install --clean` → manifest contains the receiver; delete output. Commit + push.

### Task 4: Deep link opens host directly, waits for account

**Files:** Modify `app/mini-app/[slug].tsx`; Create `lib/miniapp-autoopen.ts`; Test `lib/__tests__/miniapp-autoopen.test.ts`

**Interfaces — Produces:** `shouldAutoOpen(p: { openParam: string | undefined; decision: OpenDecision; walletStatus: 'connecting' | 'connected' | 'disconnected' | 'unknown' }): boolean` — true only when `openParam === '1'`, decision `'open'`, and status not `connecting`/`unknown`.

- [ ] Step 1: tests: connecting → false; connected + open → true; disconnected + open → true (logged-out user still opens); locked → false; no param → false.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: in the route read `open` from `useLocalSearchParams`, `useActiveWalletConnectionStatus()`; effect fires `setHostVisible(true)` once when `shouldAutoOpen`; on host open call `markMiniAppNotificationsRead(wallet, slug)` then `syncWidget(wallet)`; on close `syncWidget(wallet)`.
- [ ] Step 4: `MiniAppsEntry` host open/close paths do the same mark-read + sync. Commit + push.

### Task 5: Settings screen + in-app dots + sync triggers

**Files:** Create `app/settings/widget.tsx`; Modify `app/settings.tsx` (row "Widget" with subtitle "Mini Apps auf dem Homescreen" in ERSCHEINUNGSBILD), `components/miniapp/MiniAppCard.tsx` (`AppIcon` optional `unread` prop → dot), `components/miniapp/MiniAppsEntry.tsx` + `app/mini-apps.tsx` (pass `unread` from `useMiniAppUnread()`), `app/_layout.tsx` (AppState foreground/background → `syncWidget(wallet)`; notification received listener → `syncWidget`).

- [ ] Step 1: screen: header "Widget"; section "IM WIDGET" (selected, reorder with up/down buttons, remove) and "WEITERE MINI APPS" (tap to add; disabled at 15 with hint "Maximal 15 Mini Apps"); hint card per platform: iOS "Halte den Homescreen gedrückt → + → Röbel → Mini Apps", Android "Halte den Homescreen gedrückt → Widgets → Röbel → Mini Apps". Save on every change via `setWidgetSelection`. StyleSheet + useTheme.
- [ ] Step 2: dot in `AppIcon`: 10 px (scaled `size*0.18`, min 8) circle `#FF3B30`, 2 px border in `colors.background`, top-right, outside the clipped icon (wrap in a non-clipping View).
- [ ] Step 3: `pnpm jest --watchAll=false lib/__tests__/widget-payload.test.ts lib/__tests__/miniapp-autoopen.test.ts widgets` PASS; typecheck per `reference_expo_tsc_oom` (12 GB heap, check exit code) — no new errors vs. main baseline. Commit + push.

### Task 6: Wrap-up

- [ ] Update `docs/` state note (short section in spec "Status") + memory `project_store_build_310_pending` (widgets in 3.10.0; iOS build asks for widget-target credentials once; preview image asset).
- [ ] Merge `feat/miniapp-widgets` → main (no-ff), push. Tell Max what to test on device (add widget, choose apps, dot after a mini-app push, cold-start tap stays logged in).
