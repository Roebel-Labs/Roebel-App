import { describe, expect, it, vi } from 'vitest';
import { clearTextCaches, fitText, renderFrame } from '../draw';
import { initialState, showReducer } from '../../state/reducer';
import type { MediaLookup, RenderContext, ShowState } from '../../state/types';

type Call = { fn: string; args: unknown[] };

/** Minimal recording 2D context: every method is recorded; measureText ≈ 0.55 em per char. */
function fakeCtx() {
  const calls: Call[] = [];
  let depth = 0;
  const props: Record<string, unknown> = { font: '10px sans-serif', globalAlpha: 1 };
  const special: Record<string, (...a: unknown[]) => unknown> = {
    measureText: (t) => {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(props.font))?.[1] ?? 10);
      return { width: String(t).length * size * 0.55, actualBoundingBoxAscent: size * 0.72 };
    },
    save: () => void depth++,
    restore: () => void depth--,
  };
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in special) {
        return (...args: unknown[]) => {
          calls.push({ fn: key, args });
          return special[key](...args);
        };
      }
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ fn: key, args });
      };
    },
    set(target, key: string, v) {
      target[key] = v;
      calls.push({ fn: `set:${key}`, args: [v] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, depth: () => depth };
}

const rc: RenderContext = {
  row: { Gruppe: 'Sunshine Kids', Verein: 'TSV Röbel', Kategorie: 'Kinder' },
  next: null,
  now: new Date(2026, 10, 7, 14, 5),
  sponsor: null,
  donation: null,
};

const video = { videoWidth: 1920, videoHeight: 1080 } as unknown as CanvasImageSource;
const media: MediaLookup = (id) =>
  id === 'cam-lost' ? { el: null, status: 'lost' } : id === 'cam-load' ? { el: null, status: 'loading' } : { el: video, status: 'ok' };

function base(): ShowState {
  let s = initialState();
  s = showReducer(s, { type: 'addSource', source: { id: 'cam1', kind: 'camera', label: 'Kamera 1' } });
  s = showReducer(s, { type: 'addSource', source: { id: 'cam2', kind: 'camera', label: 'Kamera 2' } });
  s = showReducer(s, { type: 'addSource', source: { id: 'col', kind: 'color', label: 'Blau', color: '#00498B' } });
  s = showReducer(s, { type: 'addSource', source: { id: 'cam-lost', kind: 'camera', label: 'Kamera 3' } });
  s = showReducer(s, { type: 'addScene', scene: { id: 'pip', label: 'PiP', layout: 'pip', sourceIds: ['cam1', 'cam-lost'] } });
  return s;
}

function run(s: ShowState, now = 10_000, opts = {}) {
  const f = fakeCtx();
  expect(() => renderFrame(f.ctx, s, media, rc, now, opts)).not.toThrow();
  expect(f.depth()).toBe(0);
  return f;
}

const texts = (calls: Call[]) => calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);

