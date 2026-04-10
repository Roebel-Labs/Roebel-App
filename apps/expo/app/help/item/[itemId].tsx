// apps/expo/app/help/item/[itemId].tsx

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';

import { useTheme } from '@/context/ThemeContext';
import { fetchHelpItems } from '@/lib/supabase-help';
import type { HelpItem } from '@/lib/types-help';
import HelpPaginationBar from '@/components/help/HelpPaginationBar';

export default function ItemDetailScreen() {
  const router = useRouter();
  const { itemId, collectionId } = useLocalSearchParams<{ itemId: string; collectionId: string }>();
  const { colors } = useTheme();
  const [items, setItems] = useState<HelpItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!collectionId) return;
    fetchHelpItems(collectionId)
      .then(fetchedItems => {
        setItems(fetchedItems);
        const idx = fetchedItems.findIndex(i => i.id === itemId);
        if (idx >= 0) setCurrentIndex(idx);
      })
      .finally(() => setLoading(false));
  }, [collectionId, itemId]);

  const currentItem = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) setCurrentIndex(prev => prev - 1);
  }, [hasPrev]);

  const handleNext = useCallback(() => {
    if (hasNext) setCurrentIndex(prev => prev + 1);
  }, [hasNext]);

  const handleAction = useCallback(() => {
    if (currentItem?.action_route) {
      router.push(currentItem.action_route as any);
    }
  }, [currentItem, router]);

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

  if (!currentItem) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Nicht gefunden' }} />
        <View style={styles.loadingContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Inhalt nicht gefunden
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: currentItem.title }} />

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        {/* Hero Media */}
        {currentItem.hero_media_url && (
          <View style={styles.heroContainer}>
            <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
              <Image
                source={{ uri: currentItem.hero_media_url }}
                style={styles.heroMedia}
                contentFit="cover"
              />
            </View>
          </View>
        )}

        {/* Body Content */}
        <View style={styles.bodyContainer}>
          {currentItem.subtitle && (
            <Text style={[styles.bodyTitle, { color: colors.textPrimary }]}>
              {currentItem.subtitle}
            </Text>
          )}

          {currentItem.body_text && (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              {currentItem.body_text}
            </Text>
          )}

          {/* Numbered Steps */}
          {currentItem.steps && currentItem.steps.length > 0 && (
            <View style={styles.stepsContainer}>
              {currentItem.steps.map((step, index) => (
                <View key={index} style={styles.stepRow}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.textPrimary }]}>{step}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pagination Bar */}
      <HelpPaginationBar
        onPrev={handlePrev}
        onNext={handleNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
        actionLabel={currentItem.action_enabled ? currentItem.action_label : null}
        onAction={currentItem.action_enabled ? handleAction : undefined}
      />
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
  scrollView: {
    flex: 1,
  },
  heroContainer: {
    padding: 16,
  },
  heroCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroMedia: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
  },
  bodyContainer: {
    paddingHorizontal: 16,
  },
  bodyTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 20,
  },
  stepsContainer: {
    gap: 14,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    paddingTop: 2,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
