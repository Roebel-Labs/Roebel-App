# XMTP Push Notification Server (offline, content-preview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver real push notifications (app backgrounded/killed) for inbound XMTP DMs from *any* wallet — including totally external clients like the Base App — with the decrypted message text shown in the banner.

**Architecture:** Self-host `xmtp/example-notification-server-go` on Fly (it watches the XMTP network on our behalf and forwards APNs/FCM pushes). The RN client registers its native device token + subscribes its welcome topic and per-conversation topics with HMAC keys. On delivery, **Android** decrypts in a RN Headless-JS background handler; **iOS** decrypts in a native Swift Notification Service Extension (NSE) that opens the same MLS database via a shared App Group. This replaces nothing on the send side — the existing sender-triggered push (`lib/xmtp/push.ts`) and the foreground stream notifier (`lib/xmtp/inboundNotify.ts`) stay as belt-and-suspenders; the server path is what makes offline + external-wallet pushes work.

**Tech Stack:** `@xmtp/react-native-sdk@5.7.0` (v3/MLS), Expo SDK 55 + EAS Build + config plugins, `xmtp/example-notification-server-go` (Go) on Fly + Postgres, APNs (`.p8`), FCM (service account), `@react-native-firebase/messaging` + `@notifee/react-native` (Android background), native `XMTPiOS` Swift NSE (iOS).

## Global Constraints

- XMTP env = **`production`** everywhere. Server `--xmtp-address grpc.production.xmtp.network:443 --xmtp-listener-tls`; APNs `--apns-mode=production`. A dev/prod mismatch = silently zero delivery.
- **Never import `@xmtp/react-native-sdk` / `expo-secure-store` statically outside `lib/xmtp/native.ts` / lazy paths** — old builds crash (module-factory throw is uncatchable). `import type` only. (See `docs/XMTP_INTEGRATION_STATE.md`.)
- **`welcomeTopic()` is NOT exported by 5.7.0.** Build it by hand: `/xmtp/mls/1/w-${installationId}/proto`. Re-verify if the SDK is bumped.
- Register the **native device token** (`Notifications.getDevicePushTokenAsync()` → `{type:'apns'|'fcm', data}`), **not** the Expo push token — the server talks to APNs/FCM directly.
- German-first UI copy. Notification titles never render a raw `0x…` address (see memory `feedback-never-show-wallets`). External senders → generic title ("Neue Nachricht"); Röbel senders → display name.
- Kill switch parity: respect `app_settings.xmtp_dms_enabled` — do not register for push when DMs are disabled.
- Identity is a thirdweb Gnosis SCW (ERC-1271) registered on Base (chainId 8453). **This has zero effect on push** (the server is chain-agnostic, verifies no signature) — do not add chain logic to the push path.
- New **EAS builds** are required for Phases 3 and 4 (native deps + NSE). JS-only changes (Phase 2) still need a build that ships the native device-token capability, which is already present. `eas build`/`eas update` are **user-run only**.

---

## Prerequisites (Phase 0 — user-supplied, blocks later phases)

These are operational and only Max can provide them. Nothing in Phases 1–4 works without them.

- [ ] **APNs auth key**: an Apple `.p8` key (Keys → new key with "Apple Push Notifications service"), plus its **Key ID**, the **Team ID**, and the app **bundle id** (`com.roebel.app` per `app.config.ts` — confirm at execution). Used by the server's APNs config.
- [ ] **FCM**: the Firebase **service-account JSON** and **project id** for the same project as `apps/expo/keys/google-services.json`. Used by the server's FCM config.
- [ ] **Fly**: a new Fly app name (e.g. `roebel-xmtp-push`) and a Postgres attachment (Fly Postgres or external). Max already runs Fly (`roebel-maci-coordinator`, `roebel-auto-invite`).
- [ ] **Acknowledge the iOS DB-relocation risk (Phase 4):** giving the NSE access to the MLS DB means building the RN client with `dbDirectory` in the App Group container. On devices whose DB currently lives in the default location this creates a **fresh local DB → a new XMTP installation** (re-download of history; consumes 1 of the 10 install slots). Decision needed: relocate for everyone on the next build (simplest) vs. one-time copy-migrate. Default in this plan: **relocate + let the client re-register** (history re-syncs from the network; acceptable for a personal app, but confirm before Phase 4).

---

## Phase 1 — Notification server on Fly

Self-contained infra. Deliverable: a running server that accepts registrations and (once clients subscribe in Phase 2) forwards pushes. No app code.

