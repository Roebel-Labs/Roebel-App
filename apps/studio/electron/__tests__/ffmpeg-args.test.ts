import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildFfmpegArgs, parseProgress } = require('../ffmpeg-args.cjs');

const SRT_URL = 'srt://live.cloudflare.com:778?passphrase=x&streamid=y';

function valueAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe('buildFfmpegArgs', () => {
  it('builds SRT args at 30 fps, 6000/160 kbps', () => {
    const args: string[] = buildFfmpegArgs({
      target: { kind: 'srt', url: SRT_URL },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
    });
    expect(valueAfter(args, '-i')).toBe('pipe:0');
    expect(valueAfter(args, '-c:v')).toBe('h264_videotoolbox');
    expect(valueAfter(args, '-b:v')).toBe('6000k');
    expect(valueAfter(args, '-maxrate')).toBe('6000k');
    expect(valueAfter(args, '-bufsize')).toBe('12000k');
    expect(valueAfter(args, '-g')).toBe('60');
    expect(valueAfter(args, '-r')).toBe('30');
    expect(valueAfter(args, '-profile:v')).toBe('high');
    expect(valueAfter(args, '-c:a')).toBe('aac');
    expect(valueAfter(args, '-b:a')).toBe('160k');
    expect(valueAfter(args, '-ar')).toBe('48000');
    expect(args).toContain('mpegts');
    expect(args[args.length - 1]).toBe(SRT_URL);
  });

  it('reads matroska from stdin with generated pts and flushes packets', () => {
    const args: string[] = buildFfmpegArgs({
      target: { kind: 'srt', url: SRT_URL },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
    });
    const iIdx = args.indexOf('-i');
    const inputPart = args.slice(0, iIdx);
    expect(inputPart).toEqual(expect.arrayContaining(['-fflags', '+genpts', '-f', 'matroska']));
    expect(valueAfter(args, '-flush_packets')).toBe('1');
  });

  it('uses GOP 100 and -r 50 at 50 fps', () => {
    const args: string[] = buildFfmpegArgs({
      target: { kind: 'srt', url: SRT_URL },
      fps: 50,
      videoKbps: 6000,
      audioKbps: 160,
    });
    expect(valueAfter(args, '-g')).toBe('100');
    expect(valueAfter(args, '-r')).toBe('50');
  });

  it('builds RTMPS args with flv and key appended to the url', () => {
    const args: string[] = buildFfmpegArgs({
      target: { kind: 'rtmp', url: 'rtmps://live.cloudflare.com:443/live/', key: 'abc' },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
    });
    const outFmtIdx = args.lastIndexOf('-f');
    expect(args[outFmtIdx + 1]).toBe('flv');
    expect(args).not.toContain('mpegts');
    expect(args[args.length - 1]).toBe('rtmps://live.cloudflare.com:443/live/abc');
  });

  it("throws 'no_target' for kind none", () => {
    expect(() =>
      buildFfmpegArgs({ target: { kind: 'none' }, fps: 30, videoKbps: 6000, audioKbps: 160 }),
    ).toThrow('no_target');
  });
});

describe('parseProgress', () => {
  it('parses an ffmpeg progress line', () => {
    expect(
      parseProgress(
        'frame= 300 fps= 30 q=-0.0 size= 2048kB time=00:00:10.00 bitrate=6012.3kbits/s dup=0 drop=2 speed=1.00x',
      ),
    ).toEqual({ fps: 30, kbps: 6012.3, speed: 1, dropped: 2 });
  });

  it('returns null for non-progress lines', () => {
    expect(parseProgress('Input #0, matroska')).toBeNull();
  });
});

describe('maskSecrets', () => {
  const { maskSecrets } = require('../ffmpeg-args.cjs');

  it('masks the SRT passphrase and streamid', () => {
    const text = 'Connecting srt://live.example.com:778?passphrase=s3cr3t&streamid=abc123 failed';
    const out = maskSecrets(text, { kind: 'srt', url: 'srt://live.example.com:778?passphrase=s3cr3t&streamid=abc123' });
    expect(out).not.toContain('s3cr3t');
    expect(out).not.toContain('abc123');
    expect(out).toContain('passphrase=***');
  });

  it('masks the RTMP stream key wherever it appears', () => {
    const out = maskSecrets('rtmps://live.example.com:443/live/KEY987: I/O error', {
      kind: 'rtmp',
      url: 'rtmps://live.example.com:443/live/',
      key: 'KEY987',
    });
    expect(out).toBe('rtmps://live.example.com:443/live/***: I/O error');
  });
});
