import { describe, expect, it } from 'vitest';
import { nextSpot } from '../rotation';

const item = (id: string, logoUrl: string | null = `/media/${id}`) => ({ id, name: id, logoUrl });

describe('nextSpot', () => {
  it('returns -1 for an empty list', () => {
    expect(nextSpot([], new Set(), -1)).toBe(-1);
  });
  it('starts at the first usable item', () => {
    expect(nextSpot([item('a'), item('b')], new Set(), -1)).toBe(0);
  });
  it('advances and wraps around', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(nextSpot(items, new Set(), 0)).toBe(1);
    expect(nextSpot(items, new Set(), 2)).toBe(0);
  });
  it('skips items without a logo and failed ids', () => {
    const items = [item('a'), item('b', null), item('c'), item('d')];
    expect(nextSpot(items, new Set(['c']), 0)).toBe(3);
    expect(nextSpot(items, new Set(['d', 'c']), 0)).toBe(0);
  });
  it('returns -1 when nothing is usable', () => {
    expect(nextSpot([item('a'), item('b', null)], new Set(['a']), 0)).toBe(-1);
  });
  it('treats an out-of-range lastIndex as "start over"', () => {
    expect(nextSpot([item('a'), item('b')], new Set(), 9)).toBe(0);
  });
});
