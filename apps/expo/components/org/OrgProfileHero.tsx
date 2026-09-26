import React, { memo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { transformedImageUrl } from '@/lib/image-url';
import { formatAddress, formatRating, type OpenState } from '@/lib/org-profile';
import type { AccountRatingSummary } from '@/lib/types';
import {
  ArrowLeftIcon,
  ClockIcon,
  HeartFilledIcon,
  HeartIcon,
  LocationIcon,
  ShareIcon,
  StarIcon,
} from '@/components/Icons';
import BadgeCheckIcon from '@/assets/icons/badge-check.svg';
import { VERIFIED_GOLD } from '@/components/profile/IdentityRow';

export const HERO_HEIGHT = 340;
/** How far the rounded info sheet slides up over the photo. */
export const SHEET_OVERLAP = 24;
export const STAR_GOLD = '#FFB400';

export type HeroAction = {
  key: string;
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
};

type Props = {
  images: string[];
  /** Org logo, shown as a round badge overlapping the photo. */
  logoUrl?: string | null;
  name: string;
  verified: boolean;
  category: string | null;
  ratingSummary: AccountRatingSummary | null;
  openState: OpenState | null;
  address: string | null;
  onOpenLocation?: () => void;
  onRatingPress?: () => void;
  onBack: () => void;
  onShare: () => void;
  liked: boolean;
  onToggleLike: () => void;
  /** Extra round buttons left of share (search, edit). */
  extraActions?: HeroAction[];
};

/**
 * Top of every org detail page: a swipeable full-bleed photo with round
 * floating actions, and a rounded sheet over it carrying the name (+ gold
 * verified check), category, rating · open-state line and a tappable
 * location row that opens the map focused on the org.
 */
function OrgProfileHero({
  images,
  logoUrl,
  name,
  verified,
  category,
  ratingSummary,
  openState,
  address,
  onOpenLocation,
  onRatingPress,
  onBack,
  onShare,
  liked,
  onToggleLike,
  extraActions = [],
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  const hasRating = !!ratingSummary && ratingSummary.rating_count > 0;
  const ratingText = ratingSummary ? formatRating(ratingSummary.avg_stars) : '';
  const ratingCount = ratingSummary?.rating_count ?? 0;
  const buttonBg = isDark ? colors.background : 'rgba(255,255,255,0.94)';
  const closedColor = colors.warning;

  return (
    <View>
      <View style={[styles.hero, { height: HERO_HEIGHT, backgroundColor: colors.cardPlaceholder }]}>
        {images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            scrollEnabled={images.length > 1}
          >
            {images.map((uri) => (
              <Image
                key={uri}
                source={{ uri: transformedImageUrl(uri, { width: 1200 }) ?? uri }}
                style={{ width, height: HERO_HEIGHT }}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.actionsRow, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            onPress={onBack}
            style={[styles.roundButton, { backgroundColor: buttonBg }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
          >
            <ArrowLeftIcon size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.actionsRight}>
            {extraActions.map((a) => (
              <Pressable
                key={a.key}
                onPress={a.onPress}
                style={[styles.roundButton, { backgroundColor: buttonBg }]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={a.accessibilityLabel}
              >
                {a.icon}
              </Pressable>
            ))}
            <Pressable
              onPress={onShare}
              style={[styles.roundButton, { backgroundColor: buttonBg }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Teilen"
            >
              <ShareIcon size={22} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={onToggleLike}
              style={[styles.roundButton, { backgroundColor: buttonBg }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={liked ? 'Gefällt mir entfernen' : 'Gefällt mir'}
              accessibilityState={{ selected: liked }}
            >
              {liked ? (
                <HeartFilledIcon size={22} color="#E53935" />
              ) : (
                <HeartIcon size={22} color={colors.textPrimary} />
              )}
            </Pressable>
          </View>
        </View>

        {images.length > 1 ? (
          <View style={[styles.counter, { bottom: SHEET_OVERLAP + 14 }]}>
            <Text style={styles.counterText}>
              {page + 1}/{images.length}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        {logoUrl ? (
          <Image
            source={{ uri: transformedImageUrl(logoUrl, { width: 240 }) ?? logoUrl }}
            style={[styles.logo, { borderColor: colors.background, backgroundColor: colors.surface }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <Text style={[styles.name, { color: colors.textPrimary }]}>
          {name}
          {verified ? (
            <>
              {' '}
              <View style={styles.badgeWrap} accessibilityLabel="Verifiziert">
                <BadgeCheckIcon width={26} height={26} color={VERIFIED_GOLD} />
              </View>
            </>
          ) : null}
        </Text>

        {category ? (
          <Text style={[styles.category, { color: colors.textSecondary }]}>{category}</Text>
        ) : null}

        {hasRating || openState ? (
          <View style={styles.metaRow}>
            {hasRating ? (
              <Pressable
                onPress={onRatingPress}
                disabled={!onRatingPress}
                style={styles.metaItem}
                accessibilityRole="button"
                accessibilityLabel={`Bewertung ${ratingText} von 5`}
              >
                <StarIcon size={18} color={STAR_GOLD} />
                <Text style={[styles.ratingValue, { color: colors.textPrimary }]}>
                  {ratingText}
                </Text>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  ({ratingCount})
                </Text>
              </Pressable>
            ) : null}
            {hasRating && openState ? (
              <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
            ) : null}
            {openState ? (
              <View style={[styles.metaItem, styles.metaShrink]}>
                <ClockIcon size={17} color={openState.isOpen ? colors.success : closedColor} />
                <Text style={[styles.metaText, styles.metaShrink]} numberOfLines={1}>
                  <Text style={{ color: openState.isOpen ? colors.success : closedColor }}>
                    {openState.label}
                  </Text>
                  {openState.detail ? (
                    <Text style={{ color: colors.textSecondary }}> – {openState.detail}</Text>
                  ) : null}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {address || onOpenLocation ? (
          <Pressable
            onPress={onOpenLocation}
            disabled={!onOpenLocation}
            style={({ pressed }) => [
              styles.locationRow,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole={onOpenLocation ? 'button' : undefined}
            accessibilityLabel={onOpenLocation ? `${name} auf der Karte ansehen` : undefined}
          >
            <LocationIcon size={20} color={colors.textPrimary} />
            <Text style={[styles.locationText, { color: colors.textPrimary }]} numberOfLines={2}>
              {formatAddress(address) || 'Auf der Karte ansehen'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default memo(OrgProfileHero);

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    overflow: 'hidden',
  },
  actionsRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionsRight: {
    flexDirection: 'row',
    gap: 10,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'MonaSans-SemiBold',
  },
  sheet: {
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 10,
  },
  name: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  badgeWrap: {
    width: 26,
    height: 26,
    transform: [{ translateY: 4 }],
  },
  category: {
    fontSize: 16,
    fontFamily: 'MonaSans-Regular',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaShrink: {
    flexShrink: 1,
  },
  ratingValue: {
    fontSize: 16,
    fontFamily: 'MonaSans-SemiBold',
  },
  metaText: {
    fontSize: 16,
    fontFamily: 'MonaSans-Regular',
  },
  dot: {
    fontSize: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    marginTop: -62,
    marginBottom: 2,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'MonaSans-Regular',
  },
});
