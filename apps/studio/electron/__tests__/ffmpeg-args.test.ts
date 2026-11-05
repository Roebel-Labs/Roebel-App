import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildFfmpegArgs, buildTestArgs, parseProgress, parseSlaveFailure, teeEscape } = require('../ffmpeg-args.cjs');

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

  it('gives a single RTMP(S) destination a 5 s socket timeout so a hung ingest ends the encoder', () => {
    const args: string[] = buildFfmpegArgs({
      target: { kind: 'rtmp', url: 'rtmps://live.cloudflare.com:443/live/', key: 'abc' },
      fps: 30,
      videoKbps: 6000,
      audioKbps: 160,
    });
    const i = args.indexOf('-rw_timeout');
    expect(args[i + 1]).toBe('5000000');
    expect(i).toBeLessThan(args.lastIndexOf('-f')); // output option, before the URL
    const srt: string[] = buildFfmpegArgs({ target: { kind: 'srt', url: SRT_URL }, fps: 30, videoKbps: 6000, audioKbps: 160 });
    expect(srt).not.toContain('-rw_timeout');
  });

  it("throws 'no_target' for kind none", () => {
    expect(() =>
      buildFfmpegArgs({ target: { kind: 'none' }, fps: 30, videoKbps: 6000, audioKbps: 160 }),
    ).toThrow('no_target');
  });
});

describe('buildFfmpegArgs with destinations', () => {
  const base = { fps: 30 as const, videoKbps: 6000, audioKbps: 160 };
  const YT = { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'yt-key-1234' };

  it('one destination builds exactly the legacy single-target args', () => {
    const legacy = buildFfmpegArgs({ ...base, target: { kind: 'srt', url: SRT_URL } });
    expect(buildFfmpegArgs({ ...base, destinations: [{ kind: 'srt', url: SRT_URL }] })).toEqual(legacy);
    const legacyRtmp = buildFfmpegArgs({ ...base, target: YT });
    expect(buildFfmpegArgs({ ...base, destinations: [{ id: 'd1', ...YT }] })).toEqual(legacyRtmp);
  });

  it('two destinations encode once into one tee output with onfail=ignore per slave', () => {
    const args: string[] = buildFfmpegArgs({ ...base, destinations: [{ kind: 'srt', url: SRT_URL }, YT] });
    expect(args.filter((a) => a === '-c:v')).toHaveLength(1);
    expect(args.filter((a) => a === '-i')).toHaveLength(1);
    const outFmtIdx = args.lastIndexOf('-f');
    expect(args[outFmtIdx + 1]).toBe('tee');
    // tee needs explicit maps for every stream it forwards
    expect(args.slice(0, outFmtIdx)).toEqual(expect.arrayContaining(['-map', '0:v:0', '-map', '0:a:0?']));
    const tee = args[args.length - 1];
    const slaves = tee.split(/(?<!\\)\|/);
    expect(slaves).toHaveLength(2);
    // Each slave runs behind its own fifo thread (a hung destination cannot block the others) and
    // drops packets when its queue is full; RTMP slaves give up after 2 s without socket progress.
    const fifo = 'use_fifo=1:fifo_options=drop_pkts_on_overflow=1\\\\:queue_size=300';
    expect(slaves[0]).toBe(`[f=mpegts:onfail=ignore:${fifo}]${SRT_URL}`);
    expect(slaves[1]).toBe(
      `[f=flv:onfail=ignore:${fifo}:flvflags=no_duration_filesize:rw_timeout=2000000]rtmp://a.rtmp.youtube.com/live2/yt-key-1234`,
    );
  });

  it('escapes tee special characters inside slave URLs', () => {
    expect(teeEscape('srt://h:1?streamid=a|b[c]')).toBe('srt://h:1?streamid=a\\|b\\[c\\]');
    expect(teeEscape("a\\b'c")).toBe("a\\\\b\\'c");
    const args: string[] = buildFfmpegArgs({
      ...base,
      destinations: [{ kind: 'srt', url: 'srt://h:1?streamid=a|b[c]' }, YT],
    });
    expect(args[args.length - 1]).toContain(']srt://h:1?streamid=a\\|b\\[c\\]|[f=flv');
  });

  it('excludes disabled destinations and kind none', () => {
    const args: string[] = buildFfmpegArgs({
      ...base,
      destinations: [{ kind: 'none' }, { kind: 'srt', url: SRT_URL, enabled: false }, YT],
    });
    expect(args[args.length - 1]).toBe('rtmp://a.rtmp.youtube.com/live2/yt-key-1234');
    expect(args).not.toContain('tee');
  });

  it("throws 'no_target' with zero usable destinations", () => {
    expect(() => buildFfmpegArgs({ ...base, destinations: [] })).toThrow('no_target');
    expect(() => buildFfmpegArgs({ ...base, destinations: [{ kind: 'none' }] })).toThrow('no_target');
  });
});

