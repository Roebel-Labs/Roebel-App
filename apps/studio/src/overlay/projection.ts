// What the OBS overlay page may see. Never settings (stream key), sources (device ids), scenes or audio.
// `live` carries the Live-Raum chat highlight (name, message, avatar URL): key-free by construction.
// Unterstützungen are never part of it: they are never on air.
import type { RenderContext, ShowState } from '../state/types';

export type LiveOverlay = Pick<RenderContext, 'chatHighlight'>;

export type OverlayProjection = Pick<ShowState, 'overlays' | 'templates' | 'table' | 'sponsors'> & { live: LiveOverlay };

const NO_LIVE: LiveOverlay = { chatHighlight: null };

let last: { o: unknown; t: unknown; tb: unknown; sp: unknown; ch: unknown; out: OverlayProjection } | null = null;

/** Pure projection; memoized by the identity of its parts so unrelated state changes yield the same object. */
export function overlayProjection(state: ShowState, live: LiveOverlay = NO_LIVE): OverlayProjection {
  const { overlays, templates, table, sponsors } = state;
  const { chatHighlight } = live;
  if (
    last &&
    last.o === overlays &&
    last.t === templates &&
    last.tb === table &&
    last.sp === sponsors &&
    last.ch === chatHighlight
  )
    return last.out;
  const out = { overlays, templates, table, sponsors, live: { chatHighlight } };
  last = { o: overlays, t: templates, tb: table, sp: sponsors, ch: chatHighlight, out };
  return out;
}
