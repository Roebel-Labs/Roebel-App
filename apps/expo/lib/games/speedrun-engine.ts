import { SPEEDRUN_CONFIG, TILE, type SawBlade } from './speedrun-types';

// ─── Delta Time ──────────────────────────────────────────────

export function getDeltaTime(
  timeSincePreviousFrame: number | null | undefined,
): number {
  'worklet';
  const dt = (timeSincePreviousFrame ?? 16.67) / 1000;
  return Math.min(dt, 0.05);
}

// ─── Horizontal Movement ─────────────────────────────────────

export function updateHorizontalMovement(
  vx: number,
  inputX: number,
  isGrounded: boolean,
  isDashing: boolean,
  dt: number,
): number {
  'worklet';
  if (isDashing) return vx;

  const accel = isGrounded
    ? SPEEDRUN_CONFIG.GROUND_ACCEL
    : SPEEDRUN_CONFIG.AIR_ACCEL;
  const friction = isGrounded
    ? SPEEDRUN_CONFIG.GROUND_FRICTION
    : SPEEDRUN_CONFIG.AIR_FRICTION;
  const maxSpeed = SPEEDRUN_CONFIG.MAX_RUN_SPEED;

  let newVx = vx;
  if (inputX !== 0) {
    newVx += inputX * accel * dt;
    if (newVx > maxSpeed) newVx = maxSpeed;
    if (newVx < -maxSpeed) newVx = -maxSpeed;
  } else {
    if (newVx > 0) {
      newVx = Math.max(0, newVx - friction * dt);
    } else if (newVx < 0) {
      newVx = Math.min(0, newVx + friction * dt);
    }
  }
  return newVx;
}

// ─── Gravity ─────────────────────────────────────────────────

export function applyGravity(
  vy: number,
  isDashing: boolean,
  isWallSliding: boolean,
  dt: number,
): number {
  'worklet';
  if (isDashing) return 0;

  let newVy = vy + SPEEDRUN_CONFIG.GRAVITY * dt;

  if (isWallSliding && newVy > SPEEDRUN_CONFIG.WALL_SLIDE_SPEED) {
    newVy = SPEEDRUN_CONFIG.WALL_SLIDE_SPEED;
  }

  return Math.min(newVy, SPEEDRUN_CONFIG.MAX_FALL_SPEED);
}

// ─── Tile Grid Collision ─────────────────────────────────────

export type CollisionResult = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isGrounded: boolean;
  hitCeiling: boolean;
  wallDirection: number;
  hitHazard: boolean;
  hitGoal: boolean;
  hitCheckpointX: number;
  hitCheckpointY: number;
  crumbleCols: number[];
  crumbleRows: number[];
};

function isSolidTile(tile: number): boolean {
  'worklet';
  return tile === TILE.SOLID || tile === TILE.CRUMBLE;
}

function isHazardTile(tile: number): boolean {
  'worklet';
  return (
    tile === TILE.SPIKE_UP ||
    tile === TILE.SPIKE_DOWN ||
    tile === TILE.SPIKE_LEFT ||
    tile === TILE.SPIKE_RIGHT
  );
}

