import { PORTAL_CONFIG, TILE } from './mecky-portal-types';
import type { TileGrid, Enemy, KeyItem } from './mecky-portal-types';

const CFG = PORTAL_CONFIG;

// ─── Delta Time ──────────────────────────────────────────────

export function getDeltaTime(timeSincePreviousFrame: number | null | undefined): number {
  'worklet';
  const dt = (timeSincePreviousFrame ?? 16.67) / 16.67;
  return Math.min(dt, 3);
}

// ─── Gravity ─────────────────────────────────────────────────

export function applyGravity(vy: number, dt: number): number {
  'worklet';
  const newVel = vy + CFG.GRAVITY * dt;
  return Math.min(newVel, CFG.MAX_FALL_SPEED);
}

// ─── Tile Helpers ────────────────────────────────────────────

function isSolid(grid: readonly number[][], row: number, col: number, cols: number, rows: number): boolean {
  'worklet';
  if (row < 0 || row >= rows || col < 0 || col >= cols) return true;
  return grid[row][col] === TILE.WALL;
}

function isSpike(grid: readonly number[][], row: number, col: number, cols: number, rows: number): boolean {
  'worklet';
  if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
  return grid[row][col] === TILE.SPIKE;
}

// ─── Tile Collision Resolution ───────────────────────────────
// AABB collision against tile grid. Resolve X then Y independently.

export type CollisionResult = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
};

export function resolveTileCollision(
  x: number,
  y: number,
  vx: number,
  vy: number,
  dt: number,
  grid: readonly number[][],
  cols: number,
  rows: number,
): CollisionResult {
  'worklet';
  const ts = CFG.TILE_SIZE;
  const hw = CFG.MECKY_WIDTH / 2 - CFG.MECKY_HITBOX_MARGIN;
  const hh = CFG.MECKY_HEIGHT / 2 - CFG.MECKY_HITBOX_MARGIN;

  let newX = x + vx * dt;
  let newVx = vx;
  let newVy = vy;
  let grounded = false;

  // ── Horizontal resolution (use old Y) ──
  let hResolved = false;
  if (vx !== 0) {
    const top = y - hh;
    const bottom = y + hh;
    const rowTop = Math.floor(top / ts);
    const rowBottom = Math.floor(bottom / ts);

    if (vx > 0) {
      // Moving right — check the right edge
      const edgeCol = Math.floor((newX + hw) / ts);
      for (let r = rowTop; r <= rowBottom && !hResolved; r++) {
        if (isSolid(grid, r, edgeCol, cols, rows)) {
          newX = edgeCol * ts - hw - 0.01;
          newVx = 0;
          hResolved = true;
        }
      }
    } else {
      // Moving left — check the left edge
      const edgeCol = Math.floor((newX - hw) / ts);
      for (let r = rowTop; r <= rowBottom && !hResolved; r++) {
        if (isSolid(grid, r, edgeCol, cols, rows)) {
          newX = (edgeCol + 1) * ts + hw + 0.01;
          newVx = 0;
          hResolved = true;
        }
      }
    }
  }

  // ── Vertical resolution (use resolved X) ──
  let newY = y + vy * dt;
  let vResolved = false;

  const left = newX - hw;
  const right = newX + hw;
  const colLeft = Math.floor(left / ts);
  const colRight = Math.floor(right / ts);

  if (vy > 0) {
    // Falling — check bottom edge
    const edgeRow = Math.floor((newY + hh) / ts);
    for (let c = colLeft; c <= colRight && !vResolved; c++) {
      if (isSolid(grid, edgeRow, c, cols, rows)) {
        newY = edgeRow * ts - hh - 0.01;
        newVy = 0;
        grounded = true;
        vResolved = true;
      }
    }
  } else if (vy < 0) {
    // Jumping — check top edge
    const edgeRow = Math.floor((newY - hh) / ts);
    for (let c = colLeft; c <= colRight && !vResolved; c++) {
      if (isSolid(grid, edgeRow, c, cols, rows)) {
        newY = (edgeRow + 1) * ts + hh + 0.01;
        newVy = 0;
        vResolved = true;
      }
    }
  }

  // ── Ground check (when not moving vertically or barely moving) ──
  if (!grounded && vy >= 0) {
    const feetRow = Math.floor((newY + hh + 1) / ts);
    for (let c = colLeft; c <= colRight; c++) {
      if (isSolid(grid, feetRow, c, cols, rows)) {
        grounded = true;
        break;
      }
    }
  }

  return { x: newX, y: newY, vx: newVx, vy: newVy, grounded };
}

// ─── Hazard Check ────────────────────────────────────────────
// Check if player overlaps any spike tiles or enemies.

