import { useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { setTrackerWallet, setTrackingEnabled } from '@/lib/analytics/track';
import { fetchAnalyticsTrackingEnabled } from '@/lib/supabase-app-settings';

/** Keeps the analytics tracker's wallet and kill switch current. Renders nothing. */
export default function AnalyticsTrackerSync() {
  const { user } = useUser();
  const wallet = user?.wallet_address ?? null;
  useEffect(() => {
    setTrackerWallet(wallet);
  }, [wallet]);
  useEffect(() => {
    fetchAnalyticsTrackingEnabled()
      .then(setTrackingEnabled)
      .catch(() => {});
  }, []);
  return null;
}
