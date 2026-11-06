import { describe, expect, it } from 'vitest';
import { annotateDevices, relinkDevices } from '../relink';

const mac = [
  { kind: 'videoinput', deviceId: 'mac-cam', label: 'OsmoPocket4P (2ca3:0020)' },
  { kind: 'audioinput', deviceId: 'mac-mic', label: 'OsmoPocket4P' },
];
const win = [
  { kind: 'videoinput', deviceId: 'win-face', label: 'Integrated Camera' },
  { kind: 'videoinput', deviceId: 'win-cam', label: 'OsmoPocket4P' },
  { kind: 'audioinput', deviceId: 'win-mic', label: 'Mikrofon (OsmoPocket4P)' },
];

describe('device relink', () => {
  const show = {
    sources: [
      { id: 's', kind: 'camera', label: 'Osmo', deviceId: 'mac-cam' },
      { id: 'v', kind: 'video', label: 'Film', url: 'x' },
    ],
    audio: { channels: [{ id: 'c', label: 'Osmo Ton', input: { kind: 'device', deviceId: 'mac-mic' } }] },
  };

  it('finds the same camera by name on the other computer; unknown names stay unmatched', () => {
    const packed = annotateDevices(show, mac);
    const r = relinkDevices(packed, win);
    const sources = r.state.sources as { id: string; deviceId?: string }[];
    expect(sources.find((x) => x.id === 's')?.deviceId).toBe('win-cam');
    const ch = (r.state.audio as { channels: { input: { deviceId: string } }[] }).channels[0];
    expect(ch.input.deviceId).toBe('win-mic'); // "Mikrofon (OsmoPocket4P)": unique partial match
    expect(r.matched).toBe(2);
    expect(r.unmatched).toEqual([]);
  });

  it('never guesses between two partial matches', () => {
    const two = [...win, { kind: 'audioinput', deviceId: 'win-mic2', label: 'Headset (OsmoPocket4P Pro)' }];
    const r = relinkDevices(annotateDevices(show, mac), two);
    expect(r.unmatched).toEqual(['OsmoPocket4P']);
  });

  it('keeps ids that exist on this computer', () => {
    const r = relinkDevices(annotateDevices(show, mac), mac);
    expect(r.matched).toBe(0);
    expect(r.unmatched).toEqual([]);
  });
});
