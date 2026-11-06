// Show package: cameras and microphones have different device ids on every computer. The export
// records each device's name; the import maps that name to the device with the same name here.

type Device = { deviceId: string; label: string; kind: string };
type Json = Record<string, unknown>;

/** Device name without the USB vendor/product suffix ("OsmoPocket4P (2ca3:0020)" → "OsmoPocket4P"). */
export function deviceName(label: string): string {
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '').trim().toLowerCase();
}

const asList = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : []);

/** Export: stores the device name next to every camera source and device audio channel. */
export function annotateDevices(state: Json, devices: Device[]): Json {
  const label = (id: unknown, kind: string) => devices.find((d) => d.kind === kind && d.deviceId === id)?.label;
  const sources = asList(state.sources).map((s) =>
    s.kind === 'camera' && label(s.deviceId, 'videoinput') ? { ...s, deviceLabel: label(s.deviceId, 'videoinput') } : s,
  );
  const audio = state.audio && typeof state.audio === 'object' ? (state.audio as Json) : null;
  const channels = asList(audio?.channels).map((c) => {
    const input = c.input as Json | undefined;
    const l = input?.kind === 'device' ? label(input.deviceId, 'audioinput') : undefined;
    return l ? { ...c, input: { ...input, deviceLabel: l } } : c;
  });
  return { ...state, sources, ...(audio ? { audio: { ...audio, channels } } : {}) };
}

/**
 * Import: points every camera source and device audio channel at the device with the same name on
 * this computer (when its old id is not present here). Unmatched entries keep their id and show
 * "Signal verloren" until the device is re-picked. Returns the state and how many were matched.
 */
export function relinkDevices(state: Json, devices: Device[]): { state: Json; matched: number; unmatched: string[] } {
  let matched = 0;
  const unmatched: string[] = [];
  const find = (id: unknown, label: unknown, kind: string): string | null => {
    if (devices.some((d) => d.kind === kind && d.deviceId === id)) return String(id);
    if (typeof label !== 'string' || !label) return null;
    const want = deviceName(label);
    if (!want) return null;
    const pool = devices.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    const exact = pool.find((d) => deviceName(d.label) === want);
    if (exact) return exact.deviceId;
    // Windows wraps names ("Mikrofon (OsmoPocket4P)"): accept a containment match only when it is unique.
    const partial = pool.filter((d) => {
      const n = deviceName(d.label);
      return n && (n.includes(want) || want.includes(n));
    });
    return partial.length === 1 ? partial[0].deviceId : null;
  };
  const sources = asList(state.sources).map((s) => {
    if (s.kind !== 'camera') return s;
    const id = find(s.deviceId, s.deviceLabel, 'videoinput');
    if (id === null) {
      unmatched.push(String(s.deviceLabel ?? s.label ?? 'Kamera'));
      return s;
    }
    if (id !== s.deviceId) matched++;
    return { ...s, deviceId: id };
  });
  const audio = state.audio && typeof state.audio === 'object' ? (state.audio as Json) : null;
  const channels = asList(audio?.channels).map((c) => {
    const input = c.input as Json | undefined;
    if (input?.kind !== 'device') return c;
    const id = find(input.deviceId, input.deviceLabel, 'audioinput');
    if (id === null) {
      unmatched.push(String(input.deviceLabel ?? c.label ?? 'Mikrofon'));
      return c;
    }
    if (id !== input.deviceId) matched++;
    return { ...c, input: { ...input, deviceId: id } };
  });
  return { state: { ...state, sources, ...(audio ? { audio: { ...audio, channels } } : {}) }, matched, unmatched };
}
