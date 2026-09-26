/**
 * Preview fence for the passkey migration screen (tranche 1).
 *
 * Shown only when the `passkey_accounts_enabled` app setting is 'true' AND the build is not on
 * the production update channel. A null channel (no expo-updates, e.g. a dev client) counts as
 * allowed only in __DEV__, so a release build without a channel stays closed.
 */
import * as Updates from 'expo-updates';
import { fetchPasskeyAccountsEnabled } from '@/lib/supabase-app-settings';

export function passkeyPreviewAllowed(p: { flag: boolean; channel: string | null | undefined; dev: boolean }): boolean {
  if (!p.flag) return false;
  if (p.dev) return true;
  return !!p.channel && p.channel !== 'production';
}

export async function isPasskeyPreviewAllowed(): Promise<boolean> {
  let channel: string | null = null;
  try {
    channel = Updates.channel ?? null;
  } catch {
    channel = null;
  }
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  // Production is closed without even asking Supabase.
  if (!dev && (!channel || channel === 'production')) return false;
  let flag = false;
  try {
    flag = await fetchPasskeyAccountsEnabled();
  } catch {
    flag = false;
  }
  return passkeyPreviewAllowed({ flag, channel, dev });
}
