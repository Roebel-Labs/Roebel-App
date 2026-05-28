import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, ImageSourcePropType } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';

type Item = {
  label: string;
  icon: ImageSourcePropType;
  href: Href;
};

const ITEMS: Item[] = [
  { label: 'Röbel Card', icon: require('../../assets/illustration/profile/01.png'), href: '/roebel-card' as Href },
  { label: 'Bürgerbefragung', icon: require('../../assets/illustration/profile/02.png'), href: '/governance' as Href },
  { label: 'Durchstarten', icon: require('../../assets/illustration/profile/03.png'), href: '/create-org' as Href },
  { label: 'Veranstaltung\neinsenden', icon: require('../../assets/illustration/profile/04.png'), href: '/submit-event' as Href },
  {
    label: 'Anzeige\nerstellen',
    icon: require('../../assets/illustration/profile/05.png'),
    href: '/create-listing' as Href,
  },
  {
    label: 'Abfall\nkalender',
    icon: require('../../assets/illustration/profile/trash.png'),
    href: '/abfallkalender' as Href,
  },
];

export default function ProfileActionGrid() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const cardBg = colors.background;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg },
        softShadow(2, isDark),
      ]}
    >
      {ITEMS.map((item) => (
        <Pressable
          key={item.label}
          onPress={() => router.push(item.href as any)}
          style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={item.label.replace('\n', ' ')}
        >
          <Image source={item.icon} style={styles.icon} resizeMode="contain" />
          <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  cell: {
    width: '33.333%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  icon: {
    width: 48,
    height: 48,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 14,
  },
});
