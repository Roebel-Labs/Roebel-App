// SourceRegistry against a minimal fake DOM / mediaDevices (vitest runs in node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETRY_MS, START_TIMEOUT_MS, STALL_TIMEOUT_MS, SourceRegistry } from '../sources';
import type { Source } from '../../state/types';

class FakeTrack extends EventTarget {
  kind = 'video';
  readyState: 'live' | 'ended' = 'live';
  stop() {
    this.readyState = 'ended';
  }
}
class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks;
  }
}
class FakeVideo extends EventTarget {
  muted = false;
  playsInline = false;
  autoplay = false;
  crossOrigin: string | null = null;
  srcObject: unknown = null;
  loop = false;
  src = '';
  videoWidth = 1920;
  videoHeight = 1080;
  setAttribute() {}
  removeAttribute() {}
  play() {
    return Promise.resolve();
  }
  pause() {}
  load() {}
  remove() {}
}
class FakeImage extends EventTarget {
  crossOrigin: string | null = null;
  decoding = '';
  src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  removeAttribute() {}
}

let devices: { kind: string; deviceId: string }[];
let streams: FakeStream[];
let videos: FakeVideo[];
let mediaDevices: EventTarget;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  devices = [{ kind: 'videoinput', deviceId: 'cam-dev' }];
  streams = [];
  videos = [];
  mediaDevices = Object.assign(new EventTarget(), {
    getUserMedia: vi.fn(async () => {
      const s = new FakeStream();
      streams.push(s);
      return s;
    }),
    enumerateDevices: vi.fn(async () => devices),
  });
  vi.stubGlobal('navigator', { mediaDevices });
  vi.stubGlobal('HTMLVideoElement', FakeVideo);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'video') {
        const v = new FakeVideo();
        videos.push(v);
        return v;
      }
      return { style: {}, setAttribute() {}, appendChild() {}, isConnected: true };
    },
    body: { appendChild() {} },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const cam: Source = { id: 'cam-0', kind: 'camera', label: 'Kamera', deviceId: 'cam-dev' };
const flush = () => vi.advanceTimersByTimeAsync(0);

async function playingCamera() {
  const reg = new SourceRegistry({ fps: 30 });
  const seen: string[] = [];
  reg.onStatus((_id, st) => seen.push(st));
  reg.sync([cam]);
  await flush();
  videos[0].dispatchEvent(new Event('playing'));
  expect(reg.statusOf('cam-0')).toBe('ok');
  return { reg, seen };
}

describe('SourceRegistry', () => {
  it('muted camera (HDMI loss without ended) → loading → lost after the stall timeout → re-opened', async () => {
    const { reg } = await playingCamera();
    streams[0].tracks[0].dispatchEvent(new Event('mute'));
    expect(reg.statusOf('cam-0')).toBe('loading');
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS - 100);
    expect(reg.statusOf('cam-0')).toBe('loading');
    await vi.advanceTimersByTimeAsync(200);
    expect(reg.lookup('cam-0').status).toBe('lost'); // renderer shows "Signal verloren"
    expect(streams[0].tracks[0].readyState).toBe('ended'); // muted stream released
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(streams.length).toBe(2); // re-opened
    expect(reg.statusOf('cam-0')).toBe('loading');
    videos[0].dispatchEvent(new Event('playing'));
    expect(reg.statusOf('cam-0')).toBe('ok');
    reg.dispose();
  });

  it('a short mute that unmutes before the timeout never shows lost', async () => {
    const { reg, seen } = await playingCamera();
    streams[0].tracks[0].dispatchEvent(new Event('mute'));
    await vi.advanceTimersByTimeAsync(1000);
    streams[0].tracks[0].dispatchEvent(new Event('unmute'));
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS * 2);
    expect(reg.statusOf('cam-0')).toBe('ok');
    expect(seen).not.toContain('lost');
    reg.dispose();
  });

  it('video element waiting (stall) is covered by the same watchdog', async () => {
    const { reg } = await playingCamera();
    videos[0].dispatchEvent(new Event('waiting'));
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 100);
    expect(reg.statusOf('cam-0')).toBe('lost');
    reg.dispose();
  });

  it('a camera that opens but never plays turns lost after the start timeout', async () => {
    const reg = new SourceRegistry({ fps: 30 });
    reg.sync([cam]);
    await flush();
    expect(reg.statusOf('cam-0')).toBe('loading');
    await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS + 100);
    expect(reg.statusOf('cam-0')).toBe('lost');
    reg.dispose();
  });

  it('track ended → lost; stays lost while unplugged; recovers when enumerated again', async () => {
    const { reg } = await playingCamera();
    devices = [];
    streams[0].tracks[0].dispatchEvent(new Event('ended'));
    expect(reg.statusOf('cam-0')).toBe('lost');
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(streams.length).toBe(1); // no getUserMedia while the device is missing
    // stale 'playing' from the dead stream must not mask the loss
    videos[0].dispatchEvent(new Event('playing'));
    expect(reg.statusOf('cam-0')).toBe('lost');
    devices = [{ kind: 'videoinput', deviceId: 'cam-dev' }];
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(streams.length).toBe(2);
    videos[0].dispatchEvent(new Event('playing'));
    expect(reg.statusOf('cam-0')).toBe('ok');
    reg.dispose();
  });

  it('removing a source stops its tracks and clears all timers', async () => {
    const { reg } = await playingCamera();
    streams[0].tracks[0].dispatchEvent(new Event('mute'));
    reg.sync([]);
    expect(streams[0].tracks[0].readyState).toBe('ended');
    expect(reg.lookup('cam-0').status).toBe('lost');
    expect(vi.getTimerCount()).toBe(0);
    reg.dispose();
  });
});
