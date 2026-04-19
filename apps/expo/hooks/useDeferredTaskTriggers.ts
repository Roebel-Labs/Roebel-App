import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/context/UserContext';
import { useNotificationsContext } from '@/context/NotificationsContext';
import { useRewards } from '@/context/RewardsContext';

const STORAGE_KEY = '@rewards/help_hub_opened';

/**
 * Observes auth / profile / permission state and automatically marks the
 * corresponding onboarding tasks complete via the rewards RPC. Safe to call
 * anywhere inside <RewardsProvider>; guards against double-fires.
 */
export function useDeferredTaskTriggers() {
  const { user, isCitizen, isConnected } = useUser();
  const { permissionStatus } = useNotificationsContext();
  const { hasCompleted, completeTask, refresh } = useRewards();

  const firedForWallet = useRef<Set<string>>(new Set());

  const fire = async (taskKey: string) => {
    const wallet = user?.wallet_address;
    if (!wallet) return;
    const fingerprint = `${wallet}:${taskKey}`;
    if (firedForWallet.current.has(fingerprint)) return;
    if (hasCompleted(taskKey)) {
      firedForWallet.current.add(fingerprint);
      return;
    }
    firedForWallet.current.add(fingerprint);
    try {
      const res = await completeTask(taskKey);
      if (!res.success && res.error !== 'already_completed') {
        // Retry on next mount if it failed for a recoverable reason.
        firedForWallet.current.delete(fingerprint);
      }
    } catch {
      firedForWallet.current.delete(fingerprint);
    }
  };

  // first_login — once per wallet on successful connect.
  useEffect(() => {
    if (isConnected && user?.wallet_address) {
      void fire('first_login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, user?.wallet_address]);

  // complete_profile / add_profile_picture — based on user profile fields.
  useEffect(() => {
    if (!user?.wallet_address) return;
    if (user.profile_picture_url) {
      void fire('add_profile_picture');
    }
    if (user.username && user.profile_picture_url) {
      void fire('complete_profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, user?.profile_picture_url, user?.wallet_address]);

  // activate_push — when notification permission becomes 'granted'.
  useEffect(() => {
    if (permissionStatus === 'granted' && user?.wallet_address) {
      void fire('activate_push');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionStatus, user?.wallet_address]);

  // verify_citizen — when user is detected as citizen NFT holder.
  useEffect(() => {
    if (isCitizen && user?.wallet_address) {
      void fire('verify_citizen');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCitizen, user?.wallet_address]);

  // read_help_hub — triggered externally by markHelpHubOpened(); we check here
  // on mount / wallet change so the task completes on the next render.
  useEffect(() => {
    if (!user?.wallet_address) return;
    AsyncStorage.getItem(STORAGE_KEY).then((flag) => {
      if (flag === '1') {
        void fire('read_help_hub');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.wallet_address]);

  // Re-pull completions when wallet flips so we don't misreport hasCompleted.
  useEffect(() => {
    if (user?.wallet_address) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.wallet_address]);
}

/** Call this from /help the first time the user opens it. */
export async function markHelpHubOpened(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // non-fatal
  }
}
