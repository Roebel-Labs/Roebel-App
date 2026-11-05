'use strict';
// Pure helpers for the ffmpeg output process. No electron import here:
// this module is required by electron/output.cjs and by the vitest suite.

/**
 * Build the ffmpeg argv for one output session.
 * Input: the MediaRecorder Matroska chunk stream on stdin.
 * Output: H.264 (VideoToolbox) + AAC to SRT (mpegts) or RTMP(S) (flv).
 * @param {{ target: { kind: 'srt', url: string } | { kind: 'rtmp', url: string, key: string } | { kind: 'none' },
 *           fps: 30 | 50, videoKbps: number, audioKbps: number }} o
 * @returns {string[]}
 */
function buildFfmpegArgs(o) {
  const { target, fps, videoKbps, audioKbps } = o;
  if (!target || target.kind === 'none') throw new Error('no_target');

  let format;
  let url;
  if (target.kind === 'srt') {
    format = 'mpegts';
    url = target.url;
  } else if (target.kind === 'rtmp') {
    format = 'flv';
    url = joinRtmpUrl(target.url, target.key);
  } else {
    throw new Error('no_target');
  }

  const gop = fps * 2; // keyframe every 2 s
  return [
    '-hide_banner',
    '-nostdin', // disables keyboard interaction only; pipe:0 stays the input
    '-loglevel', 'warning',
    '-stats',
    '-stats_period', '1',
    // input: Matroska chunks from MediaRecorder
    '-fflags', '+genpts',
    // Codec params are in the Matroska header; a short probe makes reconnects fast.
    '-analyzeduration', '500000',
    '-probesize', '262144',
    '-f', 'matroska',
    '-i', 'pipe:0',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    // video
    '-c:v', 'h264_videotoolbox',
    '-realtime', '1',
    '-profile:v', 'high',
    '-b:v', `${videoKbps}k`,
    '-maxrate', `${videoKbps}k`,
    '-bufsize', `${videoKbps * 2}k`,
    '-g', String(gop),
    '-r', String(fps),
    '-pix_fmt', 'yuv420p',
    // audio
    '-c:a', 'aac',
    '-b:a', `${audioKbps}k`,
    '-ar', '48000',
    '-ac', '2',
    // output
    '-flush_packets', '1',
    '-f', format,
    url,
  ];
}

/** Join an RTMP(S) server URL and a stream key with exactly one slash. */
function joinRtmpUrl(url, key) {
  if (!key) return url;
  return url.endsWith('/') ? `${url}${key}` : `${url}/${key}`;
}

/**
 * Parse one ffmpeg `-stats` progress line.
 * @param {string} line
 * @returns {{ fps?: number, kbps?: number, speed?: number, dropped?: number } | null}
 */
function parseProgress(line) {
  if (typeof line !== 'string') return null;
  if (!/\b(frame|speed|bitrate)=/.test(line)) return null;
  const out = {};
  const fps = /\bfps=\s*([\d.]+)/.exec(line);
  if (fps) out.fps = Number(fps[1]);
  const kbps = /\bbitrate=\s*([\d.]+)kbits\/s/.exec(line);
  if (kbps) out.kbps = Number(kbps[1]);
  const speed = /\bspeed=\s*([\d.]+)x/.exec(line);
  if (speed) out.speed = Number(speed[1]);
  const drop = /\bdrop=\s*(\d+)/.exec(line);
  if (drop) out.dropped = Number(drop[1]);
  return Object.keys(out).length ? out : null;
}

/**
 * Backoff before restarting ffmpeg after an exit: 1 s, 2 s, 4 s, 8 s, capped at 10 s.
 * @param {number} attempt zero-based restart attempt
 * @returns {number} delay in ms
 */
function nextRestartDelay(attempt) {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(1000 * 2 ** n, 10000);
}

/**
 * Mask ingest secrets (SRT passphrase/streamid, RTMP stream key) in a log or
 * error string before it reaches logs, status or the UI.
 * @param {string} text
 * @param {{ kind: string, url?: string, key?: string } | null | undefined} target
 * @returns {string}
 */
function maskSecrets(text, target) {
  let out = String(text);
  const secrets = [];
  if (target && target.kind === 'rtmp' && target.key) secrets.push(target.key);
  if (target && target.kind === 'srt' && target.url) {
    const q = target.url.indexOf('?');
    if (q !== -1) {
      for (const pair of target.url.slice(q + 1).split('&')) {
        const [k, v] = pair.split('=');
        if (!v || !/^(passphrase|streamid)$/i.test(k)) continue;
        secrets.push(v);
        try {
          secrets.push(decodeURIComponent(v));
        } catch {
          // malformed escape: the raw value is masked already
        }
      }
    }
  }
  for (const s of secrets) if (s) out = out.split(s).join('***');
  // Belt and braces for URLs not derived from the configured target.
  return out.replace(/\b(passphrase|streamid)=[^&\s'"]+/gi, '$1=***');
}

module.exports = { buildFfmpegArgs, parseProgress, nextRestartDelay, joinRtmpUrl, maskSecrets };
