import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  runOnJS,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import {
  GAME_CONFIG,
  GAME_STATE,
  PLATFORM_COLORS,
  SPRING_COLOR,
} from '@/lib/games/mecky-jump-types';
import type { Platform, GameState } from '@/lib/games/mecky-jump-types';
import {
  getDeltaTime,
  applyGravity,
  updateMeckyPosition,
  checkPlatformCollision,
  updateCamera,
  isGameOver,
  updateMovingPlatforms,
  calculateScore,
} from '@/lib/games/mecky-jump-engine';
import {
  generateInitialPlatforms,
  generatePlatformsAbove,
  cleanupPlatforms,
} from '@/lib/games/mecky-jump-platforms';
import { StartOverlay, PlayingHUD, GameOverOverlay } from './MeckyJumpHUD';
import { useRouter } from 'expo-router';

const HIGH_SCORE_KEY = '@mecky_jump_high_score';

// ─── Platform Component ──────────────────────────────────────

type PlatformViewProps = {
  platform: Platform;
  cameraY: Animated.SharedValue<number>;
};

function PlatformView({ platform, cameraY }: PlatformViewProps) {
  const animStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      position: 'absolute',
      left: platform.x,
      top: platform.y - cameraY.value,
      width: platform.width,
      height: GAME_CONFIG.PLATFORM_HEIGHT,
      opacity: platform.broken ? 0 : 1,
    };
  });

  const color = PLATFORM_COLORS[platform.type];

  return (
    <Animated.View style={animStyle}>
      <View
        style={[
          styles.platform,
          {
            backgroundColor: color,
            width: platform.width,
            height: GAME_CONFIG.PLATFORM_HEIGHT,
          },
        ]}
      />
      {platform.type === 'spring' && (
        <View style={styles.springIndicator} />
      )}
    </Animated.View>
  );
}

// ─── Main Game Component ─────────────────────────────────────

