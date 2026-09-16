/**
 * Consent-aware analytics façade.
 *
 * The PostHog client is owned by <PostHogProvider> (mounted only when the user
 * has granted analytics consent). <PostHogTelemetry /> publishes the live
 * client into the module-level `client` ref via `setAnalyticsClient`, and
 * clears it when the provider unmounts.
 *
 * Call-sites just `import { track } from '@/lib/analytics'` and fire events.
 * If consent is denied (or revoked, or the SDK key is missing), `track()` is
 * a silent no-op — no events leave the device.
 */

import { Platform } from 'react-native';
import type { PostHog } from 'posthog-react-native';

let client: PostHog | null = null;

/**
 * Platform gate for the PostHog SDK.
 *
 * posthog-react-native crashes Hermes at launch on iOS 26.4 arm64e devices:
 * EXC_BAD_ACCESS / pointer-authentication failure in PinnedHermesValue while
 * modules initialise (PostHog/posthog-js#3562, still open at 4.74.0). The
 * 3.7.0 App Store build never had EXPO_PUBLIC_POSTHOG_KEY (it is not in the
 * EAS production environment), so the SDK was dormant on iOS until the
 * 2026-09-16 production OTA — bundled from the local .env — switched it on and
 * the app died on open for every consented iOS user. Keep the SDK off on iOS
 * until an upstream fix has been proven on an arm64e / iOS 26.4 device via an
 * internal build. `track()` stays a silent no-op when the client is absent.
 */
export function isPostHogSupportedOn(os: string): boolean {
  return os !== 'ios';
}

export const POSTHOG_SUPPORTED = isPostHogSupportedOn(Platform.OS);

/**
 * Canonical event names. Adding a new funnel step? Add it here so call-sites
 * stay typo-free and we can grep for usage.
 */
export const Events = {
  LOGIN_COMPLETED: 'login_completed',
  LOGOUT: 'logout',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  CONSENT_ACCEPTED: 'consent_accepted',
  EVENT_SUBMITTED: 'event_submitted',
  EVENT_BOOKMARKED: 'event_bookmarked',
  PROPOSAL_VOTED: 'proposal_voted',
  MECKY_MESSAGE_SENT: 'mecky_message_sent',
  PROFILE_UPDATED: 'profile_updated',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

/**
 * Wired by <PostHogTelemetry /> on mount and on every client identity change.
 * Pass `null` to clear (e.g., on consent revoke).
 */
export function setAnalyticsClient(c: PostHog | null): void {
  client = c;
}

/**
 * Fire an event. No-op when consent is not granted.
 *
 * @param event Use the {@link Events} constants for autocomplete.
 * @param props Lightweight metadata. Avoid PII.
 */
// posthog-react-native types `properties` as Record<string, any>; mirror that
// rather than tightening to `unknown` so call-sites don't need casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventProps = Record<string, any>;

export function track(event: EventName, props?: EventProps): void {
  try {
    client?.capture(event, props);
  } catch {
    // analytics must never throw upstream
  }
}
