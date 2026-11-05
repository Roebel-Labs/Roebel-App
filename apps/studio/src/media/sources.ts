// Live media behind the show's sources: cameras (getUserMedia), video files and
// images (served by the local /media/ route). The renderer reads them through
// `lookup` and draws the "Signal verloren" slate for status 'lost'.

import type { MediaLookup, Source } from '../state/types';
import { videoConstraints } from './devices';
import { externalMedia } from './external';
import { hiddenHost } from './hidden-host';

export type SourceHealth = 'ok' | 'loading' | 'lost';
export type SourceEvent = 'started' | 'ended' | 'stalled' | 'playing' | 'deviceGone' | 'deviceBack';

/** Pure health transition for one source. */
export function sourceStatus(prev: SourceHealth, ev: SourceEvent): SourceHealth {
  switch (ev) {
    case 'ended':
    case 'deviceGone':
      return 'lost';
    case 'playing':
      return 'ok';
    case 'started':
      return 'loading';
    case 'stalled':
      return prev === 'lost' ? 'lost' : 'loading';
    case 'deviceBack':
      return prev === 'lost' ? 'loading' : prev;
  }
}

export const RETRY_MS = 2000;
/** A camera that opened but delivers no frame within this time is treated as lost (and retried). */
export const START_TIMEOUT_MS = 10000;
/**
 * A source that stalls (track `mute`, video `waiting`) and does not resume within this time is
 * treated as lost: "Signal verloren" + the retry/re-open path. Covers capture cards that mute on
 * HDMI loss instead of ending the track.
 */
export const STALL_TIMEOUT_MS = 5000;

type Entry = {
  source: Source;
  key: string;
  status: SourceHealth;
  el: HTMLVideoElement | HTMLImageElement;
  stream: MediaStream | null;
  retry: ReturnType<typeof setInterval> | null;
  watchdog: ReturnType<typeof setTimeout> | null;
  opening: boolean;
  disposed: boolean;
  off: () => void;
  /** External sources: detaches the listeners on the current stream's tracks. */
  extOff: () => void;
};

type StatusListener = (sourceId: string, status: SourceHealth) => void;

function keyOf(s: Source): string | null {
  switch (s.kind) {
    case 'camera':
      return s.deviceId ? `camera:${s.deviceId}` : null;
    case 'video':
      return s.url ? `video:${s.url}` : null;
    case 'image':
      return s.url ? `image:${s.url}` : null;
    case 'external':
      return `external:${s.id}`;
    default:
      return null; // 'color' is drawn by the renderer directly
  }
}