export default function MeckyJumpGame() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  // Game state (React state for UI)
  const [gameState, setGameState] = useState<GameState>('idle');
  const [displayScore, setDisplayScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [platformsForRender, setPlatformsForRender] = useState<Platform[]>([]);

  // Shared values (UI thread)
  const meckyX = useSharedValue(screenWidth / 2);
  const meckyY = useSharedValue(screenHeight * 0.6);
  const meckyVelocityY = useSharedValue(0);
  const tiltX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const gameStateValue = useSharedValue<number>(GAME_STATE.IDLE);
  const startY = useSharedValue(screenHeight * 0.6);
  const highestY = useSharedValue(screenHeight * 0.6);
  const prevMeckyY = useSharedValue(screenHeight * 0.6);

  // Platform data (managed on JS thread, read from shared value)
  const platformsRef = useRef<Platform[]>([]);
  const highestPlatformYRef = useRef(0);
  const nextIdRef = useRef(0);
  const lastGenerationCameraY = useRef(0);

  // Accelerometer
  const accelSubscription = useRef<{ remove: () => void } | null>(null);
  const [hasAccelerometer, setHasAccelerometer] = useState(false);

  // ─── Load High Score ─────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(HIGH_SCORE_KEY).then(val => {
      if (val) setHighScore(parseInt(val, 10));
    });
  }, []);

  // ─── Accelerometer Setup ─────────────────────────────────

  useEffect(() => {
    let sub: { remove: () => void } | null = null;

    async function setup() {
      try {
        const { Accelerometer } = await import('expo-sensors');
        const available = await Accelerometer.isAvailableAsync();
        if (available) {
          setHasAccelerometer(true);
          Accelerometer.setUpdateInterval(16);
          sub = Accelerometer.addListener(({ x }) => {
            // Negate: iOS accelerometer x is inverted relative to screen
            tiltX.value = -x * GAME_CONFIG.HORIZONTAL_SPEED;
          });
          accelSubscription.current = sub;
        }
      } catch {
        // expo-sensors not available, use touch fallback
      }
    }

    setup();
    return () => {
      sub?.remove();
      accelSubscription.current = null;
    };
  }, [tiltX]);

  // ─── Touch Fallback Gesture ──────────────────────────────

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (!hasAccelerometer) {
        // Map touch position to horizontal velocity
        const normalizedX = (e.x / screenWidth - 0.5) * 2;
        tiltX.value = normalizedX * GAME_CONFIG.HORIZONTAL_SPEED;
      }
    })
    .onEnd(() => {
      if (!hasAccelerometer) {
        tiltX.value = 0;
      }
    });

  // ─── Initialize / Reset Game ─────────────────────────────

  const initGame = useCallback(() => {
    const initialY = screenHeight * 0.6;

    meckyX.value = screenWidth / 2;
    meckyY.value = initialY;
    meckyVelocityY.value = 0;
    prevMeckyY.value = initialY;
    cameraY.value = initialY - screenHeight * GAME_CONFIG.CAMERA_OFFSET_RATIO;
    startY.value = initialY;
    highestY.value = initialY;
    tiltX.value = 0;

    // Generate platforms
    const result = generateInitialPlatforms(screenWidth, screenHeight, initialY);
    platformsRef.current = result.platforms;
    highestPlatformYRef.current = result.highestY;
    nextIdRef.current = result.nextId;
    lastGenerationCameraY.current = cameraY.value;
    setPlatformsForRender([...result.platforms]);
  }, [screenWidth, screenHeight, meckyX, meckyY, meckyVelocityY, prevMeckyY, cameraY, startY, highestY, tiltX]);

  // Init on mount
  useEffect(() => {
    initGame();
  }, [initGame]);

  // ─── Start Game ──────────────────────────────────────────

  const handleStart = useCallback(() => {
    initGame();
    setDisplayScore(0);
    setIsNewHighScore(false);
    setGameState('playing');
    gameStateValue.value = GAME_STATE.PLAYING;
    // Give initial bounce
    meckyVelocityY.value = GAME_CONFIG.BOUNCE_VELOCITY;
  }, [initGame, gameStateValue, meckyVelocityY]);

  // ─── Game Over Handler ───────────────────────────────────

  const handleGameOver = useCallback(async (finalScore: number) => {
    setGameState('gameOver');
    setDisplayScore(finalScore);

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}

    // Check high score
    const stored = await AsyncStorage.getItem(HIGH_SCORE_KEY);
    const currentHigh = stored ? parseInt(stored, 10) : 0;

    if (finalScore > currentHigh) {
      await AsyncStorage.setItem(HIGH_SCORE_KEY, finalScore.toString());
      setHighScore(finalScore);
      setIsNewHighScore(true);
    }
  }, []);

  // ─── Platform Bounce Handler ─────────────────────────────

  const handleBounce = useCallback((isSpring: boolean) => {
    try {
      if (isSpring) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {}
  }, []);

  // ─── Sync Render Platforms ───────────────────────────────

  const syncPlatformsToRender = useCallback(() => {
    setPlatformsForRender([...platformsRef.current]);
  }, []);

  // ─── Score Update ────────────────────────────────────────

  const updateDisplayScore = useCallback((score: number) => {
    setDisplayScore(score);
  }, []);

  // ─── Game Loop ───────────────────────────────────────────

  useFrameCallback((frameInfo) => {
    'worklet';
    if (gameStateValue.value !== GAME_STATE.PLAYING) return;

    const dt = getDeltaTime(frameInfo.timeSincePreviousFrame);

    // 1. Store previous position for swept collision
    prevMeckyY.value = meckyY.value;

    // 2. Apply gravity
    meckyVelocityY.value = applyGravity(meckyVelocityY.value, dt);

    // 3. Apply horizontal movement from tilt
    const vx = tiltX.value;

    // 4. Update position
    const newPos = updateMeckyPosition(
      meckyX.value, meckyY.value, vx, meckyVelocityY.value, dt, screenWidth,
    );
    meckyX.value = newPos.x;
    meckyY.value = newPos.y;

    // 5. Collision detection
    const collision = checkPlatformCollision(
      meckyX.value, meckyY.value, prevMeckyY.value,
      meckyVelocityY.value, platformsRef.current,
    );

    if (collision.hit) {
      meckyVelocityY.value = collision.bounceVelocity;
      // Snap Mecky's feet to platform top
      const hitPlatform = platformsRef.current[collision.platformIndex];
      meckyY.value = hitPlatform.y - GAME_CONFIG.MECKY_HEIGHT / 2;

      if (collision.isBreaking) {
        platformsRef.current[collision.platformIndex] = {
          ...platformsRef.current[collision.platformIndex],
          broken: true,
        };
        runOnJS(syncPlatformsToRender)();
      }

      runOnJS(handleBounce)(hitPlatform.type === 'spring');
    }

    // 6. Update camera
    const newCameraY = updateCamera(cameraY.value, meckyY.value, screenHeight);
    cameraY.value = newCameraY;

    // 7. Update moving platforms
    platformsRef.current = updateMovingPlatforms(platformsRef.current, dt, screenWidth);

    // 8. Score
    if (meckyY.value < highestY.value) {
      highestY.value = meckyY.value;
    }
    const score = calculateScore(highestY.value, startY.value);
    runOnJS(updateDisplayScore)(score);

    // 9. Generate new platforms when camera moves significantly
    const genThreshold = lastGenerationCameraY.current - 200;
    if (newCameraY < genThreshold) {
      const gen = generatePlatformsAbove(
        newCameraY, screenWidth,
        highestPlatformYRef.current, score, nextIdRef.current,
      );
      if (gen.newPlatforms.length > 0) {
        platformsRef.current = [...platformsRef.current, ...gen.newPlatforms];
        highestPlatformYRef.current = gen.newHighestY;
        nextIdRef.current = gen.newNextId;
        lastGenerationCameraY.current = newCameraY;
      }

      // Cleanup old platforms
      platformsRef.current = cleanupPlatforms(platformsRef.current, newCameraY, screenHeight);
      runOnJS(syncPlatformsToRender)();
    }

    // 10. Periodic render sync (every ~10 frames for moving platforms)
    if (Math.random() < 0.1) {
      runOnJS(syncPlatformsToRender)();
    }

    // 11. Game over check
    if (isGameOver(meckyY.value, cameraY.value, screenHeight)) {
      gameStateValue.value = GAME_STATE.GAME_OVER;
      runOnJS(handleGameOver)(score);
    }
  });

  // ─── Mecky Animated Style ────────────────────────────────

  const meckyStyle = useAnimatedStyle(() => {
    'worklet';
    const scaleX = tiltX.value < -0.5 ? -1 : 1;
    return {
      position: 'absolute',
      width: GAME_CONFIG.MECKY_WIDTH,
      height: GAME_CONFIG.MECKY_HEIGHT,
      left: meckyX.value - GAME_CONFIG.MECKY_WIDTH / 2,
      top: meckyY.value - cameraY.value - GAME_CONFIG.MECKY_HEIGHT / 2,
      transform: [{ scaleX }],
    };
  });

  // ─── Background Color ────────────────────────────────────

  const bgColor = isDark ? '#1a1a2e' : '#87CEEB';

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        {/* Platforms */}
        {platformsForRender.map(platform => (
          <PlatformView
            key={platform.id}
            platform={platform}
            cameraY={cameraY}
          />
        ))}

        {/* Mecky */}
        <Animated.Image
          source={require('@/assets/games/mecky/mecky_main.png')}
          style={meckyStyle}
          resizeMode="contain"
        />

        {/* HUD */}
        {gameState === 'playing' && (
          <PlayingHUD
            score={displayScore}
            onClose={() => router.back()}
          />
        )}

        {/* Start Overlay */}
        {gameState === 'idle' && (
          <StartOverlay
            highScore={highScore}
            onStart={handleStart}
          />
        )}

        {/* Game Over Overlay */}
        {gameState === 'gameOver' && (
          <GameOverOverlay
            score={displayScore}
            highScore={highScore}
            isNewHighScore={isNewHighScore}
            onRestart={handleStart}
            onBack={() => router.back()}
          />
        )}
      </View>
    </GestureDetector>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  platform: {
    borderRadius: 6,
  },
  springIndicator: {
    position: 'absolute',
    top: -8,
    left: '50%',
    marginLeft: -6,
    width: 12,
    height: 10,
    backgroundColor: SPRING_COLOR,
    borderRadius: 3,
  },
});