export function resolveCollisions(
  x: number,
  y: number,
  vx: number,
  vy: number,
  grid: readonly (readonly number[])[],
  gridWidth: number,
  gridHeight: number,
  crumbledSet: readonly string[],
): CollisionResult {
  'worklet';
  const TS = SPEEDRUN_CONFIG.TILE_SIZE;
  const HW = SPEEDRUN_CONFIG.PLAYER_HITBOX_W / 2;
  const HH = SPEEDRUN_CONFIG.PLAYER_HITBOX_H / 2;

  let px = x;
  let py = y;
  let newVx = vx;
  let newVy = vy;
  let grounded = false;
  let ceiling = false;
  let wallDir = 0;
  let hazard = false;
  let goal = false;
  let cpX = -1;
  let cpY = -1;
  const crumbleCols: number[] = [];
  const crumbleRows: number[] = [];

  function getTile(col: number, row: number): number {
    'worklet';
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight)
      return TILE.SOLID;
    // Check if this tile was crumbled
    for (let i = 0; i < crumbledSet.length; i++) {
      if (crumbledSet[i] === `${col}-${row}`) return TILE.EMPTY;
    }
    return grid[row][col];
  }

  // ── Resolve X axis ──
  const colStart = Math.floor((px - HW) / TS);
  const colEnd = Math.floor((px + HW - 0.01) / TS);
  const rowStart = Math.floor((py - HH + 1) / TS);
  const rowEnd = Math.floor((py + HH - 1) / TS);

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const tile = getTile(col, row);
      if (isHazardTile(tile)) hazard = true;
      if (tile === TILE.GOAL) goal = true;
      if (tile === TILE.CHECKPOINT) {
        cpX = col;
        cpY = row;
      }
      if (isSolidTile(tile)) {
        if (tile === TILE.CRUMBLE) {
          crumbleCols.push(col);
          crumbleRows.push(row);
        }
        const tileLeft = col * TS;
        const tileRight = (col + 1) * TS;
        if (newVx > 0 && px + HW > tileLeft && px - HW < tileLeft) {
          px = tileLeft - HW;
          wallDir = 1;
          newVx = 0;
        } else if (newVx < 0 && px - HW < tileRight && px + HW > tileRight) {
          px = tileRight + HW;
          wallDir = -1;
          newVx = 0;
        }
      }
    }
  }

  // ── Resolve Y axis (using corrected X) ──
  const colStart2 = Math.floor((px - HW + 0.01) / TS);
  const colEnd2 = Math.floor((px + HW - 0.01) / TS);
  const rowStart2 = Math.floor((py - HH) / TS);
  const rowEnd2 = Math.floor((py + HH - 0.01) / TS);

  for (let row = rowStart2; row <= rowEnd2; row++) {
    for (let col = colStart2; col <= colEnd2; col++) {
      const tile = getTile(col, row);
      if (isHazardTile(tile)) hazard = true;
      if (tile === TILE.GOAL) goal = true;
      if (tile === TILE.CHECKPOINT) {
        cpX = col;
        cpY = row;
      }
      if (isSolidTile(tile)) {
        if (tile === TILE.CRUMBLE) {
          crumbleCols.push(col);
          crumbleRows.push(row);
        }
        const tileTop = row * TS;
        const tileBottom = (row + 1) * TS;
        if (newVy > 0 && py + HH > tileTop && py - HH < tileTop) {
          py = tileTop - HH;
          grounded = true;
          newVy = 0;
        } else if (newVy < 0 && py - HH < tileBottom && py + HH > tileBottom) {
          py = tileBottom + HH;
          ceiling = true;
          newVy = 0;
        }
      }
    }
  }

  return {
    x: px,
    y: py,
    vx: newVx,
    vy: newVy,
    isGrounded: grounded,
    hitCeiling: ceiling,
    wallDirection: wallDir,
    hitHazard: hazard,
    hitGoal: goal,
    hitCheckpointX: cpX,
    hitCheckpointY: cpY,
    crumbleCols,
    crumbleRows,
  };
}

// ─── Wall Detection (for wall sliding state) ─────────────────

export function detectWall(
  x: number,
  y: number,
  grid: readonly (readonly number[])[],
  gridWidth: number,
  gridHeight: number,
  crumbledSet: readonly string[],
): number {
  'worklet';
  const TS = SPEEDRUN_CONFIG.TILE_SIZE;
  const HW = SPEEDRUN_CONFIG.PLAYER_HITBOX_W / 2;
  const HH = SPEEDRUN_CONFIG.PLAYER_HITBOX_H / 2;
  const PROBE = 2; // pixels to probe outward

  function getTile(col: number, row: number): number {
    'worklet';
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight)
      return TILE.SOLID;
    for (let i = 0; i < crumbledSet.length; i++) {
      if (crumbledSet[i] === `${col}-${row}`) return TILE.EMPTY;
    }
    return grid[row][col];
  }

  const midRow = Math.floor(y / TS);
  const bottomRow = Math.floor((y + HH - 1) / TS);

  // Check right
  const rightCol = Math.floor((x + HW + PROBE) / TS);
  for (let row = midRow; row <= bottomRow; row++) {
    if (isSolidTile(getTile(rightCol, row))) return 1;
  }

  // Check left
  const leftCol = Math.floor((x - HW - PROBE) / TS);
  for (let row = midRow; row <= bottomRow; row++) {
    if (isSolidTile(getTile(leftCol, row))) return -1;
  }

  return 0;
}

// ─── Saw Blade Collision ─────────────────────────────────────

export function checkSawBladeCollision(
  playerX: number,
  playerY: number,
  sawPositions: readonly { x: number; y: number; radius: number }[],
): boolean {
  'worklet';
  const HW = SPEEDRUN_CONFIG.PLAYER_HITBOX_W / 2;
  const HH = SPEEDRUN_CONFIG.PLAYER_HITBOX_H / 2;

  for (let i = 0; i < sawPositions.length; i++) {
    const saw = sawPositions[i];
    const closestX = Math.max(
      playerX - HW,
      Math.min(saw.x, playerX + HW),
    );
    const closestY = Math.max(
      playerY - HH,
      Math.min(saw.y, playerY + HH),
    );
    const dx = saw.x - closestX;
    const dy = saw.y - closestY;
    if (dx * dx + dy * dy < saw.radius * saw.radius) {
      return true;
    }
  }
  return false;
}

