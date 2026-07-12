/**
 * Registers this device with the self-hosted XMTP notification server so that
 * inbound DMs — including from totally external wallets (Base App, Converse,
 * any XMTP client) — push even when the Röbel app is backgrounded or killed.
 *
 * The server (xmtp/example-notification-server-go on Fly) watches the XMTP
 * network on our behalf and forwards APNs/FCM pushes. This module only handles
 * the CLIENT side: hand the server our native push token + the topics to watch.
 * Actual display happens platform-side (Android headless handler / iOS NSE).
 *
 * SDK-safety: never statically import `@xmtp/react-native-sdk` here (old builds
 * crash on the module-factory throw). SDK functions are reached through
 * `handle.sdk`, which only exists once the native module has loaded.
 */

import * as Notifications from 'expo-notifications';
import type { XmtpClientHandle } from './client';

/**
 * Base URL of the Fly notification server. Empty until it's deployed and the
 * env var is set — every function below no-ops while empty, so this is safe to
 * ship before the server exists.
 */
export const NOTIF_SERVER = process.env.EXPO_PUBLIC_XMTP_PUSH_SERVER ?? '';

/**
 * `@xmtp/react-native-sdk@5.7.0` does NOT export `welcomeTopic()` (the docs say
 * it exists — it doesn't at this tag). The format is verified from xmtp-android
 * `Topic.kt` (`wrapMls("w-<installationId>")`). Subscribing to it is what makes
 * pushes fire for BRAND-NEW conversations, e.g. the first message an external
 * wallet ever sends this inbox.
 */
export function welcomeTopicFor(installationId: string): string {
  return `/xmtp/mls/1/w-${installationId}/proto`;
}

let lastTokenRegisteredAt = 0;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Register the device token + subscribe the welcome and conversation topics.
 * Best-effort and idempotent — safe to call on every boot/foreground.
 */
export async function registerForXmtpPush(handle: XmtpClientHandle): Promise<void> {
  if (!NOTIF_SERVER) return; // server not configured yet → no-op
  try {
    const installationId = handle.client.installationId;

    // Native device token (APNs on iOS, FCM on Android) — NOT the Expo push
    // token; the notification server talks to APNs/FCM directly. Refresh at
    // most twice a day.
    const now = Date.now();
    if (now - lastTokenRegisteredAt > TOKEN_TTL_MS) {
      const token = await Notifications.getDevicePushTokenAsync();
      if (token?.data) {
        handle.sdk.registerPushToken(NOTIF_SERVER, String(token.data));
        lastTokenRegisteredAt = now;
      }
    }

    // Subscribe the welcome topic (new conversations) + every existing
    // conversation topic. subscribePushTopics fetches + attaches this inbox's
    // HMAC keys internally so the server can drop our own sends.
    await handle.client.conversations.syncAllConversations(['allowed', 'unknown']);
    const convTopics = await handle.client.conversations.getAllPushTopics();
    const topics = [welcomeTopicFor(installationId), ...convTopics];
    await handle.sdk.subscribePushTopics(installationId, topics as any);
  } catch (err) {
    console.warn('[xmtp] push registration failed', err);
  }
}

/** Reset the throttle (e.g. on logout) so the next login re-registers the token. */
export function resetPushRegistration(): void {
  lastTokenRegisteredAt = 0;
}
