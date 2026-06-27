import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useGoBack } from '@/hooks/useGoBack';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import MenuItemEditor from '@/components/menu-admin/MenuItemEditor';
import { supabase } from '@/lib/supabase';
import type { MenuItemRecord } from '@/lib/types';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';

export default function EditMenuItemScreen() {
  return (
    <InlineErrorBoundary label="org-menu-item-edit">
      <EditMenuItemScreenInner />
    </InlineErrorBoundary>
  );
}

function EditMenuItemScreenInner() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { roleInActiveAccount } = useAccount();
  const canEdit = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';
  const [item, setItem] = useState<MenuItemRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('menu_items').select('*').eq('id', id).maybeSingle();
      if (!cancelled) {
        setItem((data as MenuItemRecord | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item?.name ?? 'Gericht'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!canEdit ? (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Nicht berechtigt.</Text>
        ) : loading ? (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Lädt…</Text>
        ) : !item ? (
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>Gericht nicht gefunden.</Text>
        ) : (
          <MenuItemEditor
            restaurantId={item.restaurant_id}
            categoryId={item.category_id ?? ''}
            item={item}
            onSaved={(updated) => setItem(updated)}
            onDeleted={() => router.back()}
          />
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
  headerTitle: { fontSize: 17, fontFamily: 'MonaSansSemiCondensed-Medium', flex: 1, textAlign: 'center' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
});
