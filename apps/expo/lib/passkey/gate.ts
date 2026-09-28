/**
 * Fence for every passkey surface (sign-in option, settings, recovery links, first-launch welcome).
 *
 * Open when the `passkey_accounts_enabled` app setting is 'true' AND one of:
 *   - a dev build (__DEV__);
 *   - a non-production update channel (preview, staging, …);
 *   - the production channel, but ONLY when `passkey_accounts_enabled_production` is 'true' too AND
 *     the running binary supports passkeys (runtimeVersion ≥ 3.8.0: the 3.7.0 store binary lacks the
 *     `webcredentials:id.ortis.app` association, so a passkey could never be created or used there).
 *
 * `passkey_accounts_enabled` stays the global kill switch: turning it off closes every channel.
 * A null channel (no expo-updates) counts as allowed only in __DEV__, so a release build without a
 * channel stays closed.
 */
import * as Updates from 'expo-updates';
import { fetchPasskeyAccountsEnabled, fetchPasskeyAccountsEnabledProduction } from '@/lib/supabase-app-settings';

/** First runtime (= app version, runtimeVersion policy appVersion) whose binary carries the passkey entitlements. */
export const PASSKEY_MIN_RUNTIME = '3.8.0';

/** True when `runtimeVersion` is a dotted version ≥ PASSKEY_MIN_RUNTIME. Anything unparsable is false. */
export function runtimeSupportsPasskeys(runtimeVersion: string | null | undefined): boolean {
  if (!runtimeVersion) return false;
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const have = parse(runtimeVersion);
  const need = parse(PASSKEY_MIN_RUNTIME)!;
  if (!have) return false;
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return have[i] > need[i];
  }
  return true;
}

export function passkeyPreviewAllowed(p: {
  flag: boolean;
  channel: string | null | undefined;
  dev: boolean;
  /** `passkey_accounts_enabled_production`; missing = off. */
  productionFlag?: boolean;
  runtimeVersion?: string | null;
}): boolean {
  if (!p.flag) return false;
  if (p.dev) return true;
  if (!p.channel) return false;
  if (p.channel !== 'production') return true;
  return !!p.productionFlag && runtimeSupportsPasskeys(p.runtimeVersion);
}

function readChannel(): string | null {
  try {
    return Updates.channel ?? null;
  } catch {
    return null;
  }
}

function readRuntimeVersion(): string | null {
  try {
    return Updates.runtimeVersion ?? null;
  } catch {
    return null;
  }
}

export async function isPasskeyPreviewAllowed(): Promise<boolean> {
  const channel = readChannel();
  const runtimeVersion = readRuntimeVersion();
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (!dev) {
    // A release build without a channel is closed without asking Supabase; so is a production
    // binary that cannot hold a passkey.
    if (!channel) return false;
    if (channel === 'production' && !runtimeSupportsPasskeys(runtimeVersion)) return false;
  }
  const isProduction = !dev && channel === 'production';
  let flag = false;
  let productionFlag = false;
  try {
    [flag, productionFlag] = await Promise.all([
      fetchPasskeyAccountsEnabled(),
      isProduction ? fetchPasskeyAccountsEnabledProduction() : Promise.resolve(false),
    ]);
  } catch {
    flag = false;
    productionFlag = false;
  }
  return passkeyPreviewAllowed({ flag, channel, dev, productionFlag, runtimeVersion });
}

/**
 * Synchronous fence for restoring a passkey session at boot (no network, no storage read). The
 * app-settings flags are deliberately NOT checked here: turning a flag off must hide the sign-in
 * option, never sign out someone already running on a passkey session. On the production channel
 * a session is restored only by a binary that supports passkeys (≥ 3.8.0); a 3.7.0 production
 * build never reads the session key and boots exactly as before.
 */
export function passkeyChannelAllowed(p?: {
  channel: string | null | undefined;
  dev: boolean;
  runtimeVersion?: string | null;
}): boolean {
  const channel = p ? p.channel : readChannel();
  const runtimeVersion = p ? p.runtimeVersion : readRuntimeVersion();
  const dev = p ? p.dev : typeof __DEV__ !== 'undefined' && __DEV__;
  if (channel === 'production') return runtimeSupportsPasskeys(runtimeVersion);
  if (dev) return true;
  return !!channel;
}
