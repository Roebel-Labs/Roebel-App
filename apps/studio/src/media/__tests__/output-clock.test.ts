import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputClock } from '../output-clock';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('OutputClock', () => {
  it('ticks 30 ± 1 times per second at 30 fps', () => {
    const tick = vi.fn();
    const clock = new OutputClock(30, tick);
    clock.start();
    vi.advanceTimersByTime(1000);
    clock.stop();
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(tick.mock.calls.length).toBeLessThanOrEqual(31);
    expect(clock.stats().overruns).toBe(0);
  });

  it('ticks 50 ± 1 times per second at 50 fps and reports fps', () => {
    const tick = vi.fn();
    const clock = new OutputClock(50, tick);
    clock.start();
    vi.advanceTimersByTime(3000);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(149);
    expect(tick.mock.calls.length).toBeLessThanOrEqual(151);
    expect(clock.stats().fps).toBeGreaterThan(49);
    expect(clock.stats().fps).toBeLessThan(51);
    clock.stop();
  });

  it('does not drift over a long run (absolute timeline)', () => {
    const tick = vi.fn();
    const clock = new OutputClock(30, tick);
    clock.start();
    vi.advanceTimersByTime(60_000);
    clock.stop();
    expect(Math.abs(tick.mock.calls.length - 1800)).toBeLessThanOrEqual(1);
  });

  it('counts an overrun when a tick blocks 100 ms and never bursts the missed ticks', () => {
    const times: number[] = [];
    let blocked = false;
    const clock = new OutputClock(30, (now) => {
      times.push(now);
      if (!blocked && times.length === 5) {
        blocked = true;
        vi.advanceTimersByTime(100); // simulate a 100 ms main-thread stall inside the tick
      }
    });
    const t0 = performance.now();
    clock.start();
    vi.advanceTimersByTime(1000);
    clock.stop();
    const slots = (performance.now() - t0) / (1000 / 30);
    expect(clock.stats().overruns).toBeGreaterThanOrEqual(1);
    // No two ticks closer than ~a frame apart: missed frames were skipped, not burst-fired.
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(1000 / 30 - 2);
    // A 100 ms stall covers 3 slots: the blocked tick plus 2 dropped ones. The rest of the timeline is kept.
    expect(times.length).toBeLessThanOrEqual(Math.floor(slots) + 1 - 2);
    expect(times.length).toBeGreaterThanOrEqual(Math.floor(slots) + 1 - 3);
  });

  it('stop() halts ticking and start() is idempotent', () => {
    const tick = vi.fn();
    const clock = new OutputClock(30, tick);
    clock.start();
    clock.start();
    vi.advanceTimersByTime(500);
    const n = tick.mock.calls.length;
    expect(n).toBeLessThanOrEqual(16);
    clock.stop();
    vi.advanceTimersByTime(1000);
    expect(tick.mock.calls.length).toBe(n);
  });

  it('a throwing tick does not kill the clock', () => {
    let calls = 0;
    const clock = new OutputClock(30, () => {
      calls++;
      throw new Error('boom');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    clock.start();
    vi.advanceTimersByTime(1000);
    clock.stop();
    err.mockRestore();
    expect(calls).toBeGreaterThanOrEqual(29);
  });
});
