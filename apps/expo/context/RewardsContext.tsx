import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/context/UserContext';
import { useNotificationsContext } from '@/context/NotificationsContext';
import {
  claimDailyCheckin,
  completeRewardTask,
  ensureReferralCode,
  fetchLootboxes,
  fetchRecentCheckins,
  fetchReferralStats,
  fetchRewardTasks,
  fetchUserKeys,
  fetchUserRewards,
  fetchUserTaskCompletions,
  openLootbox,
  purchaseLootboxKey,
  redeemReferral,
  type CheckinClaimResult,
  type DailyCheckin,
  type Lootbox,
  type OpenLootboxResult,
  type PurchaseKeyResult,
  type ReferralStats,
  type RewardTask,
  type RewardTaskCompletion,
  type TaskCompletionResult,
  type UserLootboxKeyRecord,
  type UserLootboxReward,
} from '@/lib/supabase-rewards';
import {
  ensureRoebelPointsCard,
  fetchRoebelPointsCard,
  type RoebelPointsCardRecord,
} from '@/lib/supabase-roebel-points';
import { consumePendingReferralCode } from '@/lib/referral-deeplink';

interface RewardsContextValue {
  // State
  coins: number;
  keyCount: number;
  streak: number;
  tasks: RewardTask[];
  completions: RewardTaskCompletion[];
  lootboxes: Lootbox[];
  userRewards: UserLootboxReward[];
  referralCode: string | null;
  referralStats: ReferralStats;
  recentCheckins: DailyCheckin[];
  pointsCard: RoebelPointsCardRecord | null;
  userKeys: UserLootboxKeyRecord | null;
  isLoading: boolean;
  hasCheckedInToday: boolean;
  eligibleTaskKeys: Set<string>;

  // Helpers
  hasCompleted: (taskKey: string) => boolean;
  lastCompletionOf: (taskKey: string) => RewardTaskCompletion | undefined;
  isTaskEligible: (taskKey: string) => boolean;

