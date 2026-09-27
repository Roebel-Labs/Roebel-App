/**
 * Preview fence for the org-Safe settings section: `org_safes_enabled` must be
 * 'true' AND the build must not be on the production update channel (same rule
 * as the passkey preview), AND an OrgRegistry address must be configured.
 */
import * as Updates from 'expo-updates';
import { fetchOrgSafesEnabled } from '@/lib/supabase-app-settings';
import { passkeyPreviewAllowed } from '@/lib/passkey/gate';
import { orgSafesConfigured } from './chain';

export async function isOrgSafePreviewAllowed(): Promise<boolean> {
  if (!orgSafesConfigured()) return false;
  let channel: string | null = null;
  try {
    channel = Updates.channel ?? null;
  } catch {
    channel = null;
  }
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (!dev && (!channel || channel === 'production')) return false;
  let flag = false;
  try {
    flag = await fetchOrgSafesEnabled();
  } catch {
    flag = false;
  }
  return passkeyPreviewAllowed({ flag, channel, dev });
}