// ─── Saw Blade Movement ──────────────────────────────────────

export function updateSawBladePositions(
  sawBlades: readonly SawBlade[],
  elapsedTime: number,
): { x: number; y: number; radius: number; rotation: number }[] {
  'worklet';
  const result: { x: number; y: number; radius: number; rotation: number }[] =
    [];
  for (let i = 0; i < sawBlades.length; i++) {
    const saw = sawBlades[i];
    const dx = saw.endX - saw.startX;
    const dy = saw.endY - saw.startY;
    const pathLength = Math.sqrt(dx * dx + dy * dy);
    if (pathLength < 1) {
      result.push({
        x: saw.startX,
        y: saw.startY,
        radius: saw.radius,
        rotation: elapsedTime * 360,
      });
      continue;
    }
    const cycleDuration = (pathLength * 2) / saw.speed;
    const t = (elapsedTime % cycleDuration) / cycleDuration;
    const progress = t < 0.5 ? t * 2 : 2 - t * 2;

    result.push({
      x: saw.startX + dx * progress,
      y: saw.startY + dy * progress,
      radius: saw.radius,
      rotation: elapsedTime * 360,
    });
  }
  return result;
}

// ─── Jump Processing ─────────────────────────────────────────

export type JumpResult = {
  vy: number;
  vx: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  jumped: boolean;
  wallJumped: boolean;
  wallDetachTimer: number;
};

export function processJump(
  vy: number,
  vx: number,
  isGrounded: boolean,
  coyoteTimer: number,
  jumpBufferTimer: number,
  jumpPressed: boolean,
  jumpHeld: boolean,
  isWallSliding: boolean,
  wallDirection: number,
  wallDetachTimer: number,
  jumpCutApplied: boolean,
): JumpResult {
  'worklet';
  let newVy = vy;
  let newVx = vx;
  let newCoyote = coyoteTimer;
  let newJumpBuffer = jumpBufferTimer;
  let jumped = false;
  let wallJumped = false;
  let newWallDetach = wallDetachTimer;

  const canCoyoteJump = newCoyote > 0;
  const hasBufferedJump = newJumpBuffer > 0;
  const wantJump = jumpPressed || hasBufferedJump;

  // Ground/coyote jump
  if (wantJump && (isGrounded || canCoyoteJump)) {
    newVy = SPEEDRUN_CONFIG.JUMP_VELOCITY;
    newCoyote = 0;
    newJumpBuffer = 0;
    jumped = true;
  }
  // Wall jump
  else if (wantJump && isWallSliding && wallDetachTimer <= 0) {
    newVy = SPEEDRUN_CONFIG.WALL_JUMP_VY;
    newVx = -wallDirection * SPEEDRUN_CONFIG.WALL_JUMP_VX;
    newCoyote = 0;
    newJumpBuffer = 0;
    newWallDetach = SPEEDRUN_CONFIG.WALL_DETACH_TIME;
    jumped = true;
    wallJumped = true;
  }

  // Variable jump height: cut velocity when releasing (only once)
  if (!jumpHeld && newVy < 0 && !jumped && !jumpCutApplied) {
    newVy *= SPEEDRUN_CONFIG.JUMP_CUT_MULTIPLIER;
  }

  return {
    vy: newVy,
    vx: newVx,
    coyoteTimer: newCoyote,
    jumpBufferTimer: newJumpBuffer,
    jumped,
    wallJumped,
    wallDetachTimer: newWallDetach,
  };
}

// ─── Dash Processing ─────────────────────────────────────────

export type DashResult = {
  vx: number;
  vy: number;
  dashAvailable: boolean;
  isDashing: boolean;
  dashTimer: number;
  dashStarted: boolean;
};

