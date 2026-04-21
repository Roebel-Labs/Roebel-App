import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { LootboxRewardRarity } from './supabase-rewards';

export const RARITY_COLOR: Record<LootboxRewardRarity, string> = {
  common: '#94A3B8',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

export const RARITY_LABEL: Record<LootboxRewardRarity, string> = {
  common: 'Gewöhnlich',
  rare: 'Selten',
  epic: 'Episch',
  legendary: 'Legendär',
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Ionicons glyph used to decorate rarity pills. Artists can ship PNGs later
 * at `assets/illustration/gamification/rarity/<rarity>.png`; when they do,
 * swap the `<Ionicons>` render inside `RarityPill` for a local `<Image>`.
 */
export const RARITY_ICON: Record<LootboxRewardRarity, IoniconName> = {
  common: 'ellipse',
  rare: 'diamond',
  epic: 'sparkles',
  legendary: 'star',
};
