import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createOutput } = require('../output.cjs');

const FAKE_FFMPEG = path.join(__dirname, 'fixtures', 'fake-ffmpeg.cjs');
const MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

type Status = {
  state: string;
  recordingFile?: string;
  recordingBytes: number;
  restarts: number;
  recordingError?: string;
  recordOnly?: boolean;
  lastError?: string;
  recordingOff?: boolean;
  destinations?: { id: string; state: 'ok' | 'failed'; lastError?: string }[];
};

const header = (n = 64) => Buffer.from([...MAGIC, ...new Array(n).fill(0x42)]);
const cluster = (n = 256) => Buffer.from([0x1f, 0x43, 0xb6, 0x75, ...new Array(n).fill(0x11)]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs = 2500) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('waitFor timeout');
    await sleep(10);
  }
}

let dir: string;
let dump: string;
let out: ReturnType<typeof createOutput>;
let statuses: Status[];
let needHeader: ReturnType<typeof vi.fn>;

const last = () => statuses[statuses.length - 1];
const mkvFiles = () => fs.readdirSync(dir).filter((f) => f.endsWith('.mkv')).sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-output-'));
  dump = path.join(dir, 'ffmpeg-stdin.bin');
  process.env.FAKE_FFMPEG_DUMP = dump;
  delete process.env.FAKE_FFMPEG_EXIT_MS;
  statuses = [];
  needHeader = vi.fn();
  out = createOutput({ sendStatus: (s: Status) => statuses.push(s), onNeedHeader: needHeader });
});

afterEach(async () => {
  await out.stop();
  vi.restoreAllMocks();
  delete process.env.FAKE_FFMPEG_DUMP;
  delete process.env.FAKE_FFMPEG_EXIT_MS;
  delete process.env.FAKE_FFMPEG_PIDS;
  delete process.env.FAKE_FFMPEG_STDERR;
  delete process.env.FAKE_FFMPEG_ARGS;
  delete process.env.FAKE_FFMPEG_IGNORE_TERM;
  fs.rmSync(dir, { recursive: true, force: true });
});

const cfg = () => ({
  destinations: [{ id: 'cf', kind: 'srt', url: 'srt://127.0.0.1:9000' }],
  fps: 30,
  videoKbps: 6000,
  audioKbps: 160,
  recordDir: dir,
  ffmpegPath: FAKE_FFMPEG,
});

