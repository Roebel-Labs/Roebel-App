/**
 * The rich body of the map bottom sheet, shown for any pin backed by an
 * organisation account — a Verein pin, a restaurant, or a business alike.
 *
 * MapPlaceSheet still owns the sheet itself, the swipe between places in a
 * cluster, and the share / directions / site / ig row. This component only
 * fills the detail area, so the container stays readable.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import { useOrgSheetData } from '@/hooks/useOrgSheetData';
import OrgOpeningHours from './OrgOpeningHours';
import OrgPhotoCarousel from './OrgPhotoCarousel';
import OrgCommentThread from './OrgCommentThread';
import OrgSavedByRail from './OrgSavedByRail';
import OrgExperienceComposer from './OrgExperienceComposer';
import type { Account, OpeningHours } from '@/lib/types';

type Props = {
  accountId: string;
  /** Known from the map payload; saves a fetch for the header. */
  account?: Account | null;
  /** Address line under the photos, e.g. "Marktplatz 1". */
  address?: string | null;
  openingHours: OpeningHours | null;
  /** Falls back into the carousel when the org has uploaded nothing. */
  fallbackImageUrls?: (string | null | undefined)[];
};

export default function OrgSheetDetail({
  accountId,
  account,
  address,
  openingHours,
  fallbackImageUrls = [],
}: Props) {
  const { colors } = useTheme();
  const { user } = useUser();
  const {
    photos,
    comments,
    voteSummary,
    ratingSummary,
    myVote,
    saveSummary,
    savers,
    mySave,
    experiences,
    loading,
    setVote,
    setSave,
    postExperience,
    postComment,
    postReply,
    likeComment,
  } = useOrgSheetData(accountId);

  const descriptionParts = [address, account?.bio].filter(
    (part): part is string => !!part && !!part.trim()
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.saveRow}>
        <SaveButton
          label="Merken"
          icon="🔖"
          active={mySave === 'to_try'}
          onPress={() => void setSave('to_try')}
          colors={colors}
        />
        <SaveButton
          label="Gewesen"
          icon="✅"
          active={mySave === 'been'}
          onPress={() => void setSave('been')}
          colors={colors}
        />
      </View>

      <OrgOpeningHours hours={openingHours} />

      <OrgPhotoCarousel photos={photos} fallbackUrls={fallbackImageUrls} />

      {descriptionParts.length ? (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={3}>
          {descriptionParts.join(' • ')}
        </Text>
      ) : null}

      <View style={[styles.counts, { borderColor: colors.border }]}>
        <Text style={[styles.countsTitle, { color: colors.textPrimary }]}>STIMMEN</Text>
        <View style={styles.countsRow}>
          <CountChip icon="🔖" value={saveSummary?.to_try_count ?? 0} colors={colors} />
          <CountChip icon="✅" value={saveSummary?.been_count ?? 0} colors={colors} />
          <CountChip icon="⭐" value={ratingSummary?.rating_count ?? 0} colors={colors} />
          <CountChip
            icon="👍"
            value={voteSummary?.up_count ?? 0}
            active={myVote === 1}
            onPress={() => void setVote(1)}
            colors={colors}
          />
          <CountChip
            icon="👎"
            value={voteSummary?.down_count ?? 0}
            active={myVote === -1}
            onPress={() => void setVote(-1)}
            colors={colors}
          />
        </View>

        <OrgSavedByRail savers={savers} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.textTertiary} />
      ) : (
        <>
          <OrgCommentThread
            comments={comments}
            myWallet={user?.wallet_address ?? null}
            myAvatarUrl={user?.profile_picture_url}
            onSubmit={postComment}
            onReply={postReply}
            onLike={likeComment}
          />
          <OrgExperienceComposer
            experiences={experiences}
            myWallet={user?.wallet_address ?? null}
            onSubmit={postExperience}
          />
        </>
      )}
    </View>
  );
}

function SaveButton({
  label,
  icon,
  active,
  onPress,
  colors,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        styles.saveButton,
        {
          backgroundColor: active ? colors.primaryLight : 'transparent',
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={styles.saveIcon}>{icon}</Text>
      <Text
        style={[
          styles.saveLabel,
          { color: active ? colors.primary : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CountChip({
  icon,
  value,
  active,
  onPress,
  colors,
}: {
  icon: string;
  value: number | string;
  active?: boolean;
  onPress?: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const chipStyle = [
    styles.chip,
    {
      backgroundColor: active ? colors.primaryLight : 'transparent',
      borderColor: active ? colors.primary : 'transparent',
    },
  ];
  const content = (
    <>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={[styles.chipValue, { color: colors.textPrimary }]}>{value}</Text>
    </>
  );

  // The star and bookmark figures are read-only; only the votes are tappable.
  if (!onPress) return <View style={chipStyle}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={chipStyle}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingBottom: 24 },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 16,
  },
  counts: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  countsTitle: { fontFamily: fontFamily.bold, fontSize: 13, letterSpacing: 0.4 },
  countsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipIcon: { fontSize: 14 },
  chipValue: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  saveRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, justifyContent: 'flex-end' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveIcon: { fontSize: 14 },
  saveLabel: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  loader: { paddingVertical: 24 },
});
