import React, { type ComponentProps } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import type { UserTier } from '@/lib/types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  tier: UserTier;
  size?: 'small' | 'medium';
  preferredRole?: 'buerger' | 'tourist' | 'organisation' | null;
  isVerifiedCitizen?: boolean;
};

type TierCfg = {
  label: string;
  icon: IoniconName;
  bgLight: string;
  bgDark: string;
  fgLight: string;
  fgDark: string;
};

/**
 * Tier pills get a small glyph left of the label so they feel like the
 * rarity pills on the rewards surface. Icons map to the tier's semantic:
 * guest → neutral person, tourist → compass, citizen → shield (Bürgerausweis).
 * When PNG assets land at `assets/illustration/gamification/tier/<tier>.png`,
 * swap the `<Ionicons>` here for a local `<Image>`.
 */
const TIER_CONFIG: Record<UserTier, TierCfg> = {
  guest: {
    label: 'Gast',
    icon: 'person-outline',
    bgLight: '#E5E7EB',
    bgDark: '#374151',
    fgLight: '#4B5563',
    fgDark: '#9CA3AF',
  },
  tourist: {
    label: 'Besucher',
    icon: 'compass',
    bgLight: '#DBEAFE',
    bgDark: '#1E3A5F',
    fgLight: '#1E40AF',
    fgDark: '#93C5FD',
  },
  citizen: {
    label: 'Bürger',
    icon: 'shield-checkmark',
    bgLight: '#D1FAE5',
    bgDark: '#064E3B',
    fgLight: '#065F46',
    fgDark: '#6EE7B7',
  },
};

const UNVERIFIED_BUERGER_CFG: TierCfg = {
  label: 'Nicht verifiziert',
  icon: 'shield-outline',
  bgLight: '#E5E7EB',
  bgDark: '#374151',
  fgLight: '#4B5563',
  fgDark: '#9CA3AF',
};

export default function TierBadge({
  tier,
  size = 'small',
  preferredRole,
  isVerifiedCitizen,
}: Props) {
  const { isDark } = useTheme();
  const isUnverifiedBuerger =
    tier !== 'citizen' && preferredRole === 'buerger' && !isVerifiedCitizen;
  const cfg = isUnverifiedBuerger ? UNVERIFIED_BUERGER_CFG : TIER_CONFIG[tier];
  const fg = isDark ? cfg.fgDark : cfg.fgLight;
  const bg = isDark ? cfg.bgDark : cfg.bgLight;
  const isMedium = size === 'medium';

  return (
    <View
      style={[
        styles.badge,
        isMedium ? styles.badgeMedium : styles.badgeSmall,
        { backgroundColor: bg },
      ]}
    >
      <Ionicons name={cfg.icon} size={isMedium ? 14 : 12} color={fg} />
      <Text
        style={[
          styles.label,
          isMedium ? styles.labelMedium : styles.labelSmall,
          { color: fg },
        ]}
      >
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  badgeMedium: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  label: {
    fontFamily: 'Inter-Medium',
  },
  labelSmall: {
    fontSize: 11,
  },
  labelMedium: {
    fontSize: 13,
  },
});
