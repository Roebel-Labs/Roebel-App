import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import StampCard from '@/components/credentials/StampCard';
import { formatEventDate } from '@/lib/credreg/collect-format';
import { groupBadgesByYear, type BadgeTile, type RegisterCard } from '@/lib/credreg/model';
import type { PendingBadge } from '@/lib/credreg/types';

type Props = {
  badges: RegisterCard[];
  onPress: (card: RegisterCard) => void;
  /** Own profile: attended events whose badge has not been issued yet ("wird eingetragen"). */
  pending?: PendingBadge[];
  /** Own profile: ids of scans waiting offline ("wird gesammelt"). */
  queued?: string[];
  /** A pending or queued tile was pressed (collected tiles go to `onPress`). */
  onPressTile?: (tile: BadgeTile) => void;
  /** Own profile: show the "collect your first" explanation instead of nothing. */
  emptyState?: boolean;
  /** Horizontal padding the grid applies itself (the profile sheet has none, so 16). */
  inset?: number;
  /** Horizontal padding the parent already applies on each side. */
  parentInset?: number;
};

const COLUMNS = 3;
const GAP = 12;

export const BADGE_EMPTY_TEXT =
  'Noch keine Abzeichen. Scanne bei einer Veranstaltung den QR-Code am Eingang, dann landet dein erstes Abzeichen hier.';

const tileLabel = (t: BadgeTile) =>
  [t.title, t.state === 'pending' ? 'wird eingetragen' : t.state === 'queued' ? 'wird gesammelt' : null, t.card?.state === 'expired' ? 'Abgelaufen' : null]
    .filter(Boolean)
    .join(', ');

/**
 * "Abzeichen" (spec 5.6b): stamp tiles in three columns, one sub-heading per year (newest first).
 * Empty: nothing on another person's profile, an explanation on the own one.
 */
export default function BadgeGrid({ badges, onPress, pending = [], queued = [], onPressTile, emptyState = false, inset = 16, parentInset = 0 }: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const groups = groupBadgesByYear(badges, pending, queued);
  if (groups.length === 0 && !emptyState) return null;
  const tile = Math.floor((screenWidth - (inset + parentInset) * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <View style={[styles.section, { paddingHorizontal: inset }]}>
      <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header">
        Abzeichen
      </Text>
      {groups.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <View style={[styles.emptyStamp, { borderColor: colors.border }]} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{BADGE_EMPTY_TEXT}</Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.year} style={styles.group}>
            <Text style={[styles.year, { color: colors.textSecondary }]}>{String(g.year)}</Text>
            <View style={styles.grid}>
              {g.items.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => (t.card ? onPress(t.card) : onPressTile?.(t))}
                  accessibilityRole="button"
                  accessibilityLabel={tileLabel(t)}
                  style={[{ width: tile }, t.card?.state === 'expired' && styles.dimmed]}
                >
                  <StampCard
                    imageUrl={t.imageUrl}
                    title={t.title}
                    subtitle={t.date ? formatEventDate(t.date) : ''}
                    state={t.state}
                    size="tile"
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  heading: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    marginBottom: 12,
  },
  group: {
    marginBottom: 16,
  },
  year: {
    fontSize: 13,
    fontFamily: 'MonaSans-SemiBold',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GAP,
    rowGap: 12,
  },
  dimmed: {
    opacity: 0.45,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emptyStamp: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  emptyText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 20,
  },
});
