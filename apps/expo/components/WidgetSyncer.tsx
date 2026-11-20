/**
 * Keeps the home-screen widget (and the in-app unread dots) fresh: syncs on launch, on
 * account change, whenever the app comes to the foreground or goes to the background,
 * and when a mini-app notification arrives while the app runs.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useActiveAccount } from 'thirdweb/react';
import { syncWidget } from '@/lib/widget-sync';

export default function WidgetSyncer() {
  const account = useActiveAccount();
  const wallet = account?.address?.toLowerCase() ?? null;
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void syncWidget(wallet);
  }, [wallet]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') void syncWidget(walletRef.current);
    });
    // Any push may be a mini-app one; syncs coalesce, so this is cheap.
    const notifSub = Notifications.addNotificationReceivedListener(() => {
      void syncWidget(walletRef.current);
    });
    return () => {
      appSub.remove();
      notifSub.remove();
    };
  }, []);

  return null;
}
