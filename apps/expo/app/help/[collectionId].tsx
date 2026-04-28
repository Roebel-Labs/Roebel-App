// apps/expo/app/help/[collectionId].tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fetchHelpCollection, fetchHelpItems } from '@/lib/supabase-help';
import type { HelpCollection, HelpItem } from '@/lib/types-help';
import HelpItemRow from '@/components/help/HelpItemRow';
import MeckyNotFound from '@/components/MeckyNotFound';

const HERO_HEIGHT = 320;

export default function CollectionDetailScreen() {
  const router = useRouter();
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const { colors } = useTheme();
  const [collection, setCollection] = useState<HelpCollection | null>(null);
  const [items, setItems] = useState<HelpItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!collectionId) return;
    Promise.all([
      fetchHelpCollection(collectionId),
      fetchHelpItems(collectionId),
    ])
      .then(([col, itms]) => {
        setCollection(col);
        setItems(itms);
      })
      .finally(() => setLoading(false));
  }, [collectionId]);

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!collection) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ title: 'Nicht gefunden' }} />
        <MeckyNotFound title="Sammlung nicht gefunden" />
      </SafeAreaView>
    );
  }

  const hasHero = !!collection.cover_image_url;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={
          hasHero
            ? { headerShown: false }
            : { title: collection.title }
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={hasHero ? undefined : styles.noHeroContent}
      >
        {/* Hero Image (optional) */}
        {hasHero && (
          <View style={styles.heroContainer}>
            <Image
              source={{ uri: collection.cover_image_url! }}
              style={styles.heroImage}
              contentFit="cover"
            />

            {/* Bottom-half gradient (transparent → pure black) */}
            <LinearGradient
              colors={['transparent', '#000000']}
              locations={[0, 1]}
              style={styles.heroGradient}
            />

            {/* Back button — rounded top-left */}
            <SafeAreaView edges={['top']} style={styles.heroBackWrapper}>
              <Pressable
                onPress={() => router.back()}
                style={styles.heroBackButton}
                hitSlop={8}
              >
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </Pressable>
            </SafeAreaView>

            {/* Title overlay */}
            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTitle}>{collection.title}</Text>
              {collection.subtitle && (
                <Text style={styles.heroSubtitle}>{collection.subtitle}</Text>
              )}
            </View>
          </View>
        )}

        {/* Items List */}
        <View style={styles.itemsList}>
          {items.map(item => (
            <HelpItemRow
              key={item.id}
              item={item}
              onPress={() =>
                router.push({
                  pathname: '/help/item/[itemId]',
                  params: { itemId: item.id, collectionId: collectionId },
                })
              }
            />
          ))}
        </View>

        {items.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Noch keine Inhalte vorhanden
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noHeroContent: {
    paddingTop: 8,
  },
  heroContainer: {
    width: '100%',
    height: HERO_HEIGHT,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT / 2,
  },
  heroBackWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  heroBackButton: {
    marginTop: 8,
    marginLeft: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
  },
  itemsList: {
    padding: 16,
    gap: 8,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  bottomSpacer: {
    height: 32,
  },
});