describe('renderFrame', () => {
  it('draws a full scene with the camera image', () => {
    const s = base();
    const f = run({ ...s, programSceneId: s.scenes[0].id });
    expect(f.calls.some((c) => c.fn === 'drawImage' && c.args[0] === video)).toBe(true);
    expect(f.calls[0]).toEqual({ fn: 'setTransform', args: [1, 0, 0, 1, 0, 0] });
  });

  it('draws a pip scene and a lost-signal slate for the inset', () => {
    const s = base();
    const f = run({ ...s, programSceneId: 'pip' });
    expect(f.calls.filter((c) => c.fn === 'drawImage')).toHaveLength(1);
    expect(texts(f.calls)).toEqual(expect.arrayContaining(['Signal verloren', 'Kamera 3']));
  });

  it('draws both scenes during a running fade', () => {
    let s = base();
    s = { ...s, programSceneId: s.scenes[0].id, previewSceneId: s.scenes[2].id };
    s = showReducer(s, { type: 'take', now: 1000 });
    expect(s.transition.startedAt).toBe(1000);
    const f = run(s, 1300);
    expect(f.calls.some((c) => c.fn === 'drawImage')).toBe(true); // from = camera
    expect(f.calls.some((c) => c.fn === 'set:fillStyle' && c.args[0] === '#00498B')).toBe(true); // to = colour
    expect(f.calls.some((c) => c.fn === 'set:globalAlpha' && (c.args[0] as number) > 0 && (c.args[0] as number) < 1)).toBe(true);
  });

  it('wipe and slide both bring the new scene in FROM the preset direction', () => {
    const mid = (presetId: string, direction: 'left' | 'right' | 'up' | 'down') => {
      let s = base();
      s = {
        ...s,
        presets: s.presets.map((p) => (p.id === presetId ? { ...p, easing: 'linear' as const, direction } : p)),
        programSceneId: s.scenes[0].id,
        previewSceneId: s.scenes[2].id,
        transition: { ...s.transition, presetId },
      };
      s = showReducer(s, { type: 'take', now: 1000 });
      return run(s, 1300).calls; // p = 0.5
    };
    // last rect() = the wipe clip (the from-scene camera clip comes first, the colour to-scene has none)
    const rects = (c: Call[]) => [c.filter((x) => x.fn === 'rect').map((x) => x.args).at(-1)];
    expect(rects(mid('preset-wipe', 'left'))[0]).toEqual([0, 0, 960, 1080]);
    expect(rects(mid('preset-wipe', 'right'))[0]).toEqual([960, 0, 960, 1080]);
    expect(rects(mid('preset-wipe', 'up'))[0]).toEqual([0, 0, 1920, 540]);
    expect(rects(mid('preset-wipe', 'down'))[0]).toEqual([0, 540, 1920, 540]);
    const translates = (c: Call[]) => c.filter((x) => x.fn === 'translate').map((x) => x.args);
    // [from-scene offset, to-scene offset]
    expect(translates(mid('preset-slide', 'left'))).toEqual([[960, -0], [-960, 0]]);
    expect(translates(mid('preset-slide', 'right'))).toEqual([[-960, -0], [960, 0]]);
  });

  it('runs every transition kind without throwing', () => {
    for (const presetId of ['preset-wipe', 'preset-slide', 'preset-zoom', 'preset-cut']) {
      let s = base();
      s = { ...s, programSceneId: s.scenes[0].id, previewSceneId: s.scenes[1].id, transition: { ...s.transition, presetId } };
      s = showReducer(s, { type: 'take', now: 1000 });
      run(s, 1300);
    }
  });

  it('draws a visible lower third with a null row (no binding literals, no throw)', () => {
    const s = showReducer(base(), { type: 'setOverlay', id: 'ov-lower-third', visible: true, now: 0 });
    const f = fakeCtx();
    renderFrame(f.ctx, s, media, { ...rc, row: null }, 10_000, {});
    expect(f.depth()).toBe(0);
    // Background bars are drawn; empty texts (incl. a lone separator) are skipped.
    expect(texts(f.calls)).toEqual([]);
    expect(f.calls.some((c) => c.fn === 'set:fillStyle' && c.args[0] === '#00498B')).toBe(true);
  });

  it('draws the lower third texts from the row', () => {
    const s = showReducer(base(), { type: 'setOverlay', id: 'ov-lower-third', visible: true, now: 0 });
    const f = run(s);
    expect(texts(f.calls)).toEqual(expect.arrayContaining(['Sunshine Kids', 'TSV Röbel · Kinder']));
  });

  it('survives an unknown programSceneId, broken templates and overlaysOnly', () => {
    let s: ShowState = { ...base(), programSceneId: 'does-not-exist' };
    s = {
      ...s,
      templates: [...s.templates, { id: 'broken', name: 'x', kind: 'custom', fullScreen: false, nodes: null as never, animIn: null as never, animOut: null as never }],
      overlays: [...s.overlays, { id: 'ov-broken', templateId: 'broken', visible: true, changedAt: 0 }, { id: 'ov-ghost', templateId: 'ghost', visible: true, changedAt: 0 }],
    };
    s = showReducer(s, { type: 'setOverlay', id: 'ov-clock', visible: true, now: 0 });
    const f = run(s);
    expect(texts(f.calls)).toContain('14:05');
    const o = run(s, 10_000, { overlaysOnly: true, scale: 0.25 });
    expect(o.calls[0]).toEqual({ fn: 'setTransform', args: [0.25, 0, 0, 0.25, 0, 0] });
    expect(o.calls.some((c) => c.fn === 'clearRect')).toBe(true);
  });

  it('draws full-screen overlays before the others', () => {
    let s = base();
    s = showReducer(s, { type: 'setOverlay', id: 'ov-clock', visible: true, now: 0 });
    s = showReducer(s, { type: 'setOverlay', id: 'ov-pause', visible: true, now: 0 });
    const t = texts(run(s).calls);
    expect(t.indexOf('Gleich geht’s weiter')).toBeLessThan(t.indexOf('14:05'));
  });

  it('hidden overlays draw nothing', () => {
    const f = run(base());
    expect(texts(f.calls)).toEqual([]);
  });
});

