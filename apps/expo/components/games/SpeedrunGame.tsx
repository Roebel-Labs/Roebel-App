import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  runOnJS,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { fontFamily } from '@/constants/theme';
import {
  SPEEDRUN_CONFIG,
  TILE,
  GAME_STATE,
  SPEEDRUN_COLORS,
  type LevelStats,
  type VisibleTile,
  type SawBladeRender,
  type Particle,
} from '@/lib/games/speedrun-types';
import { LEVELS } from '@/lib/games/speedrun-levels';
import {
  getDeltaTime,
  updateHorizontalMovement,
  applyGravity,
  resolveCollisions,
  detectWall,
  checkSawBladeCollision,
  updateSawBladePositions,
  processJump,
  processDash,
  updateCamera,
  cornerCorrection,
} from '@/lib/games/speedrun-engine';
import {
  StartOverlay,
  LevelSelectOverlay,
  PlayingHUD,
  LevelCompleteOverlay,
} from './SpeedrunHUD';

const STATS_KEY = '@speedrun_level_stats';
const TS = SPEEDRUN_CONFIG.TILE_SIZE;

// ─── Tile Component ──────────────────────────────────────────

const TileView = React.memo(function TileView({
  col,
  row,
  type,
  cameraX,
  cameraY,
}: {
  col: number;
  row: number;
  type: number;
  cameraX: Animated.SharedValue<number>;
  cameraY: Animated.SharedValue<number>;
}) {
  const animStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      position: 'absolute' as const,
      left: col * TS - cameraX.value,
      top: row * TS - cameraY.value,
      width: TS,
      height: TS,
    };
  });

  let tileStyle;
  if (type === TILE.SOLID) {
    tileStyle = tileStyles.solid;
  } else if (type === TILE.CRUMBLE) {
    tileStyle = tileStyles.crumble;
  } else if (type === TILE.GOAL) {
    tileStyle = tileStyles.goal;
  } else if (type === TILE.CHECKPOINT) {
    tileStyle = tileStyles.checkpoint;
  } else if (
    type === TILE.SPIKE_UP ||
    type === TILE.SPIKE_DOWN ||
    type === TILE.SPIKE_LEFT ||
    type === TILE.SPIKE_RIGHT
  ) {
    tileStyle = tileStyles.spike;
  } else {
    return null;
  }

  // Spikes get triangle rotation
  let rotation = '0deg';
  if (type === TILE.SPIKE_DOWN) rotation = '180deg';
  else if (type === TILE.SPIKE_LEFT) rotation = '-90deg';
  else if (type === TILE.SPIKE_RIGHT) rotation = '90deg';

  const isSpike =
    type === TILE.SPIKE_UP ||
    type === TILE.SPIKE_DOWN ||
    type === TILE.SPIKE_LEFT ||
    type === TILE.SPIKE_RIGHT;

  return (
    <Animated.View style={animStyle}>
      {isSpike ? (
        <View
          style={[
            tileStyles.spikeContainer,
            { transform: [{ rotate: rotation }] },
          ]}
        >
          <View style={tileStyles.spikeTriangle} />
        </View>
      ) : (
        <View style={tileStyle} />
      )}
    </Animated.View>
  );
});

// ─── Saw Blade Component ─────────────────────────────────────

function SawBladeView({
  saw,
  cameraX,
  cameraY,
}: {
  saw: SawBladeRender;
  cameraX: Animated.SharedValue<number>;
  cameraY: Animated.SharedValue<number>;
}) {
  const animStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      position: 'absolute' as const,
      left: saw.x - saw.radius - cameraX.value,
      top: saw.y - saw.radius - cameraY.value,
      width: saw.radius * 2,
      height: saw.radius * 2,
      borderRadius: saw.radius,
      backgroundColor: SPEEDRUN_COLORS.sawBlade,
      borderWidth: 2,
      borderColor: SPEEDRUN_COLORS.sawBladeBorder,
      transform: [{ rotate: `${saw.rotation}deg` }],
    };
  });

  return <Animated.View style={animStyle} />;
}

// ─── Particle Component ──────────────────────────────────────

function ParticleView({
  particle,
  cameraX,
  cameraY,
}: {
  particle: Particle;
  cameraX: Animated.SharedValue<number>;
  cameraY: Animated.SharedValue<number>;
}) {
  const opacity = particle.life / particle.maxLife;
  const animStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      position: 'absolute' as const,
      left: particle.x - particle.size / 2 - cameraX.value,
      top: particle.y - particle.size / 2 - cameraY.value,
      width: particle.size,
      height: particle.size,
      borderRadius: particle.size / 2,
      backgroundColor: particle.color,
      opacity,
    };
  });

  return <Animated.View style={animStyle} />;
}

