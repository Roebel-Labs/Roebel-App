import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily, fontSize, borderRadius, spacing } from '@/constants/theme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import type { GameState } from '@/lib/games/mecky-jump-types';

// ─── Start Overlay ───────────────────────────────────────────

type StartOverlayProps = {
  highScore: number;
  onStart: () => void;
};

export function StartOverlay({ highScore, onStart }: StartOverlayProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Idle bounce animation for Mecky
  const bounceY = useSharedValue(0);
  // Pulsing subtitle
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
        {/* Close button */}
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

        <Text style={[styles.title, { color: '#ffffff' }]}>Mecky Jump</Text>

        <Animated.Text style={[styles.subtitle, { color: 'rgba(255,255,255,0.8)' }, subtitleStyle]}>
          Tippe zum Starten
        </Animated.Text>

        {highScore > 0 && (
          <Text style={[styles.highScoreText, { color: 'rgba(255,255,255,0.6)' }]}>
            Highscore: {highScore}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Playing HUD ─────────────────────────────────────────────

type PlayingHUDProps = {
  score: number;
  onClose: () => void;
};

export function PlayingHUD({ score, onClose }: PlayingHUDProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.hudContainer, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Text style={styles.scoreText}>{score}</Text>
      <TouchableOpacity onPress={onClose} hitSlop={20} style={styles.hudCloseButton}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Game Over Overlay ───────────────────────────────────────

type GameOverOverlayProps = {
  score: number;
  highScore: number;
  isNewHighScore: boolean;
  onRestart: () => void;
  onBack: () => void;
};

export function GameOverOverlay({
  score,
  highScore,
  isNewHighScore,
  onRestart,
  onBack,
}: GameOverOverlayProps) {
  const { colors } = useTheme();

  // New high score badge bounce
  const badgeScale = useSharedValue(0);

  useEffect(() => {
    if (isNewHighScore) {
      badgeScale.value = withSpring(1, { damping: 8, stiffness: 150 });
    }
  }, [isNewHighScore, badgeScale]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  return (
    <Animated.View
      entering={SlideInDown.duration(400).springify().damping(15)}
      style={styles.overlay}
    >
      <View style={styles.gameOverCard}>
        <Text style={styles.gameOverTitle}>Spiel vorbei</Text>

        <Text style={styles.finalScore}>{score}</Text>
        <Text style={styles.finalScoreLabel}>Punkte</Text>

        {isNewHighScore && (
          <Animated.View style={[styles.highScoreBadge, badgeStyle]}>
            <Text style={styles.highScoreBadgeText}>Neuer Highscore!</Text>
          </Animated.View>
        )}

        {!isNewHighScore && highScore > 0 && (
          <Text style={styles.previousHighScore}>Highscore: {highScore}</Text>
        )}

        <TouchableOpacity
          style={[styles.restartButton, { backgroundColor: colors.primary }]}
          onPress={onRestart}
          activeOpacity={0.8}
        >
          <Text style={[styles.restartButtonText, { color: colors.onPrimary }]}>
            Nochmal spielen
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: 'rgba(255,255,255,0.7)' }]}>
            Zurück
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    fontFamily: fontFamily.semiBold,
  },
  meckyLarge: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontFamily: fontFamily.semiBold,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.regular,
    marginBottom: 16,
  },
  highScoreText: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    marginTop: 8,
  },
  // Playing HUD
  hudContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 50,
  },
  scoreText: {
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hudCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Game Over
  gameOverCard: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  gameOverTitle: {
    fontSize: 28,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    marginBottom: 24,
  },
  finalScore: {
    fontSize: 64,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
    lineHeight: 72,
  },
  finalScoreLabel: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
  highScoreBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: 20,
  },
  highScoreBadgeText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semiBold,
    color: '#ffffff',
  },
  previousHighScore: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 20,
  },
  restartButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    marginBottom: 16,
    minWidth: 200,
    alignItems: 'center',
  },
  restartButtonText: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: fontSize.base,
    fontFamily: fontFamily.medium,
  },
});