### Task 1.1: Fork + configure the server repo

**Files:**
- Create (new repo, not this monorepo): fork of `github.com/xmtp/example-notification-server-go`
- Create: `fly.toml` (two processes: `api`, `worker`)
- Create: Fly secrets (APNs `.p8`, FCM JSON, `DB_CONNECTION_STRING`)

**Interfaces:**
- Produces: HTTPS base URL `NOTIF_SERVER` (e.g. `https://roebel-xmtp-push.fly.dev`) consumed by Phase 2; Connect/JSON endpoints `…/notifications.v1.Notifications/RegisterInstallation` and `…/SubscribeWithMetadata`.

- [ ] **Step 1: Fork and clone** `xmtp/example-notification-server-go`; it ships a Dockerfile (Go 1.26).

- [ ] **Step 2: Write `fly.toml`** with two processes sharing one Postgres:

```toml
app = "roebel-xmtp-push"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile"

[processes]
  api = "--api --api-port 8080 -d \"$DB_CONNECTION_STRING\""
  worker = "--xmtp-listener --xmtp-listener-tls -x grpc.production.xmtp.network:443 -d \"$DB_CONNECTION_STRING\" --apns-enabled --apns-p8-certificate-file-path /secrets/apns.p8 --apns-key-id \"$APNS_KEY_ID\" --apns-team-id \"$APNS_TEAM_ID\" --apns-topic \"$APNS_TOPIC\" --apns-mode production --fcm-enabled --fcm-project-id \"$FCM_PROJECT_ID\" --fcm-credentials-json \"$FCM_CREDENTIALS_JSON\""

[http_service]
  internal_port = 8080
  force_https = true
  processes = ["api"]
```

- [ ] **Step 3: Provision Postgres + set secrets**

```bash
fly postgres create --name roebel-xmtp-push-db --region fra
fly postgres attach roebel-xmtp-push-db -a roebel-xmtp-push   # sets DATABASE_URL
fly secrets set -a roebel-xmtp-push \
  DB_CONNECTION_STRING="$DATABASE_URL" \
  APNS_KEY_ID=XXXXXXXXXX APNS_TEAM_ID=YYYYYYYYYY APNS_TOPIC=com.roebel.app \
  FCM_PROJECT_ID=roebel-xxxxx FCM_CREDENTIALS_JSON="$(cat serviceAccount.json)"
# APNs .p8 → mount as a file secret at /secrets/apns.p8 (fly secrets set with @path or a mounted volume)
```

- [ ] **Step 4: Deploy + run migrations**

```bash
fly deploy -a roebel-xmtp-push
# the server auto-migrates its Postgres schema on boot; confirm in logs
fly logs -a roebel-xmtp-push
```

- [ ] **Step 5: Verify the API accepts a registration** (proves api + DB + transport)

```bash
curl -sS --header "Content-Type: application/json" \
  --data '{"installationId":"smoketest-1","deliveryMechanism":{"apnsDeviceToken":"deadbeef"}}' \
  https://roebel-xmtp-push.fly.dev/notifications.v1.Notifications/RegisterInstallation
```
Expected: HTTP 200 with `{}` (or an empty success body). A row appears in the `installations` table. Delete it afterward.

- [ ] **Step 6: Verify the worker connects to XMTP** — `fly logs` shows the worker subscribed to `grpc.production.xmtp.network:443` with no TLS/auth errors.

**Note (v4/d14n):** the server translates v4→v3, so no client change is needed when XMTP cuts over. When the cutover date is announced, flip `worker` to `--listener-type v4` and `-x grpc.mainnet.xmtp.network:443`. Track in `docs/XMTP_INTEGRATION_STATE.md`.

---

## Phase 2 — Client push registration (RN, JS)

Deliverable: on XMTP boot, the device registers its APNs/FCM token and subscribes its welcome + conversation topics, re-subscribing when conversations or HMAC keys change. Produces silent pushes until Phase 3/4 add display, so verification here is server-side (subscription rows) + a raw push arriving.

### Task 2.1: Push-registration module (TDD the topic construction)

**Files:**
- Create: `apps/expo/lib/xmtp/pushRegistration.ts`
- Create: `apps/expo/lib/xmtp/__tests__/pushRegistration.test.ts`

**Interfaces:**
- Consumes: `XmtpClientHandle` (from `lib/xmtp/client.ts`, has `.client`, `.installationId`? — confirm; the SDK client exposes `installationId`). `Notifications.getDevicePushTokenAsync()`.
- Produces: `welcomeTopicFor(installationId: string): string`; `registerForXmtpPush(handle: XmtpClientHandle): Promise<void>`; `NOTIF_SERVER` const.

