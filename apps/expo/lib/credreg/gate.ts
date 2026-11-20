/**
 * Rollout gate for the credential register (profile cards, badge grid, Ausweis screens, org
 * side). A registry address must be configured and `credentials_enabled` must be 'true'. On the
 * production update channel `credentials_enabled_production` must ALSO be 'true'. Either key
 * missing = off. A closed gate leaves the profile exactly as it is today and makes no call to
 * the credential routes.
 */
import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import { credentialRegistryGnosisAddress } from '@/constants/gnosis';
import { fetchCredentialsEnabled, fetchCredentialsEnabledProduction } from '@/lib/supabase-app-settings';

/** True when this build knows a registry address (none until the production deployment). */
export function credentialsConfigured(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(credentialRegistryGnosisAddress);
}

/** Same truth table as `orgSafesAllowed` (lib/org-safe/gate.ts). */
export function credentialsAllowed(p: {
  flag: boolean;
  productionFlag: boolean;
  channel: string | null | undefined;
  dev: boolean;
}): boolean {
  if (!p.flag) return false;
  if (p.dev) return true;
  if (!p.channel) return false;
  if (p.channel !== 'production') return true;
  return p.productionFlag;
}

export async function isCredentialsAllowed(): Promise<boolean> {
  if (!credentialsConfigured()) return false;
  let channel: string | null = null;
  try {
    channel = Updates.channel ?? null;
  } catch {
    channel = null;
  }
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  const [flag, productionFlag] = await Promise.all([
    fetchCredentialsEnabled().catch(() => false),
    channel === 'production' ? fetchCredentialsEnabledProduction().catch(() => false) : Promise.resolve(false),
  ]);
  return credentialsAllowed({ flag, productionFlag, channel, dev });
}

/** The gate for a screen: null while loading, then true or false. Never throws. */
export function useCredentialsGate(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    isCredentialsAllowed()
      .catch(() => false)
      .then((ok) => {
        if (!cancelled) setAllowed(ok);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return allowed;
}