// ─── Main Game Component ─────────────────────────────────────

export default function SpeedrunGame() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ─── React State (UI) ──────────────────────────────────
  const [gameState, setGameState] = useState<
    'menu' | 'levelSelect' | 'playing' | 'levelComplete'
  >('menu');
  const [currentLevelId, setCurrentLevelId] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [deathCount, setDeathCount] = useState(0);
  const [levelStats, setLevelStats] = useState<Map<number, LevelStats>>(
    new Map(),
  );
  const [visibleTiles, setVisibleTiles] = useState<VisibleTile[]>([]);
  const [sawBladeRenderState, setSawBladeRenderState] = useState<
    SawBladeRender[]
  >([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [completionData, setCompletionData] = useState<{
    time: number;
    bestTime: number | null;
    isNewBest: boolean;
    medal: 'gold' | 'silver' | 'bronze' | null;
    deaths: number;
    levelName: string;
    hasNextLevel: boolean;
  } | null>(null);

  // ─── Shared Values (physics on UI thread) ──────────────
  const playerX = useSharedValue(0);
  const playerY = useSharedValue(0);
  const playerVX = useSharedValue(0);
  const playerVY = useSharedValue(0);
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const gameStateValue = useSharedValue<number>(GAME_STATE.MENU);
  const facingRight = useSharedValue(1);
  const isGrounded = useSharedValue(0);
  const coyoteTimer = useSharedValue(0);
  const jumpBufferTimer = useSharedValue(0);
  const dashAvailable = useSharedValue(1);
  const isDashing = useSharedValue(0);
  const dashTimer = useSharedValue(0);
  const isWallSliding = useSharedValue(0);
  const wallDirection = useSharedValue(0);
  const wallDetachTimer = useSharedValue(0);
  const deathFreezeTimer = useSharedValue(0);
  const elapsedTime = useSharedValue(0);
  const runTimer = useSharedValue(0);
  const shakeOffsetX = useSharedValue(0);
  const shakeOffsetY = useSharedValue(0);
  const jumpCutApplied = useSharedValue(0);

  // Input shared values
  const inputLeft = useSharedValue(0);
  const inputRight = useSharedValue(0);
  const inputJump = useSharedValue(0);
  const inputJumpFrame = useSharedValue(0);
  const inputDash = useSharedValue(0);

  // ─── Refs ──────────────────────────────────────────────
  const levelDataRef = useRef(LEVELS[0]);
  const crumbledTilesRef = useRef<string[]>([]);
  const activeCheckpointRef = useRef<{ x: number; y: number } | null>(null);
  const deathCountRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const nextParticleId = useRef(0);
  const frameCounter = useRef(0);

  // ─── Load Stats ────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STATS_KEY).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          const map = new Map<number, LevelStats>();
          Object.keys(parsed).forEach((key) => {
            map.set(parseInt(key, 10), parsed[key]);
          });
          setLevelStats(map);
        } catch {}
      }
    });
  }, []);

  const saveStats = useCallback(
    async (levelId: number, stats: LevelStats) => {
      const newMap = new Map(levelStats);
      newMap.set(levelId, stats);
      setLevelStats(newMap);
      const obj: Record<string, LevelStats> = {};
      newMap.forEach((v, k) => {
        obj[k.toString()] = v;
      });
      await AsyncStorage.setItem(STATS_KEY, JSON.stringify(obj));
    },
    [levelStats],
  );

  // ─── Visible Tiles Computation ─────────────────────────

  const syncVisibleTiles = useCallback(
    (camXVal: number, camYVal: number) => {
      const grid = levelDataRef.current.grid;
      const gridH = grid.length;
      const gridW = grid[0]?.length ?? 0;
      const startCol = Math.max(0, Math.floor(camXVal / TS) - 1);
      const endCol = Math.min(gridW, Math.ceil((camXVal + screenWidth) / TS) + 1);
      const startRow = Math.max(0, Math.floor(camYVal / TS) - 1);
      const endRow = Math.min(gridH, Math.ceil((camYVal + screenHeight) / TS) + 1);

      const tiles: VisibleTile[] = [];
      const crumbled = crumbledTilesRef.current;
      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const type = grid[row][col];
          if (type !== TILE.EMPTY && type !== TILE.SPAWN) {
            const key = `${col}-${row}`;
            if (type === TILE.CRUMBLE && crumbled.includes(key)) continue;
            tiles.push({ col, row, type, key });
          }
        }
      }
      setVisibleTiles(tiles);
    },
    [screenWidth, screenHeight],
  );

  // ─── Particle System ──────────────────────────────────

  const emitParticles = useCallback(
    (
      x: number,
      y: number,
      count: number,
      color: string,
      speed: number,
      size: number,
      life: number,
    ) => {
      const newParticles: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.5 + Math.random() * 0.5);
        newParticles.push({
          id: nextParticleId.current++,
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - speed * 0.3,
          life,
          maxLife: life,
          size: size * (0.5 + Math.random() * 0.5),
          color,
        });
      }
      particlesRef.current = [...particlesRef.current, ...newParticles];
    },
    [],
  );

  const updateParticles = useCallback(
    (dt: number) => {
      const living: Particle[] = [];
      for (const p of particlesRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 200 * dt; // particle gravity
        p.life -= dt;
        if (p.life > 0) living.push(p);
      }
      particlesRef.current = living;
      setParticles([...living]);
    },
    [],
  );

  // ─── Initialize Level ──────────────────────────────────

  const initLevel = useCallback(
    (levelId: number) => {
      const level = LEVELS[levelId];
      levelDataRef.current = level;
      setCurrentLevelId(levelId);

      const spawnPxX = (level.spawnX + 0.5) * TS;
      const spawnPxY = (level.spawnY + 0.5) * TS;

      playerX.value = spawnPxX;
      playerY.value = spawnPxY;
      playerVX.value = 0;
      playerVY.value = 0;
      facingRight.value = 1;
      isGrounded.value = 0;
      coyoteTimer.value = 0;
      jumpBufferTimer.value = 0;
      dashAvailable.value = 1;
      isDashing.value = 0;
      dashTimer.value = 0;
      isWallSliding.value = 0;
      wallDirection.value = 0;
      wallDetachTimer.value = 0;
      deathFreezeTimer.value = 0;
      elapsedTime.value = 0;
      runTimer.value = 0;
      jumpCutApplied.value = 0;
      shakeOffsetX.value = 0;
      shakeOffsetY.value = 0;
      inputLeft.value = 0;
      inputRight.value = 0;
      inputJump.value = 0;
      inputJumpFrame.value = 0;
      inputDash.value = 0;

      crumbledTilesRef.current = [];
      activeCheckpointRef.current = null;
      deathCountRef.current = 0;
      particlesRef.current = [];
      frameCounter.current = 0;
      setDeathCount(0);
      setDisplayTime(0);
      setParticles([]);

      // Center camera on spawn
      const levelPxW = (level.grid[0]?.length ?? 0) * TS;
      const levelPxH = level.grid.length * TS;
      cameraX.value = Math.max(
        0,
        Math.min(spawnPxX - screenWidth / 2, levelPxW - screenWidth),
      );
      cameraY.value = Math.max(
        0,
        Math.min(spawnPxY - screenHeight * 0.45, levelPxH - screenHeight),
      );

      syncVisibleTiles(cameraX.value, cameraY.value);
    },
    [
      screenWidth,
      screenHeight,
      playerX,
      playerY,
      playerVX,
      playerVY,
      cameraX,
      cameraY,
      facingRight,
      isGrounded,
      coyoteTimer,
      jumpBufferTimer,
      dashAvailable,
      isDashing,
      dashTimer,
      isWallSliding,
      wallDirection,
      wallDetachTimer,
      deathFreezeTimer,
      elapsedTime,
      runTimer,
      jumpCutApplied,
      shakeOffsetX,
      shakeOffsetY,
      inputLeft,
      inputRight,
      inputJump,
      inputJumpFrame,
      inputDash,
      syncVisibleTiles,
    ],
  );

  // ─── Death Handler ─────────────────────────────────────

  const handleDeath = useCallback(() => {
    deathCountRef.current += 1;
    setDeathCount(deathCountRef.current);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}

    // Emit death particles at player position
    emitParticles(
      playerX.value,
      playerY.value,
      12,
      SPEEDRUN_COLORS.deathParticle,
      150,
      4,
      0.5,
    );

    // Respawn
    const respawn = activeCheckpointRef.current ?? {
      x: levelDataRef.current.spawnX,
      y: levelDataRef.current.spawnY,
    };
    playerX.value = (respawn.x + 0.5) * TS;
    playerY.value = (respawn.y + 0.5) * TS;
    playerVX.value = 0;
    playerVY.value = 0;
    dashAvailable.value = 1;
    isDashing.value = 0;
    dashTimer.value = 0;
    isWallSliding.value = 0;
    wallDirection.value = 0;
    wallDetachTimer.value = 0;
    coyoteTimer.value = 0;
    jumpBufferTimer.value = 0;
    jumpCutApplied.value = 0;

    // Restore crumbled tiles
    crumbledTilesRef.current = [];
  }, [
    emitParticles,
    playerX,
    playerY,
    playerVX,
    playerVY,
    dashAvailable,
    isDashing,
    dashTimer,
    isWallSliding,
    wallDirection,
    wallDetachTimer,
    coyoteTimer,
    jumpBufferTimer,
    jumpCutApplied,
  ]);

  // ─── Level Complete Handler ────────────────────────────

  const handleLevelComplete = useCallback(
    async (timeMs: number) => {
      gameStateValue.value = GAME_STATE.LEVEL_COMPLETE;
      setGameState('levelComplete');

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      const level = levelDataRef.current;
      const timeSec = timeMs / 1000;
      let medal: 'gold' | 'silver' | 'bronze' | null = null;
      if (timeSec <= level.medalTimes.gold) medal = 'gold';
      else if (timeSec <= level.medalTimes.silver) medal = 'silver';
      else if (timeSec <= level.medalTimes.bronze) medal = 'bronze';

      const existing = levelStats.get(level.id);
      const isNewBest = existing?.bestTime == null || timeMs < existing.bestTime;
      const bestTime = isNewBest ? timeMs : existing?.bestTime ?? null;
      const bestMedal =
        isNewBest || !existing?.medal
          ? medal
          : medalRank(medal) > medalRank(existing.medal)
            ? medal
            : existing.medal;

      const stats: LevelStats = {
        bestTime,
        deaths: deathCountRef.current,
        medal: bestMedal,
      };
      await saveStats(level.id, stats);

      setCompletionData({
        time: timeMs,
        bestTime: existing?.bestTime ?? null,
        isNewBest,
        medal,
        deaths: deathCountRef.current,
        levelName: level.name,
        hasNextLevel: level.id + 1 < LEVELS.length,
      });
    },
    [gameStateValue, levelStats, saveStats],
  );

  // ─── Checkpoint Handler ────────────────────────────────

  const handleCheckpoint = useCallback((cpX: number, cpY: number) => {
    const current = activeCheckpointRef.current;
    if (current && current.x === cpX && current.y === cpY) return;
    activeCheckpointRef.current = { x: cpX, y: cpY };
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, []);

  // ─── Time Display Update ───────────────────────────────

  const updateDisplayTime = useCallback((ms: number) => {
    setDisplayTime(ms);
  }, []);

  // ─── Crumble Tile Handler ──────────────────────────────

  const handleCrumble = useCallback((col: number, row: number) => {
    const key = `${col}-${row}`;
    if (!crumbledTilesRef.current.includes(key)) {
      // Delay crumble
      setTimeout(() => {
        crumbledTilesRef.current = [...crumbledTilesRef.current, key];
      }, SPEEDRUN_CONFIG.CRUMBLE_DELAY * 1000);
    }
  }, []);

  // ─── Game Loop ─────────────────────────────────────────

  useFrameCallback((frameInfo) => {
    'worklet';
    if (gameStateValue.value !== GAME_STATE.PLAYING) return;

    const dt = getDeltaTime(frameInfo.timeSincePreviousFrame);

    // Death freeze
    if (deathFreezeTimer.value > 0) {
      deathFreezeTimer.value -= dt;
      if (deathFreezeTimer.value <= 0) {
        runOnJS(handleDeath)();
      }
      return;
    }

    // Update timers
    elapsedTime.value += dt;
    runTimer.value += dt;
    coyoteTimer.value = Math.max(0, coyoteTimer.value - dt);
    jumpBufferTimer.value = Math.max(0, jumpBufferTimer.value - dt);
    wallDetachTimer.value = Math.max(0, wallDetachTimer.value - dt);

    // Read input
    const inX =
      (inputRight.value > 0 ? 1 : 0) - (inputLeft.value > 0 ? 1 : 0);
    const jumpPressed = inputJumpFrame.value === 1;
    const jumpHeld = inputJump.value === 1;
    const dashPressed = inputDash.value === 1;
    inputJumpFrame.value = 0;
    inputDash.value = 0;

    // Facing direction
    if (inX !== 0 && wallDetachTimer.value <= 0) {
      facingRight.value = inX > 0 ? 1 : 0;
    }

    // Buffer jump
    if (jumpPressed) {
      jumpBufferTimer.value = SPEEDRUN_CONFIG.JUMP_BUFFER_TIME;
      jumpCutApplied.value = 0;
    }

    // Horizontal movement
    playerVX.value = updateHorizontalMovement(
      playerVX.value,
      inX,
      isGrounded.value === 1,
      isDashing.value === 1,
      dt,
    );

    // Gravity
    playerVY.value = applyGravity(
      playerVY.value,
      isDashing.value === 1,
      isWallSliding.value === 1,
      dt,
    );

    // Jump processing
    const jumpResult = processJump(
      playerVY.value,
      playerVX.value,
      isGrounded.value === 1,
      coyoteTimer.value,
      jumpBufferTimer.value,
      jumpPressed,
      jumpHeld,
      isWallSliding.value === 1,
      wallDirection.value,
      wallDetachTimer.value,
      jumpCutApplied.value === 1,
    );
    playerVY.value = jumpResult.vy;
    playerVX.value = jumpResult.vx;
    coyoteTimer.value = jumpResult.coyoteTimer;
    jumpBufferTimer.value = jumpResult.jumpBufferTimer;
    wallDetachTimer.value = jumpResult.wallDetachTimer;

    // Track jump cut
    if (!jumpHeld && playerVY.value < 0 && jumpCutApplied.value === 0) {
      jumpCutApplied.value = 1;
    }
    if (jumpResult.jumped) {
      jumpCutApplied.value = 0;
    }

    // Dash processing
    const dashResult = processDash(
      playerVX.value,
      playerVY.value,
      dashAvailable.value === 1,
      isDashing.value === 1,
      dashTimer.value,
      dashPressed,
      facingRight.value === 1,
      dt,
    );
    playerVX.value = dashResult.vx;
    playerVY.value = dashResult.vy;
    dashAvailable.value = dashResult.dashAvailable ? 1 : 0;
    isDashing.value = dashResult.isDashing ? 1 : 0;
    dashTimer.value = dashResult.dashTimer;

    // Apply velocity
    playerX.value += playerVX.value * dt;
    playerY.value += playerVY.value * dt;

    // Corner correction
    const grid = levelDataRef.current.grid;
    const gridW = grid[0]?.length ?? 0;
    const gridH = grid.length;
    const crumbled = crumbledTilesRef.current;

    const cc = cornerCorrection(
      playerX.value,
      playerY.value,
      playerVY.value,
      grid,
      gridW,
      gridH,
      crumbled,
    );
    playerX.value = cc.x;

    // Collision resolution
    const collision = resolveCollisions(
      playerX.value,
      playerY.value,
      playerVX.value,
      playerVY.value,
      grid,
      gridW,
      gridH,
      crumbled,
    );
    playerX.value = collision.x;
    playerY.value = collision.y;
    playerVX.value = collision.vx;
    playerVY.value = collision.vy;

    // Grounded state + coyote time
    const wasGrounded = isGrounded.value === 1;
    isGrounded.value = collision.isGrounded ? 1 : 0;
    if (wasGrounded && !collision.isGrounded) {
      coyoteTimer.value = SPEEDRUN_CONFIG.COYOTE_TIME;
    }
    if (collision.isGrounded) {
      dashAvailable.value = 1;
      jumpCutApplied.value = 0;
    }

    // Wall detection for wall sliding
    const wd = detectWall(
      playerX.value,
      playerY.value,
      grid,
      gridW,
      gridH,
      crumbled,
    );
    const sliding =
      wd !== 0 && !collision.isGrounded && playerVY.value > 0 ? 1 : 0;
    isWallSliding.value = sliding;
    wallDirection.value = sliding ? wd : 0;

    // Saw blade collision
    const sawPositions = updateSawBladePositions(
      levelDataRef.current.sawBlades,
      elapsedTime.value,
    );
    const hitSaw = checkSawBladeCollision(
      playerX.value,
      playerY.value,
      sawPositions,
    );

    // Hazard check
    if (collision.hitHazard || hitSaw) {
      deathFreezeTimer.value = SPEEDRUN_CONFIG.DEATH_FREEZE_FRAMES / 60;
      shakeOffsetX.value = withSequence(
        withTiming(SPEEDRUN_CONFIG.SCREEN_SHAKE_INTENSITY, { duration: 30 }),
        withTiming(-SPEEDRUN_CONFIG.SCREEN_SHAKE_INTENSITY, { duration: 30 }),
        withTiming(0, { duration: 40 }),
      );
      shakeOffsetY.value = withSequence(
        withTiming(-SPEEDRUN_CONFIG.SCREEN_SHAKE_INTENSITY / 2, {
          duration: 25,
        }),
        withTiming(SPEEDRUN_CONFIG.SCREEN_SHAKE_INTENSITY / 2, {
          duration: 25,
        }),
        withTiming(0, { duration: 35 }),
      );
      return;
    }

    // Goal check
    if (collision.hitGoal) {
      const timeMs = Math.round(runTimer.value * 1000);
      gameStateValue.value = GAME_STATE.LEVEL_COMPLETE;
      runOnJS(handleLevelComplete)(timeMs);
      return;
    }

    // Checkpoint
    if (collision.hitCheckpointX >= 0) {
      runOnJS(handleCheckpoint)(
        collision.hitCheckpointX,
        collision.hitCheckpointY,
      );
    }

    // Crumble tiles
    for (let i = 0; i < collision.crumbleCols.length; i++) {
      runOnJS(handleCrumble)(collision.crumbleCols[i], collision.crumbleRows[i]);
    }

    // Camera
    const levelPxW = gridW * TS;
    const levelPxH = gridH * TS;
    const cam = updateCamera(
      cameraX.value,
      cameraY.value,
      playerX.value,
      playerY.value,
      collision.isGrounded,
      facingRight.value === 1,
      levelPxW,
      levelPxH,
      screenWidth,
      screenHeight,
      dt,
    );
    cameraX.value = cam.camX;
    cameraY.value = cam.camY;

    // Sync render state
    runOnJS(updateDisplayTime)(Math.round(runTimer.value * 1000));

    // Sync tiles + saw blades every ~3 frames
    if (frameCounter.current % 3 === 0) {
      runOnJS(syncVisibleTiles)(cam.camX, cam.camY);
      if (sawPositions.length > 0) {
        runOnJS(setSawBladeRenderState)(
          sawPositions.map((s) => ({
            x: s.x,
            y: s.y,
            radius: s.radius,
            rotation: s.rotation,
          })),
        );
      }
    }

    // Update particles every ~2 frames
    if (frameCounter.current % 2 === 0) {
      runOnJS(updateParticles)(dt * 2);
    }

    frameCounter.current++;
  });

  // ─── Player Animated Style ─────────────────────────────

  const playerStyle = useAnimatedStyle(() => {
    'worklet';
    const scaleX = facingRight.value === 1 ? 1 : -1;

    // Squash & stretch
    let scaleYMod = 1;
    let scaleXMod = 1;
    if (isGrounded.value === 1 && Math.abs(playerVY.value) < 10) {
      // Subtle landing squash
      scaleYMod = 0.92;
      scaleXMod = 1.08;
    } else if (playerVY.value < -200) {
      // Jumping stretch
      scaleYMod = 1.1;
      scaleXMod = 0.92;
    }

    // Dash visual
    const dashAlpha = isDashing.value === 1 ? 0.8 : 1;

    return {
      position: 'absolute' as const,
      width: SPEEDRUN_CONFIG.PLAYER_WIDTH,
      height: SPEEDRUN_CONFIG.PLAYER_HEIGHT,
      left:
        playerX.value - SPEEDRUN_CONFIG.PLAYER_WIDTH / 2 - cameraX.value,
      top:
        playerY.value - SPEEDRUN_CONFIG.PLAYER_HEIGHT / 2 - cameraY.value,
      transform: [
        { scaleX: scaleX * scaleXMod },
        { scaleY: scaleYMod },
      ],
      opacity: dashAlpha,
    };
  });

  // ─── Screen Shake Style ────────────────────────────────

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shakeOffsetX.value },
      { translateY: shakeOffsetY.value },
    ],
  }));

  // ─── Action Handlers ───────────────────────────────────

  const handleStartGame = useCallback(() => {
    initLevel(0);
    setGameState('playing');
    gameStateValue.value = GAME_STATE.PLAYING;
  }, [initLevel, gameStateValue]);

  const handleLevelSelect = useCallback(() => {
    setGameState('levelSelect');
  }, []);

  const handleSelectLevel = useCallback(
    (levelId: number) => {
      initLevel(levelId);
      setGameState('playing');
      gameStateValue.value = GAME_STATE.PLAYING;
    },
    [initLevel, gameStateValue],
  );

  const handleRestart = useCallback(() => {
    initLevel(currentLevelId);
    setGameState('playing');
    gameStateValue.value = GAME_STATE.PLAYING;
  }, [initLevel, currentLevelId, gameStateValue]);

  const handleNextLevel = useCallback(() => {
    const nextId = currentLevelId + 1;
    if (nextId < LEVELS.length) {
      initLevel(nextId);
      setGameState('playing');
      gameStateValue.value = GAME_STATE.PLAYING;
    }
  }, [initLevel, currentLevelId, gameStateValue]);

  const handlePause = useCallback(() => {
    router.back();
  }, [router]);

  const handleBackFromLevelSelect = useCallback(() => {
    setGameState('menu');
  }, []);

  const handleLevelSelectFromComplete = useCallback(() => {
    setGameState('levelSelect');
  }, []);

  // ─── Background Color ──────────────────────────────────

  const bgColor = isDark
    ? SPEEDRUN_COLORS.backgroundDark
    : SPEEDRUN_COLORS.backgroundLight;

  // ─── Control button press state ────────────────────────

  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  const [jumpPressed, setJumpPressed] = useState(false);
  const [dashPressedState, setDashPressedState] = useState(false);

  // ─── Render ────────────────────────────────────────────

  const currentLevel = LEVELS[currentLevelId];

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Animated.View style={[styles.gameArea, shakeStyle]}>
        {/* Tiles */}
        {visibleTiles.map((tile) => (
          <TileView
            key={tile.key}
            col={tile.col}
            row={tile.row}
            type={tile.type}
            cameraX={cameraX}
            cameraY={cameraY}
          />
        ))}

        {/* Saw Blades */}
        {sawBladeRenderState.map((saw, i) => (
          <SawBladeView
            key={`saw-${i}`}
            saw={saw}
            cameraX={cameraX}
            cameraY={cameraY}
          />
        ))}

        {/* Particles */}
        {particles.map((p) => (
          <ParticleView
            key={p.id}
            particle={p}
            cameraX={cameraX}
            cameraY={cameraY}
          />
        ))}

        {/* Mecky */}
        <Animated.Image
          source={require('@/assets/games/mecky/mecky_main.png')}
          style={playerStyle}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Visual Baseline + Touch Controls (landscape layout) */}
      {gameState === 'playing' && (
        <>
          {/* Baseline divider */}
          <View
            style={[
              styles.baseline,
              { bottom: SPEEDRUN_CONFIG.CONTROL_BAR_HEIGHT + insets.bottom },
            ]}
          />

          {/* Controls bar */}
          <View
            style={[
              styles.controlsContainer,
              {
                height: SPEEDRUN_CONFIG.CONTROL_BAR_HEIGHT + insets.bottom,
                paddingBottom: insets.bottom,
                paddingLeft: insets.left + 12,
                paddingRight: insets.right + 12,
              },
            ]}
          >
            {/* D-pad left side */}
            <View style={styles.dpadGroup}>
              <Pressable
                style={[
                  styles.controlBtn,
                  styles.controlBtnLeft,
                  {
                    backgroundColor: leftPressed
                      ? SPEEDRUN_COLORS.controlButtonPressed
                      : SPEEDRUN_COLORS.controlButton,
                  },
                ]}
                onPressIn={() => {
                  inputLeft.value = 1;
                  setLeftPressed(true);
                }}
                onPressOut={() => {
                  inputLeft.value = 0;
                  setLeftPressed(false);
                }}
              >
                <Text style={styles.controlLabel}>◀</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.controlBtn,
                  styles.controlBtnRight,
                  {
                    backgroundColor: rightPressed
                      ? SPEEDRUN_COLORS.controlButtonPressed
                      : SPEEDRUN_COLORS.controlButton,
                  },
                ]}
                onPressIn={() => {
                  inputRight.value = 1;
                  setRightPressed(true);
                }}
                onPressOut={() => {
                  inputRight.value = 0;
                  setRightPressed(false);
                }}
              >
                <Text style={styles.controlLabel}>▶</Text>
              </Pressable>
            </View>

            {/* Action buttons right side */}
            <View style={styles.actionGroup}>
              <Pressable
                style={[
                  styles.controlBtn,
                  styles.controlBtnDash,
                  {
                    backgroundColor: dashPressedState
                      ? SPEEDRUN_COLORS.controlButtonPressed
                      : SPEEDRUN_COLORS.controlButton,
                  },
                ]}
                onPressIn={() => {
                  inputDash.value = 1;
                  setDashPressedState(true);
                }}
                onPressOut={() => {
                  inputDash.value = 0;
                  setDashPressedState(false);
                }}
              >
                <Text style={styles.controlLabelSmall}>DASH</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.controlBtn,
                  styles.controlBtnJump,
                  {
                    backgroundColor: jumpPressed
                      ? SPEEDRUN_COLORS.controlButtonPressed
                      : SPEEDRUN_COLORS.controlButton,
                  },
                ]}
                onPressIn={() => {
                  inputJump.value = 1;
                  inputJumpFrame.value = 1;
                  setJumpPressed(true);
                }}
                onPressOut={() => {
                  inputJump.value = 0;
                  setJumpPressed(false);
                }}
              >
                <Text style={styles.controlLabel}>▲</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {/* HUD */}
      {gameState === 'playing' && (
        <PlayingHUD
          time={displayTime}
          deaths={deathCount}
          levelName={currentLevel?.name ?? ''}
          onPause={handlePause}
        />
      )}

      {/* Start Overlay */}
      {gameState === 'menu' && (
        <StartOverlay
          onStart={handleStartGame}
          onLevelSelect={handleLevelSelect}
        />
      )}

      {/* Level Select */}
      {gameState === 'levelSelect' && (
        <LevelSelectOverlay
          levelStats={levelStats}
          onSelectLevel={handleSelectLevel}
          onBack={handleBackFromLevelSelect}
        />
      )}

      {/* Level Complete */}
      {gameState === 'levelComplete' && completionData && (
        <LevelCompleteOverlay
          time={completionData.time}
          bestTime={completionData.bestTime}
          isNewBest={completionData.isNewBest}
          medal={completionData.medal}
          deaths={completionData.deaths}
          levelName={completionData.levelName}
          hasNextLevel={completionData.hasNextLevel}
          onRestart={handleRestart}
          onNextLevel={handleNextLevel}
          onLevelSelect={handleLevelSelectFromComplete}
        />
      )}
    </View>
  );
}