export function checkHazards(
  x: number,
  y: number,
  grid: readonly number[][],
  cols: number,
  rows: number,
  enemies: readonly Enemy[],
): boolean {
  'worklet';
  const ts = CFG.TILE_SIZE;
  const hw = CFG.MECKY_WIDTH / 2 - CFG.MECKY_HITBOX_MARGIN - 2; // extra forgiving
  const hh = CFG.MECKY_HEIGHT / 2 - CFG.MECKY_HITBOX_MARGIN - 2;

  // Check spike tiles
  const colLeft = Math.floor((x - hw) / ts);
  const colRight = Math.floor((x + hw) / ts);
  const rowTop = Math.floor((y - hh) / ts);
  const rowBottom = Math.floor((y + hh) / ts);

  for (let r = rowTop; r <= rowBottom; r++) {
    for (let c = colLeft; c <= colRight; c++) {
      if (isSpike(grid, r, c, cols, rows)) {
        return true;
      }
    }
  }

  // Check enemy overlap
  const enemyR = CFG.ENEMY_SIZE / 2 - 2;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const dx = Math.abs(x - e.x);
    const dy = Math.abs(y - e.y);
    if (dx < hw + enemyR && dy < hh + enemyR) {
      return true;
    }
  }

  return false;
}

// ─── Key Collection ──────────────────────────────────────────

export type KeyCollectionResult = {
  keys: KeyItem[];
  collected: boolean;
  collectedIndex: number;
};

export function checkKeyCollection(
  x: number,
  y: number,
  keys: KeyItem[],
): KeyCollectionResult {
  'worklet';
  const ts = CFG.TILE_SIZE;
  const pickupDist = ts * 0.6;

  for (let i = 0; i < keys.length; i++) {
    if (keys[i].collected) continue;

    const kx = keys[i].tileX * ts + ts / 2;
    const ky = keys[i].tileY * ts + ts / 2;
    const dx = Math.abs(x - kx);
    const dy = Math.abs(y - ky);

    if (dx < pickupDist && dy < pickupDist) {
      const newKeys = keys.slice();
      newKeys[i] = { ...newKeys[i], collected: true };
      return { keys: newKeys, collected: true, collectedIndex: i };
    }
  }

  return { keys, collected: false, collectedIndex: -1 };
}

// ─── Door Check ──────────────────────────────────────────────

export function checkDoorReached(
  x: number,
  y: number,
  doorX: number,
  doorY: number,
  allKeysCollected: boolean,
): boolean {
  'worklet';
  if (!allKeysCollected) return false;

  const ts = CFG.TILE_SIZE;
  const dx = Math.abs(x - (doorX * ts + ts / 2));
  const dy = Math.abs(y - (doorY * ts + ts / 2));

  return dx < ts * 0.6 && dy < ts * 0.6;
}

// ─── Enemy Update ────────────────────────────────────────────

export function updateEnemies(
  enemies: Enemy[],
  dt: number,
  grid: readonly number[][],
  cols: number,
  rows: number,
): Enemy[] {
  'worklet';
  const ts = CFG.TILE_SIZE;
  const updated: Enemy[] = [];

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    let newX = e.x + CFG.ENEMY_SPEED * e.direction * dt;
    let newDir = e.direction;

    // Check wall ahead
    const checkCol = Math.floor((newX + (CFG.ENEMY_SIZE / 2) * e.direction) / ts);
    const enemyRow = Math.floor(e.y / ts);

    if (isSolid(grid, enemyRow, checkCol, cols, rows)) {
      newDir = (e.direction * -1) as 1 | -1;
      newX = e.x; // don't move into wall
    }

    // Check ground ahead (don't walk off edges)
    const groundCol = Math.floor(newX / ts);
    const groundRow = enemyRow + 1;
    if (!isSolid(grid, groundRow, groundCol, cols, rows)) {
      newDir = (e.direction * -1) as 1 | -1;
      newX = e.x;
    }

    updated.push({ ...e, x: newX, direction: newDir });
  }

  return updated;
}

// ─── Camera ──────────────────────────────────────────────────

export function updateCamera(
  camX: number,
  camY: number,
  targetX: number,
  targetY: number,
  screenWidth: number,
  screenHeight: number,
  levelWidth: number,
  levelHeight: number,
  lerp: number,
): { x: number; y: number } {
  'worklet';
  // Smooth follow
  let newX = camX + (targetX - screenWidth / 2 - camX) * lerp;
  let newY = camY + (targetY - screenHeight / 2 - camY) * lerp;

  // Clamp to level bounds
  newX = Math.max(0, Math.min(newX, levelWidth - screenWidth));
  newY = Math.max(0, Math.min(newY, levelHeight - screenHeight));

  return { x: newX, y: newY };
}
