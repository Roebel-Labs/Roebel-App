import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  runOnJS,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import {
  PORTAL_CONFIG,
  TILE,
  TILE_COLORS,
  PORTAL_PROGRESS_KEY,
  getStarRating,
} from '@/lib/games/mecky-portal-types';
import type {
  LevelData,
  KeyItem,
  Enemy,
  PortalState,
  GamePhase,
  LevelProgress,
} from '@/lib/games/mecky-portal-types';
import {
  getDeltaTime,
  applyGravity,
  resolveTileCollision,
  checkHazards,
  checkKeyCollection,
  checkDoorReached,
  updateEnemies,
  updateCamera,
} from '@/lib/games/mecky-portal-engine';
import { parseLevelData, TOTAL_LEVELS } from '@/lib/games/mecky-portal-levels';
import {
  LevelInfoBar,
  ControlPad,
  DeathOverlay,
  LevelCompleteOverlay,
  PauseOverlay,
} from './MeckyPortalHUD';
import MeckyPortalLevelSelect from './MeckyPortalLevelSelect';

const CFG = PORTAL_CONFIG;

// ─── Tile Renderer ───────────────────────────────────────────

type TileViewProps = {
  type: number;
  x: number;
  y: number;
  allKeysCollected: boolean;
};

function TileView({ type, x, y, allKeysCollected }: TileViewProps) {
  if (type === TILE.WALL) {
    return (
      <View
        style={[
          styles.tile,
          {
            left: x,
            top: y,
            width: CFG.TILE_SIZE,
            height: CFG.TILE_SIZE,
            backgroundColor: TILE_COLORS.wall,
            borderWidth: 1,
            borderColor: TILE_COLORS.wallEdge,
          },
        ]}
      />
    );
  }

  if (type === TILE.SPIKE) {
    return (
      <View
        style={[
          styles.tile,
          {
            left: x,
            top: y,
            width: CFG.TILE_SIZE,
            height: CFG.TILE_SIZE,
            justifyContent: 'flex-end',
            alignItems: 'center',
          },
        ]}
      >
        {/* Triangle spike using border trick */}
        <View style={styles.spikeTriangle} />
      </View>
    );
  }

  if (type === TILE.DOOR) {
    return (
      <View
        style={[
          styles.tile,
          {
            left: x,
            top: y,
            width: CFG.TILE_SIZE,
            height: CFG.TILE_SIZE,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
      >
        <View
          style={[
            styles.door,
            {
              backgroundColor: allKeysCollected
                ? TILE_COLORS.doorOpen
                : TILE_COLORS.doorLocked,
              borderColor: TILE_COLORS.doorFrame,
            },
          ]}
        />
      </View>
    );
  }

  return null;
}

// ─── Key Renderer ────────────────────────────────────────────

type KeyViewProps = {
  keyItem: KeyItem;
  offsetX: number;
  offsetY: number;
};

function KeyView({ keyItem, offsetX, offsetY }: KeyViewProps) {
  if (keyItem.collected) return null;

  const x = keyItem.tileX * CFG.TILE_SIZE + CFG.TILE_SIZE / 2 - CFG.KEY_SIZE / 2 + offsetX;
  const y = keyItem.tileY * CFG.TILE_SIZE + CFG.TILE_SIZE / 2 - CFG.KEY_SIZE / 2 + offsetY;

  return (
    <View
      style={[
        styles.key,
        {
          left: x,
          top: y,
          width: CFG.KEY_SIZE,
          height: CFG.KEY_SIZE,
        },
      ]}
    />
  );
}

// ─── Enemy Renderer ──────────────────────────────────────────

type EnemyViewProps = {
  enemy: Enemy;
  offsetX: number;
  offsetY: number;
};

function EnemyView({ enemy, offsetX, offsetY }: EnemyViewProps) {
  const size = CFG.ENEMY_SIZE;
  return (
    <View
      style={[
        styles.enemy,
        {
          left: enemy.x - size / 2 + offsetX,
          top: enemy.y - size / 2 + offsetY,
          width: size,
          height: size,
        },
      ]}
    >
      {/* Eyes */}
      <View style={styles.enemyEyeContainer}>
        <View style={styles.enemyEye} />
        <View style={styles.enemyEye} />
      </View>
    </View>
  );
}

// ─── Portal Marker Renderer ─────────────────────────────────

type PortalMarkerProps = {
  portal: PortalState;
  cameraX: Animated.SharedValue<number>;
  cameraY: Animated.SharedValue<number>;
  pulseAnim: Animated.SharedValue<number>;
};

function PortalMarker({ portal, cameraX, cameraY, pulseAnim }: PortalMarkerProps) {
  const r = CFG.PORTAL_RADIUS;
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: portal.x - r - cameraX.value,
    top: portal.y - r - cameraY.value,
    width: r * 2,
    height: r * 2,
    borderRadius: r,
    backgroundColor: TILE_COLORS.portal,
    opacity: portal.active ? 0.4 + pulseAnim.value * 0.3 : 0,
    transform: [{ scale: 0.9 + pulseAnim.value * 0.2 }],
  }));

  return <Animated.View style={style} />;
}

