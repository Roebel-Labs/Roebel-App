import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { HelpCollection } from '@/lib/types-help';
import HelpHeroCard from './HelpHeroCard';

type Props = {
  collections: HelpCollection[];
  onPressCollection: (collection: HelpCollection) => void;
};

export default function HelpFeaturedLayout({ collections, onPressCollection }: Props) {
  if (collections.length === 0) return null;

  // 1 featured: single full-width large card
  if (collections.length === 1) {
    return (
      <View style={styles.container}>
        <HelpHeroCard
          collection={collections[0]}
          onPress={() => onPressCollection(collections[0])}
          size="large"
        />
      </View>
    );
  }

  // 2 featured: two side-by-side small cards
  if (collections.length === 2) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <HelpHeroCard
            collection={collections[0]}
            onPress={() => onPressCollection(collections[0])}
            size="small"
          />
          <View style={styles.gap} />
          <HelpHeroCard
            collection={collections[1]}
            onPress={() => onPressCollection(collections[1])}
            size="small"
          />
        </View>
      </View>
    );
  }

  // 3 featured: 1 big on top, 2 side-by-side below
  // (4+ also falls here — shows first 3, remaining are ignored to keep layout clean)
  return (
    <View style={styles.container}>
      <HelpHeroCard
        collection={collections[0]}
        onPress={() => onPressCollection(collections[0])}
        size="large"
      />
      <View style={styles.spacer} />
      <View style={styles.row}>
        <HelpHeroCard
          collection={collections[1]}
          onPress={() => onPressCollection(collections[1])}
          size="small"
        />
        <View style={styles.gap} />
        <HelpHeroCard
          collection={collections[2]}
          onPress={() => onPressCollection(collections[2])}
          size="small"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
  },
  gap: {
    width: 12,
  },
  spacer: {
    height: 12,
  },
});
