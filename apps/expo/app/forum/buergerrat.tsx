import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ForumCategoryChips from '@/components/forum/ForumCategoryChips';
import BuergerratThreadRow from '@/components/forum/BuergerratThreadRow';
import { fetchBuergerratThreads } from '@/lib/supabase-forum';
import {
  BUERGERRAT_CITATION,
  BUERGERRAT_NDR_URL,
  BUERGERRAT_TITLE,
  BUERGERRAT_YEAR_LABEL,
} from '@/lib/buergerrat';

/** The 11 recommendations, ranked by Punkte, each opening its discussion thread. */
export default function BuergerratScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: threads = [], isFetching, refetch } = useQuery({
    queryKey: ['forum', 'buergerrat', 'threads'],
    queryFn: fetchBuergerratThreads,
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{BUERGERRAT_YEAR_LABEL}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ForumCategoryChips activeSlug="buergerrat" showNewCta={false} />
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <BuergerratThreadRow thread={item} />}
        ListHeaderComponent={
          <View style={[styles.intro, { borderBottomColor: colors.borderTertiary }]}>
            <Text style={[styles.introTitle, { color: colors.textPrimary }]}>{BUERGERRAT_TITLE}</Text>
            <Text style={[styles.introText, { color: colors.textSecondary }]}>
              Zitiert aus der Broschüre. Quelle: {BUERGERRAT_CITATION}.{' '}
              <Text
                style={[styles.introLink, { color: colors.primary }]}
                onPress={() => void Linking.openURL(BUERGERRAT_NDR_URL)}
              >
                NDR-Bericht
              </Text>
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.textSecondary} />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Noch keine Empfehlungen eingetragen.
          </Text>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: fontFamily.semiBold },
  intro: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  introTitle: { fontSize: 20, fontFamily: fontFamily.heading, lineHeight: 26 },
  introText: { fontSize: 12, fontFamily: fontFamily.regular, lineHeight: 17 },
  introLink: { fontFamily: fontFamily.semiBold },
  listContent: { paddingBottom: 32 },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
});