describe('buildTestArgs', () => {
  it('sends a 20 s lavfi test pattern + tone to one destination with the show encoder', () => {
    const args: string[] = buildTestArgs({
      destination: { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'k' },
      fps: 50,
      videoKbps: 4000,
      audioKbps: 128,
      seconds: 20,
    });
    expect(args.filter((a) => a === '-f' || a === 'lavfi').length).toBeGreaterThan(0);
    expect(args.join(' ')).toMatch(/testsrc2=size=1920x1080:rate=50/);
    expect(args.join(' ')).toMatch(/sine=/);
    expect(valueAfter(args, '-t')).toBe('20');
    expect(valueAfter(args, '-c:v')).toBe('h264_videotoolbox');
    expect(valueAfter(args, '-b:v')).toBe('4000k');
    expect(args).not.toContain('pipe:0');
    expect(args[args.length - 1]).toBe('rtmp://a.rtmp.youtube.com/live2/k');
  });
});

describe('parseSlaveFailure', () => {
  it('reads the tee slave index and reason', () => {
    expect(
      parseSlaveFailure('[tee @ 0x135e0a870] Slave muxer #1 failed: Input/output error, continuing with 1/2 slaves.'),
    ).toEqual({ index: 1, reason: 'Input/output error' });
    expect(parseSlaveFailure('[tee @ 0x1] Slave muxer #0 failed: Connection refused, continuing with 2/3 slaves.')).toEqual({
      index: 0,
      reason: 'Connection refused',
    });
    expect(parseSlaveFailure('frame=1 fps=30')).toBeNull();
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

  it('masks the secrets of every destination', () => {
    const dests = [
      { kind: 'srt', url: 'srt://live.example.com:778?passphrase=pass1111&streamid=sid2222' },
      { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'ytkey3333' },
      { kind: 'rtmp', url: 'rtmps://live-api-s.facebook.com:443/rtmp/', key: 'FB-4444?s_bl=1&a=xyz' },
    ];
    const line =
      "[tee] Slave '[f=mpegts:onfail=ignore]srt://live.example.com:778?passphrase=pass1111&streamid=sid2222' failed; " +
      'rtmp://a.rtmp.youtube.com/live2/ytkey3333 rtmps://live-api-s.facebook.com:443/rtmp/FB-4444?s_bl=1&a=xyz';
    const out = maskSecrets(line, dests);
    for (const secret of ['pass1111', 'sid2222', 'ytkey3333', 'FB-4444', 'xyz']) expect(out).not.toContain(secret);
    expect(out).toContain('rtmp://a.rtmp.youtube.com/live2/***');
  });

  it('masks everything after the RTMP app path, even for keys it was not told about', () => {
    const line =
      "[tee] Slave '[f=flv:onfail=ignore]rtmps://live-api-s.facebook.com:443/rtmp/FB-123-0-Abc?s_bl=1&s_sw=0&a=Xyz': error opening: I/O error";
    const out = maskSecrets(line, []);
    expect(out).toContain('rtmps://live-api-s.facebook.com:443/rtmp/***');
    expect(out).not.toMatch(/FB-123|Xyz|s_sw/);
    expect(maskSecrets('rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl: Broken pipe', null)).toBe(
      'rtmp://a.rtmp.youtube.com/live2/***: Broken pipe',
    );
    // server URLs without a key stay readable
    expect(maskSecrets('rtmps://live.cloudflare.com:443/live/ ok', null)).toBe('rtmps://live.cloudflare.com:443/live/ ok');
  });

  it('masks tee-escaped forms of the secrets too', () => {
    const dests = [{ kind: 'rtmp', url: 'rtmp://h/live', key: 'ab|cd' }];
    expect(maskSecrets('x rtmp://h/live/ab\\|cd y', dests)).not.toContain('cd');
  });
});

describe('Live-Raum SRT URL (URL-encoded streamid + passphrase)', () => {
  const url = 'srt://live.cloudflare.com:778?streamid=a%2Fb%20c&passphrase=p%26q%3Dr';
  const base = { fps: 30, videoKbps: 6000, audioKbps: 160 };
  it('reaches ffmpeg unchanged as a single destination', () => {
    const args = buildFfmpegArgs({ ...base, destinations: [{ kind: 'srt', url }] });
    expect(args[args.length - 1]).toBe(url);
  });
  it('is unchanged inside the tee slave list (nothing in it needs tee escaping)', () => {
    const args = buildFfmpegArgs({ ...base, destinations: [{ kind: 'srt', url }, { kind: 'rtmp', url: 'rtmp://x/live', key: 'k' }] });
    expect(args[args.length - 1].split('|')[0]).toMatch(new RegExp(`\\]${url.replace(/[?.]/g, '\\$&')}$`));
  });
});
