/**
 * Renders PostHogProvider only when the user has consented to analytics.
 * On consent withdrawal we unmount the provider entirely (no SDK in memory).
 */

import React, { useEffect, useRef } from 'react';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { useConsent } from '@/context/ConsentContext';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

export function ConditionalPostHogProvider({ children }: { children: React.ReactNode }) {
  const { preferences, ready } = useConsent();

  // Until SecureStore has been read, render children without PostHog so that
  // we never fire a single event before consent is known.
  if (!ready || !preferences.analytics || !POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider
      apiKey={POSTHOG_KEY}
      options={{
        host: POSTHOG_HOST,
        enableSessionReplay: false,
        captureAppLifecycleEvents: false,
      }}
      autocapture={false}
    >
      <PostHogConsentSync />
      {children}
    </PostHogProvider>
  );
}

/**
 * Inside the PostHog provider so it has access to the client; calls optOut/optIn
 * defensively whenever the consent flag flips. Acts as a safety net beyond the
 * provider mount/unmount itself.
 */
function PostHogConsentSync() {
  const posthog = usePostHog();
  const { preferences } = useConsent();
  const lastValueRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!posthog) return;
    const next = preferences.analytics;
    if (lastValueRef.current === next) return;
    lastValueRef.current = next;
    if (next) {
      try {
        posthog.optIn();
      } catch {
        // ignore
      }
    } else {
      try {
        posthog.optOut();
        posthog.reset();
      } catch {
        // ignore
      }
    }
  }, [posthog, preferences.analytics]);

  return null;
}
