import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { bundledFfmpegPath, resolveFfmpegPath } = require('../ffmpeg-path.cjs');

describe('bundledFfmpegPath', () => {
  it('is null in development', () => {
    expect(bundledFfmpegPath({ isPackaged: false, resourcesPath: '/r' })).toBeNull();
  });
  it('points into resources/ffmpeg per platform', () => {
    expect(bundledFfmpegPath({ isPackaged: true, resourcesPath: '/r', platform: 'darwin' })).toBe(path.join('/r', 'ffmpeg', 'ffmpeg'));
    expect(bundledFfmpegPath({ isPackaged: true, resourcesPath: 'C:\\r', platform: 'win32' })).toBe(path.join('C:\\r', 'ffmpeg', 'ffmpeg.exe'));
  });
});

describe('resolveFfmpegPath', () => {
  const has = (...paths: string[]) => (p: string) => paths.includes(p);
  it('keeps a configured path that exists (e.g. Homebrew), even when one is bundled', () => {
    expect(resolveFfmpegPath('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg', { bundled: '/b/ffmpeg', exists: has('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg', '/b/ffmpeg') })).toEqual({
      path: '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
      source: 'configured',
    });
  });
  it('falls back to the bundled binary when the configured one is missing (Windows default)', () => {
    expect(resolveFfmpegPath('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg', { bundled: 'C:\\b\\ffmpeg.exe', exists: has('C:\\b\\ffmpeg.exe') })).toEqual({
      path: 'C:\\b\\ffmpeg.exe',
      source: 'bundled',
    });
  });
  it('falls back to the bundled binary for an empty setting', () => {
    expect(resolveFfmpegPath('  ', { bundled: '/b/ffmpeg', exists: has('/b/ffmpeg') }).source).toBe('bundled');
  });
  it('returns the configured path unchanged when nothing exists (check then reports ENOENT)', () => {
    expect(resolveFfmpegPath('/x/ffmpeg', { bundled: null, exists: has() })).toEqual({ path: '/x/ffmpeg', source: 'configured' });
  });
});