describe('createOutput', () => {
  it('ignores chunks before start', () => {
    out.chunk(header());
    expect(mkvFiles()).toEqual([]);
  });

  it('coalesces a 1-byte 0x1a chunk with the rest of the EBML header', async () => {
    await out.start(cfg());
    out.chunk(Buffer.from([0x1a]));
    out.chunk(Buffer.from([0x45, 0xdf, 0xa3, 0x42, 0x42]));
    out.chunk(cluster());
    await waitFor(() => last()?.state === 'live');
    await waitFor(() => fs.existsSync(dump) && fs.statSync(dump).size === 6 + 260);
    expect([...fs.readFileSync(dump).subarray(0, 4)]).toEqual(MAGIC);
    expect(mkvFiles()).toHaveLength(1);
    await out.stop();
    const rec = fs.readFileSync(path.join(dir, mkvFiles()[0]));
    expect([...rec.subarray(0, 4)]).toEqual(MAGIC);
    expect(rec.length).toBe(6 + 260);
  });

  it('reconnects after an ffmpeg exit while the recording keeps growing', async () => {
    process.env.FAKE_FFMPEG_EXIT_MS = '150';
    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => last()?.state === 'reconnecting');
    delete process.env.FAKE_FFMPEG_EXIT_MS; // the respawned process stays up

    const file = path.join(dir, mkvFiles()[0]);
    const before = fs.statSync(file).size;
    out.chunk(cluster());
    out.chunk(cluster());
    await waitFor(() => fs.statSync(file).size === before + 2 * 260);

    // backoff (1 s) → respawn + request a fresh recorder header
    await waitFor(() => needHeader.mock.calls.length === 1);
    expect(out.getStatus().restarts).toBe(1);

    out.chunk(header()); // renderer's new MediaRecorder session
    out.chunk(cluster());
    await waitFor(() => last()?.state === 'live');
    await waitFor(() => mkvFiles().length === 2);
  });

  it('does not respawn when stopped during the backoff', async () => {
    process.env.FAKE_FFMPEG_EXIT_MS = '100';
    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => last()?.state === 'reconnecting');
    await out.stop();
    await sleep(1200); // longer than nextRestartDelay(0)
    expect(needHeader).not.toHaveBeenCalled();
    expect(last().state).toBe('idle');
    expect(last().restarts).toBe(0);
  });

  it('a recording write error never restarts the encoder; recording resumes at the next reconnect', async () => {
    const realCreate = fs.createWriteStream;
    const streams: fs.WriteStream[] = [];
    vi.spyOn(fs, 'createWriteStream').mockImplementation(((...args: Parameters<typeof realCreate>) => {
      const s = realCreate(...args);
      streams.push(s);
      return s;
    }) as typeof realCreate);
    const pidsFile = path.join(dir, 'pids.txt');
    process.env.FAKE_FFMPEG_PIDS = pidsFile;
    const pids = () => fs.readFileSync(pidsFile, 'utf8').trim().split('\n').map(Number);

    await out.start(cfg());
    out.chunk(header());
    out.chunk(cluster());
    await waitFor(() => last()?.state === 'live');
    const dumpBefore = () => fs.readFileSync(dump).length;
    await waitFor(() => dumpBefore() === 68 + 260);

    streams[0].destroy(new Error('ENOSPC: no space left on device'));
    await waitFor(() => last()?.recordingError !== undefined);
    expect(last().recordingError).toMatch(/ENOSPC/);

    // The live stream is untouched: same ffmpeg process keeps getting data.
    out.chunk(cluster());
    await waitFor(() => dumpBefore() === 68 + 2 * 260);
    await sleep(150);
    expect(needHeader).not.toHaveBeenCalled();
    expect(pids()).toHaveLength(1);
    expect(out.getStatus().restarts).toBe(0);
    expect(out.getStatus().state).toBe('live');
    expect(out.getStatus().recordingError).toMatch(/ENOSPC/); // still broken
    expect(mkvFiles()).toHaveLength(1); // headerless chunk opened no new file

    // Natural session start: ffmpeg exits → backoff → respawn + onNeedHeader.
    process.kill(pids()[0], 'SIGKILL');
    await waitFor(() => needHeader.mock.calls.length === 1);
    await waitFor(() => pids().length === 2); // exactly one respawn

    out.chunk(header()); // renderer's new MediaRecorder session
    out.chunk(cluster());
    await waitFor(() => mkvFiles().length === 2);
    await waitFor(() => out.getStatus().recordingError === undefined);
    await waitFor(() => fs.statSync(out.getStatus().recordingFile).size === 68 + 260);
    const rec2 = fs.readFileSync(out.getStatus().recordingFile);
    expect([...rec2.subarray(0, 4)]).toEqual(MAGIC);
    await waitFor(() => last()?.state === 'live');
    expect(out.getStatus().restarts).toBe(1);
  });

  it("shows 'connecting' while a mid-stream recorder restart hands over to a fresh ffmpeg", async () => {
    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => last()?.state === 'live');
    const n = statuses.length;
    out.chunk(header()); // renderer restarted its recorder on its own
    expect(statuses.slice(n).map((s) => s.state)).toContain('connecting');
    await waitFor(() => last()?.state === 'live');
    expect(out.getStatus().restarts).toBe(0);
  });

  it('a mid-stream recorder restart SIGKILLs an old encoder that ignores SIGTERM (no orphan holding the key)', async () => {
    const pidsFile = path.join(dir, 'pids.txt');
    process.env.FAKE_FFMPEG_PIDS = pidsFile;
    process.env.FAKE_FFMPEG_IGNORE_TERM = '1';
    const pids = () => fs.readFileSync(pidsFile, 'utf8').trim().split('\n').map(Number);
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => last()?.state === 'live');
    delete process.env.FAKE_FFMPEG_IGNORE_TERM; // the fresh encoder behaves
    out.chunk(header());
    await waitFor(() => pids().length === 2);
    const [old] = pids();
    await sleep(500);
    expect(alive(old)).toBe(true); // SIGTERM alone does not end it
    await waitFor(() => !alive(old), 3000);
    expect(alive(pids()[1])).toBe(true);
  }, 8000);

  it('flags a slow destination on "FIFO queue full" and rate-limits that line in the log', async () => {
    process.env.FAKE_FFMPEG_STDERR = '[fifo @ 0x7f8] FIFO queue full';
    const logs: string[] = [];
    out = createOutput({ sendStatus: (s: Status) => statuses.push(s), onNeedHeader: needHeader, log: (m: string) => logs.push(m) });
    const t0 = Date.now();
    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => (out.getStatus() as Status & { slowDestinationAt?: number }).slowDestinationAt !== undefined);
    expect((out.getStatus() as Status & { slowDestinationAt?: number }).slowDestinationAt).toBeGreaterThanOrEqual(t0);
    expect(logs.filter((l) => /FIFO queue full/.test(l))).toHaveLength(1);
  });

  it('"Lokal aufnehmen" off: streams to ffmpeg but writes no .mkv', async () => {
    await out.start({ ...cfg(), record: false });
    out.chunk(header());
    out.chunk(cluster());
    await waitFor(() => fs.existsSync(dump) && fs.statSync(dump).size > 0);
    expect(mkvFiles()).toEqual([]);
    expect(out.getStatus().recordingOff).toBe(true);
  });

  it('no destination and recording off refuses to start', async () => {
    await expect(out.start({ ...cfg(), destinations: [], record: false })).rejects.toThrow('nothing_to_do');
  });

  it('record-only mode (no destinations) writes the recording without spawning ffmpeg', async () => {
    const pidsFile = path.join(dir, 'pids.txt');
    process.env.FAKE_FFMPEG_PIDS = pidsFile;
    await out.start({ ...cfg(), destinations: [] });
    expect(out.getStatus().recordOnly).toBe(true);
    expect(out.getStatus().state).toBe('live');
    out.chunk(header());
    out.chunk(cluster());
    await sleep(200);
    expect(fs.existsSync(pidsFile)).toBe(false);
    expect(fs.existsSync(dump)).toBe(false);
    expect(mkvFiles()).toHaveLength(1);
    expect(out.getStatus().recordingBytes).toBe(68 + 260);
    const first = out.getStatus().recordingFile!;
    // A new recorder session opens a new file; still no encoder.
    out.chunk(header());
    await waitFor(() => mkvFiles().length === 2);
    expect(fs.existsSync(pidsFile)).toBe(false);
    await out.stop();
    expect(last().state).toBe('idle');
    expect(fs.readFileSync(first).length).toBe(68 + 260);
  });

  it('marks a failed tee slave per destination (masked), the others stay ok', async () => {
    process.env.FAKE_FFMPEG_STDERR =
      "[tee @ 0x1] Slave '[f=flv:onfail=ignore]rtmp://a.rtmp.youtube.com/live2/SECRETKEY': error opening: I/O error";
    const two = {
      ...cfg(),
      destinations: [
        { id: 'cf', kind: 'srt', url: 'srt://127.0.0.1:9000' },
        { id: 'yt', kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'SECRETKEY' },
      ],
    };
    const logs: string[] = [];
    out = createOutput({ sendStatus: (s: Status) => statuses.push(s), onNeedHeader: needHeader, log: (m: string) => logs.push(m) });
    await out.start(two);
    expect(out.getStatus().destinations).toEqual([
      { id: 'cf', state: 'ok' },
      { id: 'yt', state: 'ok' },
    ]);
    out.chunk(header());
    await waitFor(() => last()?.state === 'live');
    // fake emits only the open line; the index line comes next in real ffmpeg
    await out.stop();

    process.env.FAKE_FFMPEG_STDERR = '[tee @ 0x1] Slave muxer #1 failed: I/O error, continuing with 1/2 slaves.';
    statuses = [];
    await out.start(two);
    out.chunk(header());
    await waitFor(() => out.getStatus().destinations?.[1].state === 'failed');
    const d = out.getStatus().destinations!;
    expect(d[0]).toEqual({ id: 'cf', state: 'ok' });
    expect(d[1]).toEqual({ id: 'yt', state: 'failed', lastError: 'I/O error' });
    expect(out.getStatus().state).toBe('live');
    expect(logs.join('\n')).not.toContain('SECRETKEY');
    expect(JSON.stringify(statuses)).not.toContain('SECRETKEY');
  });

  it('reconnect() restarts the encoder once, asks for a fresh header and resets destination states', async () => {
    const pidsFile = path.join(dir, 'pids.txt');
    process.env.FAKE_FFMPEG_PIDS = pidsFile;
    const pids = () => fs.readFileSync(pidsFile, 'utf8').trim().split('\n').map(Number);
    process.env.FAKE_FFMPEG_STDERR = '[tee @ 0x1] Slave muxer #0 failed: Connection refused, continuing with 1/2 slaves.';
    await out.start({
      ...cfg(),
      destinations: [
        { id: 'a', kind: 'srt', url: 'srt://127.0.0.1:9000' },
        { id: 'b', kind: 'srt', url: 'srt://127.0.0.1:9001' },
      ],
    });
    out.chunk(header());
    await waitFor(() => out.getStatus().destinations?.[0].state === 'failed');
    delete process.env.FAKE_FFMPEG_STDERR;
    await out.reconnect();
    await waitFor(() => pids().length === 2);
    expect(needHeader).toHaveBeenCalledTimes(1);
    expect(out.getStatus().destinations).toEqual([
      { id: 'a', state: 'ok' },
      { id: 'b', state: 'ok' },
    ]);
    out.chunk(header());
    await waitFor(() => last()?.state === 'live');
    await sleep(1300); // no extra backoff respawn from the killed process
    expect(pids()).toHaveLength(2);
  });

  it('reconnect(destinations) drops a destination the operator switched off, without ending the session', async () => {
    const argsFile = path.join(dir, 'args.txt');
    process.env.FAKE_FFMPEG_ARGS = argsFile;
    const argvs = () => fs.readFileSync(argsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[]);
    await out.start({
      ...cfg(),
      destinations: [
        { id: 'a', kind: 'srt', url: 'srt://127.0.0.1:9000' },
        { id: 'b', kind: 'rtmp', url: 'rtmp://hung.example/live', key: 'K' },
      ],
    });
    out.chunk(header());
    await waitFor(() => last()?.state === 'live');
    await out.reconnect([{ id: 'a', kind: 'srt', url: 'srt://127.0.0.1:9000' }]);
    await waitFor(() => fs.existsSync(argsFile) && argvs().length === 2);
    const second = argvs()[1];
    expect(second).not.toContain('tee');
    expect(second[second.length - 1]).toBe('srt://127.0.0.1:9000');
    expect(out.getStatus().destinations).toEqual([{ id: 'a', state: 'ok' }]);
    expect(needHeader).toHaveBeenCalledTimes(1);
  });

  it('reconnect() refuses to drop every destination (stays on air with the old set)', async () => {
    await out.start(cfg());
    await expect(out.reconnect([])).rejects.toThrow('no_target');
    expect(out.getStatus().destinations).toEqual([{ id: 'cf', state: 'ok' }]);
  });

  it('a stop()+start() during the reconnect wait never leaves an orphan encoder', async () => {
    const pidsFile = path.join(dir, 'pids.txt');
    process.env.FAKE_FFMPEG_PIDS = pidsFile;
    const pids = () => fs.readFileSync(pidsFile, 'utf8').trim().split('\n').map(Number);
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => last()?.state === 'live');
    const r = out.reconnect(); // waits for the old process to exit
    await out.stop();
    await out.start(cfg());
    await r;
    await sleep(300);
    const living = pids().filter(alive);
    expect(living).toHaveLength(1); // only the new session's encoder
  });

  it('a single destination is not marked failed while the encoder restarts (it shows reconnecting)', async () => {
    process.env.FAKE_FFMPEG_EXIT_MS = '150';
    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => last()?.state === 'reconnecting');
    expect(last().destinations).toEqual([{ id: 'cf', state: 'ok' }]);
  });

  it('reconnect() is a no-op in record-only mode', async () => {
    const pidsFile = path.join(dir, 'pids.txt');
    process.env.FAKE_FFMPEG_PIDS = pidsFile;
    await out.start({ ...cfg(), destinations: [] });
    await out.reconnect();
    expect(fs.existsSync(pidsFile)).toBe(false);
    expect(needHeader).not.toHaveBeenCalled();
  });
});