export function processDash(
  vx: number,
  vy: number,
  dashAvailable: boolean,
  isDashing: boolean,
  dashTimer: number,
  dashPressed: boolean,
  facingRight: boolean,
  dt: number,
): DashResult {
  'worklet';
  // Start dash
  if (dashPressed && dashAvailable && !isDashing) {
    const dir = facingRight ? 1 : -1;
    return {
      vx: dir * SPEEDRUN_CONFIG.DASH_SPEED,
      vy: 0,
      dashAvailable: false,
      isDashing: true,
      dashTimer: SPEEDRUN_CONFIG.DASH_DURATION,
      dashStarted: true,
    };
  }

  // Continue dash
  if (isDashing) {
    const newTimer = dashTimer - dt;
    if (newTimer <= 0) {
      const maxSpeed = SPEEDRUN_CONFIG.MAX_RUN_SPEED;
      const clampedVx = Math.max(-maxSpeed, Math.min(maxSpeed, vx));
      return {
        vx: clampedVx,
        vy: 0,
        dashAvailable: false,
        isDashing: false,
        dashTimer: 0,
        dashStarted: false,
      };
    }
    return {
      vx,
      vy: 0,
      dashAvailable: false,
      isDashing: true,
      dashTimer: newTimer,
      dashStarted: false,
    };
  }

  return { vx, vy, dashAvailable, isDashing, dashTimer, dashStarted: false };
}

// ─── Camera ──────────────────────────────────────────────────

export function updateCamera(
  camX: number,
  camY: number,
  playerX: number,
  playerY: number,
  isGrounded: boolean,
  facingRight: boolean,
  levelPixelWidth: number,
  levelPixelHeight: number,
  screenWidth: number,
  screenHeight: number,
  dt: number,
): { camX: number; camY: number } {
  'worklet';
  const LOOK = SPEEDRUN_CONFIG.CAMERA_LOOKAHEAD_X;
  const SMOOTH = SPEEDRUN_CONFIG.CAMERA_SMOOTH_SPEED;

  const lookahead = facingRight ? LOOK : -LOOK;
  let targetX = playerX + lookahead - screenWidth / 2;

  // Track Y when grounded or when player is far from center
  let targetY = camY;
  const playerScreenY = playerY - camY;
  const centerY = screenHeight * 0.5;
  if (isGrounded || Math.abs(playerScreenY - centerY) > screenHeight * 0.3) {
    targetY = playerY - screenHeight * 0.45;
  }

  const lerpFactor = 1 - Math.exp(-SMOOTH * dt);
  let newCamX = camX + (targetX - camX) * lerpFactor;
  let newCamY = camY + (targetY - camY) * lerpFactor;

  // Clamp to level bounds
  newCamX = Math.max(0, Math.min(levelPixelWidth - screenWidth, newCamX));
  newCamY = Math.max(0, Math.min(levelPixelHeight - screenHeight, newCamY));

  return { camX: newCamX, camY: newCamY };
}

// ─── Corner Correction ───────────────────────────────────────

export function cornerCorrection(
  x: number,
  y: number,
  vy: number,
  grid: readonly (readonly number[])[],
  gridWidth: number,
  gridHeight: number,
  crumbledSet: readonly string[],
): { x: number; corrected: boolean } {
  'worklet';
  if (vy >= 0) return { x, corrected: false };

  const TS = SPEEDRUN_CONFIG.TILE_SIZE;
  const HW = SPEEDRUN_CONFIG.PLAYER_HITBOX_W / 2;
  const MAX_NUDGE = SPEEDRUN_CONFIG.CORNER_CORRECTION_PX;

  function getTile(col: number, row: number): number {
    'worklet';
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight)
      return TILE.SOLID;
    for (let i = 0; i < crumbledSet.length; i++) {
      if (crumbledSet[i] === `${col}-${row}`) return TILE.EMPTY;
    }
    return grid[row][col];
  }

  const headY = y - SPEEDRUN_CONFIG.PLAYER_HITBOX_H / 2;
  const headRow = Math.floor(headY / TS);

  // Check right side of head
  const rightCol = Math.floor((x + HW - 0.01) / TS);
  if (
    rightCol >= 0 &&
    rightCol < gridWidth &&
    headRow >= 0 &&
    headRow < gridHeight
  ) {
    const tile = getTile(rightCol, headRow);
    if (isSolidTile(tile)) {
      const tileLeft = rightCol * TS;
      const overlap = x + HW - tileLeft;
      if (overlap > 0 && overlap <= MAX_NUDGE) {
        return { x: x - overlap - 0.01, corrected: true };
      }
    }
  }

  // Check left side of head
  const leftCol = Math.floor((x - HW + 0.01) / TS);
  if (
    leftCol >= 0 &&
    leftCol < gridWidth &&
    headRow >= 0 &&
    headRow < gridHeight
  ) {
    const tile = getTile(leftCol, headRow);
    if (isSolidTile(tile)) {
      const tileRight = (leftCol + 1) * TS;
      const overlap = tileRight - (x - HW);
      if (overlap > 0 && overlap <= MAX_NUDGE) {
        return { x: x + overlap + 0.01, corrected: true };
      }
    }
  }

  return { x, corrected: false };
}
