// Cloudflare live-input credentials → studio send targets. Pure; nothing here is persisted.

import type { CfInputInfo } from './types';

/** What `addDestination` receives (the owner maps it onto Settings.destinations). */
export type LiveRoomDestination =
  | { kind: 'srt'; label: string; url: string }
  | { kind: 'rtmp'; label: string; url: string; key: string };

/** `srt://live.cloudflare.com:778?streamid=…&passphrase=…` (ffmpeg url-decodes streamid). */
export function srtFullUrl(base: string, streamId: string | null, passphrase: string | null): string {
  const b = base.trim();
  const params: string[] = [];
  if (streamId) params.push(`streamid=${encodeURIComponent(streamId)}`);
  if (passphrase) params.push(`passphrase=${encodeURIComponent(passphrase)}`);
  if (params.length === 0) return b;
  return `${b}${b.includes('?') ? '&' : '?'}${params.join('&')}`;
}

export function cfDestinations(info: CfInputInfo): { srt: LiveRoomDestination | null; rtmps: LiveRoomDestination | null } {
  return {
    srt: info.srt_url
      ? { kind: 'srt', label: 'Röbel App (Cloudflare SRT)', url: srtFullUrl(info.srt_url, info.srt_stream_id, info.srt_passphrase) }
      : null,
    rtmps:
      info.rtmps_url && info.stream_key
        ? { kind: 'rtmp', label: 'Röbel App (Cloudflare RTMPS)', url: info.rtmps_url, key: info.stream_key }
        : null,
  };
}

/** Simulcast presets for cf_add_output (operator pastes the platform's stream key). */
export const OUTPUT_PRESETS: { id: string; label: string; url: string }[] = [
  { id: 'youtube', label: 'YouTube', url: 'rtmps://a.rtmps.youtube.com/live2' },
  { id: 'facebook', label: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
  { id: 'custom', label: 'Eigenes Ziel', url: '' },
];

/** Output URLs are shown without anything that looks like a key in the path. */
export function outputLabel(url: string): string {
  if (url.includes('youtube.com')) return 'YouTube';
  if (url.includes('facebook.com')) return 'Facebook';
  try {
    return new URL(url).host;
  } catch {
    return 'Eigenes Ziel';
  }
}
