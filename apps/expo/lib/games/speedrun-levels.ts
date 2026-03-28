import { TILE, type LevelData } from './speedrun-types';

// Shorthand aliases for compact grid definitions
const _ = TILE.EMPTY;
const S = TILE.SOLID;
const U = TILE.SPIKE_UP;
const D = TILE.SPIKE_DOWN;
const L = TILE.SPIKE_LEFT;
const R = TILE.SPIKE_RIGHT;
const C = TILE.CRUMBLE;
const G = TILE.GOAL;
const P = TILE.SPAWN;
const K = TILE.CHECKPOINT;

// ─── Level 1: Erste Schritte ─────────────────────────────────
// Teaches: Running and jumping basics. No hazards.
// Landscape-wide level with simple gaps and platforms.

const level1: LevelData = {
  id: 0,
  name: 'Erste Schritte',
  grid: [
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, G, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, P, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, _, _, _, _, _, _, _, S],
    [S, S, S, S, _, _, S, S, S, _, _, S, S, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
  ],
  spawnX: 1,
  spawnY: 7,
  goalX: 22,
  goalY: 3,
  checkpoints: [],
  medalTimes: { gold: 4.0, silver: 6.0, bronze: 10.0 },
  sawBlades: [],
};

// ─── Level 2: Stachelpfad ────────────────────────────────────
// Teaches: Precision jumping over spike pits.

const level2: LevelData = {
  id: 1,
  name: 'Stachelpfad',
  grid: [
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, G, _, S],
    [S, P, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, S, S],
    [S, S, S, _, U, _, S, S, _, U, U, _, S, S, S, _, U, U, U, _, S, S, _, _, _, _, _, S],
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
  ],
  spawnX: 1,
  spawnY: 6,
  goalX: 25,
  goalY: 5,
  checkpoints: [],
  medalTimes: { gold: 5.0, silver: 8.0, bronze: 12.0 },
  sawBlades: [],
};

// ─── Level 3: Wandsprung ─────────────────────────────────────
// Teaches: Wall sliding and wall jumping.
// Wider horizontal layout with vertical shaft sections.

const level3: LevelData = {
  id: 2,
  name: 'Wandsprung',
  grid: [
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, G, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, S, S, _, _, _, _, _, _, _, _, _, _, S, S, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, S, S, _, _, _, _, _, _, _, _, S, S, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, K, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _, _, _, _, _, S],
    [S, P, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, S, S, _, U, U, _, S, S, _, _, _, _, _, _, S, S, _, U, U, _, S, S, S, S],
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
  ],
  spawnX: 1,
  spawnY: 9,
  goalX: 23,
  goalY: 1,
  checkpoints: [{ x: 12, y: 7 }],
  medalTimes: { gold: 7.0, silver: 11.0, bronze: 16.0 },
  sawBlades: [],
};

// ─── Level 4: Schneller Lauf ─────────────────────────────────
// Teaches: Dashing and crumbling platforms. First saw blade.

const level4: LevelData = {
  id: 3,
  name: 'Schneller Lauf',
  grid: [
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, G, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, K, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, P, _, _, _, _, _, _, _, _, _, _, S, S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, S, S, _, C, C, C, _, _, S, S, _, _, _, _, _, C, C, C, C, _, _, S, S, _, _, _, _, _, S],
    [S, _, _, _, U, U, U, _, _, _, _, _, _, _, _, _, U, U, U, U, _, _, _, _, _, _, _, _, _, S],
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
  ],
  spawnX: 1,
  spawnY: 7,
  goalX: 27,
  goalY: 4,
  checkpoints: [{ x: 13, y: 6 }],
  medalTimes: { gold: 9.0, silver: 13.0, bronze: 19.0 },
  sawBlades: [
    {
      id: 0,
      startX: 15 * 32 + 16,
      startY: 3 * 32 + 16,
      endX: 21 * 32 + 16,
      endY: 3 * 32 + 16,
      speed: 100,
      radius: 14,
    },
  ],
};

// ─── Level 5: Meckys Prüfung ────────────────────────────────
// All mechanics combined. Multi-section gauntlet.

const level5: LevelData = {
  id: 4,
  name: 'Meckys Prüfung',
  grid: [
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, G, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, _, K, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, _, _, _, _, _, _, _, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _, _, _, _, _, _, _, U, U, S],
    [S, P, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, S],
    [S, S, S, _, U, _, S, S, _, _, C, C, _, _, _, _, _, _, S, S, _, _, _, _, _, _, _, _, S, S, S, S],
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
  ],
  spawnX: 1,
  spawnY: 10,
  goalX: 30,
  goalY: 1,
  checkpoints: [{ x: 15, y: 8 }],
  medalTimes: { gold: 13.0, silver: 19.0, bronze: 26.0 },
  sawBlades: [
    {
      id: 0,
      startX: 7 * 32 + 16,
      startY: 9 * 32 + 16,
      endX: 12 * 32 + 16,
      endY: 9 * 32 + 16,
      speed: 90,
      radius: 14,
    },
    {
      id: 1,
      startX: 20 * 32 + 16,
      startY: 4 * 32 + 16,
      endX: 20 * 32 + 16,
      endY: 8 * 32 + 16,
      speed: 80,
      radius: 14,
    },
    {
      id: 2,
      startX: 26 * 32 + 16,
      startY: 2 * 32 + 16,
      endX: 28 * 32 + 16,
      endY: 2 * 32 + 16,
      speed: 110,
      radius: 12,
    },
  ],
};

export const LEVELS: LevelData[] = [level1, level2, level3, level4, level5];
