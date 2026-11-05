// Audio mixer: device / video-file inputs → per-channel delay, gain, meter → master → limiter → recorder track.
//
// Graph per channel:  source → DelayNode(≤1 s) → GainNode → AnalyserNode → masterGain
// Master:             masterGain → DynamicsCompressor(−3 dB, 20:1) → GainNode(−1 dB ceiling)
//                     → WaveShaper (hard clip at −1 dBFS) → AnalyserNode → MediaStreamDestination
//                                                          ↘ monitorGain → ctx.destination ("Mithören", default off)
// The pure parts (dbToGain, effectiveGain, planDevices, peakDb) are unit-tested; the graph code is kept thin.

import { audioConstraints } from '../media/devices';
import { externalMedia } from '../media/external';
import type { SourceRegistry } from '../media/sources';
import type { AudioChannel, ShowState } from '../state/types';

/** Meter / fader floor. Anything at or below counts as silence. */
export const DB_FLOOR = -60;
export const MAX_DELAY_MS = 500;
/** Ramp for fader / mute changes: long enough to avoid clicks, short enough to feel instant. */
export const RAMP_MS = 30;
/** The recorded master never exceeds this. */
export const CEILING_DB = -1;
const RETRY_MS = 2000;
const FFT = 2048; // ≈ 43 ms at 48 kHz: covers the gap between ≤ 30 Hz meter polls

export function dbToGain(db: number): number {
  return db <= DB_FLOOR ? 0 : Math.pow(10, db / 20);
}

/** Linear gain a channel should currently have (0 when muted or following a source that is not on program). */
export function effectiveGain(ch: AudioChannel, programSourceIds: string[]): number {
  if (ch.muted) return 0;
  if (ch.followsVideoSourceId !== undefined && !programSourceIds.includes(ch.followsVideoSourceId)) return 0;
  return dbToGain(ch.gainDb);
}

/** Distinct device ids the channels need open (one getUserMedia per device, shared between channels). */
export function planDevices(channels: AudioChannel[]): Set<string> {
  const out = new Set<string>();
  for (const c of channels) if (c.input.kind === 'device') out.add(c.input.deviceId);
  return out;
}

/** Absolute peak of a block in dBFS, clamped at DB_FLOOR. Allocation-free. */
export function peakDb(buf: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] < 0 ? -buf[i] : buf[i];
    if (v > peak) peak = v;
  }
  if (peak <= 0) return DB_FLOOR;
  const db = 20 * Math.log10(peak);
  return db < DB_FLOOR ? DB_FLOOR : db;
}

/** Distinct external (runtime MediaStream) sources the channels listen to. */
export function planExternal(channels: AudioChannel[]): Set<string> {
  const out = new Set<string>();
  for (const c of channels) if (c.input.kind === 'external') out.add(c.input.sourceId);
  return out;
}

export type ChannelStatus = 'ok' | 'lost';

/** One external stream's audio as a WebAudio node, rebuilt when its audio track changes. */
type ExternalInput = { trackId: string; node: MediaStreamAudioSourceNode };

type DeviceInput = {
  stream: MediaStream | null;
  node: MediaStreamAudioSourceNode | null;
  status: ChannelStatus;
  opening: boolean;
};

type ChannelNodes = {
  delay: DelayNode;
  gain: GainNode;
  analyser: AnalyserNode;
  buf: Float32Array;
  src: AudioNode | null;
  lastGain: number;
  lastInProgram: boolean;
  lastDelayMs: number;
  status: ChannelStatus;
};

// An element can only ever feed ONE MediaElementAudioSourceNode (per context), so the node is cached per element.
const elementNodes = new WeakMap<HTMLMediaElement, { ctx: BaseAudioContext; node: MediaElementAudioSourceNode }>();

function isMediaElement(el: unknown): el is HTMLMediaElement {
  return !!el && typeof (el as HTMLMediaElement).play === 'function' && 'muted' in (el as object);
}

function clipCurve(): Float32Array<ArrayBuffer> {
  const n = 1025;
  const c = dbToGain(CEILING_DB);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.max(-c, Math.min(c, x));
  }
  return curve;
}

