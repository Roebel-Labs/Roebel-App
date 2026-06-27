import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily, fontSize, borderRadius } from '@/constants/theme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  SlideInDown,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { TILE_COLORS } from '@/lib/games/mecky-portal-types';

// ─── Level Info Bar ──────────────────────────────────────────

type LevelInfoBarProps = {
  levelNumber: number;
  levelName: string;
  keysCollected: number;
  keysTotal: number;
  deaths: number;
  onPause: () => void;
};

export function LevelInfoBar({
  levelNumber,
  levelName,
  keysCollected,
  keysTotal,
  deaths,
  onPause,
}: LevelInfoBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.infoBar, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.infoLeft}>
        <Text style={styles.infoLevelText}>Lv. {levelNumber}</Text>
        <View style={styles.keyBadge}>
          <Text style={styles.keyIcon}>🔑</Text>
          <Text style={styles.keyText}>
            {keysCollected}/{keysTotal}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={onPause} hitSlop={20} style={styles.pauseButton}>
        <Text style={styles.pauseIcon}>⏸</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Control Pad ─────────────────────────────────────────────

type ControlPadProps = {
  onLeftPress: () => void;
  onLeftRelease: () => void;
  onRightPress: () => void;
  onRightRelease: () => void;
  onJump: () => void;
  onPortal: () => void;
  portalActive: boolean;
};

