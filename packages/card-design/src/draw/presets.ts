// Background finishes. Colours are sampled from the existing card masters in
// apps/expo/assets/cards (silver = Gast, navy = Bürger, gold = Bescheiniger);
// the others are new finishes in the same spirit.
import type { PresetId } from '../schema';

/** A soft radial glow; position and radius are fractions of the design width/height. */
export interface Glow { x: number; y: number; r: number; color: string }

export interface PresetSpec {
  /** Linear base gradient from `from` to `to` (fractions of width/height). */
  from: [number, number];
  to: [number, number];
  stops: string[];
  positions: number[];
  glows: Glow[];
  /** Suggested text colour for titles on this finish. */
  ink: string;
  /** Suggested colour for icons and the small print. */
  art: string;
  /** Rim drawn when the design has no border of its own. */
  rim?: { color: string; width: number };
  /** Whether `background.color` re-tints the base gradient. */
  tintable?: boolean;
}

export const PRESETS: Record<PresetId, PresetSpec> = {
  silver: {
    from: [0, 0], to: [1, 1],
    stops: ['#ECECE9', '#E9EBEA', '#EFEFEE', '#E3E4E2'], positions: [0, 0.35, 0.65, 1],
    glows: [
      { x: 0.04, y: 0.68, r: 0.32, color: '#FFFFFFD0' },
      { x: 0.52, y: 0.2, r: 0.3, color: '#F3F8F9B0' },
      { x: 0.55, y: 0.92, r: 0.3, color: '#D9DAD880' },
      { x: 0.25, y: 0.35, r: 0.22, color: '#E2E2DF90' },
    ],
    ink: '#6B787B', art: '#526872', rim: { color: '#D6D6D6', width: 4 },
  },
  navy: {
    from: [0.35, 0], to: [0.85, 1],
    stops: ['#1C3249', '#132B42', '#0A2236', '#021A29'], positions: [0, 0.4, 0.75, 1],
    glows: [
      { x: 0.4, y: 0.22, r: 0.42, color: '#22395580' },
      { x: 0.56, y: 0.58, r: 0.34, color: '#16334B70' },
      { x: 0.98, y: 0.95, r: 0.3, color: '#00141F90' },
    ],
    ink: '#E4E2CE', art: '#DCD9C3', tintable: true,
  },
  gold: {
    from: [0, 0], to: [1, 1],
    stops: ['#EDEDEA', '#EAE8DF', '#E3D7A6', '#C9A520'], positions: [0, 0.42, 0.72, 1],
    glows: [
      { x: 0.03, y: 0.6, r: 0.3, color: '#FFFFFFC0' },
      { x: 0.3, y: 0.18, r: 0.28, color: '#F4F7F7A0' },
      { x: 0.97, y: 0.9, r: 0.42, color: '#C7A210B0' },
      { x: 0.7, y: 0.55, r: 0.3, color: '#E6D28A70' },
    ],
    ink: '#7F7768', art: '#695D39', rim: { color: '#C9A748', width: 5 },
  },
  black: {
    from: [0, 0], to: [1, 1],
    stops: ['#2B2B2D', '#1A1A1C', '#0B0B0C'], positions: [0, 0.5, 1],
    glows: [
      { x: 0.3, y: 0.15, r: 0.45, color: '#3C3C4070' },
      { x: 0.9, y: 0.95, r: 0.35, color: '#00000090' },
    ],
    ink: '#EDEDED', art: '#D9D9D9', rim: { color: '#3A3A3C', width: 3 },
  },
  paper: {
    from: [0, 0], to: [1, 1],
    stops: ['#F8F4EA', '#F3EDDF', '#ECE4D2'], positions: [0, 0.55, 1],
    glows: [{ x: 0.2, y: 0.2, r: 0.4, color: '#FFFDF760' }],
    ink: '#3A3530', art: '#5A5248', rim: { color: '#E0D8C6', width: 3 },
  },
  holo: {
    from: [0, 0], to: [1, 1],
    stops: ['#E6EEFF', '#F4E3FF', '#E1FBF1', '#FFF3D9', '#E4EAFF'], positions: [0, 0.27, 0.52, 0.76, 1],
    glows: [
      { x: 0.15, y: 0.2, r: 0.35, color: '#FFFFFFB0' },
      { x: 0.8, y: 0.75, r: 0.35, color: '#D9F0FF90' },
    ],
    ink: '#3D4A66', art: '#4A5778', rim: { color: '#D4D9EE', width: 3 },
  },
  matte: {
    from: [0, 0], to: [0, 1],
    stops: ['#43536A', '#3B4A5C', '#323F4F'], positions: [0, 0.5, 1],
    glows: [],
    ink: '#F2F2F0', art: '#E4E4E0', tintable: true,
  },
  glass: {
    from: [0, 0], to: [1, 1],
    stops: ['#F6FAFCD8', '#E9F0F5C4', '#D7E1EAB8'], positions: [0, 0.5, 1],
    glows: [
      { x: 0.12, y: 0.15, r: 0.4, color: '#FFFFFFC0' },
      { x: 0.85, y: 0.9, r: 0.3, color: '#C9D6E280' },
    ],
    ink: '#24323F', art: '#33475A', rim: { color: '#FFFFFFB0', width: 3 },
  },
};

/** Base stops for a tintable preset re-coloured around `color` (#rrggbb). */
export function tintedStops(color: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    // Light at the top-left, darker towards the bottom-right.
    out.push(t < 0.5 ? mixHex(color, '#FFFFFF', 0.14 * (1 - t * 2)) : mixHex(color, '#000000', 0.38 * (t * 2 - 1)));
  }
  return out;
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** [r, g, b, a] in 0..255 from #rrggbb or #rrggbbaa. */
export function parseHex(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length >= 8 ? n(6) : 255];
}
