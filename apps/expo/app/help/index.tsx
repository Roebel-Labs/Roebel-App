// apps/expo/app/help/index.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fetchHelpCollections, fetchHelpVideos } from '@/lib/supabase-help';
import type { HelpCollection, HelpVideo } from '@/lib/types-help';
import HelpHeroCard from '@/components/help/HelpHeroCard';
import HelpCollectionCard from '@/components/help/HelpCollectionCard';
import HelpVideoCard from '@/components/help/HelpVideoCard';

export default function HelpHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [collections, setCollections] = useState<HelpCollection[]>([]);
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchHelpCollections(), fetchHelpVideos()])
      .then(([cols, vids]) => {
        setCollections(cols);
        setVideos(vids);
      })
      .finally(() => setLoading(false));
  }, []);

  const featured = collections.find(c => c.is_featured);
  const gridCollections = collections.filter(c => !c.is_featured);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{
          title: 'Hilfe & Tipps',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </Pressable>
          ),
        }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen options={{
          title: 'Hilfe & Tipps',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </Pressable>
          ),
        }} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Featured Hero Card */}
        {featured && (
          <HelpHeroCard
            collection={featured}
            onPress={() => router.push(`/help/${featured.id}`)}
          />
        )}

        {/* Grid Collections */}
        {gridCollections.length > 0 && (
          <View style={styles.section}>
            <View style={styles.grid}>
              {gridCollections.map((col, index) => (
                <React.Fragment key={col.id}>
                  {index % 2 === 0 && index > 0 && <View style={styles.gridRowSpacer} />}
                  <HelpCollectionCard
                    collection={col}
                    onPress={() => router.push(`/help/${col.id}`)}
                  />
                  {index % 2 === 0 && index < gridCollections.length - 1 && (
                    <View style={styles.gridGap} />
                  )}
                </React.Fragment>
              ))}
              {/* Fill last row if odd count */}
              {gridCollections.length % 2 !== 0 && <View style={{ flex: 1 }} />}
            </View>
          </View>
        )}

        {/* Discover Videos */}
        {videos.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Entdecke mehr über Röbel
            </Text>
            <View style={styles.videoList}>
              {videos.map(video => (
                <HelpVideoCard key={video.id} video={video} />
              ))}
            </View>
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
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridGap: {
    width: 8,
  },
  gridRowSpacer: {
    width: '100%',
    height: 8,
  },
  videoList: {
    gap: 12,
  },
  bottomSpacer: {
    height: 32,
  },
});