export class Mixer {
  private channels = new Map<string, ChannelNodes>();
  private devices = new Map<string, DeviceInput>();
  private externals = new Map<string, ExternalInput>();
  private offExternal: () => void;
  private masterGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private ceiling: GainNode;
  private clip: WaveShaperNode;
  private masterAnalyser: AnalyserNode;
  private masterBuf = new Float32Array(FFT);
  private monitorGain: GainNode;
  private dest: MediaStreamAudioDestinationNode;
  private out: Record<string, number> = { master: DB_FLOOR };
  private lastMasterDb = NaN;
  private monitorOn = false;
  private retry: ReturnType<typeof setInterval> | null = null;
  private latest: { audio: ShowState['audio']; media: SourceRegistry | null } = {
    audio: { channels: [], masterDb: 0 },
    media: null,
  };
  private disposed = false;

  constructor(private readonly ctx: AudioContext) {
    this.masterGain = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.limiter.knee.value = 0;
    this.ceiling = ctx.createGain();
    this.ceiling.gain.value = dbToGain(CEILING_DB);
    // Safety net: the compressor lets sub-attack transients through, so hard-clip at the ceiling too.
    this.clip = ctx.createWaveShaper();
    this.clip.curve = clipCurve();
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = FFT;
    this.dest = ctx.createMediaStreamDestination();
    this.dest.channelCount = 2;
    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = 0;
    this.masterGain
      .connect(this.limiter)
      .connect(this.ceiling)
      .connect(this.clip)
      .connect(this.masterAnalyser)
      .connect(this.dest);
    this.clip.connect(this.monitorGain).connect(ctx.destination);
    navigator.mediaDevices?.addEventListener('devicechange', this.onDeviceChange);
    // A guest's stream arrived, changed or went away: re-attach with the last synced state.
    this.offExternal = externalMedia.subscribe(() => this.resync());
  }

