/**
 * Rollout gate for org Safes (settings section, create-org step, attester inbox).
 * An OrgRegistry address must be configured and `org_safes_enabled` must be 'true'.
 * On the production update channel `org_safes_enabled_production` must ALSO be
 * 'true': flip it after the preview device pass, no OTA needed. Either key
 * missing = off.
 */
import * as Updates from 'expo-updates';
import { fetchOrgSafesEnabled, fetchOrgSafesEnabledProduction } from '@/lib/supabase-app-settings';
import { orgSafesConfigured } from './chain';

export function orgSafesAllowed(p: {
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

export async function isOrgSafePreviewAllowed(): Promise<boolean> {
  if (!orgSafesConfigured()) return false;
  let channel: string | null = null;
  try {
    channel = Updates.channel ?? null;
  } catch {
    channel = null;
  }
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  const [flag, productionFlag] = await Promise.all([
    fetchOrgSafesEnabled().catch(() => false),
    channel === 'production' ? fetchOrgSafesEnabledProduction().catch(() => false) : Promise.resolve(false),
  ]);
  return orgSafesAllowed({ flag, productionFlag, channel, dev });
}