  // Mutations
  claimDaily: () => Promise<CheckinClaimResult>;
  completeTask: (taskKey: string) => Promise<TaskCompletionResult>;
  buyKey: (lootboxId: string) => Promise<PurchaseKeyResult>;
  openChest: (lootboxId: string) => Promise<OpenLootboxResult>;
  applyReferral: (code: string) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

const RewardsContext = createContext<RewardsContextValue | undefined>(undefined);

function todayStrBerlin(): string {
  // Match Supabase RPC's tz anchor.
  const now = new Date();
  const berlin = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return berlin; // yyyy-mm-dd
}

const HELP_HUB_OPENED_KEY = '@rewards/help_hub_opened';

export function RewardsProvider({ children }: { children: React.ReactNode }) {
  const { user, isCitizen } = useUser();
  const { permissionStatus } = useNotificationsContext();
  // Gate everything on the users-table row (NOT just the wallet address) — the
  // RPCs write to roebel_points_card which has a FK to users(wallet_address).
  const wallet = user?.wallet_address ?? null;
  const [helpHubOpened, setHelpHubOpened] = useState(false);

  const [pointsCard, setPointsCard] = useState<RoebelPointsCardRecord | null>(null);
  const [userKeys, setUserKeys] = useState<UserLootboxKeyRecord | null>(null);
  const [tasks, setTasks] = useState<RewardTask[]>([]);
  const [completions, setCompletions] = useState<RewardTaskCompletion[]>([]);
  const [lootboxes, setLootboxes] = useState<Lootbox[]>([]);
  const [userRewards, setUserRewards] = useState<UserLootboxReward[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats>({
    code: null,
    total_invited: 0,
    coins_earned: 0,
  });
  const [recentCheckins, setRecentCheckins] = useState<DailyCheckin[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const lastLoadedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    // Always refresh catalogue (public).
    const [catalogueTasks, catalogueLootboxes] = await Promise.all([
      fetchRewardTasks(),
      fetchLootboxes(),
    ]);
    setTasks(catalogueTasks);
    setLootboxes(catalogueLootboxes);

    if (!wallet) {
      setPointsCard(null);
      setUserKeys(null);
      setCompletions([]);
      setUserRewards([]);
      setRecentCheckins([]);
      setReferralCode(null);
      setReferralStats({ code: null, total_invited: 0, coins_earned: 0 });
      return;
    }

    setIsLoading(true);
    try {
      // Only ensure a referral code if we don't already have one cached —
      // otherwise every screen focus would re-hit the RPC and log noise if it
      // ever errors.
      const codePromise = referralCode
        ? Promise.resolve(referralCode)
        : ensureReferralCode(wallet).catch(() => null);

      const [
        card,
        keys,
        userCompletions,
        rewards,
        stats,
        checkins,
        code,
      ] = await Promise.all([
        ensureRoebelPointsCard(wallet).catch(() => null),
        fetchUserKeys(wallet),
        fetchUserTaskCompletions(wallet),
        fetchUserRewards(wallet),
        fetchReferralStats(wallet),
        fetchRecentCheckins(wallet, 14),
        codePromise,
      ]);
      setPointsCard(card);
      setUserKeys(keys);
      setCompletions(userCompletions);
      setUserRewards(rewards);
      setReferralStats(stats);
      setRecentCheckins(checkins);
      if (code) setReferralCode(code);
    } catch (e) {
      console.error('RewardsContext refresh failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, referralCode]);

  useEffect(() => {
    if (lastLoadedFor.current === wallet) return;
    lastLoadedFor.current = wallet;
    void refresh();

    // If the user landed via a referral link before logging in, redeem the
    // stored code now. consumePendingReferralCode clears it so we won't retry
    // across sessions. Silent failures are fine — the snackbar in the
    // referral screen covers the UX when the user goes there manually.
    if (wallet) {
      void (async () => {
        const pending = await consumePendingReferralCode();
        if (!pending) return;
        const res = await redeemReferral(pending, wallet);
        if (res.success) {
          await refresh();
        }
      })();
    }
  }, [wallet, refresh]);

  const hasCompleted = useCallback(
    (taskKey: string) => completions.some((c) => c.task_key === taskKey),
    [completions]
  );

  const lastCompletionOf = useCallback(
    (taskKey: string) =>
      completions
        .filter((c) => c.task_key === taskKey)
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at))[0],
    [completions]
  );

  // Read the help-hub-opened flag once per wallet so eligibility reflects it.
  useEffect(() => {
    AsyncStorage.getItem(HELP_HUB_OPENED_KEY).then((v) => setHelpHubOpened(v === '1'));
  }, [wallet, tasks.length]);

  // Computed set of task keys the user is eligible to claim based on their
  // current state (profile completeness, permissions, NFT, etc). Used by the
  // UI to render the "Erhalten" button when a task's condition is already met
  // but the completion row hasn't been inserted yet.
  const eligibleTaskKeys = useMemo(() => {
    const set = new Set<string>();
    if (!wallet || !user) return set;

    // first_login — always eligible once connected.
    set.add('first_login');

    if (user.profile_picture_url) {
      set.add('add_profile_picture');
    }
    if (user.username && user.profile_picture_url) {
      set.add('complete_profile');
    }
    if (permissionStatus === 'granted') {
      set.add('activate_push');
    }
    if (helpHubOpened) {
      set.add('read_help_hub');
    }
    if (isCitizen) {
      set.add('verify_citizen');
    }
    return set;
  }, [wallet, user, isCitizen, permissionStatus, helpHubOpened]);

  const isTaskEligible = useCallback(
    (taskKey: string) => eligibleTaskKeys.has(taskKey),
    [eligibleTaskKeys]
  );

  const claimDaily = useCallback(async (): Promise<CheckinClaimResult> => {
    if (!wallet) return { success: false, error: 'not_connected' };
    const result = await claimDailyCheckin(wallet);
    if (result.success) await refresh();
    return result;
  }, [wallet, refresh]);

  const completeTask = useCallback(
    async (taskKey: string): Promise<TaskCompletionResult> => {
      if (!wallet) return { success: false, error: 'not_connected' };
      const result = await completeRewardTask(wallet, taskKey);
      if (result.success) await refresh();
      return result;
    },
    [wallet, refresh]
  );

  const buyKey = useCallback(
    async (lootboxId: string): Promise<PurchaseKeyResult> => {
      if (!wallet) return { success: false, error: 'not_connected' };
      const result = await purchaseLootboxKey(wallet, lootboxId);
      if (result.success) {
        // Optimistic local update so UI is snappy before refresh resolves.
        if (typeof result.new_balance === 'number') {
          setPointsCard((p) => (p ? { ...p, points_balance: result.new_balance! } : p));
        }
        if (typeof result.new_key_count === 'number') {
          setUserKeys((k) =>
            k
              ? { ...k, key_count: result.new_key_count! }
              : {
                  wallet_address: wallet,
                  key_count: result.new_key_count!,
                  total_purchased: 1,
                  total_used: 0,
                  updated_at: new Date().toISOString(),
                }
          );
        }
        void refresh();
      }
      return result;
    },
    [wallet, refresh]
  );

  const openChest = useCallback(
    async (lootboxId: string): Promise<OpenLootboxResult> => {
      if (!wallet) return { success: false, error: 'not_connected' };
      const result = await openLootbox(wallet, lootboxId);
      if (result.success) {
        // Optimistic local decrement of key count; refresh handles balance +
        // inventory actual state.
        setUserKeys((k) =>
          k && k.key_count > 0
            ? { ...k, key_count: k.key_count - 1, total_used: k.total_used + 1 }
            : k
        );
        void refresh();
      }
      return result;
    },
    [wallet, refresh]
  );

  const applyReferral = useCallback(
    async (code: string) => {
      if (!wallet) return { success: false, error: 'not_connected' };
      const result = await redeemReferral(code, wallet);
      if (result.success) {
        const card = await fetchRoebelPointsCard(wallet);
        if (card) setPointsCard(card);
        void refresh();
      }
      return { success: !!result.success, error: result.error };
    },
    [wallet, refresh]
  );

  const coins = pointsCard?.points_balance ?? 0;
  const keyCount = userKeys?.key_count ?? 0;
  const streak = pointsCard?.streak_days ?? 0;
  const hasCheckedInToday = useMemo(() => {
    if (!recentCheckins.length) return false;
    return recentCheckins.some((c) => c.checkin_date === todayStrBerlin());
  }, [recentCheckins]);

  // Auto check-in on app open. Fires once per wallet per day; guarded by
  // autoClaimedFor ref so React double-renders or rapid wallet flips don't
  // double-call. The server enforces uniqueness via the PK anyway.
  const autoClaimedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!wallet) return;
    if (isLoading) return;
    if (hasCheckedInToday) return;
    const today = todayStrBerlin();
    const sig = `${wallet}:${today}`;
    if (autoClaimedFor.current === sig) return;
    autoClaimedFor.current = sig;
    void (async () => {
      const result = await claimDailyCheckin(wallet);
      if (result.success) {
        await refresh();
      }
    })();
  }, [wallet, isLoading, hasCheckedInToday, refresh]);

