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

import type { PostHog } from 'posthog-react-native';

let client: PostHog | null = null;

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
