import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily, fontSize, borderRadius, spacing } from '@/constants/theme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  SlideInDown,
} from 'react-native-reanimated';
import { LEVELS } from '@/lib/games/speedrun-levels';
import {
  SPEEDRUN_COLORS,
  type LevelData,
  type LevelStats,
} from '@/lib/games/speedrun-types';

// ─── Helpers ─────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds % 1) * 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function getMedalEmoji(medal: 'gold' | 'silver' | 'bronze' | null): string {
  if (medal === 'gold') return '🥇';
  if (medal === 'silver') return '🥈';
  if (medal === 'bronze') return '🥉';
  return '';
}

function getMedalColor(medal: 'gold' | 'silver' | 'bronze' | null): string {
  if (medal === 'gold') return SPEEDRUN_COLORS.medalGold;
  if (medal === 'silver') return SPEEDRUN_COLORS.medalSilver;
  if (medal === 'bronze') return SPEEDRUN_COLORS.medalBronze;
  return 'transparent';
}

// ─── Start Overlay ───────────────────────────────────────────

type StartOverlayProps = {
  onStart: () => void;
  onLevelSelect: () => void;
};

export function StartOverlay({ onStart, onLevelSelect }: StartOverlayProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const bounceY = useSharedValue(0);
  const subtitleOpacity = useSharedValue(1);

  useEffect(() => {
    bounceY.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    subtitleOpacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
      true,
    );
  }, [bounceY, subtitleOpacity]);

  const meckyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  return (
    <Pressable style={styles.overlay} onPress={onStart}>
      <View style={[styles.overlayContent, { paddingTop: insets.top + 60 }]}>
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 12 }]}
          onPress={() => router.back()}
          hitSlop={20}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>

        <Animated.View style={meckyStyle}>
          <Image
            source={require('@/assets/games/mecky/mecky_main.png')}
            style={styles.meckyLarge}
            resizeMode="contain"
          />
        </Animated.View>

        <Text style={styles.title}>Mecky Speedrun</Text>

        <Animated.Text
          style={[styles.subtitle, { color: 'rgba(255,255,255,0.8)' }, subtitleStyle]}
        >
          Tippe zum Starten
        </Animated.Text>

        <TouchableOpacity
          style={[styles.levelSelectButton, { borderColor: 'rgba(255,255,255,0.4)' }]}
          onPress={(e) => {
            e.stopPropagation();
            onLevelSelect();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.levelSelectButtonText}>Level auswählen</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

// ─── Level Select Overlay ────────────────────────────────────

type LevelSelectOverlayProps = {
  levelStats: Map<number, LevelStats>;
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
};

export function LevelSelectOverlay({
  levelStats,
  onSelectLevel,
  onBack,
}: LevelSelectOverlayProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const isLevelUnlocked = (levelId: number): boolean => {
    if (levelId === 0) return true;
    const prevStats = levelStats.get(levelId - 1);
    return prevStats?.bestTime != null;
  };

  return (
    <View style={styles.overlay}>
      <View style={[styles.levelSelectContainer, { paddingTop: insets.top + 20 }]}>
        <View style={styles.levelSelectHeader}>
          <TouchableOpacity onPress={onBack} hitSlop={20}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.levelSelectTitle}>Level auswählen</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.levelList}
          contentContainerStyle={styles.levelListContent}
          showsVerticalScrollIndicator={false}
        >
          {LEVELS.map((level) => {
            const stats = levelStats.get(level.id);
            const unlocked = isLevelUnlocked(level.id);

            return (
              <Pressable
                key={level.id}
                style={[
                  styles.levelCard,
                  { opacity: unlocked ? 1 : 0.4 },
                ]}
                onPress={() => unlocked && onSelectLevel(level.id)}
                disabled={!unlocked}
              >
                <View style={styles.levelCardLeft}>
                  <Text style={styles.levelNumber}>{level.id + 1}</Text>
                </View>
                <View style={styles.levelCardCenter}>
                  <Text style={styles.levelCardName}>{level.name}</Text>
                  {stats?.bestTime != null ? (
                    <Text style={styles.levelCardTime}>
                      {getMedalEmoji(stats.medal)} {formatTime(stats.bestTime)}
                    </Text>
                  ) : unlocked ? (
                    <Text style={styles.levelCardTime}>Noch nicht gespielt</Text>
                  ) : (
                    <Text style={styles.levelCardTime}>Gesperrt</Text>
                  )}
                </View>
                <View style={styles.levelCardRight}>
                  {stats?.medal && (
                    <View
                      style={[
                        styles.medalDot,
                        { backgroundColor: getMedalColor(stats.medal) },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Playing HUD ─────────────────────────────────────────────

type PlayingHUDProps = {
  time: number;
  deaths: number;
  levelName: string;
  onPause: () => void;
};

export function PlayingHUD({ time, deaths, levelName, onPause }: PlayingHUDProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.hudContainer, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <View>
        <Text style={styles.timerText}>{formatTime(time)}</Text>
        <Text style={styles.levelNameText}>{levelName}</Text>
      </View>
      <View style={styles.hudRight}>
        {deaths > 0 && (
          <Text style={styles.deathCounter}>💀 {deaths}</Text>
        )}
        <TouchableOpacity
          onPress={onPause}
          hitSlop={20}
          style={styles.hudCloseButton}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Level Complete Overlay ──────────────────────────────────

type LevelCompleteOverlayProps = {
  time: number;
  bestTime: number | null;
  isNewBest: boolean;
  medal: 'gold' | 'silver' | 'bronze' | null;
  deaths: number;
  levelName: string;
  hasNextLevel: boolean;
  onRestart: () => void;
  onNextLevel: () => void;
  onLevelSelect: () => void;
};

export function LevelCompleteOverlay({
  time,
  bestTime,
  isNewBest,
  medal,
  deaths,
  levelName,
  hasNextLevel,
  onRestart,
  onNextLevel,
  onLevelSelect,
}: LevelCompleteOverlayProps) {
  const { colors } = useTheme();

  const badgeScale = useSharedValue(0);

  useEffect(() => {
    if (isNewBest) {
      badgeScale.value = withSpring(1, { damping: 8, stiffness: 150 });
    }
  }, [isNewBest, badgeScale]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  return (
    <Animated.View
      entering={SlideInDown.duration(400).springify().damping(15)}
      style={styles.overlay}
    >
      <View style={styles.completeCard}>
        <Text style={styles.completeTitle}>Level geschafft!</Text>
        <Text style={styles.completeLevelName}>{levelName}</Text>

        <View style={styles.completeTimeRow}>
          {medal && (
            <Text style={styles.completeMedal}>{getMedalEmoji(medal)}</Text>
          )}
          <Text style={styles.completeTime}>{formatTime(time)}</Text>
        </View>

        {isNewBest && (
          <Animated.View style={[styles.newRecordBadge, badgeStyle]}>
            <Text style={styles.newRecordText}>Neuer Rekord!</Text>
          </Animated.View>
        )}

        {!isNewBest && bestTime != null && (
          <Text style={styles.previousBest}>
            Bestzeit: {formatTime(bestTime)}
          </Text>
        )}

        {deaths > 0 && (
          <Text style={styles.deathStat}>💀 {deaths} Tode</Text>
        )}

        <View style={styles.completeButtons}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={onRestart}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              Nochmal
            </Text>
          </TouchableOpacity>

          {hasNextLevel && (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: SPEEDRUN_COLORS.goal }]}
              onPress={onNextLevel}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Nächstes Level</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onLevelSelect} style={styles.backButton}>
            <Text style={styles.backButtonText}>Level auswählen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  overlayContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  meckyLarge: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.regular,
    marginBottom: 24,
  },
  levelSelectButton: {
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  levelSelectButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  // Level Select
  levelSelectContainer: {
    flex: 1,
    width: '100%',
  },
  levelSelectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backArrow: {
    color: '#ffffff',
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
  },
  levelSelectTitle: {
    color: '#ffffff',
    fontSize: fontSize['2xl'],
    fontFamily: fontFamily.semiBold,
  },
  levelList: {
    flex: 1,
  },
  levelListContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.lg,
    padding: 16,
    marginBottom: 10,
  },
  levelCardLeft: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  levelNumber: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
  },
  levelCardCenter: {
    flex: 1,
  },
  levelCardName: {
    color: '#ffffff',
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    marginBottom: 2,
  },
  levelCardTime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.sm,
    fontFamily: fontFamily.regular,
  },
  levelCardRight: {
    width: 20,
    alignItems: 'center',
  },
  medalDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  // Playing HUD
  hudContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    zIndex: 50,
  },
  timerText: {
    fontSize: 24,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  levelNameText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  hudRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deathCounter: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    color: '#FC8181',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hudCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Level Complete
  completeCard: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  completeTitle: {
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    marginBottom: 4,
  },
  completeLevelName: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 24,
  },
  completeTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  completeMedal: {
    fontSize: 36,
    marginRight: 8,
  },
  completeTime: {
    fontSize: 48,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    lineHeight: 56,
  },
  newRecordBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: 16,
  },
  newRecordText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
  },
  previousBest: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
  },
  deathStat: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 20,
  },
  completeButtons: {
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.lg,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    color: '#ffffff',
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: fontSize.base,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    color: 'rgba(255,255,255,0.7)',
  },
});
