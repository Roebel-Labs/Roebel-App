// Non-React runtime behind the UI: live sources, the 1920×1080 program canvas
// and the on-air session (MediaRecorder → main → ffmpeg + recording file).

import { createProgramOutput, type ProgramOutput } from '../media/program';
import { SourceRegistry, type SourceHealth } from '../media/sources';
import { programAudioTrack } from '../output/program-audio';
import { startRecorder } from '../output/recorder';
import type { OutputConfig, OutputStatus, Settings, ShowState, StreamTarget } from '../state/types';

type Listener = () => void;

/** Sources + program output for one fps setting. Recreated when fps changes (off air only). */
export class Engine {
  readonly registry: SourceRegistry;
  readonly program: ProgramOutput;
  private health = new Map<string, SourceHealth>();
  private listeners = new Set<Listener>();
  private offStatus: () => void;

  constructor(
    readonly fps: 30 | 50,
    getState: () => ShowState,
  ) {
    this.registry = new SourceRegistry({ fps });
    this.offStatus = this.registry.onStatus((id, st) => {
      this.health.set(id, st);
      this.listeners.forEach((l) => l());
    });
    this.program = createProgramOutput(getState, this.registry, fps);
    this.program.clock.start();
  }

  sourceHealth(id: string): SourceHealth {
    return this.health.get(id) ?? this.registry.statusOf(id) ?? 'loading';
  }

  onHealth(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  dispose() {
    this.offStatus();
    this.listeners.clear();
    this.program.dispose();
    this.registry.dispose();
  }
}

export type OnAirSnapshot = {
  phase: 'off' | 'starting' | 'on' | 'stopping';
  /** Wall-clock ms when the broadcast was started (on-air timer). */
  startedAt: number | null;
  status: OutputStatus | null;
  /** Last MediaRecorder error (auto-restarted). */
  recorderError: string | null;
  recorderRestarts: number;
  /** Start failure shown in the dialog / pill. */
  startError: string | null;
};

type Recorder = ReturnType<typeof startRecorder>;

/** A MediaRecorder that never fires 'stop' must not hang "Sendung beenden" or a restart. */
export const RECORDER_STOP_TIMEOUT_MS = 2000;

/** Resolves true when `p` settled in time, false on timeout. Never rejects. */
export function settleWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    p.then(
      () => {
        clearTimeout(t);
        resolve(true);
      },
      () => {
        clearTimeout(t);
        resolve(true);
      },
    );
  });
}

/** Owns the on-air session. Order matters: recorder stops (final chunk flushed) BEFORE output.stop(). */
export class OnAir {
  private snap: OnAirSnapshot = {
    phase: 'off',
    startedAt: null,
    status: null,
    recorderError: null,
    recorderRestarts: 0,
    startError: null,
  };
  private listeners = new Set<Listener>();
  private rec: Recorder | null = null;
  private stream: MediaStream | null = null;
  private videoKbps = 6000;
  private restarting: Promise<void> | null = null;
  private starting: Promise<void> | null = null;
  private cancelStart = false;
  private offs: Array<() => void> = [];

  constructor() {
    this.offs.push(window.studio.output.onStatus((s) => this.set({ status: s })));
    // ffmpeg was restarted by main: it needs a fresh Matroska header.
    this.offs.push(window.studio.output.onNeedHeader(() => void this.restartRecorder()));
  }

