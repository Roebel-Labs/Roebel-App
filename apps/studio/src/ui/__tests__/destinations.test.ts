import { describe, expect, it } from 'vitest';
import { destinationProblem, destinationsProblem, newDestination, PRESETS, uploadEstimate } from '../settings/destinations';

describe('destination presets', () => {
  it('carry the exact ingest URLs', () => {
    const url = (id: string) => {
      const t = PRESETS.find((p) => p.id === id)!.target;
      return t.kind === 'none' ? '' : t.url;
    };
    expect(url('cloudflare-rtmps')).toBe('rtmps://live.cloudflare.com:443/live/');
    expect(url('youtube')).toBe('rtmp://a.rtmp.youtube.com/live2');
    expect(url('facebook')).toBe('rtmps://live-api-s.facebook.com:443/rtmp/');
    expect(PRESETS.find((p) => p.id === 'cloudflare-srt')!.target.kind).toBe('srt');
  });

  it('a new destination is enabled and needs its key before going live', () => {
    const d = newDestination('youtube', 'x');
    expect(d).toMatchObject({ id: 'x', name: 'YouTube', enabled: true });
    expect(destinationProblem(d)).toMatch(/Streamschlüssel/);
    expect(destinationProblem({ ...d, target: { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'k' } })).toBeNull();
  });

  it('disabled destinations are not checked; none enabled = record-only, no problem', () => {
    expect(destinationsProblem([{ ...newDestination('facebook', 'f'), enabled: false }])).toBeNull();
    expect(destinationsProblem([])).toBeNull();
  });
});

describe('uploadEstimate', () => {
  it('multiplies (video + audio) by the number of destinations and warns above one', () => {
    expect(uploadEstimate(1, 6000, 160)).toEqual({ perStream: 6160, totalKbps: 6160, mbit: 6.16, warn: false });
    expect(uploadEstimate(2, 6000, 160)).toMatchObject({ totalKbps: 12320, warn: true });
  });
});
