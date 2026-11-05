// What the OBS overlay page may see. Never settings (stream key), sources (device ids), scenes or audio.
import type { ShowState } from '../state/types';

export type OverlayProjection = Pick<ShowState, 'overlays' | 'templates' | 'table' | 'sponsors'>;

let last: { o: unknown; t: unknown; tb: unknown; sp: unknown; out: OverlayProjection } | null = null;

/** Pure projection; memoized by the identity of its parts so unrelated state changes yield the same object. */
export function overlayProjection(state: ShowState): OverlayProjection {
  const { overlays, templates, table, sponsors } = state;
  if (last && last.o === overlays && last.t === templates && last.tb === table && last.sp === sponsors) return last.out;
  const out = { overlays, templates, table, sponsors };
  last = { o: overlays, t: templates, tb: table, sp: sponsors, out };
  return out;
}
