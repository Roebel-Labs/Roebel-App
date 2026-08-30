import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ForumThreadCard from './ForumThreadCard';
import ForumCategoryChips from './ForumCategoryChips';
import { fetchRecentForumThreads } from '@/lib/supabase-forum';

type Props = {
  /** undefined = all categories */
  categorySlug?: string;
  title: string;
};

export default function ForumThreadList({ categorySlug, title }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: threads = [], isFetching, refetch } = useQuery({
    queryKey: ['forum', 'threads', categorySlug ?? 'alle'],
    queryFn: () => fetchRecentForumThreads(50, categorySlug),
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ForumCategoryChips activeSlug={categorySlug ?? 'alle'} />
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <ForumThreadCard thread={item} />}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.borderTertiary }]} />
        )}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.textSecondary} />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Noch keine Diskussionen. Starte das erste Thema!
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
  headerTitle: {
    fontSize: 17,
    fontFamily: fontFamily.semiBold,
  },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  listContent: { paddingBottom: 32 },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
});