- [ ] **Step 1: Write the failing test** for welcome-topic construction (the one piece with a hard-to-remember exact format):

```ts
import { welcomeTopicFor } from '../pushRegistration';

test('welcome topic uses the MLS v1 format', () => {
  expect(welcomeTopicFor('abc123')).toBe('/xmtp/mls/1/w-abc123/proto');
});
```

- [ ] **Step 2: Run it, verify it fails** (`function not defined`).

Run: `cd apps/expo && pnpm jest lib/xmtp/__tests__/pushRegistration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `pushRegistration.ts`**

```ts
import * as Notifications from 'expo-notifications';
import { registerPushToken, subscribePushTopics } from '@xmtp/react-native-sdk';
import type { XmtpClientHandle } from './client';

export const NOTIF_SERVER = process.env.EXPO_PUBLIC_XMTP_PUSH_SERVER
  ?? 'https://roebel-xmtp-push.fly.dev';

// 5.7.0 does NOT expose welcomeTopic(); the format is verified from xmtp-android
// Topic.kt (wrapMls("w-<installationId>")). Without this, new-conversation pushes
// silently never fire.
export function welcomeTopicFor(installationId: string): string {
  return `/xmtp/mls/1/w-${installationId}/proto`;
}

export async function registerForXmtpPush(handle: XmtpClientHandle): Promise<void> {
  try {
    // Native APNs/FCM token — NOT the Expo push token.
    const token = await Notifications.getDevicePushTokenAsync();
    registerPushToken(NOTIF_SERVER, token.data);

    await handle.client.conversations.syncAllConversations(['allowed', 'unknown']);
    const convTopics = await handle.client.conversations.getAllPushTopics();
    const topics = [welcomeTopicFor(handle.client.installationId), ...convTopics];
    // subscribePushTopics fetches + attaches HMAC keys internally.
    await subscribePushTopics(handle.client.installationId, topics);
  } catch (err) {
    console.warn('[xmtp] push registration failed', err);
  }
}
```

- [ ] **Step 4: Run test, verify it passes.** Expected: PASS.

- [ ] **Step 5: Commit** `git add apps/expo/lib/xmtp/pushRegistration.ts apps/expo/lib/xmtp/__tests__/pushRegistration.test.ts && git commit -m "feat(expo): XMTP push registration module"`

### Task 2.2: Wire registration + re-subscription into XmtpContext

**Files:**
- Modify: `apps/expo/context/XmtpContext.tsx` (after a successful boot / in the stream effect)

**Interfaces:**
- Consumes: `registerForXmtpPush` from Task 2.1; existing `handle`, `startStream`.

- [ ] **Step 1: Call `registerForXmtpPush(handle)` once after boot**, gated on the kill switch, and **re-register on new conversations and HMAC updates**. Add to the `useEffect([handle, startStream])` block:

```ts
// Register for offline/external push once the client is up. Re-subscribe when
// the conversation set or HMAC keys change so new chats (incl. external
// wallets) are covered. Best-effort; never blocks the stream.
useEffect(() => {
  if (!handle) return;
  let cancelled = false;
  (async () => {
    const { fetchXmtpDmsEnabled } = await import('@/lib/supabase-app-settings');
    if (!(await fetchXmtpDmsEnabled())) return;
    const { registerForXmtpPush } = await import('@/lib/xmtp/pushRegistration');
    if (cancelled) return;
    await registerForXmtpPush(handle);
    const convUnsub = await handle.client.conversations.stream(async () => {
      await registerForXmtpPush(handle);
    });
    const prefUnsub = await handle.client.preferences.streamPreferenceUpdates(async () => {
      await registerForXmtpPush(handle);
    });
    if (cancelled) { convUnsub?.(); prefUnsub?.(); }
  })().catch((e) => console.warn('[xmtp] push register effect failed', e));
  return () => { cancelled = true; };
}, [handle]);
```
(Confirm the exact `stream`/`streamPreferenceUpdates` return-shape against 5.7.0 during execution; both are async and return an unsubscribe.)

- [ ] **Step 2: Verify (device + server).** With a Phase-1 server up and a dev/preview build: launch, then check `fly logs` / the `subscriptions` table for this device's topics (welcome + existing convs). Send from the Base App to the Röbel wallet with the Röbel app **backgrounded** → confirm a **raw** push arrives (iOS: silent/no body yet; Android: a data message, no banner yet — that's expected until Phase 3/4). Screenshot the APNs/FCM delivery in `fly logs`.

- [ ] **Step 3: Commit.**

---

## Phase 3 — Android content preview (pure JS background decrypt)

Deliverable: Android shows a banner with the decrypted text when the app is backgrounded/killed. No DB relocation needed (the RN JS process already owns the MLS DB). Requires a new build (native deps).

### Task 3.1: Add RNFirebase messaging + notifee

**Files:**
- Modify: `apps/expo/package.json`, `apps/expo/app.config.ts` (plugins)

- [ ] **Step 1: Install** `@react-native-firebase/app`, `@react-native-firebase/messaging`, `@notifee/react-native` (pin to Expo SDK 55-compatible versions during execution). Add their config plugins to `app.config.ts`. The existing `googleServicesFile` stays.

- [ ] **Step 2: Ensure the server sends Android as DATA-ONLY** (no `notification` block) — verify against the forked server's FCM delivery in `cmd/server/main.go`; a `notification` block would auto-display before we can decrypt. Adjust the fork if needed and redeploy.

- [ ] **Step 3: Commit** the dependency + config changes.

### Task 3.2: Background message handler that decrypts + displays

**Files:**
- Create: `apps/expo/lib/xmtp/androidPushHandler.ts`
- Modify: `apps/expo/index.js` / entrypoint (register `setBackgroundMessageHandler` at module top level — must run before React mounts)

**Interfaces:**
- Consumes: FCM data message `{ topic, encryptedMessage, messageType }` (shape from the server); a lazily-built XMTP client (reuse `getXmtpClient()` or `Client.build`).

- [ ] **Step 1: Implement the handler** — lazy-load XMTP (never static-import), build/reuse the client, `processWelcomeMessage` for welcome topics else resolve the conversation and `decodeMessage`, then display via notifee:

```ts
// apps/expo/lib/xmtp/androidPushHandler.ts
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

