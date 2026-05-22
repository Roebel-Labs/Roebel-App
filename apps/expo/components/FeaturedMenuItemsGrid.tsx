import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import MenuItemThumbs from '@/components/MenuItemThumbs';
import type { MenuItemRecord, MenuItemVoteSummary } from '@/lib/types';

type Props = {
  accountId: string;
  items: MenuItemRecord[];
  voteSummaries: Record<string, MenuItemVoteSummary>;
};

function rankItems(items: MenuItemRecord[], votes: Record<string, MenuItemVoteSummary>): MenuItemRecord[] {
  const withScore = items.map((it) => {
    const v = votes[it.id];
    const score = v ? v.percent_liked * Math.log10(v.vote_count + 1) : 0;
    return { it, score };
  });
  withScore.sort((a, b) => b.score - a.score);
  // If no votes at all, fall back to sort_order/name.
  const allZero = withScore.every((w) => w.score === 0);
  if (allZero) return items.slice(0, 6);
  return withScore.slice(0, 6).map((w) => w.it);
}

export default function FeaturedMenuItemsGrid({ accountId, items, voteSummaries }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const ranked = rankItems(items, voteSummaries);
  if (!ranked.length) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Beliebte Gerichte</Text>
      <FlatList
        data={ranked}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.row}
        renderItem={({ item, index }) => {
          const v = voteSummaries[item.id];
          return (
            <Pressable
              onPress={() => router.push(`/account/${accountId}/menu/${item.id}`)}
              style={styles.card}
            >
              <View style={[styles.imgWrap, { backgroundColor: colors.surfaceSecondary }]}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.img} contentFit="cover" />
                ) : null}
                {index < 3 && (
                  <View style={[styles.badge, { backgroundColor: colors.success }]}>
                    <Text style={styles.badgeText}>#{index + 1} most liked</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
              <View style={styles.meta}>
                <Text style={[styles.price, { color: colors.textPrimary }]}>€{item.price.toFixed(2)}</Text>
                <MenuItemThumbs summary={v ?? null} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const CARD_W = 160;

const styles = StyleSheet.create({
  section: { paddingTop: 16, paddingBottom: 8 },
  heading: { paddingHorizontal: 16, fontSize: 22, fontFamily: 'Inter-Medium', marginBottom: 12 },
  row: { paddingHorizontal: 16, gap: 12 },
  card: { width: CARD_W },
  imgWrap: { width: CARD_W, height: CARD_W, borderRadius: 12, overflow: 'hidden', justifyContent: 'flex-start' },
  img: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 11 },
  name: { marginTop: 8, fontFamily: 'Inter-Medium', fontSize: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  price: { fontFamily: 'Inter-Regular', fontSize: 13 },
});