  get(): OnAirSnapshot {
    return this.snap;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(patch: Partial<OnAirSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  start(cfg: OutputConfig, programStream: MediaStream): Promise<void> {
    if (this.snap.phase !== 'off') return this.starting ?? Promise.resolve();
    this.cancelStart = false;
    this.set({ phase: 'starting', startError: null, recorderError: null, recorderRestarts: 0 });
    this.starting = (async () => {
      try {
        await window.studio.output.start(cfg);
        if (this.cancelStart) {
          // stop() was requested while main was starting: undo instead of going on air.
          await window.studio.output.stop().catch(() => {});
          this.set({ phase: 'off', startedAt: null });
          return;
        }
        this.videoKbps = cfg.videoKbps;
        this.stream = new MediaStream([...programStream.getVideoTracks(), programAudioTrack()]);
        this.rec = this.newRecorder();
        this.set({ phase: 'on', startedAt: Date.now() });
      } catch (e) {
        this.rec = null;
        this.stream = null;
        await window.studio.output.stop().catch(() => {});
        this.set({ phase: 'off', startedAt: null, startError: errorText(e) });
        throw e;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  /**
   * Main is still broadcasting although this renderer has no session (reload or crash):
   * take the session over and send a fresh recorder header so ffmpeg is fed again.
   */
  async adopt(programStream: MediaStream): Promise<void> {
    if (this.snap.phase !== 'off') return;
    const info = await window.studio.output.getStatus().catch(() => null);
    if (!info?.started || this.snap.phase !== 'off') return;
    this.videoKbps = info.videoKbps ?? this.videoKbps;
    this.stream = new MediaStream([...programStream.getVideoTracks(), programAudioTrack()]);
    this.set({ phase: 'on', startedAt: info.startedAt ?? Date.now(), status: info.status ?? this.snap.status });
    try {
      this.rec = this.newRecorder();
    } catch (e) {
      this.set({ recorderError: errorText(e) });
    }
  }

  async stop(): Promise<void> {
    if (this.snap.phase === 'starting') {
      this.cancelStart = true;
      await this.starting?.catch(() => {});
    }
    if (this.snap.phase === 'off' || this.snap.phase === 'stopping') return;
    this.set({ phase: 'stopping' });
    if (this.restarting) await settleWithin(this.restarting, RECORDER_STOP_TIMEOUT_MS);
    const rec = this.rec;
    this.rec = null;
    // The final chunk must reach main before the file is closed, but never wait forever.
    if (rec && !(await settleWithin(rec.stop(), RECORDER_STOP_TIMEOUT_MS))) {
      console.error('[onair] recorder did not stop in time; closing the output anyway');
    }
    try {
      await window.studio.output.stop();
    } finally {
      this.stream = null;
      this.set({ phase: 'off', startedAt: null });
    }
  }

  /** "Ziel neu verbinden": main restarts the encoder (all destinations), then asks for a fresh header. */
  reconnect(cfg?: Pick<OutputConfig, 'destinations'>): Promise<void> {
    if (this.snap.phase !== 'on') return Promise.resolve();
    return window.studio.output.reconnect(cfg ? { destinations: cfg.destinations } : undefined);
  }

  /** New MediaRecorder session → fresh header → main opens a new recording file and re-feeds ffmpeg. */
  restartRecorder(): Promise<void> {
    if (!this.stream || this.snap.phase !== 'on') return Promise.resolve();
    if (this.restarting) return this.restarting;
    this.restarting = (async () => {
      try {
        const old = this.rec;
        this.rec = null;
        if (old) await settleWithin(old.stop(), RECORDER_STOP_TIMEOUT_MS);
        if (this.snap.phase === 'on' && this.stream) {
          this.rec = this.newRecorder();
          this.set({ recorderRestarts: this.snap.recorderRestarts + 1 });
        }
      } catch (e) {
        this.set({ recorderError: `Neustart fehlgeschlagen: ${errorText(e)}` });
      } finally {
        this.restarting = null;
      }
    })();
    return this.restarting;
  }

  private newRecorder(): Recorder {
    const rec: Recorder = startRecorder(this.stream!, {
      videoKbps: this.videoKbps,
      onError: (msg) => {
        if (this.rec !== rec) return; // an old session that is already being replaced
        console.error('[onair] MediaRecorder error', msg);
        this.set({ recorderError: msg });
        void this.restartRecorder();
      },
    });
    return rec;
  }

  dispose() {
    this.offs.forEach((f) => f());
    this.listeners.clear();
  }
}

export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // ipcRenderer.invoke wraps main errors: "Error invoking remote method 'x': Error: msg"
  const msg = raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  if (msg === 'no_target') return 'Kein Sendeziel eingestellt';
  if (msg === 'recorder_mime_unsupported') return 'Dieses System kann den Programm-Stream nicht kodieren';
  return msg;
}

/** What main gets for a session: only enabled, usable destinations (none = record-only). */
export function outputConfig(s: Settings): OutputConfig {
  const destinations: OutputConfig['destinations'] = [];
  for (const d of s.destinations) {
    if (!d.enabled || d.target.kind === 'none') continue;
    destinations.push({ id: d.id, ...(d.target as StreamTarget) });
  }
  return {
    destinations,
    fps: s.fps,
    videoKbps: s.videoKbps,
    audioKbps: s.audioKbps,
    recordDir: s.recordDir,
    ffmpegPath: s.ffmpegPath,
  };
}

/** Display form of a target: never the stream key, never SRT query secrets. */
export function maskedTarget(t: Settings['destinations'][number]['target']): string {
  if (t.kind === 'none') return 'Kein Ziel';
  if (t.kind === 'srt') {
    const q = t.url.indexOf('?');
    return q === -1 ? t.url : `${t.url.slice(0, q)}?…`;
  }
  // The last four characters only for long keys, so a short key is never shown whole.
  const key = !t.key ? 'ohne Schlüssel' : t.key.length >= 12 ? `Schlüssel •••• ${t.key.slice(-4)}` : 'Schlüssel ••••';
  return `${t.url} (${key})`;
}
