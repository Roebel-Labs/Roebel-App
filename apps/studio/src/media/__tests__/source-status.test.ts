import { describe, expect, it } from 'vitest';
import { sourceStatus } from '../sources';

describe('sourceStatus', () => {
  it('brief cases', () => {
    expect(sourceStatus('ok', 'ended')).toBe('lost');
    expect(sourceStatus('lost', 'deviceBack')).toBe('loading');
    expect(sourceStatus('loading', 'playing')).toBe('ok');
    expect(sourceStatus('ok', 'stalled')).toBe('loading');
  });

  it('device gone is lost from any state', () => {
    for (const s of ['ok', 'loading', 'lost'] as const) expect(sourceStatus(s, 'deviceGone')).toBe('lost');
  });

  it('a stall never hides a lost signal', () => {
    expect(sourceStatus('lost', 'stalled')).toBe('lost');
  });

  it('deviceBack does not downgrade a healthy source', () => {
    expect(sourceStatus('ok', 'deviceBack')).toBe('ok');
    expect(sourceStatus('loading', 'deviceBack')).toBe('loading');
  });

  it('started means a new stream is attached but not yet playing', () => {
    expect(sourceStatus('lost', 'started')).toBe('loading');
    expect(sourceStatus('loading', 'started')).toBe('loading');
  });

  it('full unplug → replug cycle recovers', () => {
    let s = sourceStatus('loading', 'playing');
    s = sourceStatus(s, 'ended');
    expect(s).toBe('lost');
    s = sourceStatus(s, 'deviceBack');
    s = sourceStatus(s, 'started');
    s = sourceStatus(s, 'playing');
    expect(s).toBe('ok');
  });
});