// ─── Helper ──────────────────────────────────────────────────

function medalRank(medal: 'gold' | 'silver' | 'bronze' | null): number {
  if (medal === 'gold') return 3;
  if (medal === 'silver') return 2;
  if (medal === 'bronze') return 1;
  return 0;
}

// ─── Tile Styles ─────────────────────────────────────────────

const tileStyles = StyleSheet.create({
  solid: {
    flex: 1,
    backgroundColor: SPEEDRUN_COLORS.solid,
    borderWidth: 1,
    borderColor: SPEEDRUN_COLORS.solidBorder,
    borderRadius: 2,
  },
  crumble: {
    flex: 1,
    backgroundColor: SPEEDRUN_COLORS.crumble,
    borderWidth: 1,
    borderColor: SPEEDRUN_COLORS.crumbleBreaking,
    borderRadius: 2,
    borderStyle: 'dashed',
  },
  goal: {
    flex: 1,
    backgroundColor: SPEEDRUN_COLORS.goal,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: SPEEDRUN_COLORS.goalGlow,
  },
  checkpoint: {
    flex: 1,
    backgroundColor: SPEEDRUN_COLORS.checkpoint,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: SPEEDRUN_COLORS.checkpointActive,
  },
  spike: {
    flex: 1,
  },
  spikeContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  spikeTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: TS / 2 - 4,
    borderRightWidth: TS / 2 - 4,
    borderBottomWidth: TS - 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: SPEEDRUN_COLORS.spike,
  },
});

// ─── Main Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  gameArea: {
    flex: 1,
  },
  // Baseline divider
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SPEEDRUN_CONFIG.BASELINE_HEIGHT,
    backgroundColor: SPEEDRUN_COLORS.baseline,
    zIndex: 35,
  },
  // Controls (landscape: row layout, D-pad left, actions right)
  controlsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 30,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dpadGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  controlBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  controlBtnLeft: {
    width: 80,
    height: 60,
  },
  controlBtnRight: {
    width: 80,
    height: 60,
  },
  controlBtnDash: {
    width: 80,
    height: 60,
  },
  controlBtnJump: {
    width: 100,
    height: 60,
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 26,
    fontFamily: fontFamily.semiBold,
  },
  controlLabelSmall: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 2,
  },
});
