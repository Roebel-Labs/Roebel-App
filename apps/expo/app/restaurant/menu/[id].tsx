import React from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowLeftIcon } from '@/components/Icons';
import { useSpecialMenu } from '@/hooks/useSpecialMenu';
import MenuCategorySection from '@/components/MenuCategorySection';
import { SpecialMenuDetailSkeleton } from '@/components/SkeletonLoader';
import { useTheme } from '@/context/ThemeContext';

export default function SpecialMenuDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { specialMenu, loading, refetch } = useSpecialMenu(id);
  const [refreshing, setRefreshing] = React.useState(false);
  const { colors } = useTheme();

  async function onRefresh() { setRefreshing(true); await refetch(); setRefreshing(false); }

  if (loading) return (<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}><Stack.Screen options={{ headerShown: false }} /><SpecialMenuDetailSkeleton /></SafeAreaView>);

  if (!specialMenu) return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}><Stack.Screen options={{ headerShown: false }} />
      <View style={styles.floatingBackContainer}><Pressable onPress={() => router.back()} style={[styles.floatingBackButton, { backgroundColor: colors.background }, shadows.backButton]}><ArrowLeftIcon size={24} color={colors.tabIconActive} /></Pressable></View>
      <View style={styles.notFoundContainer}><Text style={styles.notFoundEmoji}>🍽️</Text><Text style={[styles.notFoundText, { color: colors.textSecondary }]}>Menü nicht gefunden</Text></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Hero */}
        <View style={styles.heroContainer}>
          {specialMenu.cover_image_url ? (
            <Image source={{ uri: specialMenu.cover_image_url }} style={styles.heroImage} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
              {specialMenu.restaurant?.logo_url ? <Image source={{ uri: specialMenu.restaurant.logo_url }} style={{ width: 180, height: 80 }} contentFit="contain" accessibilityIgnoresInvertColors /> : <Text style={[styles.heroPlaceholderName, { color: colors.textPrimary }]}>{specialMenu.restaurant?.name || specialMenu.name}</Text>}
            </View>
          )}
          <View style={styles.floatingBackContainer}><Pressable onPress={() => router.back()} style={[styles.floatingBackButton, { backgroundColor: colors.background }, shadows.backButton]}><ArrowLeftIcon size={24} color={colors.tabIconActive} /></Pressable></View>
        </View>

        <View style={styles.infoSection}>
          <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>{specialMenu.name}</Text>
          {specialMenu.description && <Text style={[styles.description, { color: colors.textPrimary }]}>{specialMenu.description}</Text>}
        </View>

        <View style={styles.menuSection}>
          {specialMenu.special_menu_categories?.map((category) => (<MenuCategorySection key={category.id} category={category} items={category.special_menu_items || []} />))}
          {(!specialMenu.special_menu_categories || specialMenu.special_menu_categories.length === 0) && <Text style={[styles.noMenuText, { color: colors.textSecondary }]}>Keine Menüpunkte verfügbar</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const shadows = StyleSheet.create({
  backButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingBackContainer: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
  },
  floatingBackButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  notFoundEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  heroContainer: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholderName: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 16,
  },
  menuTitle: {
    fontSize: 26,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  menuSection: {
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  noMenuText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    padding: 32,
  },
});
