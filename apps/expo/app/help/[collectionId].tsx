// apps/expo/app/help/[collectionId].tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { fetchHelpCollection, fetchHelpItems } from '@/lib/supabase-help';
import type { HelpCollection, HelpItem } from '@/lib/types-help';
import HelpItemRow from '@/components/help/HelpItemRow';

export default function CollectionDetailScreen() {
  const router = useRouter();
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const { colors } = useTheme();
  const [collection, setCollection] = useState<HelpCollection | null>(null);
  const [items, setItems] = useState<HelpItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!collectionId) return;
    Promise.all([fetchHelpCollection(collectionId), fetchHelpItems(collectionId)])
      .then(([col, itms]) => {
        setCollection(col);
        setItems(itms);
      })
      .finally(() => setLoading(false));
  }, [collectionId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!collection) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Nicht gefunden' }} />
        <View style={styles.loadingContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Sammlung nicht gefunden
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: collection.title }} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        {collection.cover_image_url && (
          <View style={styles.heroContainer}>
            <Image
              source={{ uri: collection.cover_image_url }}
              style={styles.heroImage}
              contentFit="cover"
            />
            <View style={styles.heroOverlay}>
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
    </SafeAreaView>
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
  heroContainer: {
    height: 200,
    position: 'relative',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
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
