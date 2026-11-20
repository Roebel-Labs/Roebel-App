// New elements for the "Hinzufügen" panel. Texts on the card are design content (German, never
// translated); they are placed in the middle and coloured with the finish's ink.
import { PRESETS, designSize, newLayerId, type CardDesign, type FieldId, type FieldLayer, type ImageLayer, type Layer, type TextLayer } from '@roebel/card-design';

const base = { rotation: 0, opacity: 1, shine: false } as const;

/** Text colour that suits the background. */
export function inkFor(d: CardDesign): string {
  return d.background.kind === 'preset' ? PRESETS[d.background.preset].ink : '#1C1917';
}

export function textLayer(d: CardDesign, kind: 'heading' | 'body'): TextLayer {
  const { w: W, h: H } = designSize(d.format);
  const heading = kind === 'heading';
  const w = Math.min(560, W - 104), h = heading ? 60 : 36;
  return {
    ...base, id: newLayerId(d), type: 'text', x: (W - w) / 2, y: (H - h) / 2, w, h,
    text: heading ? 'Überschrift' : 'Text', font: heading ? 'barlow-black' : 'mona', size: heading ? 44 : 24,
    color: inkFor(d), align: 'center', uppercase: heading, letterSpacing: 0,
  };
}

const FIELD_SAMPLES: Record<FieldId, { label: string | null; sample: string }> = {
  holderName: { label: null, sample: 'Vorname Nachname' },
  validUntil: { label: 'Gültig bis', sample: '31.12.2027' },
  memberSince: { label: 'Mitglied seit', sample: '01.01.2024' },
};

/** A personal field, with a small caption above it for the dates. */
export function fieldLayers(d: CardDesign, field: FieldId): Layer[] {
  const { w: W, h: H } = designSize(d.format);
  const ink = inkFor(d);
  const { label, sample } = FIELD_SAMPLES[field];
  const w = field === 'holderName' ? 600 : 300;
  const x = (W - w) / 2, y = H / 2 - 22;
  const value: FieldLayer = {
    ...base, id: newLayerId(d), type: 'field', field, sampleText: sample, x, y, w, h: 44,
    font: 'mona-bold', size: 30, color: ink, align: 'left', uppercase: false, letterSpacing: 0,
  };
  if (!label) return [value];
  const withValue: CardDesign = { ...d, layers: [...d.layers, value] };
  const caption: TextLayer = {
    ...base, id: newLayerId(withValue), type: 'text', text: label, x, y: y - 30, w, h: 26,
    font: 'mona', size: 18, color: ink, align: 'left', uppercase: true, letterSpacing: 0.08,
  };
  return [caption, value];
}

/** An uploaded image as a new layer, fitted into a box that suits its role. */
export function imageLayer(d: CardDesign, assetId: string, role: ImageLayer['role'], size: { width: number | null; height: number | null }): ImageLayer {
  const { w: W, h: H } = designSize(d.format);
  const box = role === 'logo' ? { w: 180, h: 110 } : role === 'sticker' ? { w: 200, h: 200 } : { w: 320, h: 220 };
  const iw = size.width || box.w, ih = size.height || box.h;
  const s = Math.min(box.w / iw, box.h / ih);
  const w = Math.round(iw * s), h = Math.round(ih * s);
  const pos = role === 'logo' ? { x: W - 52 - w, y: 46 } : { x: (W - w) / 2, y: (H - h) / 2 };
  return { ...base, id: newLayerId(d), type: 'image', ...pos, w, h, assetId, role };
}