function hasLiveVideo(stream: MediaStream | null): boolean {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export class SourceRegistry {
  private entries = new Map<string, Entry>();
  private listeners = new Set<StatusListener>();
  private disposed = false;
  private offExternal: () => void;

  constructor(private readonly opts: { fps: 30 | 50 } = { fps: 30 }) {
    navigator.mediaDevices?.addEventListener('devicechange', this.onDeviceChange);
    this.offExternal = externalMedia.subscribe((id) => {
      const e = this.entries.get(id);
      if (e && !e.disposed && e.source.kind === 'external') this.attachExternal(e);
    });
  }

  readonly lookup: MediaLookup = (sourceId) => {
    const e = this.entries.get(sourceId);
    if (!e) return { el: null, status: 'lost' };
    return { el: e.el, status: e.status };
  };

  /** Diff against the show's sources: create new, rebuild changed, release removed. */
  sync(sources: Source[]): void {
    if (this.disposed) return;
    const wanted = new Map<string, Source>();
    for (const s of sources) if (keyOf(s)) wanted.set(s.id, s);
    for (const [id, e] of this.entries) {
      const s = wanted.get(id);
      if (!s || keyOf(s) !== e.key) this.release(id);
    }
    for (const [id, s] of wanted) {
      const e = this.entries.get(id);
      if (e) {
        e.source = s;
        if (e.el instanceof HTMLVideoElement && s.kind === 'video') e.el.loop = s.loop !== false;
        continue;
      }
      this.create(s);
    }
  }

  onStatus(cb: StatusListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** For diagnostics (Task 5 UI). */
  statusOf(sourceId: string): SourceHealth | null {
    return this.entries.get(sourceId)?.status ?? null;
  }

  /** Dev/test aid: simulates an unplug by ending the source's tracks (MediaStreamTrack.stop() fires no 'ended' itself). */
  debugEndTracks(sourceId: string): void {
    const e = this.entries.get(sourceId);
    e?.stream?.getTracks().forEach((t) => {
      t.stop();
      t.dispatchEvent(new Event('ended'));
    });
  }

  dispose(): void {
    this.disposed = true;
    navigator.mediaDevices?.removeEventListener('devicechange', this.onDeviceChange);
    this.offExternal();
    for (const id of [...this.entries.keys()]) this.release(id);
    this.listeners.clear();
  }

  // ---- internals ----

  private emit(e: Entry, ev: SourceEvent) {
    if (e.disposed) return;
    // A stale 'playing' from an ended stream (Chromium shows a 2×2 placeholder) must not mask a loss.
    if (ev === 'playing' && e.source.kind === 'camera' && !hasLiveVideo(e.stream)) return;
    if (ev === 'playing' && e.source.kind === 'external' && !hasLiveVideo(externalMedia.get(e.source.id))) return;
    const prev = e.status;
    const next = sourceStatus(prev, ev);
    if (next !== 'loading') this.clearWatchdog(e);
    else if (ev === 'stalled' && prev === 'ok') this.armWatchdog(e, STALL_TIMEOUT_MS, 'stalled');
    if (next === 'lost') {
      this.ensureRetry(e);
      if (e.source.kind === 'camera') this.dropCameraStream(e);
    } else this.clearRetry(e);
    if (next === e.status) return;
    e.status = next;
    for (const l of this.listeners) {
      try {
        l(e.source.id, next);
      } catch (err) {
        console.error('[sources] status listener failed', err);
      }
    }
  }

  private ensureRetry(e: Entry) {
    if (e.retry !== null) return;
    e.retry = setInterval(() => void this.recover(e), RETRY_MS);
  }

  /** If the source is still 'loading' when this fires, it is treated as lost (→ retry loop). */
  private armWatchdog(e: Entry, ms: number, reason: string) {
    this.clearWatchdog(e);
    const stream = e.stream;
    e.watchdog = setTimeout(() => {
      e.watchdog = null;
      if (e.disposed || e.stream !== stream || e.status !== 'loading') return;
      console.warn(`[sources] ${e.source.label}: ${reason}, no frames within ${ms} ms → lost`);
      this.emit(e, 'ended');
    }, ms);
  }

  private clearWatchdog(e: Entry) {
    if (e.watchdog === null) return;
    clearTimeout(e.watchdog);
    e.watchdog = null;
  }

  private dropCameraStream(e: Entry) {
    stopStream(e.stream);
    e.stream = null;
    if (e.el instanceof HTMLVideoElement) e.el.srcObject = null;
  }

  private clearRetry(e: Entry) {
    if (e.retry === null) return;
    clearInterval(e.retry);
    e.retry = null;
  }

  private create(s: Source) {
    const key = keyOf(s)!;
    const el = s.kind === 'image' ? new Image() : document.createElement('video');
    const e: Entry = {
      source: s,
      key,
      status: 'loading',
      el,
      stream: null,
      retry: null,
      watchdog: null,
      opening: false,
      disposed: false,
      off: () => {},
      extOff: () => {},
    };
    this.entries.set(s.id, e);
    if (el instanceof HTMLVideoElement) {
      el.muted = true; // audio goes through the mixer, never the element
      el.playsInline = true;
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.crossOrigin = 'anonymous'; // /media/ sends ACAO:* → canvas stays untainted
      hiddenHost().appendChild(el);
      const onPlaying = () => this.emit(e, 'playing');
      const onStall = () => this.emit(e, 'stalled');
      const onError = () => this.emit(e, 'ended');
      el.addEventListener('playing', onPlaying);
      el.addEventListener('waiting', onStall);
      el.addEventListener('error', onError);
      e.off = () => {
        el.removeEventListener('playing', onPlaying);
        el.removeEventListener('waiting', onStall);
        el.removeEventListener('error', onError);
      };
      if (s.kind === 'camera') void this.openCamera(e);
      else if (s.kind === 'external') this.attachExternal(e);
      else this.openVideo(e);
    } else {
      el.crossOrigin = 'anonymous';
      el.decoding = 'async';
      el.onload = () => this.emit(e, 'playing');
      el.onerror = () => this.emit(e, 'ended');
      e.off = () => {
        el.onload = null;
        el.onerror = null;
      };
      el.src = s.url!;
    }
  }

  private release(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    e.disposed = true;
    this.clearRetry(e);
    this.clearWatchdog(e);
    e.off();
    e.extOff();
    stopStream(e.stream); // turns the camera light off, frees the capture buffers (never set for external sources)
    e.stream = null;
    if (e.el instanceof HTMLVideoElement) {
      e.el.pause();
      e.el.srcObject = null;
      e.el.removeAttribute('src');
      e.el.load(); // drops the decoder
      e.el.remove();
    } else {
      e.el.removeAttribute('src');
    }
  }

  private async openCamera(e: Entry) {
    if (e.opening || e.disposed) return;
    e.opening = true;
    const video = e.el as HTMLVideoElement;
    try {
      stopStream(e.stream);
      e.stream = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(e.source.deviceId!, this.opts.fps),
        audio: false,
      });
      if (e.disposed) {
        stopStream(stream);
        return;
      }
      e.stream = stream;
      for (const t of stream.getVideoTracks()) {
        t.addEventListener('ended', () => {
          if (e.stream === stream) this.emit(e, 'ended');
        });
        // A capture card losing its HDMI signal often mutes instead of ending.
        t.addEventListener('mute', () => {
          if (e.stream === stream) this.emit(e, 'stalled');
        });
        t.addEventListener('unmute', () => {
          if (e.stream === stream) this.emit(e, 'playing');
        });
      }
      this.emit(e, 'started');
      this.armWatchdog(e, START_TIMEOUT_MS, 'opened');
      video.srcObject = stream;
      await video.play().catch(() => {});
    } catch (err) {
      console.warn(`[sources] camera ${e.source.label} unavailable`, err);
      this.emit(e, 'deviceGone');
    } finally {
      e.opening = false;
    }
  }

  /**
   * Points an external source's element at its current stream (from media/external.ts). No stream or no
   * live video track → 'lost' ("Signal verloren"). The tracks belong to the stream's owner: never stopped here.
   */
  private attachExternal(e: Entry) {
    const video = e.el as HTMLVideoElement;
    const stream = externalMedia.get(e.source.id);
    e.extOff();
    e.extOff = () => {};
    if (!stream || !hasLiveVideo(stream)) {
      video.srcObject = null;
      this.emit(e, 'ended');
      return;
    }
    const offs: Array<() => void> = [];
    for (const t of stream.getVideoTracks()) {
      const onEnded = () => this.emit(e, 'ended');
      const onMute = () => this.emit(e, 'stalled');
      const onUnmute = () => this.emit(e, 'playing');
      t.addEventListener('ended', onEnded);
      t.addEventListener('mute', onMute);
      t.addEventListener('unmute', onUnmute);
      offs.push(() => {
        t.removeEventListener('ended', onEnded);
        t.removeEventListener('mute', onMute);
        t.removeEventListener('unmute', onUnmute);
      });
    }
    e.extOff = () => offs.forEach((f) => f());
    this.emit(e, 'started');
    // Re-assign even for the same stream: its track set may have changed.
    video.srcObject = null;
    video.srcObject = stream;
    void video.play().catch(() => {});
  }

  private openVideo(e: Entry) {
    const video = e.el as HTMLVideoElement;
    video.loop = e.source.loop !== false;
    video.src = e.source.url!;
    video.load();
    void video.play().catch(() => {});
  }

  private async cameraPresent(deviceId: string): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((d) => d.kind === 'videoinput' && d.deviceId === deviceId);
    } catch {
      return false;
    }
  }

  /** Called every RETRY_MS while a source is lost. */
  private async recover(e: Entry) {
    if (e.disposed || e.status !== 'lost' || e.opening) return;
    if (e.source.kind === 'external') {
      // Comes back when its owner hands in a stream again (externalMedia listener); polling only re-checks.
      if (hasLiveVideo(externalMedia.get(e.source.id))) this.attachExternal(e);
      return;
    }
    if (e.source.kind === 'camera') {
      // Only re-open when the device is enumerated again: avoids a getUserMedia storm.
      if (!(await this.cameraPresent(e.source.deviceId!))) return;
      if (e.disposed || e.status !== 'lost') return;
      this.emit(e, 'deviceBack');
      await this.openCamera(e);
    } else if (e.el instanceof HTMLVideoElement) {
      this.emit(e, 'deviceBack');
      this.openVideo(e);
    } else {
      this.emit(e, 'deviceBack');
      const img = e.el;
      const url = e.source.url!;
      img.removeAttribute('src');
      img.src = url;
    }
  }

  private onDeviceChange = () => {
    void (async () => {
      let ids: Set<string>;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        ids = new Set(devices.filter((d) => d.kind === 'videoinput').map((d) => d.deviceId));
      } catch {
        return;
      }
      for (const e of this.entries.values()) {
        if (e.source.kind !== 'camera' || e.disposed) continue;
        const present = ids.has(e.source.deviceId!);
        if (!present && e.status !== 'lost') {
          this.emit(e, 'deviceGone');
        } else if (present && e.status === 'lost' && !e.opening) {
          this.emit(e, 'deviceBack');
          void this.openCamera(e);
        }
      }
    })();
  };
}
