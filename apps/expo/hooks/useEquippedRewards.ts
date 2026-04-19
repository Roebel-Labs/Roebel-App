import { useMemo } from 'react';
import { useRewards } from '@/context/RewardsContext';
import type {
  LootboxReward,
  LootboxRewardType,
  UserLootboxReward,
} from '@/lib/supabase-rewards';

export type EquippedRewardsMap = Partial<
  Record<LootboxRewardType, UserLootboxReward & { reward: LootboxReward }>
>;

/**
 * Returns the currently-equipped cosmetic of each type for the logged-in user.
 * A user can have at most one equipped item per type (profile_frame,
 * profile_banner, sticker, animated_sticker, badge). The RewardsContext keeps
 * userRewards in sync; this just projects the equipped subset by type.
 */
export function useEquippedRewards(): EquippedRewardsMap {
  const { userRewards } = useRewards();

  return useMemo(() => {
    const byType: EquippedRewardsMap = {};
    for (const ur of userRewards) {
      if (!ur.is_equipped || !ur.reward) continue;
      // Latest equipped wins if multiple rows exist for the same type.
      const existing = byType[ur.reward.type];
      if (!existing || ur.obtained_at > existing.obtained_at) {
        byType[ur.reward.type] = {
          ...ur,
          reward: ur.reward,
        };
      }
    }
    return byType;
  }, [userRewards]);
}
