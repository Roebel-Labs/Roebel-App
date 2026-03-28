// ─── Tile Types ──────────────────────────────────────────────

export const TILE = {
  EMPTY: 0,
  WALL: 1,
  SPIKE: 2,
  KEY: 3,
  DOOR: 4,
  ENEMY_SPAWN: 5,
  PLAYER_SPAWN: 6,
} as const;

// ─── Game Configuration Constants ────────────────────────────

export const PORTAL_CONFIG = {
  // Grid
  TILE_SIZE: 40,

  // Physics
  GRAVITY: 0.6,
  JUMP_VELOCITY: -11,
  MOVE_SPEED: 4,
  MAX_FALL_SPEED: 15,

  // Mecky dimensions
  MECKY_WIDTH: 36,
  MECKY_HEIGHT: 36,
  MECKY_HITBOX_MARGIN: 4,

  // Entities
  KEY_SIZE: 20,
  DOOR_WIDTH: 36,
  DOOR_HEIGHT: 40,
  ENEMY_SIZE: 32,
  ENEMY_SPEED: 1.5,
  PORTAL_RADIUS: 16,

  // Camera
  CAMERA_LERP: 0.12,
} as const;

// ─── Colors ──────────────────────────────────────────────────

export const TILE_COLORS = {
  wall: '#5D4E37',
  wallEdge: '#4A3D2B',
  spike: '#E53935',
  key: '#FFD700',
  keyGlow: 'rgba(255, 215, 0, 0.3)',
  doorLocked: '#B71C1C',
  doorOpen: '#43A047',
  doorFrame: '#795548',
  enemy: '#FF5722',
  enemyEye: '#ffffff',
  portal: '#42A5F5',
  portalGlow: 'rgba(66, 165, 245, 0.4)',
  portalInactive: 'rgba(66, 165, 245, 0.3)',
  backgroundDark: '#1a1a2e',
  backgroundLight: '#E8F5E9',
  controlBg: 'rgba(255,255,255,0.15)',
  controlActive: 'rgba(255,255,255,0.35)',
} as const;

// ─── Types ───────────────────────────────────────────────────

export type TileGrid = number[][];

export type Enemy = {
  id: number;
  x: number;
  y: number;
  direction: 1 | -1;
  startX: number;
};

export type KeyItem = {
  id: number;
  tileX: number;
  tileY: number;
  collected: boolean;
};

export type LevelDef = {
  id: number;
  name: string;
  grid: TileGrid;
};

export type LevelData = {
  id: number;
  name: string;
  grid: TileGrid;
  cols: number;
  rows: number;
  spawnX: number;
  spawnY: number;
  keys: KeyItem[];
  enemies: Enemy[];
  doorX: number;
  doorY: number;
};

export type LevelProgress = {
  completed: boolean;
  bestStars: number;
  bestDeaths: number;
};

export type PortalState = {
  active: boolean;
  x: number;
  y: number;
};

export type GamePhase = 'levelSelect' | 'playing' | 'dead' | 'levelComplete';

// ─── Star Rating ─────────────────────────────────────────────

export function getStarRating(deaths: number): number {
  'worklet';
  if (deaths === 0) return 3;
  if (deaths <= 2) return 2;
  return 1;
}

// ─── AsyncStorage Key ────────────────────────────────────────

export const PORTAL_PROGRESS_KEY = '@mecky_portal_progress';
