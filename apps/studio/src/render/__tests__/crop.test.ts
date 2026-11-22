import { describe, expect, it } from 'vitest';
import { cleanCrop, cropRect, MAX_CROP } from '../layout';
import { cropDrag } from '../../ui/show/LayoutEditor';
import { restore } from '../../state/reducer';

describe('crop', () => {
  it('cuts the source rect per edge', () => {
    const r = cropRect(1000, 500, { l: 0.1, t: 0.2, r: 0.3, b: 0 });
    expect([r.x, r.y, r.w, r.h].map(Math.round)).toEqual([100, 100, 600, 400]);
    expect(cropRect(1000, 500, undefined)).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });

  it('clamps edges and drops an empty crop', () => {
    expect(cleanCrop({ l: 0, t: 0, r: 0, b: 0 })).toBeUndefined();
    expect(cleanCrop({ l: 0.9, t: -1, r: NaN, b: 0.1 })).toEqual({ l: MAX_CROP, t: 0, r: 0, b: 0.1 });
  });

  it('dragging the left edge in by a quarter of the box cuts a quarter of the visible picture', () => {
    const start = { x: 0, y: 0, w: 400, h: 200 };
    const out = cropDrag(start, { l: 0, t: 0, r: 0, b: 0 }, { x: 100, y: 0, w: 300, h: 200 });
    expect(out.crop.l).toBeCloseTo(0.25);
    expect(out.rect).toEqual({ x: 100, y: 0, w: 300, h: 200 });
  });

  it('stops at the crop limit and keeps box and picture together', () => {
    const start = { x: 0, y: 0, w: 400, h: 200 };
    const out = cropDrag(start, { l: 0, t: 0, r: 0, b: 0 }, { x: 390, y: 0, w: 10, h: 200 });
    expect(out.crop.l).toBe(MAX_CROP);
    expect(out.rect.x).toBeCloseTo(400 * MAX_CROP);
  });

  it('keeps crop and border style through a restart', () => {
    const base = restore(null);
    const scene = { id: 's1', label: 'A', layout: 'free' as const, sourceIds: ['a'], frames: { a: { x: 0, y: 0, w: 10, h: 10, border: true, borderWidth: 6, borderColor: '#00498b', crop: { l: 0.1, t: 0, r: 0, b: 0.2 } } } };
    const back = restore(JSON.stringify({ ...base, scenes: [scene] }));
    expect(back.scenes.find((s) => s.id === 's1')?.frames?.a).toMatchObject({ borderWidth: 6, borderColor: '#00498b', crop: { l: 0.1, t: 0, r: 0, b: 0.2 } });
  });
});
