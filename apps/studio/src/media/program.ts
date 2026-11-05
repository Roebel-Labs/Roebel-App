// Program output: a 1920×1080 canvas drawn by renderFrame on every OutputClock
// tick, exposed as a MediaStream for the recorder. captureStream(0) + an
// explicit requestFrame() after each draw means exactly one encoded frame per
// tick, independent of rAF (which stops when the window is hidden).

import { renderFrame } from '../render/draw';
import type { RenderContext, ShowState } from '../state/types';
import { hiddenHost } from './hidden-host';
import { OutputClock } from './output-clock';
import type { SourceRegistry } from './sources';

export const PROGRAM_W = 1920;
export const PROGRAM_H = 1080;

export type ProgramOutput = {
  canvas: HTMLCanvasElement;
  stream: MediaStream;
  clock: OutputClock;
  dispose(): void;
};

/** Current + next table row, wall clock; the sponsor is the spot of a running Werbeblock; donation is filled in by a later task. */
export function defaultRenderContext(state: ShowState): RenderContext {
  const rows = state.table.rows;
  const i = rows.findIndex((r) => r.id === state.table.currentRowId);
  const sp = state.sponsors.breakActive ? state.sponsors.items.find((x) => x.id === state.sponsors.currentId) : undefined;
  return {
    row: i >= 0 ? rows[i].values : null,
    next: i >= 0 && i + 1 < rows.length ? rows[i + 1].values : null,
    now: new Date(),
    sponsor: sp ? { name: sp.name, logoUrl: sp.logoUrl ?? '' } : null,
    donation: null,
  };
}

export function createProgramOutput(
  getState: () => ShowState,
  registry: Pick<SourceRegistry, 'lookup'>,
  fps: number,
  getRenderContext: (state: ShowState) => RenderContext = defaultRenderContext,
): ProgramOutput {
  const canvas = document.createElement('canvas');
  canvas.width = PROGRAM_W;
  canvas.height = PROGRAM_H;
  hiddenHost().appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const clock = new OutputClock(fps, () => {
    const state = getState();
    // Show-state timestamps (transition/overlay changedAt) are wall-clock ms.
    renderFrame(ctx, state, registry.lookup, getRenderContext(state), Date.now());
    track.requestFrame();
  });
  return {
    canvas,
    stream,
    clock,
    dispose() {
      clock.stop();
      track.stop();
      canvas.remove();
    },
  };
}
