import { describe, expect, it } from 'vitest';
import { captureAllowed, gateAudio, gateSources } from '../gate';

const sources = [
  { id: 'c', kind: 'camera' },
  { id: 'v', kind: 'video' },
  { id: 'x', kind: 'external' },
] as never;
const audio = {
  masterDb: 0,
  channels: [
    { id: 'mic', input: { kind: 'device', deviceId: 'd1' } },
    { id: 'vid', input: { kind: 'source', sourceId: 'v' } },
    { id: 'ext', input: { kind: 'external', sourceId: 'x' } },
  ],
} as never;

describe('capture gate', () => {
  it('allows capture only in the livestream section or while on air', () => {
    expect(captureAllowed('home', 'off')).toBe(false);
    expect(captureAllowed('apps', 'off')).toBe(false);
    expect(captureAllowed('live', 'off')).toBe(true);
    expect(captureAllowed('home', 'on')).toBe(true);
    expect(captureAllowed('home', 'starting')).toBe(true);
  });
  it('withholds cameras and microphones when closed, keeps files and ingest', () => {
    expect((gateSources(sources, false) as { id: string }[]).map((s) => s.id)).toEqual(['v', 'x']);
    expect((gateAudio(audio, false) as { channels: { id: string }[] }).channels.map((c) => c.id)).toEqual(['vid', 'ext']);
    expect(gateSources(sources, true)).toBe(sources);
    expect(gateAudio(audio, true)).toBe(audio);
  });
});
