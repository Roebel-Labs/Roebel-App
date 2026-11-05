'use strict';
// Output controller (Electron main): receives MediaRecorder Matroska chunks
// from the renderer, appends them to a local recording file and pipes them
// into ffmpeg, which encodes with VideoToolbox and pushes to SRT/RTMP(S).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFfmpegArgs, parseProgress, nextRestartDelay, maskSecrets } = require('./ffmpeg-args.cjs');

// Every MediaRecorder session starts with an EBML header (1A 45 DF A3).
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
// If ffmpeg cannot keep up, stdin buffers grow; past this we restart it.
const MAX_STDIN_BACKLOG = 32 * 1024 * 1024;
// A session that stays live this long resets the backoff attempt counter.
const STABLE_MS = 20000;

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
  const mask = (s) => maskSecrets(s, cfg && cfg.target);
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

  /** @type {import('../src/state/types').OutputStatus} */
  let status = { state: 'idle', since: Date.now(), recordingBytes: 0, restarts: 0 };

  function setState(state, extra = {}) {
    if (status.state !== state) status = { ...status, state, since: Date.now() };
    Object.assign(status, extra);
    hooks.sendStatus({ ...status });
  }

  function openRecording() {
    closeRecording();
    let file = path.join(cfg.recordDir, `${timestampName()}.mkv`);
    for (let i = 2; fs.existsSync(file); i++) {
      file = path.join(cfg.recordDir, `${timestampName()}-${i}.mkv`);
    }
    recordStream = fs.createWriteStream(file, { flags: 'a' });
    recordStream.on('error', (err) => {
      log(`recording write error: ${err.message}`);
      status.lastError = `Aufnahme: ${err.message}`;
    });
    status.recordingFile = file;
    log(`recording → ${file}`);
  }

  function closeRecording() {
    return new Promise((resolve) => {
      if (!recordStream) return resolve();
      const s = recordStream;
      recordStream = null;
      s.end(resolve);
    });
  }

  function spawnFfmpeg() {
    const args = buildFfmpegArgs(cfg);
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
    if (!newCfg || !newCfg.target || newCfg.target.kind === 'none') throw new Error('no_target');
    cfg = { ...newCfg, recordDir: expandHome(newCfg.recordDir) };
    fs.mkdirSync(cfg.recordDir, { recursive: true });
    buildFfmpegArgs(cfg); // validate before flipping state
    started = true;
    held = null;
    attempt = 0;
    status = { state: 'connecting', since: Date.now(), recordingBytes: 0, restarts: 0 };
    hooks.sendStatus({ ...status });
    spawnFfmpeg();
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
    //    Each recorder session (fresh header) gets its own file.
    if (isHeader || !recordStream) openRecording();
    recordStream.write(buf);
    status.recordingBytes += buf.length;

    // 2) Then the encoder.
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

  async function stop() {
    if (held && recordStream) recordStream.write(held);
    held = null;
    started = false;
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

  return { start, chunk, stop, getStatus: () => ({ ...status }) };
}

module.exports = { createOutput, expandHome, timestampName };