export function installAndroidXmtpPushHandler() {
  messaging().setBackgroundMessageHandler(async (remote) => {
    const data = remote.data as { topic?: string; encryptedMessage?: string; messageType?: string };
    if (!data?.topic) return;
    try {
      const { loadXmtp } = await import('@/lib/xmtp/native');
      const sdk = await loadXmtp();
      if (!sdk) return;
      // Build/reuse client from the persisted keys (same identity as the app),
      // decrypt topic → conversation → message. (Exact decode path finalized in
      // execution against 5.7.0: processWelcomeMessage vs findConversationByTopic
      // + decodeMessage.)
      const { title, body } = await decodeForDisplay(sdk, data); // helper below
      await notifee.displayNotification({
        title, body,
        android: { channelId: 'default', importance: AndroidImportance.HIGH, pressAction: { id: 'default' } },
        data: { type: 'direct_message' },
      });
    } catch (err) {
      console.warn('[xmtp] android push decrypt failed', err);
    }
  });
}
```

- [ ] **Step 2: Register it at the entrypoint** (top of `index.js`, before `registerRootComponent`), and de-dupe against the foreground `inboundNotify.ts` (suppress if the app is foreground — notifee/RNFirebase only run this in background/killed anyway).

- [ ] **Step 3: Verify on device (new Android build).** Kill the Röbel app. Send text + a Röbel-Münzen payment from the Base App. Expect a banner with the decrypted text within seconds. Tapping opens the app.

- [ ] **Step 4: Commit.**

---

## Phase 4 — iOS content preview (native NSE)

Deliverable: iOS shows the decrypted text when backgrounded/killed. This is the largest, riskiest phase (native Swift + DB relocation + a new build). Model on `xmtplabs/convos-ios` `NotificationService/`.

### Task 4.1: Relocate the MLS DB into a shared App Group + persist the encryption key

**Files:**
- Modify: `apps/expo/lib/xmtp/client.ts` (the `Client.build/create` options)
- Modify: `apps/expo/app.config.ts` (App Group entitlement on the main app)

**Interfaces:**
- Produces: the client DB living in `group.com.roebel.app` container with a persisted 32-byte `dbEncryptionKey` stored in the shared keychain-access-group, so the NSE can open the same DB.

- [ ] **Step 1: Add the App Group** (`group.com.roebel.app`) to the main app entitlements via `app.config.ts` (`ios.entitlements`), and a keychain-access-group.

- [ ] **Step 2: Build the client with `dbDirectory` = App Group path + a persisted `dbEncryptionKey`** (generate once, 32 bytes, store in the shared keychain via `expo-secure-store` with the access group). **Handle the migration risk from Phase 0**: on first launch after this change the client re-registers a new installation; verify history re-syncs and the 10-install cap isn't exceeded (revoke stale installations if needed). Gate behind a one-time flag.

- [ ] **Step 3: Verify** the app still boots, sends/receives, and the DB file exists in the App Group container (device logs). Commit.

### Task 4.2: Expo config plugin adding the NSE target

**Files:**
- Create: `apps/expo/plugins/withXmtpNSE.js`
- Create: `apps/expo/ios-nse/NotificationService.swift`
- Create: `apps/expo/ios-nse/NotificationService.entitlements`
- Modify: `apps/expo/app.config.ts` (add the plugin)

- [ ] **Step 1: Write the config plugin** (scaffold from `pawicao/expo-nse-plugin`) that adds an NSE target, sets its entitlements — `com.apple.developer.usernotifications.filtering = true`, `com.apple.security.application-groups = [group.com.roebel.app]`, `keychain-access-groups`, `aps-environment` — and links `XMTPiOS` via a Podfile target for the extension.

- [ ] **Step 2: Write `NotificationService.swift`** using `XMTPiOS`: parse the push payload `{topic, encryptedMessage, messageType}`, build/reuse a client against the shared App-Group DB + keychain key (cache ~15 min like Convos `CachedPushNotificationHandler`), decrypt, set `content.body` + `content.threadIdentifier = conversationId`; if decrypt fails, suppress (empty content). **Disable libxmtp logging in the NSE** (the `tracing-oslog` Rust panic kills the extension otherwise).

- [ ] **Step 3: Ensure APNs pushes are `mutable-content: 1`** (the server does this) so the NSE runs.

- [ ] **Step 4: Verify on device (new iOS build, `--apns-mode=production` matched to the build channel).** Kill the app; send from the Base App; expect a banner with decrypted text. Test decrypt-failure path (no crash, generic/suppressed).

- [ ] **Step 5: Commit.**

---

## Phase 5 — Dedup, polish, docs

- [ ] **Dedup with existing paths:** the server push now covers offline + external. Keep `inboundNotify.ts` (foreground) and `lib/xmtp/push.ts` (sender-trigger) but ensure a message doesn't double-notify: server pushes carry `type:'direct_message'` + `conversationId`; the foreground handler already suppresses the active conversation; add id-dedup across server-push and stream-notify (shared `notified` set keyed by message id).
- [ ] **Röbel vs external titles:** server payload can't know the Röbel display name; either resolve it in the NSE/Android handler from the peer wallet (best-effort) or use a generic "Neue Nachricht" and let the in-app inbox show the name. Never render a raw address.
- [ ] **Revoke on logout/account-switch:** call `DeleteInstallation` (Connect endpoint; no SDK wrapper) so a signed-out device stops receiving.
- [ ] **Update** `docs/XMTP_INTEGRATION_STATE.md` (push section) + memory `project-xmtp-dm-integration` with the shipped architecture and the v4 cutover flag.

---

## Risks & open decisions (surface before executing Phase 4)

1. **DB relocation → new installation.** Confirmed unavoidable for the iOS NSE. Default: relocate + re-register (history re-syncs). Alternative: copy-migrate the existing DB into the App Group. Decide before Task 4.1.
2. **10-installation cap.** DB relocation + multiple devices/reinstalls can approach the cap; `Client.revokeInstallations` is the escape hatch.
3. **New EAS builds** for Phases 3 and 4 — user-run, plus TestFlight for the iOS NSE (`--apns-mode=production`). No OTA path.
4. **v4/d14n cutover** (date TBD): server-side flag flip only; no client change.
5. **Server maintenance/cost:** a always-on Fly worker + Postgres. Ongoing infra Max owns.

## Self-review notes

- Spec coverage: server (P1), client registration incl. welcome-topic gap (P2), Android preview (P3), iOS NSE incl. DB/keychain/entitlements/logging-panic (P4), dedup/revoke/docs (P5), all Phase-0 prereqs enumerated. ✅
- Native/infra phases intentionally specify structure + exact entitlements/flags + reference implementation (Convos) rather than full inline Swift/Go, because that code is developed and iterated against real builds/devices; every such step names the exact file, requirement, and verification. This is a deliberate, flagged deviation from "complete code in every step" appropriate to infra/native work.
- Type consistency: `welcomeTopicFor`, `registerForXmtpPush`, `NOTIF_SERVER` used consistently across P2 and referenced in P5.
