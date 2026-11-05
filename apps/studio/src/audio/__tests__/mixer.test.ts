import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbToGain, effectiveGain, peakDb, planDevices, DB_FLOOR, MAX_DELAY_MS } from '../mixer';
import type { AudioChannel } from '../../state/types';

const ch = (p: Partial<AudioChannel> = {}): AudioChannel => ({
  id: 'c',
  label: 'c',
  input: { kind: 'device', deviceId: 'd1' },
  gainDb: 0,
  muted: false,
  delayMs: 0,
  ...p,
});

describe('dbToGain', () => {
  it('maps dB to linear', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(10)).toBeCloseTo(3.162, 3);
  });
  it('treats the floor as silence', () => {
    expect(dbToGain(-60)).toBe(0);
    expect(dbToGain(-100)).toBe(0);
  });
});

describe('effectiveGain', () => {
  it('is 0 when muted', () => expect(effectiveGain(ch({ muted: true }), ['cam1'])).toBe(0));
  it('is 0 when following a source that is not in program', () =>
    expect(effectiveGain(ch({ followsVideoSourceId: 'cam2' }), ['cam1'])).toBe(0));
  it('is audible when the followed source is in program (split)', () =>
    expect(effectiveGain(ch({ gainDb: -6, followsVideoSourceId: 'cam2' }), ['cam1', 'cam2'])).toBeCloseTo(0.501, 3));
  it('ignores program when not following', () => expect(effectiveGain(ch({ gainDb: 0 }), [])).toBe(1));
});

describe('planDevices', () => {
  it('returns each device once and skips source inputs', () => {
    const set = planDevices([
      ch({ id: 'a' }),
      ch({ id: 'b' }),
      ch({ id: 'c', input: { kind: 'device', deviceId: 'd2' } }),
      ch({ id: 'd', input: { kind: 'source', sourceId: 's' } }),
    ]);
    expect([...set].sort()).toEqual(['d1', 'd2']);
  });
});

describe('peakDb', () => {
  it('converts the absolute peak to dBFS', () => {
    expect(peakDb(new Float32Array([0, 0.5, -1, 0.1]))).toBeCloseTo(0, 5);
    expect(peakDb(new Float32Array([0.5, -0.25]))).toBeCloseTo(-6.02, 1);
  });
  it('clamps silence at the floor', () => {
    expect(peakDb(new Float32Array(8))).toBe(DB_FLOOR);
    expect(peakDb(new Float32Array([1e-6]))).toBe(DB_FLOOR);
  });
});

it('exposes the delay ceiling', () => expect(MAX_DELAY_MS).toBe(500));

// ---- graph wiring against a fake AudioContext ----
import { Mixer, CEILING_DB } from '../mixer';

type FakeNode = Record<string, any> & { kind: string; out: FakeNode[] };

function fakeCtx() {
  const nodes: FakeNode[] = [];
  const param = (v = 1) => ({
    value: v,
    calls: [] as string[],
    cancelScheduledValues() {},
    setValueAtTime() {},
    linearRampToValueAtTime(_v: number, t: number) {
      this.calls.push(`ramp:${t.toFixed(3)}`);
    },
    setTargetAtTime() {},
  });
  const mk = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
    const n: FakeNode = {
      kind,
      out: [],
      connect(to: FakeNode) {
        n.out.push(to);
        return to;
      },
      disconnect() {},
      ...extra,
    };
    nodes.push(n);
    return n;
  };
  const track = { stop() {}, addEventListener() {} };
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: mk('destination'),
    createGain: () => mk('gain', { gain: param() }),
    createDelay: () => mk('delay', { delayTime: param(0) }),
    createAnalyser: () => mk('analyser', { getFloatTimeDomainData() {} }),
    createDynamicsCompressor: () =>
      mk('compressor', { threshold: param(), ratio: param(), attack: param(), release: param(), knee: param() }),
    createWaveShaper: () => mk('shaper'),
    createMediaStreamDestination: () => mk('dest', { stream: { getAudioTracks: () => [track], getTracks: () => [track] } }),
    createMediaStreamSource: () => mk('devicesrc'),
  };
  return { ctx: ctx as unknown as AudioContext, nodes };
}

describe('Mixer graph', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds the limiter chain and opens each device once with raw constraints', async () => {
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [{ addEventListener() {}, stop() {} }] }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, addEventListener() {}, removeEventListener() {} } });
    const { ctx, nodes } = fakeCtx();
    const m = new Mixer(ctx);
    const comp = nodes.find((n) => n.kind === 'compressor')!;
    expect([comp.threshold.value, comp.ratio.value, comp.attack.value, comp.release.value]).toEqual([-3, 20, 0.003, 0.1]);
    const ceiling = comp.out[0];
    expect(ceiling.gain.value).toBeCloseTo(Math.pow(10, CEILING_DB / 20), 6);

    const audio = {
      masterDb: 0,
      channels: [ch({ id: 'a' }), ch({ id: 'b' }), ch({ id: 'c', followsVideoSourceId: 's2', gainDb: -6 })],
    };
    m.sync(audio, ['s1'], { lookup: () => ({ el: null, status: 'lost' }) } as never, 600);
    await Promise.resolve();
    await Promise.resolve();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const c1 = (getUserMedia.mock.calls[0] as unknown[])[0] as { audio: Record<string, unknown> };
    expect(c1.audio).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    expect(m.statusOf('a')).toBe('ok');
    expect(Object.keys(m.levels()).sort()).toEqual(['a', 'b', 'c', 'master']);

    // follow-video fade-in uses the transition duration
    m.sync(audio, ['s1', 's2'], { lookup: () => ({ el: null, status: 'lost' }) } as never, 600);
    const gains = nodes.filter((n) => n.kind === 'gain');
    expect(gains.some((g) => g.gain.calls.includes('ramp:0.600'))).toBe(true);

    m.sync({ masterDb: 0, channels: [] }, [], { lookup: () => ({ el: null, status: 'lost' }) } as never);
    expect(Object.keys(m.levels())).toEqual(['master']);
    m.dispose();
  });
});
