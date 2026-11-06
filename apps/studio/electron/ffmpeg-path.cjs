'use strict';
// Which ffmpeg binary to run. Packaged builds ship their own in
// resources/ffmpeg/; a configured path that exists always wins, so a working
// custom install (e.g. Homebrew ffmpeg-full) is never replaced behind the
// operator's back.

const fs = require('node:fs');
const path = require('node:path');

/** Path of the ffmpeg bundled with a packaged app, or null in development. */
function bundledFfmpegPath({ isPackaged, resourcesPath, platform = process.platform }) {
  if (!isPackaged || !resourcesPath) return null;
  return path.join(resourcesPath, 'ffmpeg', platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

/**
 * @param {string} configured the Settings value
 * @param {{ bundled: string | null, exists?: (p: string) => boolean }} o
 * @returns {{ path: string, source: 'configured' | 'bundled' }}
 */
function resolveFfmpegPath(configured, { bundled, exists = fs.existsSync }) {
  const c = String(configured || '').trim();
  if (c && exists(c)) return { path: c, source: 'configured' };
  if (bundled && exists(bundled)) return { path: bundled, source: 'bundled' };
  return { path: c, source: 'configured' };
}

module.exports = { bundledFfmpegPath, resolveFfmpegPath };