  /** AudioContext may start 'suspended' until a user gesture. */
  resume(): Promise<void> {
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  /** The post-limiter program mix for the recorder. */
  master(): MediaStreamTrack {
    return this.dest.stream.getAudioTracks()[0];
  }

  /** Routes the post-limiter master to the speakers (off by default: a room mic would feed back). */
  setMonitor(on: boolean): void {
    this.monitorOn = on;
    this.ramp(this.monitorGain.gain, on ? 1 : 0, RAMP_MS);
  }
  get monitoring(): boolean {
    return this.monitorOn;
  }

  /**
   * Reconciles the graph with the show state. Cheap enough to call on every state change; call it
   * again when a source's element may have been re-created (SourceRegistry.onStatus).
   * `transitionMs` is the ramp for channels that fade in/out because their followed picture changed.
   */
  sync(audio: ShowState['audio'], programSourceIds: string[], media: SourceRegistry, transitionMs = 0): void {
    if (this.disposed) return;
    this.latest = { audio, media };
    const ids = new Set(audio.channels.map((c) => c.id));
    for (const id of [...this.channels.keys()]) if (!ids.has(id)) this.removeChannel(id);

    // Devices: open what is needed, release what is not.
    const wanted = planDevices(audio.channels);
    for (const id of [...this.devices.keys()]) if (!wanted.has(id)) this.closeDevice(id);
    for (const id of wanted) if (!this.devices.has(id)) void this.openDevice(id);
    const ext = planExternal(audio.channels);
    for (const id of [...this.externals.keys()]) if (!ext.has(id)) this.closeExternal(id);

    for (const c of audio.channels) {
      const n = this.channels.get(c.id) ?? this.createChannel(c.id);
      this.attach(c, n);
      const inProgram = c.followsVideoSourceId === undefined || programSourceIds.includes(c.followsVideoSourceId);
      const g = effectiveGain(c, programSourceIds);
      if (g !== n.lastGain) {
        // A picture-driven fade follows the transition; fader / mute moves are quick.
        const ms = inProgram !== n.lastInProgram && transitionMs > 0 ? transitionMs : RAMP_MS;
        this.ramp(n.gain.gain, g, ms);
        n.lastGain = g;
      }
      n.lastInProgram = inProgram;
      const d = Math.min(MAX_DELAY_MS, Math.max(0, c.delayMs));
      if (d !== n.lastDelayMs) {
        n.delay.delayTime.setTargetAtTime(d / 1000, this.ctx.currentTime, 0.02);
        n.lastDelayMs = d;
      }
    }
    if (audio.masterDb !== this.lastMasterDb) {
      this.ramp(this.masterGain.gain, dbToGain(audio.masterDb), RAMP_MS);
      this.lastMasterDb = audio.masterDb;
    }
  }

  /**
   * Peak dBFS per channel id plus 'master'. Returns the SAME object every call (no per-frame
   * allocation) — read it, don't keep it. Lost channels read DB_FLOOR; see statusOf().
   */
  levels(): Record<string, number> {
    for (const [id, n] of this.channels) {
      if (n.status === 'lost') {
        this.out[id] = DB_FLOOR;
        continue;
      }
      n.analyser.getFloatTimeDomainData(n.buf as Float32Array<ArrayBuffer>);
      this.out[id] = peakDb(n.buf);
    }
    this.masterAnalyser.getFloatTimeDomainData(this.masterBuf as Float32Array<ArrayBuffer>);
    this.out.master = peakDb(this.masterBuf);
    return this.out;
  }

  statusOf(channelId: string): ChannelStatus {
    return this.channels.get(channelId)?.status ?? 'lost';
  }

  dispose(): void {
    this.disposed = true;
    navigator.mediaDevices?.removeEventListener('devicechange', this.onDeviceChange);
    this.offExternal();
    if (this.retry) clearInterval(this.retry);
    this.retry = null;
    for (const id of [...this.channels.keys()]) this.removeChannel(id);
    for (const id of [...this.devices.keys()]) this.closeDevice(id);
    for (const id of [...this.externals.keys()]) this.closeExternal(id);
    for (const n of [this.masterGain, this.limiter, this.ceiling, this.clip, this.masterAnalyser, this.monitorGain]) {
      n.disconnect();
    }
    this.dest.stream.getTracks().forEach((t) => t.stop());
  }

  // ---- internals ----

  private ramp(p: AudioParam, target: number, ms: number): void {
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(target, now + Math.max(RAMP_MS, ms) / 1000);
  }

  private createChannel(id: string): ChannelNodes {
    const delay = this.ctx.createDelay(1);
    const gain = this.ctx.createGain();
    gain.gain.value = 0; // silent until the first sync ramps it in
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = FFT;
    delay.connect(gain).connect(analyser).connect(this.masterGain);
    const n: ChannelNodes = {
      delay,
      gain,
      analyser,
      buf: new Float32Array(FFT),
      src: null,
      lastGain: 0,
      lastInProgram: true,
      lastDelayMs: 0,
      status: 'lost',
    };
    this.channels.set(id, n);
    this.out[id] = DB_FLOOR;
    return n;
  }

  private removeChannel(id: string): void {
    const n = this.channels.get(id);
    if (!n) return;
    n.src?.disconnect(n.delay);
    n.delay.disconnect();
    n.gain.disconnect();
    n.analyser.disconnect();
    this.channels.delete(id);
    delete this.out[id];
  }

  /** Connects the channel to its current input node (device stream or the source's media element). */
  private attach(c: AudioChannel, n: ChannelNodes): void {
    let next: AudioNode | null = null;
    if (c.input.kind === 'device') {
      next = this.devices.get(c.input.deviceId)?.node ?? null;
    } else if (c.input.kind === 'external') {
      next = this.externalNode(c.input.sourceId);
    } else {
      const el = this.latest.media?.lookup(c.input.sourceId).el;
      next = isMediaElement(el) ? this.elementNode(el) : null;
    }
    if (next !== n.src) {
      // The old input may already be fully disconnected (lost device / closed guest): that throws InvalidAccessError.
      try {
        n.src?.disconnect(n.delay);
      } catch {
        /* already detached */
      }
      next?.connect(n.delay);
      n.src = next;
    }
    n.status = next ? 'ok' : 'lost';
  }

  private elementNode(el: HTMLMediaElement): MediaElementAudioSourceNode | null {
    const cached = elementNodes.get(el);
    if (cached) return cached.ctx === this.ctx ? cached.node : null;
    try {
      const node = this.ctx.createMediaElementSource(el);
      // Once captured the element no longer reaches the speakers; un-mute so the node carries sound.
      el.muted = false;
      elementNodes.set(el, { ctx: this.ctx, node });
      return node;
    } catch {
      return null;
    }
  }

  /**
   * The audio of an external stream. Built from a one-track MediaStream so later changes to the guest's
   * stream (LiveKit swapping tracks) never silently re-route; a new track id rebuilds the node.
   * The tracks belong to the stream's owner and are never stopped here.
   */
  private externalNode(sourceId: string): MediaStreamAudioSourceNode | null {
    const stream = externalMedia.get(sourceId);
    const track = stream?.getAudioTracks().find((t) => t.readyState === 'live') ?? null;
    const cur = this.externals.get(sourceId);
    if (cur && track && cur.trackId === track.id) return cur.node;
    if (cur) this.closeExternal(sourceId);
    if (!track) return null;
    try {
      const node = this.ctx.createMediaStreamSource(new MediaStream([track]));
      this.externals.set(sourceId, { trackId: track.id, node });
      return node;
    } catch {
      return null;
    }
  }

  private closeExternal(sourceId: string): void {
    const cur = this.externals.get(sourceId);
    if (!cur) return;
    this.externals.delete(sourceId);
    cur.node.disconnect();
  }

  private async openDevice(deviceId: string): Promise<void> {
    const existing = this.devices.get(deviceId);
    if (existing?.opening) return;
    const d: DeviceInput = existing ?? { stream: null, node: null, status: 'lost', opening: false };
    this.devices.set(deviceId, d);
    d.opening = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
      if (this.disposed || this.devices.get(deviceId) !== d) {
        stream.getTracks().forEach((t) => t.stop()); // released while opening
        return;
      }
      d.stream = stream;
      d.node = this.ctx.createMediaStreamSource(stream);
      d.status = 'ok';
      for (const t of stream.getAudioTracks()) t.addEventListener('ended', () => this.deviceLost(deviceId, d));
    } catch {
      d.status = 'lost';
    } finally {
      d.opening = false;
    }
    if (d.status === 'lost') this.ensureRetry();
    this.resync();
  }

