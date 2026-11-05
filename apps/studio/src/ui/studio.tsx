// React glue for the runtime: Engine (sources + program) and OnAir (broadcast session).

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SourceHealth } from '../media/sources';
import { useShow } from '../state/store';
import type { Scene } from '../state/types';
import { Engine, OnAir, type OnAirSnapshot } from './engine';

type Ctx = { engine: Engine; onAir: OnAir };
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

  // fps is fixed per program output; the settings form only allows changes off air.
  useEffect(() => {
    const e = new Engine(fps, () => latest.current);
    setEngine(e);
    return () => e.dispose();
  }, [fps]);

  useEffect(() => {
    engine?.registry.sync(state.sources);
  }, [engine, state.sources]);

  if (!engine) return null;
  return <StudioContext.Provider value={{ engine, onAir }}>{children}</StudioContext.Provider>;
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
