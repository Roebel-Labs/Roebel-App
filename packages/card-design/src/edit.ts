// Pure reducers over a CardDesign, shared by the Studio and app editors.
import type { CardDesign, FieldLayer, ImageLayer, Layer, TextLayer } from './schema';

type Patch<L> = Partial<Omit<L, 'id' | 'type'>>;
export type LayerPatch = Patch<TextLayer> | Patch<FieldLayer> | Patch<ImageLayer>;

export function newLayerId(d: CardDesign): string {
  const taken = new Set(d.layers.map((l) => l.id));
  for (let n = d.layers.length + 1; ; n++) {
    const id = `l${n}`;
    if (!taken.has(id)) return id;
  }
}

export function addLayer(d: CardDesign, layer: Layer): CardDesign {
  const id = d.layers.some((l) => l.id === layer.id) ? newLayerId(d) : layer.id;
  return { ...d, layers: [...d.layers, { ...layer, id }] };
}

export function updateLayer(d: CardDesign, id: string, patch: LayerPatch): CardDesign {
  if (!d.layers.some((l) => l.id === id)) return d;
  return {
    ...d,
    layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch, id: l.id, type: l.type } as Layer) : l)),
  };
}

export function removeLayer(d: CardDesign, id: string): CardDesign {
  return { ...d, layers: d.layers.filter((l) => l.id !== id) };
}

export function moveLayer(d: CardDesign, id: string, to: 'up' | 'down' | 'top' | 'bottom'): CardDesign {
  const i = d.layers.findIndex((l) => l.id === id);
  if (i < 0) return d;
  const layers = [...d.layers];
  const [layer] = layers.splice(i, 1);
  const target =
    to === 'top' ? layers.length : to === 'bottom' ? 0 : to === 'up' ? Math.min(i + 1, layers.length) : Math.max(i - 1, 0);
  layers.splice(target, 0, layer);
  return { ...d, layers };
}

/** Whether point (x, y) lies in the layer's box rotated about its centre. */
export function layerContains(l: Layer, x: number, y: number): boolean {
  const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
  const rad = (-l.rotation * Math.PI) / 180;
  const dx = x - cx, dy = y - cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= l.w / 2 && Math.abs(ly) <= l.h / 2;
}

/** Id of the top-most layer containing the point, or null. */
export function hitTest(d: CardDesign, x: number, y: number): string | null {
  for (let i = d.layers.length - 1; i >= 0; i--) {
    if (layerContains(d.layers[i], x, y)) return d.layers[i].id;
  }
  return null;
}

/** Nearest target within `tolerance`, otherwise `value` unchanged. */
export function snap(value: number, targets: number[], tolerance = 6): number {
  let best = value, bestDist = Infinity;
  for (const t of targets) {
    const dist = Math.abs(t - value);
    if (dist <= tolerance && dist < bestDist) { best = t; bestDist = dist; }
  }
  return best;
}