// ─── Main Game Component ─────────────────────────────────────

export default function MeckyPortalGame() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { isDark } = useTheme();
  const router = useRouter();

  // ── Game phase ──
  const [phase, setPhase] = useState<GamePhase>('levelSelect');
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // ── Game state ──
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [portal, setPortal] = useState<PortalState>({ active: false, x: 0, y: 0 });
  const [deaths, setDeaths] = useState(0);
  const [keysCollected, setKeysCollected] = useState(0);
  const [stars, setStars] = useState(0);

  // ── Shared values for 60fps game loop ──
  const playerX = useSharedValue(0);
  const playerY = useSharedValue(0);
  const playerVx = useSharedValue(0);
  const playerVy = useSharedValue(0);
  const isGrounded = useSharedValue(0); // 0 = false, 1 = true
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const gameActive = useSharedValue(0); // 0 = inactive, 1 = active

  // ── Input state ──
  const moveDir = useSharedValue(0); // -1 = left, 0 = none, 1 = right
  const jumpRequested = useSharedValue(0); // 0 = no, 1 = yes
  const facingDir = useSharedValue(1); // 1 = right, -1 = left

  // ── Data refs (for worklet access) ──
  const levelRef = useRef<LevelData | null>(null);
  const keysRef = useRef<KeyItem[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const deathsRef = useRef(0);

  // ── Portal pulse animation ──
  const portalPulse = useSharedValue(0);

  useEffect(() => {
    portalPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0, { duration: 800 }),
      ),
      -1,
      true,
    );
  }, [portalPulse]);

  // ─── Start Level ───────────────────────────────────────────

  const startLevel = useCallback((levelIndex: number) => {
    const data = parseLevelData(levelIndex);
    setLevelData(data);
    setCurrentLevelIndex(levelIndex);
    setKeys(data.keys.map(k => ({ ...k, collected: false })));
    setEnemies([...data.enemies]);
    setPortal({ active: false, x: 0, y: 0 });
    setDeaths(0);
    deathsRef.current = 0;
    setKeysCollected(0);
    setIsPaused(false);

    levelRef.current = data;
    keysRef.current = data.keys.map(k => ({ ...k, collected: false }));
    enemiesRef.current = [...data.enemies];

    // Set player position (center of spawn tile)
    const spawnPxX = data.spawnX * CFG.TILE_SIZE + CFG.TILE_SIZE / 2;
    const spawnPxY = data.spawnY * CFG.TILE_SIZE + CFG.TILE_SIZE / 2;
    playerX.value = spawnPxX;
    playerY.value = spawnPxY;
    playerVx.value = 0;
    playerVy.value = 0;
    isGrounded.value = 0;

    // Center camera on player
    const levelW = data.cols * CFG.TILE_SIZE;
    const levelH = data.rows * CFG.TILE_SIZE;
    cameraX.value = Math.max(0, Math.min(spawnPxX - screenWidth / 2, levelW - screenWidth));
    cameraY.value = Math.max(0, Math.min(spawnPxY - screenHeight / 2, levelH - screenHeight));

    moveDir.value = 0;
    facingDir.value = 1;
    jumpRequested.value = 0;

    setPhase('playing');
    gameActive.value = 1;
  }, [screenWidth, screenHeight, playerX, playerY, playerVx, playerVy, isGrounded, cameraX, cameraY, gameActive, moveDir, facingDir]);

  // ─── Respawn ───────────────────────────────────────────────

  const respawn = useCallback(() => {
    if (!levelRef.current) return;
    const data = levelRef.current;

    const spawnPxX = data.spawnX * CFG.TILE_SIZE + CFG.TILE_SIZE / 2;
    const spawnPxY = data.spawnY * CFG.TILE_SIZE + CFG.TILE_SIZE / 2;
    playerX.value = spawnPxX;
    playerY.value = spawnPxY;
    playerVx.value = 0;
    playerVy.value = 0;
    isGrounded.value = 0;

    // Reset keys
    const resetKeys = keysRef.current.map(k => ({ ...k, collected: false }));
    keysRef.current = resetKeys;
    setKeys(resetKeys);
    setKeysCollected(0);

    // Reset enemies
    if (data.enemies.length > 0) {
      const resetEnemies = [...data.enemies];
      enemiesRef.current = resetEnemies;
      setEnemies(resetEnemies);
    }

    // Reset portal
    setPortal({ active: false, x: 0, y: 0 });

    moveDir.value = 0;
    facingDir.value = 1;
    jumpRequested.value = 0;

    setPhase('playing');
    gameActive.value = 1;
  }, [playerX, playerY, playerVx, playerVy, isGrounded, gameActive, moveDir, facingDir]);

  // ─── Die ───────────────────────────────────────────────────

  const handleDeath = useCallback(() => {
    gameActive.value = 0;
    setPhase('dead');
    deathsRef.current += 1;
    setDeaths(deathsRef.current);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  }, [gameActive]);

  // ─── Key Collected ─────────────────────────────────────────

  const handleKeyCollected = useCallback(() => {
    setKeysCollected(c => c + 1);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }, []);

  // ─── Level Complete ────────────────────────────────────────

  const handleLevelComplete = useCallback(async (deathCount: number) => {
    gameActive.value = 0;
    const rating = getStarRating(deathCount);
    setStars(rating);
    setPhase('levelComplete');

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    // Save progress
    try {
      const raw = await AsyncStorage.getItem(PORTAL_PROGRESS_KEY);
      const progress: Record<number, LevelProgress> = raw ? JSON.parse(raw) : {};
      const existing = progress[currentLevelIndex];

      if (!existing || rating > existing.bestStars) {
        progress[currentLevelIndex] = {
          completed: true,
          bestStars: Math.max(rating, existing?.bestStars ?? 0),
          bestDeaths: existing ? Math.min(deathCount, existing.bestDeaths) : deathCount,
        };
      } else {
        progress[currentLevelIndex] = {
          ...existing,
          completed: true,
        };
      }

      await AsyncStorage.setItem(PORTAL_PROGRESS_KEY, JSON.stringify(progress));
    } catch {}
  }, [gameActive, currentLevelIndex]);

  // ─── Sync State ────────────────────────────────────────────

  const syncEnemies = useCallback((updatedEnemies: Enemy[]) => {
    enemiesRef.current = updatedEnemies;
    setEnemies([...updatedEnemies]);
  }, []);

  const syncKeys = useCallback((updatedKeys: KeyItem[]) => {
    keysRef.current = updatedKeys;
    setKeys([...updatedKeys]);
  }, []);

  // ─── Portal Action ─────────────────────────────────────────

  const handlePortal = useCallback(() => {
    if (phase !== 'playing') return;

    if (portal.active) {
      // Teleport to portal
      playerX.value = portal.x;
      playerY.value = portal.y;
      playerVy.value = 0;
      setPortal({ active: false, x: 0, y: 0 });
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch {}
    } else {
      // Place portal at current position
      setPortal({ active: true, x: playerX.value, y: playerY.value });
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
  }, [phase, portal, playerX, playerY, playerVy]);

  // ─── Game Loop ─────────────────────────────────────────────

  useFrameCallback((frameInfo) => {
    'worklet';
    if (gameActive.value !== 1) return;

    const level = levelRef.current;
    if (!level) return;

    const dt = getDeltaTime(frameInfo.timeSincePreviousFrame);

    // 1. Read input
    const md = moveDir.value;
    const vx = md * CFG.MOVE_SPEED;
    if (md !== 0) {
      facingDir.value = md;
    }

    // 2. Jump
    if (jumpRequested.value === 1 && isGrounded.value === 1) {
      playerVy.value = CFG.JUMP_VELOCITY;
      isGrounded.value = 0;
      jumpRequested.value = 0;
    } else {
      jumpRequested.value = 0;
    }

    // 3. Gravity
    playerVy.value = applyGravity(playerVy.value, dt);

    // 4. Tile collision
    const col = resolveTileCollision(
      playerX.value,
      playerY.value,
      vx,
      playerVy.value,
      dt,
      level.grid,
      level.cols,
      level.rows,
    );

    playerX.value = col.x;
    playerY.value = col.y;
    playerVx.value = col.vx;
    playerVy.value = col.vy;
    isGrounded.value = col.grounded ? 1 : 0;

    // 5. Hazard check
    const dead = checkHazards(
      playerX.value,
      playerY.value,
      level.grid,
      level.cols,
      level.rows,
      enemiesRef.current,
    );
    if (dead) {
      runOnJS(handleDeath)();
      return;
    }

    // 6. Update enemies
    const updatedEnemies = updateEnemies(
      enemiesRef.current,
      dt,
      level.grid,
      level.cols,
      level.rows,
    );
    // Sync enemies to render periodically
    if (Math.random() < 0.15) {
      runOnJS(syncEnemies)(updatedEnemies);
    } else {
      enemiesRef.current = updatedEnemies;
    }

    // 7. Key collection
    const keyResult = checkKeyCollection(
      playerX.value,
      playerY.value,
      keysRef.current,
    );
    if (keyResult.collected) {
      keysRef.current = keyResult.keys;
      runOnJS(syncKeys)(keyResult.keys);
      runOnJS(handleKeyCollected)();
    }

    // 8. Door check
    const totalKeys = keysRef.current.length;
    const collectedKeys = keysRef.current.filter(k => k.collected).length;
    const allCollected = collectedKeys === totalKeys;

    if (checkDoorReached(playerX.value, playerY.value, level.doorX, level.doorY, allCollected)) {
      runOnJS(handleLevelComplete)(deathsRef.current);
      return;
    }

    // 9. Camera
    const levelW = level.cols * CFG.TILE_SIZE;
    const levelH = level.rows * CFG.TILE_SIZE;
    const cam = updateCamera(
      cameraX.value,
      cameraY.value,
      playerX.value,
      playerY.value,
      screenWidth,
      screenHeight,
      levelW,
      levelH,
      CFG.CAMERA_LERP,
    );
    cameraX.value = cam.x;
    cameraY.value = cam.y;
  });


  // ─── Mecky Animated Style ──────────────────────────────────

  const meckyStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      position: 'absolute',
      width: CFG.MECKY_WIDTH,
      height: CFG.MECKY_HEIGHT,
      left: playerX.value - CFG.MECKY_WIDTH / 2 - cameraX.value,
      top: playerY.value - CFG.MECKY_HEIGHT / 2 - cameraY.value,
      transform: [{ scaleX: facingDir.value < 0 ? -1 : 1 }],
    };
  });

  // ─── Render ────────────────────────────────────────────────

  // Level select phase
  if (phase === 'levelSelect') {
    return <MeckyPortalLevelSelect onSelectLevel={startLevel} />;
  }

  // Game phases
  if (!levelData) return null;

  const bgColor = isDark ? TILE_COLORS.backgroundDark : TILE_COLORS.backgroundLight;
  const allKeysCollected = keysCollected === levelData.keys.length;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Tile Grid */}
      <TileGridRenderer
        grid={levelData.grid}
        rows={levelData.rows}
        cols={levelData.cols}
        cameraX={cameraX}
        cameraY={cameraY}
        allKeysCollected={allKeysCollected}
      />

      {/* Keys */}
      <KeysRenderer
        keys={keys}
        cameraX={cameraX}
        cameraY={cameraY}
      />

      {/* Enemies */}
      <EnemiesRenderer
        enemies={enemies}
        cameraX={cameraX}
        cameraY={cameraY}
      />

      {/* Portal Marker */}
      <PortalMarker
        portal={portal}
        cameraX={cameraX}
        cameraY={cameraY}
        pulseAnim={portalPulse}
      />

      {/* Mecky */}
      <Animated.Image
        source={require('@/assets/games/mecky/mecky_main.png')}
        style={meckyStyle}
        resizeMode="contain"
      />

      {/* HUD - Level Info */}
      {phase === 'playing' && (
        <LevelInfoBar
          levelNumber={currentLevelIndex + 1}
          levelName={levelData.name}
          keysCollected={keysCollected}
          keysTotal={levelData.keys.length}
          deaths={deaths}
          onPause={() => {
            gameActive.value = 0;
            setIsPaused(true);
          }}
        />
      )}

      {/* Controls */}
      {phase === 'playing' && !isPaused && (
        <ControlPad
          onLeftPress={() => { moveDir.value = -1; }}
          onLeftRelease={() => { if (moveDir.value === -1) moveDir.value = 0; }}
          onRightPress={() => { moveDir.value = 1; }}
          onRightRelease={() => { if (moveDir.value === 1) moveDir.value = 0; }}
          onJump={() => { jumpRequested.value = 1; }}
          onPortal={handlePortal}
          portalActive={portal.active}
        />
      )}

      {/* Death Overlay */}
      {phase === 'dead' && (
        <DeathOverlay onContinue={respawn} />
      )}

      {/* Level Complete */}
      {phase === 'levelComplete' && (
        <LevelCompleteOverlay
          levelNumber={currentLevelIndex + 1}
          deaths={deaths}
          stars={stars}
          isLastLevel={currentLevelIndex >= TOTAL_LEVELS - 1}
          onNextLevel={() => startLevel(currentLevelIndex + 1)}
          onLevelSelect={() => setPhase('levelSelect')}
        />
      )}

      {/* Pause */}
      {isPaused && phase === 'playing' && (
        <PauseOverlay
          onResume={() => {
            setIsPaused(false);
            gameActive.value = 1;
          }}
          onLevelSelect={() => {
            setIsPaused(false);
            setPhase('levelSelect');
          }}
        />
      )}
    </View>
  );
}

