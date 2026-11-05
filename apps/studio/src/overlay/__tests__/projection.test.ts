import { describe, expect, it } from 'vitest';
import { restore, showReducer } from '../../state/reducer';
import { overlayProjection } from '../projection';

describe('overlayProjection', () => {
  const base = restore(null);
  const secret = { ...base, settings: { ...base.settings, target: { kind: 'rtmp', url: 'rtmp://x/live', key: 'SECRET-KEY-123' }, srtPassphrase: 'SRT-PASS-456' } } as any;

  it('contains neither the stream key nor the srt passphrase, nor sources/scenes/audio', () => {
    const json = JSON.stringify(overlayProjection(secret));
    expect(json).not.toContain('SECRET-KEY-123');
    expect(json).not.toContain('SRT-PASS-456');
    expect(Object.keys(overlayProjection(secret)).sort()).toEqual(['overlays', 'sponsors', 'table', 'templates']);
  });

  it('keeps the same reference when an unrelated part changes, a new one when overlays change', () => {
    const a = overlayProjection(secret);
    const edited = { ...secret, settings: { ...secret.settings, target: { kind: 'rtmp', url: 'u', key: 'typing' } } };
    expect(overlayProjection(edited)).toBe(a);
    const toggled = showReducer(secret, { type: 'setOverlay', id: secret.overlays[0].id, visible: true, now: 1 });
    expect(overlayProjection(toggled)).not.toBe(a);
  });
});
