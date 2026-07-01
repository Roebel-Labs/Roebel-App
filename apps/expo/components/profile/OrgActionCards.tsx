import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import { softShadow } from '@/lib/shadow';

const ANZEIGE = require('../../assets/illustration/profile/05.png');
const DIENSTLEISTUNG = require('../../assets/illustration/profile/06.png');
const VERANSTALTUNG = require('../../assets/illustration/profile/04.png');
const ADS_ILLUSTRATION = require('../../assets/illustration/profile/ads.png');
const DASHBOARD_ILLUSTRATION = require('../../assets/illustration/profile/dashboard.png');

type GridItem = {
  label: string;
  icon: any;
  onPress: () => void;
};

type WideItem = {
  label: string;
  icon: any;
  onPress: () => void;
};

export default function OrgActionCards() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const requireAuth = useRequireAuth();
  const cardBg = colors.background;

  const gridItems: GridItem[] = [
    {
      label: 'Anzeige\nerstellen',
      icon: ANZEIGE,
      onPress: () =>
        requireAuth(() =>
          router.push({ pathname: '/create-listing', params: { listingType: 'product' } } as any)
        ),
    },
    {
      label: 'Dienstleistung\nanbieten',
      icon: DIENSTLEISTUNG,
      onPress: () =>
        requireAuth(() =>
          router.push({ pathname: '/create-listing', params: { listingType: 'service' } } as any)
        ),
    },
    {
      label: 'Veranstaltung\nerstellen',
      icon: VERANSTALTUNG,
      onPress: () => requireAuth(() => router.push('/submit-event' as any)),
    },
  ];

  const wideItems: WideItem[] = [
    { label: 'Anzeigen', icon: ADS_ILLUSTRATION, onPress: () => router.push('/org/ads' as any) },
    { label: 'Dashboard', icon: DASHBOARD_ILLUSTRATION, onPress: () => router.push('/org/dashboard' as any) },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.grid, { backgroundColor: cardBg }, softShadow(2, isDark)]}>
        {gridItems.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={item.label.replace('\n', ' ')}
          >
            <Image source={item.icon} style={styles.cellIcon} resizeMode="contain" />
            <Text style={[styles.cellLabel, { color: colors.textPrimary }]} numberOfLines={2}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.wideRow}>
        {wideItems.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.wideCard,
              { backgroundColor: cardBg, opacity: pressed ? 0.85 : 1 },
              softShadow(2, isDark),
            ]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Image source={item.icon} style={styles.wideIcon} resizeMode="contain" />
            <Text style={[styles.wideLabel, { color: colors.textPrimary }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 8,
  },
  cellIcon: {
    width: 48,
    height: 48,
  },
  cellLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 14,
  },
  wideRow: {
    flexDirection: 'row',
    gap: 12,
  },
  wideCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  wideIcon: {
    width: 32,
    height: 32,
  },
  wideLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
});
