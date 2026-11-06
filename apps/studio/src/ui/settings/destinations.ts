// Pure helpers for stream destinations: presets for "+ Ziel", validation and the upload estimate.

import type { LiveRoomDestination } from '../../live-room/destinations';
import type { Destination, OutputTarget, StreamTarget } from '../../state/types';

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

/**
 * The ingest a destination publishes to: RTMP server + key (slashes normalised), or the
 * SRT host + streamid (other query params ignored). Two destinations with the same ingest
 * would push the same stream twice and the platform throws one of them out.
 */
export function ingestKey(t: OutputTarget): string | null {
  if (t.kind === 'rtmp') {
    const server = clean(t.url).replace(/\/+$/, '').toLowerCase();
    const key = clean(t.key).replace(/^\/+/, '');
    return server && key ? `rtmp|${server}/${key}` : null;
  }
  if (t.kind === 'srt') {
    const url = clean(t.url);
    const q = url.indexOf('?');
    const host = (q === -1 ? url : url.slice(0, q)).replace(/\/+$/, '').toLowerCase();
    const streamid = q === -1 ? null : new URLSearchParams(url.slice(q + 1)).get('streamid');
    return streamid ? `srt|${host}|${streamid}` : `srt|${host}`;
  }
  return null;
}

/** Host of a destination URL, lower-case ('' when unparsable). */
function hostOf(t: OutputTarget): string {
  if (t.kind === 'none') return '';
  const m = /^[a-z]+:\/\/([^/:?#]+)/i.exec(clean(t.url));
  return m ? m[1].toLowerCase() : '';
}

/** The first problem of an enabled destination (record-only mode has none). Duplicate ingests block going live. */
export function destinationsProblem(list: Destination[]): string | null {
  for (const d of enabledDestinations(list)) {
    const p = destinationProblem(d);
    if (p) return p;
  }
  return duplicateIngestProblem(list);
}

/** Two enabled destinations publishing to the same ingest (same RTMP server + key, or same SRT streamid). */
export function duplicateIngestProblem(list: Destination[]): string | null {
  const enabled = enabledDestinations(list);
  const seen = new Map<string, Destination>();
  for (const d of enabled) {
    const k = ingestKey(d.target);
    if (!k) continue;
    const first = seen.get(k);
    if (first) {
      const a = first.name.trim() || 'Ziel';
      const b = d.name.trim() || 'Ziel';
      return `${a} und ${b} senden an die gleiche Adresse mit dem gleichen Schlüssel. Ein Ziel ausschalten oder löschen.`;
    }
    seen.set(k, d);
  }
  return null;
}

/** Non-blocking hint for the go-live dialog and the settings (null when there is nothing to say). */
export function destinationsWarning(list: Destination[]): string | null {
  const cf = enabledDestinations(list).filter((d) => /(^|\.)cloudflare\.com$/.test(hostOf(d.target)));
  if (cf.length > 1)
    return 'Zwei Cloudflare-Ziele: nur wenn es zwei verschiedene Live-Inputs sind – sonst wirft Cloudflare einen Stream raus.';
  return null;
}

/** Upload needed for N parallel streams (ffmpeg sends each destination its own copy). */
export function uploadEstimate(n: number, videoKbps: number, audioKbps: number) {
  const perStream = videoKbps + audioKbps;
  const totalKbps = n * perStream;
  return { perStream, totalKbps, mbit: totalKbps / 1000, warn: n > 1 };
}

/** A Live-Raum send target → the addDestination action payload. URLs/keys pass through unchanged (already encoded). */
export function fromLiveRoomDestination(d: LiveRoomDestination): { name: string; target: StreamTarget } {
  const name = d.label.trim() || 'Röbel App';
  if (d.kind === 'srt') return { name, target: { kind: 'srt', url: clean(d.url) } };
  return { name, target: { kind: 'rtmp', url: clean(d.url), key: clean(d.key) } };
}
