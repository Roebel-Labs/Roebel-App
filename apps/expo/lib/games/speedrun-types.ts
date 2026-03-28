// ─── Game Configuration Constants ────────────────────────────

export const SPEEDRUN_CONFIG = {
  // Physics (all units in px/s or px/s², framerate-independent)
  GRAVITY: 980,
  MAX_FALL_SPEED: 600,

  // Movement
  GROUND_ACCEL: 3200,
  AIR_ACCEL: 2400,
  GROUND_FRICTION: 2800,
  AIR_FRICTION: 800,
  MAX_RUN_SPEED: 280,

  // Jumping
  JUMP_VELOCITY: -420,
  JUMP_CUT_MULTIPLIER: 0.4,
  COYOTE_TIME: 0.083,
  JUMP_BUFFER_TIME: 0.1,

  // Wall mechanics
  WALL_SLIDE_SPEED: 80,
  WALL_JUMP_VX: 260,
  WALL_JUMP_VY: -380,
  WALL_STICK_TIME: 0.1,
  WALL_DETACH_TIME: 0.15,

  // Dash
  DASH_SPEED: 480,
  DASH_DURATION: 0.12,

  // Player dimensions
  PLAYER_WIDTH: 32,
  PLAYER_HEIGHT: 32,
  PLAYER_HITBOX_W: 24,
  PLAYER_HITBOX_H: 30,

  // Tile grid
  TILE_SIZE: 32,

  // Camera (tuned for landscape)
  CAMERA_DEADZONE_X: 40,
  CAMERA_DEADZONE_Y: 30,
  CAMERA_LOOKAHEAD_X: 80,
  CAMERA_SMOOTH_SPEED: 10,

  // Corner correction
  CORNER_CORRECTION_PX: 4,

  // Effects
  DEATH_FREEZE_FRAMES: 3,
  SCREEN_SHAKE_INTENSITY: 4,
  SCREEN_SHAKE_DURATION: 150,

  // Crumble
  CRUMBLE_DELAY: 0.3,

  // UI (landscape layout)
  CONTROL_BAR_HEIGHT: 80,
  BASELINE_HEIGHT: 2,
} as const;

// ─── Tile Types (numeric for worklet compatibility) ──────────

export const TILE = {
  EMPTY: 0,
  SOLID: 1,
  SPIKE_UP: 2,
  SPIKE_DOWN: 3,
  SPIKE_LEFT: 4,
  SPIKE_RIGHT: 5,
  CRUMBLE: 6,
  GOAL: 7,
  SPAWN: 8,
  CHECKPOINT: 9,
} as const;

export type TileType = (typeof TILE)[keyof typeof TILE];

// ─── Game States (numeric for shared values) ─────────────────

export const GAME_STATE = {
  MENU: 0,
  LEVEL_SELECT: 1,
  PLAYING: 2,
  DEATH_FREEZE: 3,
  LEVEL_COMPLETE: 4,
} as const;

// ─── Types ───────────────────────────────────────────────────

export type MedalTimes = {
  gold: number;
  silver: number;
  bronze: number;
};

export type SawBlade = {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  speed: number;
  radius: number;
};

export type LevelData = {
  id: number;
  name: string;
  grid: number[][];
  spawnX: number;
  spawnY: number;
  goalX: number;
  goalY: number;
  checkpoints: { x: number; y: number }[];
  medalTimes: MedalTimes;
  sawBlades: SawBlade[];
};

export type LevelStats = {
  bestTime: number | null;
  deaths: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
};

export type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export type VisibleTile = {
  col: number;
  row: number;
  type: number;
  key: string;
};

export type SawBladeRender = {
  x: number;
  y: number;
  radius: number;
  rotation: number;
};

// ─── Colors ──────────────────────────────────────────────────

export const SPEEDRUN_COLORS = {
  solid: '#4A5568',
  solidBorder: '#2D3748',
  spike: '#E53E3E',
  crumble: '#B7791F',
  crumbleBreaking: '#ED8936',
  goal: '#48BB78',
  goalGlow: '#9AE6B4',
  checkpoint: '#ECC94B',
  checkpointActive: '#F6E05E',
  sawBlade: '#E53E3E',
  sawBladeBorder: '#C53030',
  backgroundDark: '#1A202C',
  backgroundLight: '#EDF2F7',
  medalGold: '#FFD700',
  medalSilver: '#C0C0C0',
  medalBronze: '#CD7F32',
  dustParticle: 'rgba(255,255,255,0.6)',
  dashTrail: 'rgba(138,180,248,0.5)',
  deathParticle: '#FC8181',
  controlButton: 'rgba(255,255,255,0.12)',
  controlButtonPressed: 'rgba(255,255,255,0.25)',
  baseline: 'rgba(255,255,255,0.15)',
} as const;
