/**
 * Supabase mirror for the consent system.
 *
 * SecureStore is the source of truth — these calls are best-effort. Failures
 * are swallowed (logged in dev) so that a network blip never breaks the
 * consent UX. Each preference change emits one audit-log row.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import {
  PRIVACY_POLICY_VERSION,
  type ConsentCategoryId,
  type ConsentPreferences,
  type ConsentSource,
} from '@/constants/consent';

const APP_VERSION =
  (Constants.expoConfig?.version as string | undefined) ??
  ((Constants as unknown as { manifest?: { version?: string } }).manifest?.version) ??
  'unknown';

const PLATFORM = Platform.OS;

const USER_AGENT = `roebel-expo/${APP_VERSION} (${PLATFORM} ${Platform.Version})`;

type AuditRow = {
  device_id: string;
  wallet_address: string | null;
  category: string;
  previous_value: boolean | null;
  new_value: boolean | null;
  source: ConsentSource;
  policy_version: string;
  app_version: string;
  platform: string;
  user_agent: string;
};

export type MirrorParams = {
  deviceId: string;
  walletAddress: string | null;
  previous: ConsentPreferences | null;
  next: ConsentPreferences;
  source: ConsentSource;
};

function diff(
  previous: ConsentPreferences | null,
  next: ConsentPreferences
): { category: ConsentCategoryId; previous: boolean | null; next: boolean }[] {
  const ids = Object.keys(next) as ConsentCategoryId[];
  return ids
    .map((id) => ({
      category: id,
      previous: previous ? previous[id] : null,
      next: next[id],
    }))
    .filter((row) => row.previous !== row.next);
}

export async function mirrorConsent(params: MirrorParams): Promise<void> {
  const { deviceId, walletAddress, previous, next, source } = params;

  const upsertPromise = (supabase.from('consent_preferences') as any)
    .upsert(
      {
        device_id: deviceId,
        wallet_address: walletAddress,
        preferences: next,
        policy_version: PRIVACY_POLICY_VERSION,
        app_version: APP_VERSION,
        platform: PLATFORM,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'device_id' }
    )
    .then((res: { error: { message: string } | null }) => {
      if (res.error && __DEV__) {
        console.warn('[consent-supabase] upsert failed:', res.error.message);
      }
    });

  const changes = diff(previous, next);
  const auditRows: AuditRow[] = changes.map((c) => ({
    device_id: deviceId,
    wallet_address: walletAddress,
    category: c.category,
    previous_value: c.previous,
    new_value: c.next,
    source,
    policy_version: PRIVACY_POLICY_VERSION,
    app_version: APP_VERSION,
    platform: PLATFORM,
    user_agent: USER_AGENT,
  }));

  const auditPromise =
    auditRows.length > 0
      ? (supabase.from('consent_audit_log') as any)
          .insert(auditRows)
          .then((res: { error: { message: string } | null }) => {
            if (res.error && __DEV__) {
              console.warn(
                '[consent-supabase] audit insert failed:',
                res.error.message
              );
            }
          })
      : Promise.resolve();

  await Promise.all([upsertPromise, auditPromise]);
}

export async function logSpecialEvent(params: {
  deviceId: string;
  walletAddress: string | null;
  category: '__migration__' | '__reconcile__';
  source: ConsentSource;
}): Promise<void> {
  const row: AuditRow = {
    device_id: params.deviceId,
    wallet_address: params.walletAddress,
    category: params.category,
    previous_value: null,
    new_value: null,
    source: params.source,
    policy_version: PRIVACY_POLICY_VERSION,
    app_version: APP_VERSION,
    platform: PLATFORM,
    user_agent: USER_AGENT,
  };
  try {
    const { error } = await (supabase.from('consent_audit_log') as any).insert([row]);
    if (error && __DEV__) {
      console.warn('[consent-supabase] special event failed:', error.message);
    }
  } catch (err) {
    if (__DEV__) console.warn('[consent-supabase] special event threw:', err);
  }
}

export async function logBannerDismissal(params: {
  deviceId: string;
  walletAddress: string | null;
  category: ConsentCategoryId;
}): Promise<void> {
  const row: AuditRow = {
    device_id: params.deviceId,
    wallet_address: params.walletAddress,
    category: params.category,
    previous_value: null,
    new_value: null,
    source: 'banner_dismissed',
    policy_version: PRIVACY_POLICY_VERSION,
    app_version: APP_VERSION,
    platform: PLATFORM,
    user_agent: USER_AGENT,
  };
  try {
    await (supabase.from('consent_audit_log') as any).insert([row]);
  } catch {
    // ignore
  }
}

export async function reconcileWalletAddress(params: {
  deviceId: string;
  walletAddress: string;
}): Promise<void> {
  const { deviceId, walletAddress } = params;
  try {
    await (supabase.from('consent_preferences') as any)
      .update({ wallet_address: walletAddress })
      .eq('device_id', deviceId);
  } catch {
    // ignore
  }
  await logSpecialEvent({
    deviceId,
    walletAddress,
    category: '__reconcile__',
    source: 'reconcile',
  });
}

export type AuditLogEntry = {
  id: string;
  category: string;
  previous_value: boolean | null;
  new_value: boolean | null;
  source: string;
  created_at: string;
};

export async function fetchAuditHistory(params: {
  deviceId: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('consent_audit_log')
      .select('id, category, previous_value, new_value, source, created_at')
      .eq('device_id', params.deviceId)
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 50);
    if (error || !data) return [];
    return data as unknown as AuditLogEntry[];
  } catch {
    return [];
  }
}
