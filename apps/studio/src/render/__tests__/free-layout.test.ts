import { describe, expect, it } from 'vitest';
import { defaultFrame, MIN_BOX, resizeRect, sceneLayers, snapLines, snapMove, snapResize, toFreeScene } from '../layout';
import type { Scene } from '../../state/types';
import { resolveScreen } from '../../media/sources';

const pip: Scene = { id: 's', label: 'Screen + Cam', layout: 'pip', sourceIds: ['screen', 'cam'] };

describe('sceneLayers', () => {
  it('pip: full bottom layer and a framed inset on top', () => {
    const l = sceneLayers(pip, 1920, 1080);
    expect(l.map((x) => x.sourceId)).toEqual(['screen', 'cam']);
    expect(l[0].rect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(l[1].border).toBe(true);
    expect(l.every((x) => !x.free)).toBe(true);
  });
  it('background becomes the bottom layer', () => {
    const l = sceneLayers({ ...pip, layout: 'split', backgroundSourceId: 'bg' }, 1920, 1080);
    expect(l.map((x) => x.sourceId)).toEqual(['bg', 'screen', 'cam']);
  });
  it('free: frames in sourceIds order; a source without frame fills the picture', () => {
    const scene: Scene = { id: 'f', label: '', layout: 'free', sourceIds: ['a', 'b'], frames: { b: { x: 10, y: 20, w: 300, h: 300, radius: 9999, fit: 'cover' } } };
    const l = sceneLayers(scene, 1920, 1080);
    expect(l[0]).toMatchObject({ sourceId: 'a', rect: { x: 0, y: 0, w: 1920, h: 1080 }, fit: 'auto', free: true });
    expect(l[1]).toMatchObject({ sourceId: 'b', rect: { x: 10, y: 20, w: 300, h: 300 }, fit: 'cover', radius: 9999 });
  });
});

describe('toFreeScene', () => {
  it('keeps the picture exactly where it was', () => {
    const free = toFreeScene(pip, 1920, 1080);
    expect(free.layout).toBe('free');
    expect(free.sourceIds).toEqual(['screen', 'cam']);
    const before = sceneLayers(pip, 1920, 1080).map((l) => l.rect);
    const after = sceneLayers(free, 1920, 1080).map((l) => l.rect);
    expect(after).toEqual(before.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })));
    expect(free.frames?.cam.border).toBe(true);
  });
  it('drops the split-only fields and a duplicated background', () => {
    const free = toFreeScene({ ...pip, layout: 'split', fill: true, backgroundSourceId: 'screen' }, 1920, 1080);
    expect(free.fill).toBeUndefined();
    expect(free.backgroundSourceId).toBeUndefined();
    expect(free.sourceIds).toEqual(['screen', 'cam']);
  });
});

describe('resizeRect', () => {
  const r = { x: 100, y: 100, w: 400, h: 200 };
  it('corner keeps the aspect ratio and the opposite corner', () => {
    const out = resizeRect(r, 'se', 200, 0, false);
    expect(out).toEqual({ x: 100, y: 100, w: 600, h: 300 });
    const nw = resizeRect(r, 'nw', -200, 0, false);
    expect(nw.x + nw.w).toBe(500);
    expect(nw.y + nw.h).toBe(300);
    expect(nw.w / nw.h).toBeCloseTo(2);
  });
  it('Shift = free corner; edges change one side', () => {
    expect(resizeRect(r, 'se', 100, 10, true)).toEqual({ x: 100, y: 100, w: 500, h: 210 });
    expect(resizeRect(r, 'w', 50, 0, false)).toEqual({ x: 150, y: 100, w: 350, h: 200 });
  });
  it('never smaller than MIN_BOX', () => {
    const out = resizeRect(r, 'e', -1000, 0, false);
    expect(out.w).toBe(MIN_BOX);
    expect(out.x).toBe(100);
  });
});

describe('snapping', () => {
  const lines = snapLines([{ x: 1000, y: 500, w: 200, h: 100 }], 1920, 1080);
  it('moves onto a frame edge within tolerance', () => {
    const out = snapMove({ x: 8, y: 300, w: 100, h: 100 }, lines, 16);
    expect(out.rect.x).toBe(0);
    expect(out.guideX).toBe(0);
  });
  it('snaps the centre onto the frame centre', () => {
    const out = snapMove({ x: 905, y: 200, w: 100, h: 100 }, lines, 16);
    expect(out.rect.x + out.rect.w / 2).toBe(960);
  });
  it('leaves boxes far from any line alone', () => {
    const r = { x: 300, y: 300, w: 100, h: 100 };
    expect(snapMove(r, lines, 16)).toEqual({ rect: r, guideX: null, guideY: null });
  });
  it('resize snaps only the moving edge', () => {
    const out = snapResize({ x: 100, y: 100, w: 1810, h: 100 }, 'e', lines, 16);
    expect(out.rect).toEqual({ x: 100, y: 100, w: 1820, h: 100 });
  });
});

describe('defaultFrame', () => {
  it('stacks new boxes leftwards from the bottom-right corner', () => {
    const a = defaultFrame(1920, 1080, 0);
    const b = defaultFrame(1920, 1080, 1);
    expect(a.x + a.w).toBe(1880);
    expect(b.x + b.w).toBeLessThan(a.x);
  });
});

describe('resolveScreen', () => {
  const list = [
    { id: 'screen:1:0', name: 'Entire screen', kind: 'screen' },
    { id: 'window:99:0', name: 'Vortrag – Keynote', kind: 'window' },
  ];
  it('same id first, then the same window title, else null', () => {
    expect(resolveScreen(list, { screenId: 'screen:1:0', label: 'x' })).toBe('screen:1:0');
    expect(resolveScreen(list, { screenId: 'window:12:0', label: 'Vortrag – Keynote', screenKind: 'window' })).toBe('window:99:0');
    expect(resolveScreen(list, { screenId: 'window:12:0', label: 'Weg', screenKind: 'window' })).toBeNull();
  });
});
