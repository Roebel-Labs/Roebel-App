import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioConstraints, listDevices, videoConstraints } from '../devices';

afterEach(() => vi.unstubAllGlobals());

describe('devices', () => {
  it('audioConstraints disables all voice processing and pins the device', () => {
    expect(audioConstraints('mic-1')).toEqual({
      deviceId: { exact: 'mic-1' },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48000 },
    });
  });

  it('videoConstraints asks for 1080p at the output fps', () => {
    expect(videoConstraints('cam-1', 50)).toEqual({
      deviceId: { exact: 'cam-1' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 50 },
    });
    expect(videoConstraints('cam-1', 30).frameRate).toEqual({ ideal: 30 });
  });

  it('listDevices splits video/audio inputs and drops outputs and duplicates', async () => {
    const d = (kind: string, deviceId: string, label = deviceId) => ({ kind, deviceId, label, groupId: 'g' });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: async () => [
          d('videoinput', 'facetime'),
          d('videoinput', 'iphone'),
          d('audioinput', 'default'),
          d('audioinput', 'mic'),
          d('audioinput', 'mic'),
          d('audiooutput', 'speaker'),
          d('videoinput', ''), // no permission yet → empty id, unusable
        ],
      },
    });
    const r = await listDevices();
    expect(r.video.map((x) => x.deviceId)).toEqual(['facetime', 'iphone']);
    expect(r.audio.map((x) => x.deviceId)).toEqual(['default', 'mic']);
  });
});
