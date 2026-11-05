import { useEffect, useRef } from 'react';
import { defaultRenderContext } from '../../media/program';
import { renderFrame } from '../../render/draw';
import { useShow } from '../../state/store';
import type { ShowState } from '../../state/types';
import { useStudio } from '../studio';
import { TransitionBar } from './TransitionBar';

const MON_W = 960;
const MON_H = 540;

/** The state as it will look after TAKE: the preview scene as program, no transition running. */
export function asProgram(state: ShowState, sceneId: string | null, withOverlays = true): ShowState {
  return {
    ...state,
    programSceneId: sceneId,
    transition: { ...state.transition, startedAt: null, fromSceneId: null },
    overlays: withOverlays ? state.overlays : [],
  };
}

function sceneLabel(state: ShowState, id: string | null): string {
  return state.scenes.find((s) => s.id === id)?.label ?? '';
}

function PreviewMonitor() {
  const { state } = useShow();
  const { engine } = useStudio();
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const ctx = ref.current!.getContext('2d', { alpha: false })!;
    let raf = 0;
    let last = 0;
    const minGap = 1000 / engine.fps - 2; // never draw the monitor faster than the output
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < minGap) return;
      last = t;
      const s = latest.current;
      const shown = asProgram(s, s.previewSceneId);
      renderFrame(ctx, shown, engine.registry.lookup, defaultRenderContext(shown), Date.now(), { scale: MON_W / 1920 });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const label = sceneLabel(state, state.previewSceneId);
  return (
    <div className="pvw">
      <div className="monitor-head">
        <span className="monitor-title">Vorschau</span>
        <span className="monitor-scene">{label}</span>
      </div>
      <div className="monitor-frame">
        <canvas ref={ref} width={MON_W} height={MON_H} />
        {!state.previewSceneId && (
          <div className="monitor-empty">
            {state.scenes.length === 0
              ? 'Füge unten mit „+ Quelle“ eine Kamera, ein Bild oder eine Farbe hinzu.'
              : 'Klicke unten eine Quelle an, um sie hier vorzubereiten.'}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveMonitor() {
  const { state } = useShow();
  const { engine } = useStudio();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current!.getContext('2d', { alpha: false })!;
    let raf = 0;
    let last = 0;
    const minGap = 1000 / engine.fps - 2;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < minGap) return;
      last = t;
      ctx.drawImage(engine.program.canvas, 0, 0, MON_W, MON_H);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div className="pgm">
      <div className="monitor-head">
        <span className="monitor-title">Live</span>
        <span className="monitor-scene">{sceneLabel(state, state.programSceneId)}</span>
      </div>
      <div className="monitor-frame">
        <canvas ref={ref} width={MON_W} height={MON_H} />
        {!state.programSceneId && <div className="monitor-empty">Noch nichts live. TAKE schickt die Vorschau hierher.</div>}
      </div>
    </div>
  );
}

export function Monitors() {
  return (
    <div className="monitors">
      <PreviewMonitor />
      <TransitionBar />
      <LiveMonitor />
    </div>
  );
}
