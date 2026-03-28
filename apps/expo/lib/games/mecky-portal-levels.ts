import { TILE, PORTAL_CONFIG } from './mecky-portal-types';
import type { LevelDef, LevelData, KeyItem, Enemy } from './mecky-portal-types';

const _ = TILE.EMPTY;
const W = TILE.WALL;
const S = TILE.SPIKE;
const K = TILE.KEY;
const D = TILE.DOOR;
const E = TILE.ENEMY_SPAWN;
const P = TILE.PLAYER_SPAWN;

// ─── Level Definitions ───────────────────────────────────────
// Each grid: rows top-to-bottom, columns left-to-right.
// Levels are roughly 12-16 cols wide, 10-14 rows tall.

const LEVELS: LevelDef[] = [
  // ─── Level 1: Tutorial ───────────────────────────────────
  // Simple flat ground, 1 key, door. Learn movement + jumping.
  {
    id: 1,
    name: 'Erste Schritte',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, K, _, _, W],
      [W, P, _, _, _, _, _, _, _, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 2: First Jump ─────────────────────────────────
  // Platforms at different heights, key on upper platform.
  {
    id: 2,
    name: 'Erster Sprung',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, K, _, W],
      [W, _, _, _, _, _, _, _, W, W, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, W, W, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, P, _, _, _, _, _, _, _, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 3: Spikes Intro ───────────────────────────────
  // Spike gaps in the ground. 2 keys. Jump over spikes.
  {
    id: 3,
    name: 'Vorsicht Stacheln',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, K, _, _, _, _, K, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, P, _, W, S, S, W, _, W, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 4: Portal Tutorial ────────────────────────────
  // Key on isolated platform. Spikes below. Place portal, jump to key, teleport back.
  {
    id: 4,
    name: 'Portal-Training',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, K, _, _, _, W],
      [W, _, _, _, _, _, _, _, W, W, W, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, P, _, _, W, _, _, _, _, _, _, _, D, W],
      [W, W, W, W, W, S, S, S, S, S, S, W, W, W],
    ],
  },

  // ─── Level 5: Moving Enemy ───────────────────────────────
  // Patrolling enemy guards the key.
  {
    id: 5,
    name: 'Feindkontakt',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, E, _, _, _, K, _, _, W],
      [W, P, _, _, W, W, W, W, W, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 6: Vertical Challenge ─────────────────────────
  // Tall level with platforming. 2 keys at different heights.
  {
    id: 6,
    name: 'Hoch hinaus',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, K, _, _, _, _, _, _, W],
      [W, _, _, W, W, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, W, W, _, _, W],
      [W, _, _, _, _, _, _, _, K, _, _, W],
      [W, _, _, _, W, W, _, _, W, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, W, W, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W],
      [W, P, _, _, _, S, S, _, _, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 7: Portal Puzzle ──────────────────────────────
  // Key behind spikes. Must portal from a high platform to reach it.
  {
    id: 7,
    name: 'Portal-Rätsel',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, W, W, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, K, _, _, W],
      [W, _, _, _, _, _, _, _, _, S, W, S, _, W],
      [W, _, _, _, _, _, _, _, _, S, _, S, _, W],
      [W, _, _, _, _, W, W, _, _, W, _, W, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, P, _, _, _, _, _, _, _, _, _, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 8: Enemy Gauntlet ─────────────────────────────
  // Multiple enemies + spikes. 3 keys scattered.
  {
    id: 8,
    name: 'Spießrutenlauf',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, K, _, _, _, _, K, _, _, W],
      [W, _, _, _, W, W, _, _, _, W, W, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, E, _, _, _, E, _, _, _, K, _, W],
      [W, P, _, W, W, S, W, W, S, W, W, W, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 9: The Maze ───────────────────────────────────
  // Larger level, multiple paths, 3 keys, portal required.
  {
    id: 9,
    name: 'Das Labyrinth',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, W, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, W, _, _, _, _, _, _, _, K, _, W],
      [W, _, _, _, _, W, _, _, W, W, W, _, _, W, _, W],
      [W, _, _, _, _, _, _, _, _, _, W, _, _, W, _, W],
      [W, _, _, W, W, W, W, _, _, _, W, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, K, _, _, _, _, W, W, _, _, _, _, _, _, W],
      [W, _, W, W, _, _, _, _, _, _, _, W, W, W, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, E, _, _, _, K, _, _, _, _, W],
      [W, P, _, _, S, S, W, W, _, _, W, _, _, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },

  // ─── Level 10: Final Challenge ───────────────────────────
  // All mechanics combined. 4 keys, enemies, spikes, vertical + portal.
  {
    id: 10,
    name: 'Die Meisterprüfung',
    grid: [
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, _, K, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, _, W, W, _, _, W],
      [W, _, _, _, _, _, _, _, K, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, W, W, _, _, _, _, _, _, W],
      [W, _, _, _, W, W, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, _, _, _, _, _, _, _, E, _, _, _, _, W],
      [W, _, K, _, _, _, _, _, _, W, W, W, S, _, _, W],
      [W, _, W, S, _, _, _, _, _, _, _, _, S, _, _, W],
      [W, _, _, S, _, _, _, _, _, _, _, _, _, _, _, W],
      [W, _, _, W, _, E, _, _, _, K, _, _, _, _, _, W],
      [W, P, _, _, _, W, W, W, _, W, _, _, _, _, D, W],
      [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    ],
  },
];

// ─── Level Parser ────────────────────────────────────────────

export function parseLevelData(levelIndex: number): LevelData {
  const def = LEVELS[levelIndex];
  const grid = def.grid;
  const rows = grid.length;
  const cols = grid[0].length;

  let spawnX = 1;
  let spawnY = 1;
  let doorX = 1;
  let doorY = 1;
  const keys: KeyItem[] = [];
  const enemies: Enemy[] = [];
  let keyId = 0;
  let enemyId = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = grid[r][c];
      if (tile === TILE.PLAYER_SPAWN) {
        spawnX = c;
        spawnY = r;
      } else if (tile === TILE.DOOR) {
        doorX = c;
        doorY = r;
      } else if (tile === TILE.KEY) {
        keys.push({ id: keyId++, tileX: c, tileY: r, collected: false });
      } else if (tile === TILE.ENEMY_SPAWN) {
        // Find patrol bounds: walk left/right until hitting a wall
        let minX = c;
        let maxX = c;
        // Check left
        for (let cx = c - 1; cx >= 0; cx--) {
          if (grid[r][cx] === TILE.WALL) break;
          // Also check there's ground below for the enemy to walk on
          if (r + 1 < rows && grid[r + 1][cx] === TILE.WALL) {
            minX = cx;
          } else {
            break;
          }
        }
        // Check right
        for (let cx = c + 1; cx < cols; cx++) {
          if (grid[r][cx] === TILE.WALL) break;
          if (r + 1 < rows && grid[r + 1][cx] === TILE.WALL) {
            maxX = cx;
          } else {
            break;
          }
        }
        enemies.push({
          id: enemyId++,
          x: c * PORTAL_CONFIG.TILE_SIZE + PORTAL_CONFIG.TILE_SIZE / 2,
          y: r * PORTAL_CONFIG.TILE_SIZE + PORTAL_CONFIG.TILE_SIZE / 2,
          direction: 1,
          startX: c * PORTAL_CONFIG.TILE_SIZE + PORTAL_CONFIG.TILE_SIZE / 2,
        });
      }
    }
  }

  return {
    id: def.id,
    name: def.name,
    grid,
    cols,
    rows,
    spawnX,
    spawnY,
    keys,
    enemies,
    doorX,
    doorY,
  };
}

export const TOTAL_LEVELS = LEVELS.length;

export function getLevelName(levelIndex: number): string {
  return LEVELS[levelIndex]?.name ?? `Level ${levelIndex + 1}`;
}
