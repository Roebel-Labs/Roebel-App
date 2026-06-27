import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchOrgAccountsBySubType } from '@/lib/supabase-accounts';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import CheckIcon from '@/assets/icons/check.svg';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import type { Account } from '@/lib/types';

export default function BusinessesListScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const data = await fetchOrgAccountsBySubType('unternehmen');
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching org accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const renderRow = ({ item }: { item: Account }) => (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/account/[id]' as any, params: { id: item.id } })
      }
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <UserAvatarWithFrame
        size={44}
        uri={item.avatar_url}
        fallbackInitial={(item.name[0] || '?').toUpperCase()}
        frameAssetUrl={null}
      />
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.name, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.is_verified && (
            <View style={[styles.verifiedBadge, { backgroundColor: colors.primary }]}>
              <CheckIcon width={10} height={10} color={colors.onPrimary} />
            </View>
          )}
        </View>
        {item.slug && (
          <Text
            style={[styles.subtitle, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            @{item.slug}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Lokale Unternehmen</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={accounts}
          renderItem={renderRow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Keine Unternehmen verfügbar
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  listContent: {
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    flexShrink: 1,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
});