describe('testDestination', () => {
  const { testDestination } = require('../output.cjs');

  it('runs one ffmpeg test-pattern push to that destination only and reports ok', async () => {
    const argsFile = path.join(dir, 'args.txt');
    process.env.FAKE_FFMPEG_ARGS = argsFile;
    const r = await testDestination({
      destination: { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'KEY1' },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
      ffmpegPath: FAKE_FFMPEG,
      seconds: 1,
    });
    expect(r).toEqual({ ok: true });
    const argv: string[] = JSON.parse(fs.readFileSync(argsFile, 'utf8').trim());
    expect(argv[argv.length - 1]).toBe('rtmp://a.rtmp.youtube.com/live2/KEY1');
    expect(argv).toContain('lavfi');
  });

  it('reports a masked error when ffmpeg fails', async () => {
    process.env.FAKE_FFMPEG_EXIT_MS = '50';
    process.env.FAKE_FFMPEG_STDERR = 'x';
    const r = await testDestination({
      destination: { kind: 'srt', url: 'srt://h:1?passphrase=topsecret1' },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
      ffmpegPath: FAKE_FFMPEG,
      seconds: 5,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.error).not.toContain('topsecret1');
  });

  it('can be aborted (going live kills a running test)', async () => {
    const ac = new AbortController();
    const p = testDestination({
      destination: { kind: 'srt', url: 'srt://h:1' },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
      ffmpegPath: FAKE_FFMPEG,
      seconds: 20,
      signal: ac.signal,
      // stdin is ignored, so the fake would exit at once; keep it running like a real push
      env: { ...process.env, FAKE_FFMPEG_EXIT_MS: '60000' },
    });
    await sleep(150);
    ac.abort();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/abgebrochen/i);
  });

  it('reports a missing ffmpeg binary', async () => {
    const r = await testDestination({
      destination: { kind: 'srt', url: 'srt://h:1' },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
      ffmpegPath: path.join(dir, 'nope'),
      seconds: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ENOENT|nicht gefunden/);
  });
});

describe('resolveEncoder', () => {
  const { resolveEncoder } = require('../output.cjs');

  it('picks the first Windows candidate whose probe encode succeeds', async () => {
    const tried: string[] = [];
    const run = async (_bin: string, args: string[]) => {
      const enc = args[args.indexOf('-c:v') + 1];
      tried.push(enc);
      return enc === 'h264_qsv';
    };
    expect(await resolveEncoder('C:\\ff-qsv.exe', { platform: 'win32', run })).toBe('h264_qsv');
    expect(tried).toEqual(['h264_nvenc', 'h264_qsv']);
  });

  it('falls back to libx264 when no GPU encoder works', async () => {
    const run = async (_bin: string, args: string[]) => args.includes('libx264');
    expect(await resolveEncoder('C:\\ff-cpu.exe', { platform: 'win32', run })).toBe('libx264');
  });

  it('caches a success per binary and does not cache a failure', async () => {
    let calls = 0;
    const fail = async () => {
      calls += 1;
      return false;
    };
    expect(await resolveEncoder('/ff-none', { platform: 'darwin', run: fail })).toBeNull();
    expect(await resolveEncoder('/ff-none', { platform: 'darwin', run: fail })).toBeNull();
    expect(calls).toBe(4);
    const ok = async () => true;
    expect(await resolveEncoder('/ff-vt', { platform: 'darwin', run: ok })).toBe('h264_videotoolbox');
    expect(await resolveEncoder('/ff-vt', { platform: 'darwin', run: fail })).toBe('h264_videotoolbox');
  });
});

describe('expandHome', () => {
  const { expandHome } = require('../output.cjs');
  it('expands ~/ into the home folder', () => {
    expect(expandHome('~/Movies/Ortis Studio', 'darwin')).toBe(path.join(os.homedir(), 'Movies', 'Ortis Studio'));
  });
  it('puts the default Movies folder into Videos on Windows', () => {
    expect(expandHome('~/Movies/Ortis Studio', 'win32')).toBe(path.join(os.homedir(), 'Videos', 'Ortis Studio'));
  });
  it('leaves absolute paths alone', () => {
    expect(expandHome('D:\\Aufnahmen', 'win32')).toBe('D:\\Aufnahmen');
  });
});