describe('error reporting', () => {
  it('warns once per distinct error even when two broken overlays alternate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = (id: string) => ({ id, name: id, kind: 'custom' as const, fullScreen: false, nodes: [null] as never, animIn: { kind: 'none' as const, durationMs: 0, easing: 'linear' as const }, animOut: { kind: 'none' as const, durationMs: 0, easing: 'linear' as const } });
    const s0 = base();
    const s: ShowState = {
      ...s0,
      templates: [bad('bad-a'), bad('bad-b')],
      overlays: [
        { id: 'a', templateId: 'bad-a', visible: true, changedAt: 0 },
        { id: 'b', templateId: 'bad-b', visible: true, changedAt: 0 },
      ],
    };
    for (let i = 0; i < 10; i++) run(s, 10_000 + i);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('clearTextCaches', () => {
  it('forces text to be re-measured (fonts finished loading)', () => {
    const f = fakeCtx();
    fitText(f.ctx, 'Neu messen', 'Inter', 600, 33, 500);
    const n = f.calls.filter((c) => c.fn === 'measureText').length;
    fitText(f.ctx, 'Neu messen', 'Inter', 600, 33, 500);
    expect(f.calls.filter((c) => c.fn === 'measureText').length).toBe(n); // cached
    clearTextCaches();
    fitText(f.ctx, 'Neu messen', 'Inter', 600, 33, 500);
    expect(f.calls.filter((c) => c.fn === 'measureText').length).toBeGreaterThan(n);
  });
});

describe('fitText', () => {
  it('keeps short text, shrinks medium text, ellipsises long text', () => {
    const { ctx } = fakeCtx();
    expect(fitText(ctx, 'Kurz', 'Inter', 600, 40, 1000)).toMatchObject({ text: 'Kurz', size: 40 });
    // 20 chars × 22 px = 440 px at 40 px; fits at ≥ 0.7 × 40 = 28 px in 400 px
    const mid = fitText(ctx, 'abcdefghijabcdefghij', 'Inter', 600, 40, 400);
    expect(mid.text).toBe('abcdefghijabcdefghij');
    expect(mid.size).toBeLessThan(40);
    expect(mid.size).toBeGreaterThanOrEqual(28);
    const long = fitText(ctx, 'Tanzsportgemeinschaft Röbel/Müritz e. V. Abteilung Kinder', 'Inter', 600, 40, 300);
    expect(long.text.endsWith('…')).toBe(true);
    expect(long.size).toBe(28);
    expect(long.text.length * 28 * 0.55).toBeLessThanOrEqual(300);
  });
});
