import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useGoBack } from '@/hooks/useGoBack';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CategoryEditor from '@/components/menu-admin/CategoryEditor';
import { fetchRestaurantByAccount } from '@/lib/supabase-restaurants';

export default function NewCategoryScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const canEdit = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';
  const [restaurantId, setRestaurantId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeAccount?.id) return;
    let cancelled = false;
    (async () => {
      const r = await fetchRestaurantByAccount(activeAccount.id);
      if (!cancelled) setRestaurantId(r?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [activeAccount?.id]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neue Kategorie</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {!canEdit ? (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Nicht berechtigt.</Text>
        ) : restaurantId ? (
          <CategoryEditor
            restaurantId={restaurantId}
            onSaved={() => router.back()}
          />
        ) : (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Restaurant lädt…</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter-Medium' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
});
