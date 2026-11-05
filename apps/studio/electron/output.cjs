'use strict';
// Output controller (Electron main): receives MediaRecorder Matroska chunks
// from the renderer, appends them to a local recording file and pipes them
// into ffmpeg, which encodes once with VideoToolbox and pushes to one or more
// SRT/RTMP(S) destinations (tee muxer for two or more). With no destination it
// only records (record-only mode, no ffmpeg at all).

const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildFfmpegArgs,
  buildTestArgs,
  parseProgress,
  parseSlaveFailure,
  nextRestartDelay,
  maskSecrets,
  usableDestinations,
} = require('./ffmpeg-args.cjs');

// Every MediaRecorder session starts with an EBML header (1A 45 DF A3).
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
// If ffmpeg cannot keep up, stdin buffers grow; past this we restart it.
const MAX_STDIN_BACKLOG = 32 * 1024 * 1024;
// A session that stays live this long resets the backoff attempt counter.
const STABLE_MS = 20000;
// "Ziel neu verbinden" waits at most this long for the old encoder to close its connections.
const RECONNECT_EXIT_CAP_MS = 2000;

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestampName(d = new Date()) {
  return (
    `roebel-studio-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function toBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof ArrayBuffer) return Buffer.from(chunk);
  if (ArrayBuffer.isView(chunk)) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return null;
}

/**
 * @param {{ sendStatus: (s: object) => void, onNeedHeader: () => void, log?: (msg: string) => void }} hooks
 */
function createOutput(hooks) {
  const rawLog = hooks.log || (() => {});
  // Never let ingest secrets (stream key, SRT passphrase) reach logs or status.
  const mask = (s) => maskSecrets(s, cfg && cfg.destinations);
  const log = (msg) => rawLog(mask(msg));
  let cfg = null;
  let started = false;
  let proc = null;
  let awaitingHeader = true; // ffmpeg is fed only from a chunk that starts with a header
  let recordStream = null;
  let restartTimer = null;
  let statusTimer = null;
  let attempt = 0;
  let liveSince = 0;
  let stderrTail = '';
  let progressLines = 0;
  let held = null; // short chunk that may be the start of an EBML header
  let recordOnly = false;
  let reconnecting = null; // pending reconnect() promise
  const openedFiles = new Set();

  /** @type {import('../src/state/types').OutputStatus} */
  let status = { state: 'idle', since: Date.now(), recordingBytes: 0, restarts: 0 };

  function setState(state, extra = {}) {
    if (status.state !== state) status = { ...status, state, since: Date.now() };
    Object.assign(status, extra);
    hooks.sendStatus({ ...status });
  }

  function openRecording() {
    closeRecording();
    try {
      // Re-create the directory in case it vanished after start (e.g. unplugged drive).
      fs.mkdirSync(cfg.recordDir, { recursive: true });
    } catch (err) {
      onRecordingError(err);
      return;
    }
    let file = path.join(cfg.recordDir, `${timestampName()}.mkv`);
    // existsSync misses files whose async open is still pending, so also
    // check the names opened in this process.
    for (let i = 2; fs.existsSync(file) || openedFiles.has(file); i++) {
      file = path.join(cfg.recordDir, `${timestampName()}-${i}.mkv`);
    }
    openedFiles.add(file);
    const stream = fs.createWriteStream(file, { flags: 'a' });
    stream.on('error', (err) => {
      if (stream !== recordStream) return;
      onRecordingError(err);
    });
    recordStream = stream;
    status.recordingFile = file;
    log(`recording → ${file}`);
  }

  // A failed stream is destroyed: drop it and keep recordingError set
  // ("Aufnahme unterbrochen"). It must NEVER restart MediaRecorder or ffmpeg:
  // the live stream outranks the recording. Recording resumes at the next
  // natural session start (reconnect or next start), when a header arrives
  // anyway; recordingError clears once a write into a new file succeeds.
  function onRecordingError(err) {
    log(`recording write error: ${err.message}`);
    status.recordingError = `Aufnahme: ${err.message}`;
    recordStream = null;
    hooks.sendStatus({ ...status });
  }

  function closeRecording() {
    return new Promise((resolve) => {
      if (!recordStream) return resolve();
      const s = recordStream;
      recordStream = null;
      s.end(resolve);
    });
  }

  /** Every destination starts 'ok' with each encoder process; tee reports the ones that fail. */
  function resetDestinations() {
    status.destinations = cfg.destinations.map((d) => ({ id: d.id, state: 'ok' }));
  }

  function markDestinationFailed(index, reason) {
    const list = status.destinations;
    if (!list || !list[index] || list[index].state === 'failed') return;
    list[index] = { id: list[index].id, state: 'failed', lastError: mask(reason).slice(0, 200) };
    hooks.sendStatus({ ...status, destinations: list.map((d) => ({ ...d })) });
  }

  function spawnFfmpeg() {
    const args = buildFfmpegArgs(cfg);
    resetDestinations();
    log(`spawn ${cfg.ffmpegPath} ${args.join(' ')}`);
    awaitingHeader = true;
    stderrTail = '';
    const p = spawn(cfg.ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    proc = p;
    p.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') log(`ffmpeg stdin error: ${err.message}`);
    });
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (data) => {
      for (const line of String(data).split(/[\r\n]+/)) {
        if (!line.trim()) continue;
        const prog = parseProgress(line);
        if (prog) {
          if (p !== proc) continue;
          Object.assign(status, prog);
          if (++progressLines % 10 === 0) log(`progress ${JSON.stringify(prog)}`);
          if (status.state !== 'live') {
            liveSince = Date.now();
            log('ffmpeg live');
            setState('live', { lastError: undefined });
          } else if (attempt > 0 && Date.now() - liveSince > STABLE_MS) {
            attempt = 0;
          }
        } else {
          stderrTail = mask(line).slice(0, 300);
          log(`ffmpeg: ${line}`);
          const slave = parseSlaveFailure(line);
          if (slave && p === proc) markDestinationFailed(slave.index, slave.reason);
        }
      }
    });
    p.on('error', (err) => {
      // Spawn failure (e.g. ENOENT): retrying will not help.
      if (p !== proc) return;
      proc = null;
      log(`ffmpeg spawn error: ${err.message}`);
      setState('error', { lastError: `ffmpeg: ${err.message}` });
    });
    p.on('exit', (code, signal) => {
      if (p !== proc) return;
      proc = null;
      log(`ffmpeg exited code=${code} signal=${signal}`);
      if (!started || status.state === 'error') return;
      // A single destination fails with its process (tee reports its own slaves).
      if (cfg.destinations.length === 1) markDestinationFailed(0, stderrTail || `ffmpeg beendet (${signal || code})`);
      const delay = nextRestartDelay(attempt);
      attempt += 1;
      setState('reconnecting', {
        lastError: stderrTail || `ffmpeg beendet (${signal || code})`,
        fps: undefined,
        kbps: undefined,
        speed: undefined,
      });
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (!started) return;
        status.restarts += 1;
        spawnFfmpeg();
        // The renderer restarts its MediaRecorder so ffmpeg gets a fresh Matroska header.
        hooks.onNeedHeader();
      }, delay);
    });
  }

  async function start(newCfg) {
    if (started) await stop();
    if (!newCfg) throw new Error('no_target');
    const destinations = usableDestinations(newCfg).map((d, i) => ({ ...d, id: typeof d.id === 'string' ? d.id : String(i) }));
    cfg = { ...newCfg, destinations, recordDir: expandHome(newCfg.recordDir) };
    delete cfg.target;
    fs.mkdirSync(cfg.recordDir, { recursive: true });
    recordOnly = destinations.length === 0;
    if (!recordOnly) buildFfmpegArgs(cfg); // validate before flipping state
    started = true;
    held = null;
    attempt = 0;
    if (recordOnly) {
      // Nur aufnehmen: chunks go to the recording file only, no encoder.
      log('record-only mode (no destination)');
      status = { state: 'live', since: Date.now(), recordingBytes: 0, restarts: 0, recordOnly: true, destinations: [] };
      hooks.sendStatus({ ...status });
    } else {
      status = { state: 'connecting', since: Date.now(), recordingBytes: 0, restarts: 0 };
      hooks.sendStatus({ ...status });
      spawnFfmpeg();
    }
    clearInterval(statusTimer);
    statusTimer = setInterval(() => hooks.sendStatus({ ...status }), 1000);
  }

  function chunk(raw) {
    if (!started) return;
    let buf = toBuffer(raw);
    if (!buf || buf.length === 0) return;
    // Chrome emits the first byte of a new session's EBML header as its own
    // 1-byte chunk. Hold such a short prefix until the next chunk so header
    // detection sees the whole magic.
    if (held) {
      buf = Buffer.concat([held, buf]);
      held = null;
    }
    if (buf.length < EBML_MAGIC.length && EBML_MAGIC.subarray(0, buf.length).equals(buf)) {
      held = buf;
      return;
    }
    const isHeader = buf.length >= 4 && buf.subarray(0, 4).equals(EBML_MAGIC);

    // 1) Recording first, so an ffmpeg failure never loses footage.
    //    Each recorder session (fresh header) gets its own file. Without a
    //    header there is no playable file to start, so after a write error
    //    chunks are skipped until the requested new session arrives.
    if (isHeader) openRecording();
    if (recordStream) {
      const stream = recordStream;
      if (status.recordingError) {
        stream.write(buf, (err) => {
          if (!err && stream === recordStream && status.recordingError) {
            log('recording resumed');
            status.recordingError = undefined;
            hooks.sendStatus({ ...status });
          }
        });
      } else {
        stream.write(buf);
      }
      status.recordingBytes += buf.length;
    }

    // 2) Then the encoder.
    if (isHeader && proc && !awaitingHeader) {
      // A new recorder session while ffmpeg is mid-stream (renderer restarted
      // its recorder on its own): ffmpeg cannot take a second header, so hand
      // the new session to a fresh process. Not counted as a restart, but
      // shown as 'connecting' so the UI does not hide the gap.
      const old = proc;
      proc = null;
      log('new recorder session, restarting encoder');
      old.stdin.end();
      old.kill('SIGTERM');
      setState('connecting');
      spawnFfmpeg();
    }
    if (!proc || !proc.stdin.writable) return;
    if (awaitingHeader) {
      if (!isHeader) return;
      awaitingHeader = false;
    }
    if (proc.stdin.writableLength > MAX_STDIN_BACKLOG) {
      log('ffmpeg stdin backlog too large, restarting encoder');
      proc.kill('SIGKILL');
      return;
    }
    proc.stdin.write(buf);
  }

  /**
   * "Ziel neu verbinden": a failed tee slave is never retried by ffmpeg, so
   * restart the whole encoder (brief gap on every destination). Waits for the
   * old process to close its connections before the new one opens them.
   */
  function reconnect() {
    if (!started || recordOnly) return Promise.resolve();
    if (reconnecting) return reconnecting;
    reconnecting = (async () => {
      const old = proc;
      proc = null;
      clearTimeout(restartTimer);
      restartTimer = null;
      log('manual reconnect, restarting encoder');
      setState('connecting', { fps: undefined, kbps: undefined, speed: undefined });
      if (old) {
        await new Promise((resolve) => {
          const killer = setTimeout(() => {
            old.kill('SIGKILL');
            resolve();
          }, RECONNECT_EXIT_CAP_MS);
          old.once('exit', () => {
            clearTimeout(killer);
            resolve();
          });
          old.stdin.end();
          old.kill('SIGTERM');
        });
      }
      if (!started) return;
      attempt = 0;
      spawnFfmpeg();
      hooks.sendStatus({ ...status, destinations: status.destinations.map((d) => ({ ...d })) });
      // The new process needs a fresh Matroska header.
      hooks.onNeedHeader();
    })().finally(() => {
      reconnecting = null;
    });
    return reconnecting;
  }

  async function stop() {
    if (held && recordStream) recordStream.write(held);
    held = null;
    started = false;
    recordOnly = false;
    clearTimeout(restartTimer);
    restartTimer = null;
    clearInterval(statusTimer);
    statusTimer = null;
    const p = proc;
    proc = null;
    if (p) {
      await new Promise((resolve) => {
        const killer = setTimeout(() => {
          p.kill('SIGKILL');
          resolve();
        }, 3000);
        p.once('exit', () => {
          clearTimeout(killer);
          resolve();
        });
        p.stdin.end(); // EOF lets ffmpeg flush and exit cleanly
      });
    }
    await closeRecording();
    status = { ...status, state: 'idle', since: Date.now(), fps: undefined, kbps: undefined, speed: undefined };
    hooks.sendStatus({ ...status });
  }

  return {
    start,
    chunk,
    stop,
    reconnect,
    getStatus: () => ({ ...status, destinations: status.destinations && status.destinations.map((d) => ({ ...d })) }),
  };
}

/**
 * "Testen": push a generated test pattern + tone to ONE destination for
 * `seconds` (default 20) with the show encoder settings. Independent of the UI
 * and of a running show. Errors are masked; the key never reaches the result.
 * @param {{ destination: object, fps: 30 | 50, videoKbps: number, audioKbps: number, ffmpegPath: string,
 *           seconds?: number, log?: (msg: string) => void }} o
 * @returns {Promise<{ ok: boolean, error?: string, seconds?: number }>}
 */
function testDestination(o) {
  const seconds = o.seconds || 20;
  const mask = (s) => maskSecrets(s, [o.destination]);
  const log = (msg) => (o.log ? o.log(mask(msg)) : undefined);
  let args;
  try {
    args = buildTestArgs({ ...o, seconds });
  } catch (e) {
    return Promise.resolve({ ok: false, error: e.message === 'no_target' ? 'Adresse fehlt' : mask(e.message) });
  }
  return new Promise((resolve) => {
    const t0 = Date.now();
    let tail = '';
    let progress = false;
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      log(`test finished: ${JSON.stringify(r)}`);
      resolve(r);
    };
    log(`test spawn ${o.ffmpegPath} ${args.join(' ')}`);
    const p = spawn(o.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    // Connect timeouts + the run itself; never hang the Settings tab.
    const watchdog = setTimeout(() => {
      p.kill('SIGKILL');
      finish({ ok: false, error: 'Zeitüberschreitung' });
    }, (seconds + 20) * 1000);
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (data) => {
      for (const line of String(data).split(/[\r\n]+/)) {
        if (!line.trim()) continue;
        if (parseProgress(line)) progress = true;
        else tail = mask(line).slice(0, 300);
      }
    });
    p.on('error', (err) =>
      finish({ ok: false, error: err.code === 'ENOENT' ? `ffmpeg nicht gefunden (ENOENT)` : mask(err.message) }),
    );
    p.on('exit', (code, signal) => {
      const secs = Math.round((Date.now() - t0) / 1000);
      if (code === 0) finish({ ok: true });
      else finish({ ok: false, error: tail || `ffmpeg beendet (${signal || code})`, seconds: progress ? secs : 0 });
    });
  });
}

/**
 * "Prüfen": does this ffmpeg run, speak SRT and have the VideoToolbox H.264 encoder?
 * @param {string} ffmpegPath
 * @returns {Promise<{ ok: boolean, version: string | null, srt: boolean, videotoolbox: boolean, error?: string }>}
 */
async function checkFfmpeg(ffmpegPath) {
  const run = (args) =>
    new Promise((resolve, reject) => {
      execFile(ffmpegPath, ['-hide_banner', ...args], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') return reject(new Error('ffmpeg nicht gefunden (ENOENT)'));
        if (err && !stdout) return reject(new Error(String(stderr || err.message).trim().slice(0, 200)));
        resolve(String(stdout));
      });
    });
  try {
    const [versionOut, protocols, encoders] = await Promise.all([run(['-version']), run(['-protocols']), run(['-encoders'])]);
    const version = (/^ffmpeg version (\S+)/m.exec(versionOut) || [])[1] || null;
    const srt = /^\s*srt\s*$/m.test(protocols);
    const videotoolbox = /\bh264_videotoolbox\b/.test(encoders);
    return { ok: srt && videotoolbox, version, srt, videotoolbox };
  } catch (e) {
    return { ok: false, version: null, srt: false, videotoolbox: false, error: e.message };
  }
}

module.exports = { createOutput, testDestination, checkFfmpeg, expandHome, timestampName };
