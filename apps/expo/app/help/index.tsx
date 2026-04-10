// apps/expo/app/help/index.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import {
  fetchHelpCollections,
  fetchHelpSections,
  fetchHelpVideos,
} from '@/lib/supabase-help';
import type { HelpCollection, HelpSection, HelpVideo } from '@/lib/types-help';
import HelpFeaturedLayout from '@/components/help/HelpFeaturedLayout';
import HelpCollectionCard from '@/components/help/HelpCollectionCard';
import HelpListRow from '@/components/help/HelpListRow';
import HelpVideoCard from '@/components/help/HelpVideoCard';

export default function HelpHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [collections, setCollections] = useState<HelpCollection[]>([]);
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchHelpSections(), fetchHelpCollections(), fetchHelpVideos()])
      .then(([secs, cols, vids]) => {
        setSections(secs);
        setCollections(cols);
        setVideos(vids);
      })
      .finally(() => setLoading(false));
  }, []);

  const featured = useMemo(
    () => collections.filter(c => c.is_featured),
    [collections],
  );

  const collectionsBySection = useMemo(() => {
    const map = new Map<string, HelpCollection[]>();
    for (const col of collections) {
      if (!col.section_id) continue;
      const list = map.get(col.section_id) ?? [];
      list.push(col);
      map.set(col.section_id, list);
    }
    return map;
  }, [collections]);

  const headerOptions = {
    title: 'Hilfe & Tipps',
    headerLeft: () => (
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
    ),
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={headerOptions} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['bottom']}
    >
      <Stack.Screen options={headerOptions} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Featured Collections */}
        {featured.length > 0 && (
          <View style={styles.featuredBlock}>
            <Text style={[styles.sectionTitle, styles.sectionTitlePadded, { color: colors.textPrimary }]}>
              Empfohlen
            </Text>
            <HelpFeaturedLayout
              collections={featured}
              onPressCollection={col => router.push(`/help/${col.id}`)}
            />
          </View>
        )}

        {/* Sections */}
        {sections.map(section => {
          const sectionCollections = collectionsBySection.get(section.id) ?? [];
          if (sectionCollections.length === 0) return null;

          return (
            <View key={section.id} style={styles.section}>
              <Text
                style={[styles.sectionTitle, styles.sectionTitlePadded, { color: colors.textPrimary }]}
              >
                {section.title}
              </Text>

              {section.view_mode === 'grid' ? (
                <View style={styles.gridPadded}>
                  <GridCollections
                    collections={sectionCollections}
                    onPress={col => router.push(`/help/${col.id}`)}
                  />
                </View>
              ) : (
                <View style={styles.list}>
                  {sectionCollections.map((col, idx) => (
                    <React.Fragment key={col.id}>
                      <HelpListRow
                        collection={col}
                        onPress={() => router.push(`/help/${col.id}`)}
                      />
                      {idx < sectionCollections.length - 1 && (
                        <View
                          style={[styles.listDivider, { backgroundColor: colors.border }]}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Discover Videos */}
        {videos.length > 0 && (
          <View style={[styles.section, styles.sectionPadded]}>
            <Text
              style={[styles.sectionTitle, { color: colors.textPrimary }]}
            >
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

// Two-column grid renderer for collection cards
function GridCollections({
  collections,
  onPress,
}: {
  collections: HelpCollection[];
  onPress: (col: HelpCollection) => void;
}) {
  const rows: HelpCollection[][] = [];
  for (let i = 0; i < collections.length; i += 2) {
    rows.push(collections.slice(i, i + 2));
  }

  return (
    <View>
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[gridStyles.row, rowIndex > 0 && gridStyles.rowSpacing]}
        >
          <HelpCollectionCard
            collection={row[0]}
            onPress={() => onPress(row[0])}
          />
          <View style={gridStyles.gap} />
          {row[1] ? (
            <HelpCollectionCard
              collection={row[1]}
              onPress={() => onPress(row[1])}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rowSpacing: {
    marginTop: 12,
  },
  gap: {
    width: 12,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredBlock: {
    marginTop: 12,
  },
  section: {
    marginTop: 24,
  },
  sectionPadded: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  sectionTitlePadded: {
    paddingHorizontal: 16,
  },
  gridPadded: {
    paddingHorizontal: 16,
  },
  list: {
    // list rows fill width; dividers between
  },
  listDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66, // align with text after icon
  },
  videoList: {
    gap: 12,
  },
  bottomSpacer: {
    height: 32,
  },
});