export function ControlPad({
  onLeftPress,
  onLeftRelease,
  onRightPress,
  onRightRelease,
  onJump,
  onPortal,
  portalActive,
}: ControlPadProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.controlPad, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
      {/* Left side: Direction buttons */}
      <View style={styles.dpadRow}>
        <Pressable
          style={styles.dpadButton}
          onPressIn={onLeftPress}
          onPressOut={onLeftRelease}
        >
          <Text style={styles.dpadText}>◀</Text>
        </Pressable>
        <Pressable
          style={styles.dpadButton}
          onPressIn={onRightPress}
          onPressOut={onRightRelease}
        >
          <Text style={styles.dpadText}>▶</Text>
        </Pressable>
      </View>

      {/* Right side: Action buttons */}
      <View style={styles.actionButtons}>
        <Pressable
          style={[
            styles.portalButton,
            {
              backgroundColor: portalActive
                ? TILE_COLORS.portal
                : TILE_COLORS.portalInactive,
              borderColor: TILE_COLORS.portal,
            },
          ]}
          onPress={onPortal}
        >
          <Text style={styles.portalIcon}>◉</Text>
        </Pressable>
        <Pressable style={styles.jumpButton} onPressIn={onJump}>
          <Text style={styles.jumpText}>▲</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Death Overlay ───────────────────────────────────────────

type DeathOverlayProps = {
  onContinue: () => void;
};

export function DeathOverlay({ onContinue }: DeathOverlayProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.deathOverlay}
    >
      <Pressable style={styles.deathContent} onPress={onContinue}>
        <Text style={styles.deathIcon}>💀</Text>
        <Text style={styles.deathText}>Erwischt!</Text>
        <Text style={styles.deathSubtext}>Tippe zum Weiterspielen</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Level Complete Overlay ──────────────────────────────────

type LevelCompleteOverlayProps = {
  levelNumber: number;
  deaths: number;
  stars: number;
  isLastLevel: boolean;
  onNextLevel: () => void;
  onLevelSelect: () => void;
};

export function LevelCompleteOverlay({
  levelNumber,
  deaths,
  stars,
  isLastLevel,
  onNextLevel,
  onLevelSelect,
}: LevelCompleteOverlayProps) {
  const { colors } = useTheme();

  // Star animations
  const star1 = useSharedValue(0);
  const star2 = useSharedValue(0);
  const star3 = useSharedValue(0);

  useEffect(() => {
    star1.value = withSpring(stars >= 1 ? 1 : 0, { damping: 8, stiffness: 150 });
    setTimeout(() => {
      star2.value = withSpring(stars >= 2 ? 1 : 0, { damping: 8, stiffness: 150 });
    }, 200);
    setTimeout(() => {
      star3.value = withSpring(stars >= 3 ? 1 : 0, { damping: 8, stiffness: 150 });
    }, 400);
  }, [stars, star1, star2, star3]);

  const starStyle1 = useAnimatedStyle(() => ({ transform: [{ scale: star1.value }] }));
  const starStyle2 = useAnimatedStyle(() => ({ transform: [{ scale: star2.value }] }));
  const starStyle3 = useAnimatedStyle(() => ({ transform: [{ scale: star3.value }] }));

  return (
    <Animated.View
      entering={SlideInDown.duration(400).springify().damping(15)}
      style={styles.overlay}
    >
      <View style={styles.completeCard}>
        <Text style={styles.completeTitle}>Level {levelNumber} geschafft!</Text>

        <View style={styles.starsContainer}>
          <Animated.Text style={[styles.completeStar, starStyle1]}>⭐</Animated.Text>
          <Animated.Text style={[styles.completeStar, starStyle2]}>⭐</Animated.Text>
          <Animated.Text style={[styles.completeStar, starStyle3]}>⭐</Animated.Text>
        </View>

        {deaths > 0 && (
          <Text style={styles.deathCount}>
            {deaths} {deaths === 1 ? 'Tod' : 'Tode'}
          </Text>
        )}

        {!isLastLevel && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={onNextLevel}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              Nächstes Level
            </Text>
          </TouchableOpacity>
        )}

        {isLastLevel && (
          <View style={styles.allCompleteContainer}>
            <Text style={styles.allCompleteText}>Alle Level geschafft! 🎉</Text>
          </View>
        )}

        <TouchableOpacity onPress={onLevelSelect} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Level-Auswahl</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Pause Overlay ───────────────────────────────────────────

type PauseOverlayProps = {
  onResume: () => void;
  onLevelSelect: () => void;
};

export function PauseOverlay({ onResume, onLevelSelect }: PauseOverlayProps) {
  const { colors } = useTheme();

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.overlay}>
      <View style={styles.pauseCard}>
        <Text style={styles.pauseTitle}>Pause</Text>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={onResume}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            Fortsetzen
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onLevelSelect} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Level-Auswahl</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Level Info Bar
  infoBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 50,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoLevelText: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  keyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  keyIcon: {
    fontSize: 14,
  },
  keyText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semiBold,
    color: '#FFD700',
  },
  pauseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIcon: {
    fontSize: 16,
  },

  // Control Pad
  controlPad: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    zIndex: 50,
  },
  dpadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dpadButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: TILE_COLORS.controlBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadText: {
    fontSize: 24,
    color: '#ffffff',
  },
  actionButtons: {
    alignItems: 'center',
    gap: 10,
  },
  portalButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  portalIcon: {
    fontSize: 24,
    color: '#ffffff',
  },
  jumpButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: TILE_COLORS.controlBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jumpText: {
    fontSize: 24,
    color: '#ffffff',
  },

  // Death Overlay
  deathOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(180, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  deathContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deathIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  deathText: {
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    marginBottom: 8,
  },
  deathSubtext: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.8)',
  },

  // Level Complete & Pause overlays
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  completeCard: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  completeTitle: {
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    marginBottom: 24,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  completeStar: {
    fontSize: 42,
  },
  deathCount: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 24,
  },
  allCompleteContainer: {
    marginBottom: 16,
  },
  allCompleteText: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.semiBold,
    color: '#FFD700',
    textAlign: 'center',
  },
  primaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    marginBottom: 16,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.lg,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  secondaryButton: {
    paddingVertical: 8,
  },
  secondaryButtonText: {
    fontSize: fontSize.base,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    color: 'rgba(255,255,255,0.7)',
  },
  pauseCard: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  pauseTitle: {
    fontSize: 32,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    marginBottom: 32,
  },
});
