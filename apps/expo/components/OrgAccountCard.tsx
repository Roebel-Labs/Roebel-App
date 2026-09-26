import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { StarIcon } from '@/components/Icons';
import BadgeCheckIcon from '@/assets/icons/badge-check.svg';
import { VERIFIED_GOLD } from '@/components/profile/IdentityRow';
import { placeCardStyles as styles } from '@/components/GastroCard';
import { formatAddress, formatRating } from '@/lib/org-profile';
import type { AccountRatingSummary, OrgAccountCardRecord } from '@/lib/types';
import { transformedImageUrl } from '@/lib/image-url';

const STAR_GOLD = '#FFB400';

type Props = {
  account: OrgAccountCardRecord;
  upCount: number | null;
  ratingSummary?: AccountRatingSummary | null;
};

/**
 * Large org-account card for the Erkunden rail, same shape as GastroCard:
 * wide cover (logo centred when there is none) with a "Verifiziert" pill,
 * then name + star rating, address and a category · recommendations line.
 */
function OrgAccountCard({ account, upCount, ratingSummary }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const hasRatings = !!ratingSummary && ratingSummary.rating_count > 0;
  const ratingText = ratingSummary ? formatRating(ratingSummary.avg_stars) : '';
  const ups = upCount ?? 0;
  const metaParts = [
    'Unternehmen',
    ups > 0 ? `${ups} ${ups === 1 ? 'Empfehlung' : 'Empfehlungen'}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/account/[id]' as any, params: { id: account.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${account.name} ansehen`}
    >
      <View style={[styles.cover, { backgroundColor: colors.cardPlaceholder }]}>
        {account.cover_url ? (
          <Image
            source={{ uri: transformedImageUrl(account.cover_url, { width: 840 }) ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={account.cover_url ?? undefined}
            accessibilityIgnoresInvertColors
          />
        ) : account.avatar_url ? (
          <Image
            source={{ uri: transformedImageUrl(account.avatar_url, { width: 220 }) ?? undefined }}
            style={styles.logo}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={account.avatar_url ?? undefined}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={[local.initial, { color: colors.textSecondary }]}>
            {(account.name[0] || '?').toUpperCase()}
          </Text>
        )}

        {account.is_verified ? (
          <View style={styles.pill}>
            <BadgeCheckIcon width={18} height={18} color={VERIFIED_GOLD} />
            <Text style={styles.pillText}>Verifiziert</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.titleRow}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {account.name}
        </Text>
        {hasRatings ? (
          <View style={styles.rating}>
            <StarIcon size={16} color={STAR_GOLD} />
            <Text style={[styles.ratingValue, { color: colors.textPrimary }]}>
              {ratingText}
            </Text>
          </View>
        ) : null}
      </View>
      {account.address ? (
        <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>
          {formatAddress(account.address)}
        </Text>
      ) : null}
      <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>
        {metaParts.join('  ·  ')}
      </Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  initial: {
    fontSize: 40,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});

export default memo(OrgAccountCard);
