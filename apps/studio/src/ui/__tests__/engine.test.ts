import { describe, expect, it, vi } from 'vitest';
import { errorText, maskedTarget, outputConfig, settleWithin } from '../engine';
import { defaultSettings } from '../../state/reducer';

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

describe('outputConfig', () => {
  it('passes only enabled, usable destinations to main, with their ids', () => {
    const s = {
      ...defaultSettings(),
      destinations: [
        { id: 'a', name: 'Cloudflare', enabled: true, target: { kind: 'srt' as const, url: 'srt://h:1' } },
        { id: 'b', name: 'YouTube', enabled: false, target: { kind: 'rtmp' as const, url: 'rtmp://y/live2', key: 'k' } },
        { id: 'c', name: 'Facebook', enabled: true, target: { kind: 'rtmp' as const, url: 'rtmps://f/rtmp/', key: 'f' } },
        { id: 'd', name: 'Leer', enabled: true, target: { kind: 'none' as const } },
      ],
    };
    const cfg = outputConfig(s);
    expect(cfg.destinations).toEqual([
      { id: 'a', kind: 'srt', url: 'srt://h:1' },
      { id: 'c', kind: 'rtmp', url: 'rtmps://f/rtmp/', key: 'f' },
    ]);
    expect(cfg).not.toHaveProperty('target');
    expect(cfg.fps).toBe(30);
  });

  it('zero enabled destinations → record-only config (empty list)', () => {
    expect(outputConfig(defaultSettings()).destinations).toEqual([]);
  });
});
