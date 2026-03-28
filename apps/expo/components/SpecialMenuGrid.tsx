import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SpecialMenuRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  menus: SpecialMenuRecord[];
};

export default function SpecialMenuGrid({ menus }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  if (menus.length === 0) {
    return null;
  }

  const handlePress = (menuId: string) => {
    router.push(`/restaurant/menu/${menuId}` as any);
  };

  const renderGridCard = (menu: SpecialMenuRecord) => (
    <Pressable
      key={menu.id}
      style={({ pressed }) => [
        styles.gridCard,
        { backgroundColor: colors.surfaceSecondary },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => handlePress(menu.id)}
      accessibilityRole="button"
      accessibilityLabel={`${menu.name} ansehen`}
    >
      <View style={styles.gridIconContainer}>
        {menu.icon_image_url ? (
          <Image
            source={{ uri: menu.icon_image_url }}
            style={styles.fullSize}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Image
            source={require('@/assets/illustration/categories/essen_trinken.png')}
            style={styles.fullSize}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        )}
      </View>
      <Text style={[styles.gridCardName, { color: colors.textPrimary }]}>{menu.name}</Text>
    </Pressable>
  );

  const renderFeaturedCard = (menu: SpecialMenuRecord) => (
    <Pressable
      key={menu.id}
      style={({ pressed }) => [
        styles.featuredCard,
        { backgroundColor: colors.surfaceSecondary },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => handlePress(menu.id)}
      accessibilityRole="button"
      accessibilityLabel={`${menu.name} ansehen`}
    >
      <View style={styles.featuredTextContainer}>
        <Text style={[styles.featuredName, { color: colors.textPrimary }]}>{menu.name}</Text>
      </View>
      <View style={styles.featuredIconContainer}>
        {menu.icon_image_url ? (
          <Image
            source={{ uri: menu.icon_image_url }}
            style={styles.fullSize}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Image
            source={require('@/assets/illustration/categories/essen_trinken.png')}
            style={styles.fullSize}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        )}
      </View>
    </Pressable>
  );

  // 1 menu: single full-width card
  if (menus.length === 1) {
    return (
      <View style={styles.outerContainer}>
        {renderFeaturedCard(menus[0])}
      </View>
    );
  }

  // 2 menus: side by side
  if (menus.length === 2) {
    return (
      <View style={styles.outerContainer}>
        <View style={styles.row}>
          {menus.map(renderGridCard)}
        </View>
      </View>
    );
  }

  // 3 menus: featured + 2 below
  if (menus.length === 3) {
    return (
      <View style={styles.outerContainer}>
        {renderFeaturedCard(menus[0])}
        <View style={styles.row}>
          {menus.slice(1).map(renderGridCard)}
        </View>
      </View>
    );
  }

  // 4+ menus: 2x2 grid (or more rows)
  const rows: SpecialMenuRecord[][] = [];
  for (let i = 0; i < menus.length; i += 2) {
    rows.push(menus.slice(i, i + 2));
  }

  return (
    <View style={styles.outerContainer}>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map(renderGridCard)}
          {/* Add empty flex spacer if odd number in last row */}
          {row.length === 1 && <View style={styles.emptyGridSpacer} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  gridCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
  gridIconContainer: {
    width: 60,
    height: 60,
    marginBottom: 12,
  },
  gridCardName: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'left',
  },
  featuredCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
  featuredTextContainer: {
    flex: 1,
  },
  featuredName: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    lineHeight: 24,
  },
  featuredIconContainer: {
    width: 100,
    height: 80,
    marginLeft: 16,
  },
  fullSize: {
    width: '100%',
    height: '100%',
  },
  emptyGridSpacer: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
});
