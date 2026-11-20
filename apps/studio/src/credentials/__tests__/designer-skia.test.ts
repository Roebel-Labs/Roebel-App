import { describe, expect, it, vi } from 'vitest';
import type { CanvasKit } from 'canvaskit-wasm';
import { createSkiaLoader, makeSurface, shouldAnimate, tiltFromPointer } from '../designer/skia';
import { TEMPLATES } from '@roebel/card-design';

const canvas = {} as HTMLCanvasElement;

describe('card canvas surface', () => {
  it('uses WebGL when it works', () => {
    const gl = { kind: 'gl' };
    const ck = { MakeWebGLCanvasSurface: vi.fn(() => gl), MakeSWCanvasSurface: vi.fn(() => ({ kind: 'sw' })) } as unknown as CanvasKit;
    expect(makeSurface(ck, canvas)).toBe(gl);
    expect(ck.MakeSWCanvasSurface).not.toHaveBeenCalled();
  });

  it('falls back to the software surface when WebGL returns null', () => {
    const sw = { kind: 'sw' };
    const ck = { MakeWebGLCanvasSurface: vi.fn(() => null), MakeSWCanvasSurface: vi.fn(() => sw) } as unknown as CanvasKit;
    expect(makeSurface(ck, canvas)).toBe(sw);
    expect(ck.MakeSWCanvasSurface).toHaveBeenCalledWith(canvas);
  });

  it('falls back when WebGL throws', () => {
    const sw = { kind: 'sw' };
    const ck = {
      MakeWebGLCanvasSurface: vi.fn(() => {
        throw new Error('no webgl');
      }),
      MakeSWCanvasSurface: vi.fn(() => sw),
    } as unknown as CanvasKit;
    expect(makeSurface(ck, canvas)).toBe(sw);
  });
});

describe('shared Skia instance', () => {
  it('loads CanvasKit and the fonts once for two canvases', async () => {
    const ck = { fake: true } as unknown as CanvasKit;
    const loadCk = vi.fn(async () => ck);
    const fonts = { provider: {}, families: new Set() };
    const loadFonts = vi.fn(async () => fonts);
    const load = createSkiaLoader(loadCk, loadFonts as never, () => ({}) as never);
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(a.ck).toBe(ck);
    expect(loadCk).toHaveBeenCalledTimes(1);
    expect(loadFonts).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed load', async () => {
    const loadCk = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({} as CanvasKit);
    const load = createSkiaLoader(loadCk, (async () => ({ provider: {}, families: new Set() })) as never, () => ({}) as never);
    await expect(load()).rejects.toThrow('offline');
    await expect(load()).resolves.toBeTruthy();
    expect(loadCk).toHaveBeenCalledTimes(2);
  });
});

describe('animation', () => {
  const buerger = TEMPLATES.find((x) => x.id === 'buerger')!.design;
  const papier = TEMPLATES.find((x) => x.id === 'papier')!.design;

  it('animates only a design with shine, never with reduced motion or static', () => {
    expect(shouldAnimate(buerger, 'loop', false)).toBe(true);
    expect(shouldAnimate(buerger, 'loop', true)).toBe(false);
    expect(shouldAnimate(buerger, 'static', false)).toBe(false);
    expect(shouldAnimate(papier, 'loop', false)).toBe(false);
    expect(shouldAnimate({ ...papier, layers: [{ ...papier.layers[0], shine: true }] }, 'loop', false)).toBe(true);
  });

  it('maps the pointer to a tilt of -1..1', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(tiltFromPointer(rect, 200, 100)).toEqual({ x: 0, y: 0 });
    expect(tiltFromPointer(rect, 300, 150)).toEqual({ x: 1, y: 1 });
    expect(tiltFromPointer(rect, 0, 0)).toEqual({ x: -1, y: -1 });
  });
});
