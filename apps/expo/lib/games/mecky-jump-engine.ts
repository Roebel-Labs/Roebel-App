import { GAME_CONFIG } from './mecky-jump-types';
import type { Platform } from './mecky-jump-types';

// ─── Delta Time ──────────────────────────────────────────────

export function getDeltaTime(timeSincePreviousFrame: number | null | undefined): number {
  'worklet';
  const dt = (timeSincePreviousFrame ?? 16.67) / 16.67;
  return Math.min(dt, 3); // cap to prevent tunneling on lag
}

// ─── Gravity ─────────────────────────────────────────────────

export function applyGravity(velocityY: number, dt: number): number {
  'worklet';
  const newVel = velocityY + GAME_CONFIG.GRAVITY * dt;
  return Math.min(newVel, GAME_CONFIG.MAX_FALL_SPEED);
}

// ─── Position Update + Screen Wrapping ───────────────────────

export function updateMeckyPosition(
  x: number,
  y: number,
  vx: number,
  vy: number,
  dt: number,
  screenWidth: number,
): { x: number; y: number } {
  'worklet';
  let newX = x + vx * dt;
  const newY = y + vy * dt;

  const halfW = GAME_CONFIG.MECKY_WIDTH / 2;
  if (newX < -halfW) {
    newX = screenWidth + halfW;
  } else if (newX > screenWidth + halfW) {
    newX = -halfW;
  }

  return { x: newX, y: newY };
}

// ─── Collision Detection (Swept AABB) ────────────────────────

export type CollisionResult = {
  hit: boolean;
  platformIndex: number;
  bounceVelocity: number;
  isBreaking: boolean;
};

export function checkPlatformCollision(
  meckyX: number,
  meckyY: number,
  prevMeckyY: number,
  meckyVelocityY: number,
  platforms: readonly Platform[],
): CollisionResult {
  'worklet';
  const noHit: CollisionResult = { hit: false, platformIndex: -1, bounceVelocity: 0, isBreaking: false };

  // Only detect when falling
  if (meckyVelocityY <= 0) return noHit;

  const feetY = meckyY + GAME_CONFIG.MECKY_HEIGHT / 2;
  const prevFeetY = prevMeckyY + GAME_CONFIG.MECKY_HEIGHT / 2;
  const meckyLeft = meckyX - GAME_CONFIG.MECKY_HITBOX_WIDTH / 2;
  const meckyRight = meckyX + GAME_CONFIG.MECKY_HITBOX_WIDTH / 2;

  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.broken) continue;

    const platTop = p.y;
    const platLeft = p.x;
    const platRight = p.x + p.width;

    // Feet must cross the platform top line this frame
    const feetCrossed = prevFeetY <= platTop && feetY >= platTop;
    // Horizontal overlap
    const horizontalOverlap = meckyRight > platLeft && meckyLeft < platRight;

    if (feetCrossed && horizontalOverlap) {
      const isSpring = p.type === 'spring';
      const bounceVel = isSpring
        ? GAME_CONFIG.SPRING_BOUNCE_VELOCITY
        : GAME_CONFIG.BOUNCE_VELOCITY;

      return {
        hit: true,
        platformIndex: i,
        bounceVelocity: bounceVel,
        isBreaking: p.type === 'breaking',
      };
    }
  }

  return noHit;
}

// ─── Camera ──────────────────────────────────────────────────

export function updateCamera(
  currentCameraY: number,
  meckyY: number,
  screenHeight: number,
): number {
  'worklet';
  // Camera only moves upward
  const targetCameraY = meckyY - screenHeight * GAME_CONFIG.CAMERA_OFFSET_RATIO;
  return Math.min(currentCameraY, targetCameraY);
}

// ─── Game Over Check ─────────────────────────────────────────

export function isGameOver(
  meckyY: number,
  cameraY: number,
  screenHeight: number,
): boolean {
  'worklet';
  return meckyY > cameraY + screenHeight + 50;
}

// ─── Moving Platform Update ──────────────────────────────────

export function updateMovingPlatforms(
  platforms: Platform[],
  dt: number,
  screenWidth: number,
): Platform[] {
  'worklet';
  const updated: Platform[] = [];
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.type === 'moving' && !p.broken) {
      let newX = p.x + GAME_CONFIG.MOVING_PLATFORM_SPEED * p.movingDirection * dt;
      let newDir = p.movingDirection;
      if (newX <= 0) {
        newX = 0;
        newDir = 1;
      } else if (newX + p.width >= screenWidth) {
        newX = screenWidth - p.width;
        newDir = -1;
      }
      updated.push({ ...p, x: newX, movingDirection: newDir as 1 | -1 });
    } else {
      updated.push(p);
    }
  }
  return updated;
}

// ─── Score ───────────────────────────────────────────────────

export function calculateScore(highestY: number, startY: number): number {
  'worklet';
  const pixelsClimbed = startY - highestY;
  return Math.max(0, Math.round(pixelsClimbed * GAME_CONFIG.POINTS_PER_PIXEL));
}
