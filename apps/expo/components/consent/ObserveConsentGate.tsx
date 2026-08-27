/**
 * ObserveConsentGate — keeps EAS Observe's metric dispatch in lockstep with the
 * `analytics` consent category, the same way ConditionalPostHogProvider gates
 * PostHog and ConsentGate gates Sentry. Observe collects startup/render timings,
 * memory and frame-rate samples plus the active route name and ships them to
 * Expo's servers, so it is telemetry and must not run unconsented.
 *
 * Renders null — this is a behavioural gate, not UI.
 *
 * Two things make a JS-side gate sufficient here:
 *   1. The native side only dispatches on `applicationWillResignActive` /
 *      `applicationWillTerminate` (and the Android background worker), never at
 *      launch — so this effect always lands before the first send.
 *   2. `configure()` is persisted to UserDefaults/SharedPreferences, so the last
 *      value survives a cold start. That cuts both ways: a withdrawal made in a
 *      previous session stays in force, but a stale `true` would too, which is
 *      why we re-assert `false` on every mount until consent has been read back.
 *
 * NOTE: `configure()` is a FULL REPLACEMENT — fields absent from the call reset
 * to their defaults. Always restate every option we care about.
 */

import { useEffect, useRef } from 'react';
import Observe from 'expo-observe';
import { useConsent } from '@/context/ConsentContext';

export function ObserveConsentGate() {
  const { preferences, ready } = useConsent();
  const lastValueRef = useRef<boolean | null>(null);

  useEffect(() => {
    // Until SecureStore has been read, consent is unknown — treat it as denied.
    const dispatchingEnabled = ready ? preferences.analytics : false;
    if (lastValueRef.current === dispatchingEnabled) return;
    lastValueRef.current = dispatchingEnabled;

    try {
      Observe.configure({ dispatchingEnabled, dispatchInDebug: false });
    } catch {
      // Native module absent (Expo Go, or a runtime built before expo-observe
      // was added). Nothing is being collected, so there is nothing to gate.
    }
  }, [ready, preferences.analytics]);

  return null;
}
