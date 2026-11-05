'use strict';
// Pure helpers for the ffmpeg output process. No electron import here:
// this module is required by electron/output.cjs and by the vitest suite.

/**
 * The usable destinations of a config: `destinations` (multi-destination) or
 * the legacy single `target`. Drops kind 'none' and entries with enabled === false.
 * @param {{ destinations?: object[], target?: object }} o
 * @returns {Array<{ kind: 'srt', url: string } | { kind: 'rtmp', url: string, key: string }>}
 */
function usableDestinations(o) {
  const list = Array.isArray(o.destinations) ? o.destinations : o.target ? [o.target] : [];
  return list.filter((d) => d && d.enabled !== false && (d.kind === 'srt' || d.kind === 'rtmp'));
}

/** Container format + final URL of one destination. */
function destinationOutput(d) {
  if (d.kind === 'srt') return { format: 'mpegts', url: d.url };
  return { format: 'flv', url: joinRtmpUrl(d.url, d.key) };
}

/**
 * Escape a slave URL for the tee muxer's slave list (ffmpeg-utils "Quoting and
 * escaping"): backslash before \, ', | and the option brackets [ ].
 * @param {string} url
 */
function teeEscape(url) {
  return String(url).replace(/[\\'|[\]]/g, '\\$&');
}

/** Encoder settings shared by the show output and the destination test. */
function encodeArgs({ fps, videoKbps, audioKbps }) {
  const gop = fps * 2; // keyframe every 2 s
  return [
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
  ];
}

/**
 * Output part: one destination writes straight to it; two or more encode once
 * and fan out through the tee muxer. A failing tee slave (onfail=ignore) is
 * dropped without stopping the others; ffmpeg only exits when all have failed.
 */
function outputArgs(dests) {
  if (dests.length === 1) {
    const { format, url } = destinationOutput(dests[0]);
    return ['-flush_packets', '1', '-f', format, url];
  }
  const slaves = dests.map((d) => {
    const { format, url } = destinationOutput(d);
    // flv cannot seek back on a network stream to write duration/filesize.
    const opts = format === 'flv' ? 'f=flv:onfail=ignore:flvflags=no_duration_filesize' : `f=${format}:onfail=ignore`;
    return `[${opts}]${teeEscape(url)}`;
  });
  return ['-flush_packets', '1', '-f', 'tee', slaves.join('|')];
}

/**
 * Build the ffmpeg argv for one output session.
 * Input: the MediaRecorder Matroska chunk stream on stdin.
 * Output: H.264 (VideoToolbox) + AAC to SRT (mpegts) and/or RTMP(S) (flv).
 * @param {{ destinations?: Array<{ kind: 'srt', url: string } | { kind: 'rtmp', url: string, key: string } | { kind: 'none' }>,
 *           target?: { kind: 'srt', url: string } | { kind: 'rtmp', url: string, key: string } | { kind: 'none' },
 *           fps: 30 | 50, videoKbps: number, audioKbps: number }} o
 * @returns {string[]}
 */
function buildFfmpegArgs(o) {
  const dests = usableDestinations(o);
  if (dests.length === 0) throw new Error('no_target');
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
    ...encodeArgs(o),
    ...outputArgs(dests),
  ];
}

/**
 * Argv for "Testen": a generated 1080p test pattern + 1 kHz tone, pushed for
 * `seconds` to one destination with the show's encoder settings.
 * @param {{ destination: object, fps: 30 | 50, videoKbps: number, audioKbps: number, seconds: number }} o
 */
function buildTestArgs(o) {
  const dests = usableDestinations({ destinations: [o.destination] });
  if (dests.length === 0) throw new Error('no_target');
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel', 'warning',
    '-stats',
    '-stats_period', '1',
    '-re',
    '-f', 'lavfi',
    '-i', `testsrc2=size=1920x1080:rate=${o.fps}`,
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:sample_rate=48000',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-t', String(o.seconds),
    ...encodeArgs(o),
    ...outputArgs(dests),
  ];
}

/**
 * Parse a tee slave failure line ("Slave muxer #1 failed: <reason>, continuing with …").
 * The index is the slave's position in the tee list = the destination's index.
 * @param {string} line
 * @returns {{ index: number, reason: string } | null}
 */
function parseSlaveFailure(line) {
  const m = /Slave muxer #(\d+) failed: (.*?)(?:, continuing with .*)?$/.exec(String(line));
  return m ? { index: Number(m[1]), reason: m[2].trim() } : null;
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
 * Mask ingest secrets (SRT passphrase/streamid, RTMP stream key) of every
 * destination in a log or error string before it reaches logs, status or the UI.
 * @param {string} text
 * @param {object | object[] | null | undefined} targets one target or a destination list
 * @returns {string}
 */
function maskSecrets(text, targets) {
  let out = String(text);
  const list = Array.isArray(targets) ? targets : targets ? [targets] : [];
  const secrets = [];
  for (const target of list) {
    if (!target) continue;
    if (target.kind === 'rtmp' && target.key) secrets.push(target.key);
    if (target.kind === 'srt' && target.url) {
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
  }
  // Tee slave lists carry escaped copies; mask those first (they are longer).
  const all = [...secrets.map(teeEscape), ...secrets].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const s of all) out = out.split(s).join('***');
  // Belt and braces for URLs not derived from the configured targets.
  return out.replace(/\b(passphrase|streamid)=[^&\s'"|\]]+/gi, '$1=***');
}

module.exports = {
  buildFfmpegArgs,
  buildTestArgs,
  parseProgress,
  parseSlaveFailure,
  nextRestartDelay,
  joinRtmpUrl,
  maskSecrets,
  teeEscape,
  usableDestinations,
};
