import {
  GAME_CONFIG,
  DIFFICULTY_START,
  DIFFICULTY_END,
} from './mecky-jump-types';
import type { Platform, PlatformType } from './mecky-jump-types';

// ─── Helpers ─────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

function randomRange(min: number, max: number): number {
  'worklet';
  return min + Math.random() * (max - min);
}

function getDifficulty(score: number): number {
  'worklet';
  return Math.min(score / GAME_CONFIG.DIFFICULTY_MAX_SCORE, 1);
}

// ─── Random Platform Type ────────────────────────────────────

function pickPlatformType(difficulty: number): PlatformType {
  'worklet';
  const normalW = lerp(DIFFICULTY_START.normal, DIFFICULTY_END.normal, difficulty);
  const movingW = lerp(DIFFICULTY_START.moving, DIFFICULTY_END.moving, difficulty);
  const breakingW = lerp(DIFFICULTY_START.breaking, DIFFICULTY_END.breaking, difficulty);
  // spring is the remainder

  const roll = Math.random();
  if (roll < normalW) return 'normal';
  if (roll < normalW + movingW) return 'moving';
  if (roll < normalW + movingW + breakingW) return 'breaking';
  return 'spring';
}

// ─── Create a Platform ───────────────────────────────────────

function createPlatform(
  id: number,
  y: number,
  screenWidth: number,
  type: PlatformType,
): Platform {
  'worklet';
  const maxX = screenWidth - GAME_CONFIG.PLATFORM_WIDTH;
  const x = randomRange(0, Math.max(0, maxX));

  return {
    id,
    x,
    y,
    width: GAME_CONFIG.PLATFORM_WIDTH,
    type,
    broken: false,
    movingDirection: Math.random() > 0.5 ? 1 : -1,
  };
}

// ─── Initial Platform Generation ─────────────────────────────

export function generateInitialPlatforms(
  screenWidth: number,
  screenHeight: number,
  startY: number,
): { platforms: Platform[]; highestY: number; nextId: number } {
  'worklet';
  const platforms: Platform[] = [];
  let nextId = 0;

  // Ground platform directly under Mecky
  platforms.push({
    id: nextId++,
    x: screenWidth / 2 - GAME_CONFIG.PLATFORM_WIDTH / 2,
    y: startY + GAME_CONFIG.MECKY_HEIGHT / 2 + 5,
    width: GAME_CONFIG.PLATFORM_WIDTH,
    type: 'normal',
    broken: false,
    movingDirection: 1,
  });

  let currentY = startY;

  for (let i = 0; i < GAME_CONFIG.INITIAL_PLATFORM_COUNT; i++) {
    currentY -= randomRange(GAME_CONFIG.PLATFORM_GAP_MIN, GAME_CONFIG.PLATFORM_GAP_MIN + 30);
    // Start easy: mostly normal platforms
    const type = i < 3 ? 'normal' : pickPlatformType(0);
    platforms.push(createPlatform(nextId++, currentY, screenWidth, type));
  }

  return { platforms, highestY: currentY, nextId };
}

// ─── Generate Platforms Above ────────────────────────────────

export function generatePlatformsAbove(
  cameraY: number,
  screenWidth: number,
  highestPlatformY: number,
  score: number,
  nextId: number,
): { newPlatforms: Platform[]; newHighestY: number; newNextId: number } {
  'worklet';
  const generateUntilY = cameraY - GAME_CONFIG.PLATFORM_BUFFER;
  const newPlatforms: Platform[] = [];
  let currentY = highestPlatformY;
  let id = nextId;
  const difficulty = getDifficulty(score);

  while (currentY > generateUntilY) {
    const gapMin = lerp(GAME_CONFIG.PLATFORM_GAP_MIN, GAME_CONFIG.PLATFORM_GAP_MIN + 20, difficulty);
    const gapMax = lerp(GAME_CONFIG.PLATFORM_GAP_MIN + 30, GAME_CONFIG.PLATFORM_GAP_MAX, difficulty);
    currentY -= randomRange(gapMin, gapMax);

    const type = pickPlatformType(difficulty);
    newPlatforms.push(createPlatform(id++, currentY, screenWidth, type));
  }

  return { newPlatforms, newHighestY: currentY, newNextId: id };
}

// ─── Cleanup Off-screen Platforms ────────────────────────────

export function cleanupPlatforms(
  platforms: Platform[],
  cameraY: number,
  screenHeight: number,
): Platform[] {
  'worklet';
  const cutoff = cameraY + screenHeight + 200;
  return platforms.filter(p => p.y < cutoff);
}
