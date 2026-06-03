import { supabase } from './supabase';

/**
 * Record that a wallet was active today, with the device platform.
 *
 * Upserts one row per (wallet_address, activity_date) into `app_activity`,
 * refreshing `last_seen_at` and `platform` on repeat opens the same day. This
 * powers real daily-active-user (DAU) and per-platform analytics in the web
 * admin dashboard. Platform is captured for ALL logging-in users (not only
 * those who enabled push notifications).
 *
 * Best-effort and non-fatal: failures are logged but never block login.
 */
export async function logActivity(
  walletAddress: string,
  platform: 'ios' | 'android' | 'web',
  appVersion?: string
): Promise<void> {
  try {
    // 'as any' because app_activity is not yet in the generated schema types.
    const { error } = await (supabase.from('app_activity') as any).upsert(
      {
        wallet_address: walletAddress.toLowerCase(),
        activity_date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (UTC)
        platform,
        app_version: appVersion,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: 'wallet_address,activity_date',
      }
    );

    if (error) {
      console.warn('[activity] Failed to log activity:', error.message);
    }
  } catch (err) {
    console.warn('[activity] Exception logging activity:', err);
  }
}
