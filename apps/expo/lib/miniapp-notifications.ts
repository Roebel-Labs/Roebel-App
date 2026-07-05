/**
 * Mini-app notification opt-in state.
 *
 * Two layers:
 *  - Local decision map (AsyncStorage): whether the user has already answered
 *    the notification sheet for a given app slug ('enabled' | 'dismissed').
 *    Used to decide whether to show the sheet again — never re-prompt.
 *  - Supabase `mini_app_notification_optins`: the per-(app, wallet) opt-in the
 *    server-side notification sender (apps/web /api/mini-apps/notifications)
 *    will check before delivering. Upserted on "Benachrichtigungen aktivieren".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const DECISION_KEY = 'miniapps.notifDecision.v1';

export type NotificationDecision = 'enabled' | 'dismissed';

type DecisionMap = Record<string, NotificationDecision>;

async function readDecisions(): Promise<DecisionMap> {
  try {
    const raw = await AsyncStorage.getItem(DECISION_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as DecisionMap) : {};
  } catch {
    return {};
  }
}

/** The user's stored answer for this app, or null if never asked. */
export async function getNotificationDecision(
  slug: string,
): Promise<NotificationDecision | null> {
  const map = await readDecisions();
  return map[slug] ?? null;
}

export async function setNotificationDecision(
  slug: string,
  decision: NotificationDecision,
): Promise<void> {
  try {
    const map = await readDecisions();
    map[slug] = decision;
    await AsyncStorage.setItem(DECISION_KEY, JSON.stringify(map));
  } catch {
    // Best-effort; worst case the sheet shows again next session.
  }
}

/**
 * Persist the opt-in server-side. Fire-and-forget style: never throws, returns
 * whether the write succeeded. `mini_app_notification_optins` is not in the
 * generated Supabase types yet — cast the builder (repo convention).
 */
export async function saveNotificationOptIn(args: {
  miniAppId: string;
  wallet: string;
  enabled: boolean;
}): Promise<boolean> {
  try {
    const { error } = await (supabase.from('mini_app_notification_optins') as any).upsert(
      {
        mini_app_id: args.miniAppId,
        wallet: args.wallet.toLowerCase(),
        enabled: args.enabled,
        source: 'expo_host',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'mini_app_id,wallet' },
    );
    if (error) {
      console.warn('[miniapps] saveNotificationOptIn error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[miniapps] saveNotificationOptIn threw:', e);
    return false;
  }
}
