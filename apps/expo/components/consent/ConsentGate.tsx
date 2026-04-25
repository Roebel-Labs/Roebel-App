/**
 * Watches consent state and:
 *  - pushes the user to /consent on first launch (when no granular prefs exist
 *    yet AND the user is not already inside the welcome flow),
 *  - initializes / closes Sentry as the `crash` flag flips,
 *  - mounts the policy-version re-consent sheet globally.
 */

import React, { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { useConsent } from '@/context/ConsentContext';
import {
  closeSentry,
  initSentryWithBufferReplay,
} from '@/lib/sentry-init';
import { ConsentReconsentSheet } from './ConsentReconsentSheet';

export function ConsentGate() {
  const { ready, needsConsent, preferences } = useConsent();
  const router = useRouter();
  const pathname = usePathname();
  const pushedRef = useRef(false);

  // Route to /consent on first launch once the SecureStore read has resolved.
  useEffect(() => {
    if (!ready || !needsConsent) return;
    if (pushedRef.current) return;
    if (pathname?.startsWith('/welcome') || pathname === '/consent') return;
    pushedRef.current = true;
    setTimeout(() => router.push('/consent' as any), 100);
  }, [ready, needsConsent, pathname, router]);

  // Re-eligible to push if state changes back to needing consent (rare).
  useEffect(() => {
    if (!needsConsent) pushedRef.current = false;
  }, [needsConsent]);

  // Manual Sentry lifecycle.
  useEffect(() => {
    if (!ready) return;
    if (preferences.crash) {
      initSentryWithBufferReplay();
    } else {
      closeSentry();
    }
  }, [ready, preferences.crash]);

  return <ConsentReconsentSheet />;
}
