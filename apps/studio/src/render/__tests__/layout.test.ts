import { describe, expect, it } from 'vitest';
import { fitRect, sceneRects } from '../layout';

describe('sceneRects', () => {
  it('full', () => {
    expect(sceneRects('full', 1920, 1080)).toEqual([{ x: 0, y: 0, w: 1920, h: 1080 }]);
  });
  it('pip = full + bottom-right 30 % inset with 40 px margin', () => {
    const r = sceneRects('pip', 1920, 1080);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(r[1]).toEqual({ w: 576, h: 324, x: 1304, y: 716 });
  });
  it('split = two letterboxed halves', () => {
    const r = sceneRects('split', 1920, 1080);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.w)).toEqual([960, 960]);
    expect(r[0]).toEqual({ x: 0, y: 270, w: 960, h: 540 });
    expect(r[1]).toEqual({ x: 960, y: 270, w: 960, h: 540 });
  });
  it('split with fill = two full-height halves (no bars)', () => {
    expect(sceneRects('split', 1920, 1080, { fill: true })).toEqual([
      { x: 0, y: 0, w: 960, h: 1080 },
      { x: 960, y: 0, w: 960, h: 1080 },
    ]);
  });
});

describe('fitRect', () => {
  const box = { x: 0, y: 0, w: 200, h: 100 };
  it('contain letterboxes', () => {
    expect(fitRect(100, 100, box, 'contain')).toEqual({ x: 50, y: 0, w: 100, h: 100 });
  });
  it('cover overflows', () => {
    expect(fitRect(100, 100, box, 'cover')).toEqual({ x: 0, y: -50, w: 200, h: 200 });
  });
  it('degenerate source falls back to the box', () => {
    expect(fitRect(0, 0, box, 'contain')).toEqual(box);
  });
});
