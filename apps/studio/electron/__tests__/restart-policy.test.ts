import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { nextRestartDelay } = require('../ffmpeg-args.cjs');

describe('nextRestartDelay', () => {
  it('backs off exponentially from 1 s', () => {
    expect(nextRestartDelay(0)).toBe(1000);
    expect(nextRestartDelay(1)).toBe(2000);
    expect(nextRestartDelay(3)).toBe(8000);
  });

  it('caps at 10 s', () => {
    expect(nextRestartDelay(10)).toBe(10000);
  });
});
