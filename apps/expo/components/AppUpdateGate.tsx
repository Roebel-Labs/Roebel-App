/**
 * Watches the app release config and routes the user to /app-update when the
 * installed version is behind the admin-configured `latest_version`. Mirrors
 * the ConsentGate pattern: it owns the navigation side-effect so the modal
 * screen itself stays passive.
 */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useAppReleaseGate } from '@/hooks/useAppReleaseGate';

export function AppUpdateGate() {
  const { shouldShow } = useAppReleaseGate();
  const router = useRouter();
  const pathname = usePathname();
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!shouldShow) {
      pushedRef.current = false;
      return;
    }
    if (pushedRef.current) return;
    // Don't interrupt the first-launch onboarding flows.
    if (pathname === '/welcome' || pathname === '/consent') return;
    if (pathname === '/app-update') return;

    pushedRef.current = true;
    setTimeout(() => router.push('/app-update' as any), 150);
  }, [shouldShow, pathname, router]);

  return null;
}