// ─── Animated Tile Grid Renderer ─────────────────────────────

type TileGridRendererProps = {
  grid: number[][];
  rows: number;
  cols: number;
  cameraX: Animated.SharedValue<number>;
  cameraY: Animated.SharedValue<number>;
  allKeysCollected: boolean;
};

function TileGridRenderer({ grid, rows, cols, cameraX, cameraY, allKeysCollected }: TileGridRendererProps) {
  const containerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: -cameraX.value,
    top: -cameraY.value,
    width: cols * CFG.TILE_SIZE,
    height: rows * CFG.TILE_SIZE,
  }));

  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const type = grid[r][c];
      if (type === TILE.WALL || type === TILE.SPIKE || type === TILE.DOOR) {
        tiles.push(
          <TileView
            key={`${r}-${c}`}
            type={type}
            x={c * CFG.TILE_SIZE}
            y={r * CFG.TILE_SIZE}
            allKeysCollected={allKeysCollected}
          />,
        );
      }
    }
  }

  return <Animated.View style={containerStyle}>{tiles}</Animated.View>;
}

// ─── Animated Keys Renderer ──────────────────────────────────

type KeysRendererProps = {
  keys: KeyItem[];
  cameraX: Animated.SharedValue<number>;
  cameraY: Animated.SharedValue<number>;
};