  const value: RewardsContextValue = useMemo(
    () => ({
      coins,
      keyCount,
      streak,
      tasks,
      completions,
      lootboxes,
      userRewards,
      referralCode,
      referralStats,
      recentCheckins,
      pointsCard,
      userKeys,
      isLoading,
      hasCheckedInToday,
      eligibleTaskKeys,
      hasCompleted,
      lastCompletionOf,
      isTaskEligible,
      claimDaily,
      completeTask,
      buyKey,
      openChest,
      applyReferral,
      refresh,
    }),
    [
      coins,
      keyCount,
      streak,
      tasks,
      completions,
      lootboxes,
      userRewards,
      referralCode,
      referralStats,
      recentCheckins,
      pointsCard,
      userKeys,
      isLoading,
      hasCheckedInToday,
      eligibleTaskKeys,
      hasCompleted,
      lastCompletionOf,
      isTaskEligible,
      claimDaily,
      completeTask,
      buyKey,
      openChest,
      applyReferral,
      refresh,
    ]
  );

  return <RewardsContext.Provider value={value}>{children}</RewardsContext.Provider>;
}

export function useRewards(): RewardsContextValue {
  const ctx = useContext(RewardsContext);
  if (!ctx) throw new Error('useRewards must be used within RewardsProvider');
  return ctx;
}
