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

describe('destinationPills', () => {
  it('follows the running encoder, not the settings toggles, and shows amber while reconnecting', async () => {
    const { destinationPills } = await import('../show/HealthBar');
    const settings = {
      ...(await import('../../state/reducer')).defaultSettings(),
      destinations: [
        { ...newDestination('youtube', 'yt'), enabled: false },
        { ...newDestination('cloudflare-srt', 'cf'), enabled: true },
      ],
    };
    const live = { state: 'live' as const, since: 0, recordingBytes: 0, restarts: 0 };
    const pills = destinationPills(settings, {
      ...live,
      destinations: [
        { id: 'cf', state: 'ok' },
        { id: 'yt', state: 'failed', lastError: 'Operation timed out' },
      ],
    });
    expect(pills.map((p) => [p.name, p.tone])).toEqual([
      ['Cloudflare', 'ok'],
      ['YouTube', 'lost'],
    ]);
    const restarting = destinationPills(settings, { ...live, state: 'reconnecting', destinations: [{ id: 'cf', state: 'ok' }] });
    expect(restarting.map((p) => p.tone)).toEqual(['loading']);
  });
});

describe('fromLiveRoomDestination', () => {
  it('maps SRT and RTMPS targets from the Live-Raum without touching the encoded URL', async () => {
    const { fromLiveRoomDestination } = await import('../settings/destinations');
    const { srtFullUrl } = await import('../../live-room/destinations');
    const url = srtFullUrl('srt://live.cloudflare.com:778', 'a/b c', 'p&q=r');
    expect(url).toBe('srt://live.cloudflare.com:778?streamid=a%2Fb%20c&passphrase=p%26q%3Dr');
    expect(fromLiveRoomDestination({ kind: 'srt', label: 'Röbel App (Cloudflare SRT)', url })).toEqual({
      name: 'Röbel App (Cloudflare SRT)',
      target: { kind: 'srt', url },
    });
    expect(fromLiveRoomDestination({ kind: 'rtmp', label: ' ', url: 'rtmps://live.cloudflare.com:443/live/', key: 'k1' })).toEqual({
      name: 'Röbel App',
      target: { kind: 'rtmp', url: 'rtmps://live.cloudflare.com:443/live/', key: 'k1' },
    });
  });
});