function KeysRenderer({ keys, cameraX, cameraY }: KeysRendererProps) {
  const containerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: -cameraX.value,
    top: -cameraY.value,
  }));

  return (
    <Animated.View style={containerStyle}>
      {keys.map(k => (
        <KeyView key={k.id} keyItem={k} offsetX={0} offsetY={0} />
      ))}
    </Animated.View>
  );
}

// ─── Animated Enemies Renderer ───────────────────────────────

type EnemiesRendererProps = {
  enemies: Enemy[];
  cameraX: Animated.SharedValue<number>;
  cameraY: Animated.SharedValue<number>;
};

function EnemiesRenderer({ enemies, cameraX, cameraY }: EnemiesRendererProps) {
  const containerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: -cameraX.value,
    top: -cameraY.value,
  }));

  return (
    <Animated.View style={containerStyle}>
      {enemies.map(e => (
        <EnemyView key={e.id} enemy={e} offsetX={0} offsetY={0} />
      ))}
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  tile: {
    position: 'absolute',
  },
  spikeTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: CFG.TILE_SIZE / 2,
    borderRightWidth: CFG.TILE_SIZE / 2,
    borderBottomWidth: CFG.TILE_SIZE * 0.7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: TILE_COLORS.spike,
    transform: [{ rotate: '180deg' }],
    marginBottom: 2,
  },
  door: {
    width: CFG.DOOR_WIDTH,
    height: CFG.DOOR_HEIGHT,
    borderRadius: 4,
    borderWidth: 3,
  },
  key: {
    position: 'absolute',
    borderRadius: CFG.KEY_SIZE / 2,
    backgroundColor: TILE_COLORS.key,
    shadowColor: TILE_COLORS.key,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  enemy: {
    position: 'absolute',
    borderRadius: CFG.ENEMY_SIZE / 2,
    backgroundColor: TILE_COLORS.enemy,
  },
  enemyEyeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    gap: 6,
  },
  enemyEye: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TILE_COLORS.enemyEye,
  },
});
