// ─── Game Configuration Constants ────────────────────────────

export const GAME_CONFIG = {
  // Physics
  GRAVITY: 0.55,
  BOUNCE_VELOCITY: -14,
  SPRING_BOUNCE_VELOCITY: -22,
  MAX_FALL_SPEED: 18,
  HORIZONTAL_SPEED: 8,

  // Mecky dimensions (rendered)
  MECKY_WIDTH: 55,
  MECKY_HEIGHT: 55,
  MECKY_HITBOX_WIDTH: 36,
  MECKY_HITBOX_FEET_HEIGHT: 12,

  // Platforms
  PLATFORM_WIDTH: 68,
  PLATFORM_HEIGHT: 14,
  PLATFORM_GAP_MIN: 70,
  PLATFORM_GAP_MAX: 150,
  MOVING_PLATFORM_SPEED: 1.8,
  INITIAL_PLATFORM_COUNT: 12,
  PLATFORM_BUFFER: 400,
  MAX_PLATFORMS: 30,

  // Camera
  CAMERA_OFFSET_RATIO: 0.35,

  // Scoring
  POINTS_PER_PIXEL: 0.1,
  DIFFICULTY_MAX_SCORE: 5000,
} as const;

// ─── Platform Colors ─────────────────────────────────────────

export const PLATFORM_COLORS = {
  normal: '#4CAF50',
  moving: '#42A5F5',
  breaking: '#8D6E63',
  spring: '#4CAF50',
} as const;

export const SPRING_COLOR = '#FF9800';

// ─── Types ───────────────────────────────────────────────────

export type PlatformType = 'normal' | 'moving' | 'breaking' | 'spring';

export type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  type: PlatformType;
  broken: boolean;
  movingDirection: 1 | -1;
};

export type GameState = 'idle' | 'playing' | 'gameOver';

// Numeric encoding for shared values (worklet-compatible)
export const GAME_STATE = {
  IDLE: 0,
  PLAYING: 1,
  GAME_OVER: 2,
} as const;

// ─── Difficulty Table ────────────────────────────────────────

export type DifficultyWeights = {
  normal: number;
  moving: number;
  breaking: number;
  spring: number;
};

export const DIFFICULTY_START: DifficultyWeights = {
  normal: 0.80,
  moving: 0.10,
  breaking: 0.05,
  spring: 0.05,
};

export const DIFFICULTY_END: DifficultyWeights = {
  normal: 0.30,
  moving: 0.30,
  breaking: 0.30,
  spring: 0.10,
};
