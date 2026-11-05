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
  fs.rmSync(dir, { recursive: true, force: true });
});

const cfg = () => ({
  target: { kind: 'srt', url: 'srt://127.0.0.1:9000' },
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

  it('recovers the recording after a write error via a fresh recorder session', async () => {
    const realCreate = fs.createWriteStream;
    const streams: fs.WriteStream[] = [];
    vi.spyOn(fs, 'createWriteStream').mockImplementation(((...args: Parameters<typeof realCreate>) => {
      const s = realCreate(...args);
      streams.push(s);
      return s;
    }) as typeof realCreate);

    await out.start(cfg());
    out.chunk(header());
    await waitFor(() => last()?.state === 'live');

    streams[0].destroy(new Error('ENOSPC: no space left on device'));
    await waitFor(() => needHeader.mock.calls.length === 1);
    expect(last().recordingError).toMatch(/ENOSPC/);

    out.chunk(cluster()); // headerless tail of the old session: no new file
    expect(mkvFiles()).toHaveLength(1);

    out.chunk(header()); // renderer restarted MediaRecorder
    out.chunk(cluster());
    await waitFor(() => mkvFiles().length === 2);
    await waitFor(() => fs.statSync(out.getStatus().recordingFile).size === 68 + 260);
    const rec2 = fs.readFileSync(out.getStatus().recordingFile);
    expect([...rec2.subarray(0, 4)]).toEqual(MAGIC);

    // ffmpeg was handed to a fresh process starting at the new header
    await waitFor(() => {
      const d = fs.readFileSync(dump);
      return d.indexOf(Buffer.from(MAGIC), 1) !== -1;
    });
    await sleep(120); // progress lines arrive → live again
    expect(last().state).toBe('live');
    expect(last().recordingError).toMatch(/ENOSPC/); // sticky
    expect(last().restarts).toBe(0);
  });
});
