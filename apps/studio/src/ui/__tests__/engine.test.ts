import { describe, expect, it, vi } from 'vitest';
import { errorText, maskedTarget, settleWithin } from '../engine';

describe('settleWithin', () => {
  it('resolves true when the promise settles in time (also on rejection)', async () => {
    await expect(settleWithin(Promise.resolve(), 50)).resolves.toBe(true);
    await expect(settleWithin(Promise.reject(new Error('x')), 50)).resolves.toBe(true);
  });

  it('resolves false instead of hanging when the recorder never stops', async () => {
    vi.useFakeTimers();
    const p = settleWithin(new Promise(() => {}), 2000);
    vi.advanceTimersByTime(2000);
    await expect(p).resolves.toBe(false);
    vi.useRealTimers();
  });
});

describe('maskedTarget', () => {
  it('never shows SRT query secrets or the RTMP key', () => {
    expect(maskedTarget({ kind: 'srt', url: 'srt://live.example.com:778?passphrase=geheim&streamid=abc' })).toBe('srt://live.example.com:778?…');
    const r = maskedTarget({ kind: 'rtmp', url: 'rtmps://x/live/', key: 'supersecretkey1234' });
    expect(r).not.toContain('supersecret');
    expect(r).toContain('1234');
  });
});

describe('errorText', () => {
  it('unwraps IPC errors and translates known codes', () => {
    expect(errorText(new Error("Error invoking remote method 'output:start': Error: no_target"))).toBe('Kein Sendeziel eingestellt');
  });
});