  private deviceLost(deviceId: string, d: DeviceInput): void {
    if (this.devices.get(deviceId) !== d) return;
    this.dropStream(d);
    this.ensureRetry();
    this.resync();
  }

  private dropStream(d: DeviceInput): void {
    d.node?.disconnect();
    d.stream?.getTracks().forEach((t) => t.stop());
    d.node = null;
    d.stream = null;
    d.status = 'lost';
  }

  private closeDevice(deviceId: string): void {
    const d = this.devices.get(deviceId);
    if (!d) return;
    this.devices.delete(deviceId); // before dropStream: an in-flight open() sees the release and stops its stream
    this.dropStream(d);
  }

  private ensureRetry(): void {
    if (this.retry || this.disposed) return;
    this.retry = setInterval(() => {
      let anyLost = false;
      for (const [id, d] of this.devices) {
        if (d.status !== 'lost') continue;
        anyLost = true;
        void this.openDevice(id);
      }
      if (!anyLost && this.retry) {
        clearInterval(this.retry);
        this.retry = null;
      }
    }, RETRY_MS);
  }

  private onDeviceChange = (): void => {
    for (const [id, d] of this.devices) if (d.status === 'lost') void this.openDevice(id);
  };

  /** Re-attach inputs after an async device event, using the last synced state. */
  private resync(): void {
    if (this.disposed) return;
    for (const c of this.latest.audio.channels) {
      const n = this.channels.get(c.id);
      if (n) this.attach(c, n);
    }
  }
}
