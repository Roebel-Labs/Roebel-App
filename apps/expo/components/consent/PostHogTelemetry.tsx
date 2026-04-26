/**
 * PostHog telemetry — screen tracking + user identify.
 *
 * Mounts inside <ThemedLayout /> (descendant of both ConditionalPostHogProvider
 * and UserProvider). The outer wrapper checks consent first; the inner only
 * runs when analytics consent is granted, which is the same condition under
 * which ConditionalPostHogProvider mounts the real <PostHogProvider>. That
 * means usePostHog() is always called inside an actual provider — no
 * "called without a PostHog client" warning.
 */

import React, { useEffect, useRef } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useConsent } from '@/context/ConsentContext';
import { useUser } from '@/context/UserContext';
import { getScreenName } from '@/hooks/useAnalytics';
import { setAnalyticsClient } from '@/lib/analytics';

export function PostHogTelemetry() {
  const { ready, preferences } = useConsent();
  if (!ready || !preferences.analytics) return null;
  return <PostHogTelemetryInner />;
}

function PostHogTelemetryInner() {
  const posthog = usePostHog();
  const { user } = useUser();
  const pathname = usePathname();
  const segments = useSegments();
  const identifiedFor = useRef<string | null>(null);
  const lastUserRef = useRef<string | null>(null);

  // Publish the live client to the module-level analytics façade so that
  // `track()` call-sites can fire custom events without needing the provider.
  useEffect(() => {
    setAnalyticsClient(posthog ?? null);
    return () => setAnalyticsClient(null);
  }, [posthog]);

  // Screen tracking
  useEffect(() => {
    if (!posthog || !pathname) return;
    posthog.screen(getScreenName(pathname, segments), { path: pathname });
  }, [posthog, pathname, segments]);

  // Identify on user change; reset on logout
  useEffect(() => {
    if (!posthog) return;
    if (user?.wallet_address) {
      const props = {
        tier: user.tier,
        onboarding_completed: !!user.onboarding_completed_at,
        is_verified_citizen: !!user.is_verified_citizen,
      };
      if (identifiedFor.current !== user.wallet_address) {
        posthog.identify(user.wallet_address, props);
        identifiedFor.current = user.wallet_address;
      } else {
        posthog.capture('$set', { $set: props });
      }
      lastUserRef.current = user.wallet_address;
    } else if (lastUserRef.current) {
      posthog.reset();
      identifiedFor.current = null;
      lastUserRef.current = null;
    }
  }, [
    posthog,
    user?.wallet_address,
    user?.tier,
    user?.onboarding_completed_at,
    user?.is_verified_citizen,
  ]);

  return null;
}
