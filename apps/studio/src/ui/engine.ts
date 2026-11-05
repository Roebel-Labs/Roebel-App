// Non-React runtime behind the UI: live sources, the 1920×1080 program canvas
// and the on-air session (MediaRecorder → main → ffmpeg + recording file).

import { createProgramOutput, type ProgramOutput } from '../media/program';
import { SourceRegistry, type SourceHealth } from '../media/sources';
import { programAudioTrack } from '../output/program-audio';
import { startRecorder } from '../output/recorder';
import type { OutputConfig, OutputStatus, ShowState } from '../state/types';

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

  async start(cfg: OutputConfig, programStream: MediaStream): Promise<void> {
    if (this.snap.phase !== 'off') return;
    this.set({ phase: 'starting', startError: null, recorderError: null, recorderRestarts: 0 });
    try {
      await window.studio.output.start(cfg);
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
    }
  }

  async stop(): Promise<void> {
    if (this.snap.phase === 'off' || this.snap.phase === 'stopping') return;
    this.set({ phase: 'stopping' });
    try {
      if (this.restarting) await this.restarting.catch(() => {});
      const rec = this.rec;
      this.rec = null;
      if (rec) await rec.stop(); // final chunk reaches main before the file is closed
    } catch (e) {
      console.error('[onair] recorder stop failed', e);
    }
    try {
      await window.studio.output.stop();
    } finally {
      this.stream = null;
      this.set({ phase: 'off', startedAt: null });
    }
  }

  /** New MediaRecorder session → fresh header → main opens a new recording file and re-feeds ffmpeg. */
  restartRecorder(): Promise<void> {
    if (!this.rec || !this.stream || this.snap.phase !== 'on') return Promise.resolve();
    if (this.restarting) return this.restarting;
    this.restarting = (async () => {
      try {
        const old = this.rec;
        this.rec = null;
        await old?.stop().catch(() => {});
        if (this.snap.phase === 'on' && this.stream) {
          this.rec = this.newRecorder();
          this.set({ recorderRestarts: this.snap.recorderRestarts + 1 });
        }
      } finally {
        this.restarting = null;
      }
    })();
    return this.restarting;
  }

  private newRecorder(): Recorder {
    return startRecorder(this.stream!, {
      videoKbps: this.videoKbps,
      onError: (msg) => {
        console.error('[onair] MediaRecorder error', msg);
        this.set({ recorderError: msg });
        void this.restartRecorder();
      },
    });
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

/** Display form of a target: never the stream key, never SRT query secrets. */
export function maskedTarget(t: OutputConfig['target']): string {
  if (t.kind === 'none') return 'Kein Ziel';
  if (t.kind === 'srt') {
    const q = t.url.indexOf('?');
    return q === -1 ? t.url : `${t.url.slice(0, q)}?…`;
  }
  const key = t.key ? `Schlüssel •••• ${t.key.slice(-4)}` : 'ohne Schlüssel';
  return `${t.url} (${key})`;
}
