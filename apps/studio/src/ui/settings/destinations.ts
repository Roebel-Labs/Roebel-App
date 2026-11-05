// Pure helpers for stream destinations: presets for "+ Ziel", validation and the upload estimate.

import type { Destination, OutputTarget } from '../../state/types';

export type PresetId = 'cloudflare-srt' | 'cloudflare-rtmps' | 'youtube' | 'facebook' | 'custom-rtmp';

export const PRESETS: Array<{ id: PresetId; label: string; name: string; target: OutputTarget; hint: string }> = [
  {
    id: 'cloudflare-srt',
    label: 'Cloudflare SRT',
    name: 'Cloudflare',
    target: { kind: 'srt', url: '' },
    hint: 'Komplette SRT-Adresse aus Cloudflare Stream einfügen (srt://…?streamid=…).',
  },
  {
    id: 'cloudflare-rtmps',
    label: 'Cloudflare RTMPS',
    name: 'Cloudflare RTMPS',
    target: { kind: 'rtmp', url: 'rtmps://live.cloudflare.com:443/live/', key: '' },
    hint: 'Streamschlüssel aus Cloudflare Stream einfügen.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    name: 'YouTube',
    target: { kind: 'rtmp', url: 'rtmp://a.rtmp.youtube.com/live2', key: '' },
    hint: 'Streamschlüssel aus YouTube Studio → Livestream einfügen.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    name: 'Facebook',
    target: { kind: 'rtmp', url: 'rtmps://live-api-s.facebook.com:443/rtmp/', key: '' },
    hint: 'Streamschlüssel aus Facebook Live Producer einfügen.',
  },
  {
    id: 'custom-rtmp',
    label: 'Eigenes RTMP',
    name: 'Eigenes Ziel',
    target: { kind: 'rtmp', url: '', key: '' },
    hint: 'Server-Adresse (rtmp:// oder rtmps://) und Streamschlüssel eintragen.',
  },
];

export function newDestination(preset: PresetId, id: string = crypto.randomUUID()): Destination {
  const p = PRESETS.find((x) => x.id === preset) ?? PRESETS[0];
  return { id, name: p.name, enabled: true, target: { ...p.target } };
}

/** Pasted addresses/keys often carry whitespace or wrapping quotes. */
export const clean = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2');

/** German problem text for one destination, or null when it can go live. */
export function destinationProblem(d: Destination): string | null {
  const t = d.target;
  const who = d.name.trim() || 'Ziel';
  if (t.kind === 'none') return `${who}: kein Protokoll gewählt.`;
  if (t.kind === 'srt' && !/^srt:\/\/.+/.test(t.url)) return `${who}: Die SRT-Adresse fehlt oder beginnt nicht mit srt://.`;
  if (t.kind === 'rtmp' && !/^rtmps?:\/\/.+/.test(t.url)) return `${who}: Die Adresse fehlt oder beginnt nicht mit rtmp:// bzw. rtmps://.`;
  if (t.kind === 'rtmp' && !t.key) return `${who}: Der Streamschlüssel fehlt.`;
  return null;
}

export const enabledDestinations = (list: Destination[]) => list.filter((d) => d.enabled);

/** The first problem of an enabled destination (record-only mode has none). */
export function destinationsProblem(list: Destination[]): string | null {
  for (const d of enabledDestinations(list)) {
    const p = destinationProblem(d);
    if (p) return p;
  }
  return null;
}

/** Upload needed for N parallel streams (ffmpeg sends each destination its own copy). */
export function uploadEstimate(n: number, videoKbps: number, audioKbps: number) {
  const perStream = videoKbps + audioKbps;
  const totalKbps = n * perStream;
  return { perStream, totalKbps, mbit: totalKbps / 1000, warn: n > 1 };
}
