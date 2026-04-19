import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useActiveAccount } from 'thirdweb/react';
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

  // Helpers
  hasCompleted: (taskKey: string) => boolean;
  lastCompletionOf: (taskKey: string) => RewardTaskCompletion | undefined;

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

export function RewardsProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;

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
        ensureReferralCode(wallet),
      ]);
      setPointsCard(card);
      setUserKeys(keys);
      setCompletions(userCompletions);
      setUserRewards(rewards);
      setReferralStats(stats);
      setRecentCheckins(checkins);
      setReferralCode(code);
    } catch (e) {
      console.error('RewardsContext refresh failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

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
      hasCompleted,
      lastCompletionOf,
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
      hasCompleted,
      lastCompletionOf,
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
