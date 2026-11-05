// Capture device enumeration and getUserMedia constraints.

export async function listDevices(): Promise<{ video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const pick = (kind: MediaDeviceKind) => {
    const seen = new Set<string>();
    return all.filter((d) => {
      // Empty ids appear before media permission is granted; they cannot be opened.
      if (d.kind !== kind || !d.deviceId || seen.has(d.deviceId)) return false;
      seen.add(d.deviceId);
      return true;
    });
  };
  return { video: pick('videoinput'), audio: pick('audioinput') };
}

/** Raw program audio: no voice processing, stereo, 48 kHz. */
export function audioConstraints(deviceId: string): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
  };
}

export function videoConstraints(deviceId: string, fps: 30 | 50): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: fps },
  };
}
