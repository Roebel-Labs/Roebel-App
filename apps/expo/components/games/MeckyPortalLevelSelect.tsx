import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily, fontSize, borderRadius, spacing } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PORTAL_PROGRESS_KEY, TILE_COLORS } from '@/lib/games/mecky-portal-types';
import type { LevelProgress } from '@/lib/games/mecky-portal-types';
import { TOTAL_LEVELS, getLevelName } from '@/lib/games/mecky-portal-levels';

type Props = {
  onSelectLevel: (levelIndex: number) => void;
};

export default function MeckyPortalLevelSelect({ onSelectLevel }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [progress, setProgress] = useState<Record<number, LevelProgress>>({});

  useEffect(() => {
    loadProgress();
  }, []);

  async function loadProgress() {
    try {
      const raw = await AsyncStorage.getItem(PORTAL_PROGRESS_KEY);
      if (raw) {
        setProgress(JSON.parse(raw));
      }
    } catch {}
  }

  function isLevelUnlocked(levelIndex: number): boolean {
    if (levelIndex === 0) return true;
    const prev = progress[levelIndex - 1];
    return prev?.completed === true;
  }

  function renderStars(count: number) {
    const stars = [];
    for (let i = 0; i < 3; i++) {
      stars.push(
        <Text
          key={i}
          style={[
            styles.star,
            { color: i < count ? '#FFD700' : isDark ? '#5f6368' : '#d1d5db' },
          ]}
        >
          ★
        </Text>,
      );
    }
    return <View style={styles.starsRow}>{stars}</View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? TILE_COLORS.backgroundDark : TILE_COLORS.backgroundLight }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={20}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Image
            source={require('@/assets/games/mecky/mecky_main.png')}
            style={styles.headerMecky}
            resizeMode="contain"
          />
          <Text style={[styles.headerTitle, { color: isDark ? '#e8eaed' : '#1a1a2e' }]}>
            Mecky Portal
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[styles.subtitle, { color: isDark ? '#9aa0a6' : '#6b7280' }]}>
        Löse Rätsel mit Portalen!
      </Text>

      {/* Level Grid */}
      <ScrollView
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: TOTAL_LEVELS }).map((_, i) => {
          const unlocked = isLevelUnlocked(i);
          const levelProgress = progress[i];

          return (
            <Pressable
              key={i}
              style={[
                styles.levelCard,
                {
                  backgroundColor: unlocked
                    ? isDark ? '#2d2e31' : '#ffffff'
                    : isDark ? '#1f2023' : '#f0f0f0',
                  opacity: unlocked ? 1 : 0.5,
                },
              ]}
              onPress={() => unlocked && onSelectLevel(i)}
              disabled={!unlocked}
            >
              <Text
                style={[
                  styles.levelNumber,
                  { color: unlocked ? (isDark ? '#e8eaed' : '#1a1a2e') : (isDark ? '#5f6368' : '#9ca3af') },
                ]}
              >
                {unlocked ? `${i + 1}` : '🔒'}
              </Text>
              <Text
                style={[
                  styles.levelName,
                  { color: unlocked ? (isDark ? '#9aa0a6' : '#6b7280') : (isDark ? '#5f6368' : '#9ca3af') },
                ]}
                numberOfLines={1}
              >
                {getLevelName(i)}
              </Text>
              {levelProgress?.completed && renderStars(levelProgress.bestStars)}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  backArrow: {
    fontSize: 28,
    color: '#ffffff',
    width: 40,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMecky: {
    width: 40,
    height: 40,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  headerSpacer: {
    width: 40,
  },
  subtitle: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  levelCard: {
    width: '47%',
    borderRadius: borderRadius.lg,
    padding: 16,
    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  levelNumber: {
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
    marginBottom: 4,
  },
  levelName: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.medium,
    marginBottom: 6,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    fontSize: 18,
  },
});
