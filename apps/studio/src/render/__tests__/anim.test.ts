import { describe, expect, it } from 'vitest';
import { ease, overlayProgress, transitionProgress } from '../anim';
import type { Easing, OverlayAnim, OverlayInstance } from '../../state/types';

const fade: OverlayAnim = { kind: 'fade', durationMs: 400, easing: 'easeOut' };
const ov = (visible: boolean, changedAt: number): OverlayInstance => ({ id: 'o', templateId: 't', visible, changedAt });

describe('ease', () => {
  it('linear is identity', () => {
    expect(ease('linear', 0.5)).toBe(0.5);
  });
  it('every easing maps 0→0 and 1→1', () => {
    for (const e of ['linear', 'easeInOut', 'easeOut', 'backOut'] as Easing[]) {
      expect(ease(e, 0)).toBeCloseTo(0, 10);
      expect(ease(e, 1)).toBeCloseTo(1, 10);
    }
  });
  it('clamps t outside 0..1', () => {
    expect(ease('easeOut', -1)).toBe(0);
    expect(ease('easeOut', 2)).toBe(1);
  });
});

describe('overlayProgress', () => {
  it('animates in', () => {
    expect(overlayProgress(ov(true, 1000), fade, 1000)).toBe(0);
    const mid = overlayProgress(ov(true, 1000), fade, 1200);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(overlayProgress(ov(true, 1000), fade, 1400)).toBe(1);
    expect(overlayProgress(ov(true, 1000), fade, 9000)).toBe(1);
  });
  it('animates out on hide, decreasing', () => {
    const a = overlayProgress(ov(false, 1000), fade, 1200);
    const b = overlayProgress(ov(false, 1000), fade, 1300);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(b).toBeLessThan(a);
    expect(overlayProgress(ov(false, 1000), fade, 1400)).toBe(0);
    expect(overlayProgress(ov(false, 0), fade, 1_000_000)).toBe(0);
  });
  it('none / zero duration snaps', () => {
    const none: OverlayAnim = { kind: 'none', durationMs: 400, easing: 'linear' };
    expect(overlayProgress(ov(true, 1000), none, 1000)).toBe(1);
    expect(overlayProgress(ov(false, 1000), none, 1000)).toBe(0);
    expect(overlayProgress(ov(true, 1000), { ...fade, durationMs: 0 }, 1000)).toBe(1);
  });
  it('a node delay postpones the in-animation', () => {
    expect(overlayProgress(ov(true, 1000), fade, 1100, 100)).toBe(0);
    expect(overlayProgress(ov(true, 1000), fade, 1500, 100)).toBe(1);
  });
});

describe('transitionProgress', () => {
  it('null start means done', () => {
    expect(transitionProgress(null, 600, 5)).toBe(1);
  });
  it('linear and clamped', () => {
    expect(transitionProgress(1000, 600, 1300)).toBe(0.5);
    expect(transitionProgress(1000, 600, 5000)).toBe(1);
    expect(transitionProgress(1000, 600, 900)).toBe(0);
    expect(transitionProgress(1000, 0, 1000)).toBe(1);
  });
});
