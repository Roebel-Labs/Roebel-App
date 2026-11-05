// React glue for the runtime: Engine (sources + program) and OnAir (broadcast session).

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Mixer } from '../audio/mixer';
import type { SourceHealth } from '../media/sources';
import { setProgramAudioProvider } from '../output/program-audio';
import { useShow } from '../state/store';
import type { Scene, ShowState } from '../state/types';
import { Engine, OnAir, type OnAirSnapshot } from './engine';

type Ctx = { engine: Engine; onAir: OnAir; mixer: Mixer };

/** Source ids the program shows, and the ramp for picture-following audio. */
function programAudioInputs(s: ShowState): { ids: string[]; transitionMs: number } {
  const scene = s.scenes.find((x) => x.id === s.programSceneId);
  const preset = s.presets.find((p) => p.id === s.transition.presetId);
  return {
    ids: scene ? scene.sourceIds : [],
    transitionMs: s.transition.startedAt !== null && preset ? preset.durationMs : 0,
  };
}
const StudioContext = createContext<Ctx | null>(null);

// One OnAir per renderer (it subscribes to main's output events).
let onAirSingleton: OnAir | null = null;

export function StudioProvider({ children }: { children: ReactNode }) {
  const { state } = useShow();
  const latest = useRef(state);
  latest.current = state;
  const onAir = (onAirSingleton ??= new OnAir());
  const fps = state.settings.fps;
  const [engine, setEngine] = useState<Engine | null>(null);
  const [mixer, setMixer] = useState<Mixer | null>(null);

  // One mixer per page; its master is the program audio for the recorder.
  useEffect(() => {
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
    const m = new Mixer(ctx);
    setProgramAudioProvider(() => m.master());
    setMixer(m);
    // Chromium may start the context suspended until a user gesture.
    const resume = () => void m.resume().catch(() => {});
    resume();
    window.addEventListener('pointerdown', resume, { once: true, capture: true });
    window.addEventListener('keydown', resume, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      setProgramAudioProvider(null);
      m.dispose();
      void ctx.close().catch(() => {});
    };
  }, []);

  // fps is fixed per program output; the settings form only allows changes off air.
  useEffect(() => {
    const e = new Engine(fps, () => latest.current);
    setEngine(e);
    return () => e.dispose();
  }, [fps]);

  useEffect(() => {
    engine?.registry.sync(state.sources);
  }, [engine, state.sources]);

  // Mixer follows the show (channels, faders, program picture) and re-attaches re-created elements.
  const { ids: programIds, transitionMs } = programAudioInputs(state);
  const programKey = programIds.join('|');
  useEffect(() => {
    if (!mixer || !engine) return;
    const p = programAudioInputs(latest.current);
    mixer.sync(state.audio, p.ids, engine.registry, p.transitionMs);
  }, [mixer, engine, state.audio, programKey, transitionMs]);
  useEffect(() => {
    if (!mixer || !engine) return;
    return engine.onHealth(() => {
      const s = latest.current;
      const p = programAudioInputs(s);
      mixer.sync(s.audio, p.ids, engine.registry, 0);
    });
  }, [mixer, engine]);

  // A reload/crash while on air: main is still broadcasting, take the session over.
  useEffect(() => {
    if (engine && mixer) void onAir.adopt(engine.program.stream);
  }, [engine, mixer, onAir]);

  const value = useMemo(() => (engine && mixer ? { engine, onAir, mixer } : null), [engine, mixer, onAir]);
  if (!value) return null;
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): Ctx {
  const c = useContext(StudioContext);
  if (!c) throw new Error('useStudio outside <StudioProvider>');
  return c;
}

export function useOnAir(): OnAirSnapshot {
  const { onAir } = useStudio();
  return useSyncExternalStore(
    (cb) => onAir.subscribe(cb),
    () => onAir.get(),
  );
}

/** Health of every source, re-rendering on change. */
export function useSourceHealth(): (id: string) => SourceHealth {
  const { engine } = useStudio();
  const [, bump] = useState(0);
  useEffect(() => engine.onHealth(() => bump((n) => n + 1)), [engine]);
  return (id) => engine.sourceHealth(id);
}

/** Worst health of a scene's sources; colour sources are always fine. */
export function sceneHealth(scene: Scene, kindOf: (id: string) => string | undefined, health: (id: string) => SourceHealth): SourceHealth {
  let worst: SourceHealth = 'ok';
  for (const id of scene.sourceIds) {
    const kind = kindOf(id);
    if (kind === undefined) return 'lost';
    if (kind === 'color') continue;
    const h = health(id);
    if (h === 'lost') return 'lost';
    if (h === 'loading') worst = 'loading';
  }
  return worst;
}

/** Re-renders once per `ms`. */
export function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
