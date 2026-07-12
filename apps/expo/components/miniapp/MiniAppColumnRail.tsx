/**
 * MiniAppColumnRail — the World-App "Top Apps" layout: apps stacked up to 3
 * per column, columns laid out left-to-right and swiped horizontally like a
 * carousel. Each column snaps to the left edge so a full block of three always
 * aligns cleanly; the next column peeks in at the right to signal more.
 */
import React, { useMemo } from 'react';
import { View, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import type { MiniApp } from '@/lib/miniapps';
import { MiniAppRowCard } from '@/components/miniapp/MiniAppCard';

const COLUMN_SIZE = 3; // max mini apps stacked in one column
const RAIL_PADDING = 16; // matches the store's side gutter
const COL_GAP = 16; // space between columns
const PEEK = 32; // how much of the next column shows at the right edge

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function MiniAppColumnRail({
  apps,
  isInstalled,
  onOpen,
}: {
  apps: MiniApp[];
  isInstalled: (slug: string) => boolean;
  onOpen: (app: MiniApp) => void;
}) {
  const { width } = useWindowDimensions();
  const colW = width - RAIL_PADDING - PEEK;
  const columns = useMemo(() => chunk(apps, COLUMN_SIZE), [apps]);

  // A single column doesn't need a carousel — render it inline full-width.
  if (columns.length <= 1) {
    return (
      <View style={styles.singleColumn}>
        {apps.map((app) => (
          <MiniAppRowCard
            key={app.id}
            app={app}
            installed={isInstalled(app.slug)}
            onPress={() => onOpen(app)}
          />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      horizontal
      data={columns}
      keyExtractor={(_, i) => `col-${i}`}
      showsHorizontalScrollIndicator={false}
      snapToInterval={colW + COL_GAP}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      contentContainerStyle={styles.railContent}
      renderItem={({ item, index }) => (
        <View
          style={[
            { width: colW },
            index < columns.length - 1 && { marginRight: COL_GAP },
          ]}
        >
          {item.map((app) => (
            <MiniAppRowCard
              key={app.id}
              app={app}
              installed={isInstalled(app.slug)}
              onPress={() => onOpen(app)}
              columnMode
            />
          ))}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  railContent: { paddingHorizontal: RAIL_PADDING },
  singleColumn: { paddingHorizontal: RAIL_PADDING },
});
