import type { OverlayAnim, Template, TemplateNode } from '../state/types';

// Starter templates (1920×1080 space). Kept inside the 5 % action-safe area.
const NAVY = '#00498B';
const ACCENT = '#7ABBF2';
const WHITE = '#FFFFFF';
const GREY = '#6B7280';

const fadeIn = (durationMs: number): OverlayAnim => ({ kind: 'fade', durationMs, easing: 'easeInOut' });
const fadeOut = (durationMs: number): OverlayAnim => ({ kind: 'fade', durationMs, easing: 'easeInOut' });

const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, extra: Partial<TemplateNode> = {}): TemplateNode => ({
  id,
  type: 'rect',
  x,
  y,
  w,
  h,
  fill,
  ...extra,
});

const text = (id: string, x: number, y: number, w: number, h: number, value: string, extra: Partial<TemplateNode> = {}): TemplateNode => ({
  id,
  type: 'text',
  x,
  y,
  w,
  h,
  text: value,
  font: 'Inter',
  weight: 600,
  size: 28,
  color: WHITE,
  align: 'left',
  ...extra,
});

const title = { font: 'Plus Jakarta Sans', weight: 800 } as const;

export const STARTER_TEMPLATES: Template[] = [
  {
    id: 'lower-third',
    name: 'Bauchbinde',
    kind: 'lowerThird',
    fullScreen: false,
    nodes: [
      rect('bg', 120, 826, 880, 92, NAVY, { radius: 4 }),
      rect('accent', 120, 826, 8, 92, ACCENT),
      text('title', 156, 826, 816, 92, '{{row.Gruppe}}', { ...title, size: 46, delayMs: 60 }),
      rect('sub-bg', 120, 924, 720, 54, WHITE, { radius: 4, delayMs: 120 }),
      text('sub', 156, 924, 656, 54, '{{row.Verein}} · {{row.Kategorie}}', { size: 26, color: NAVY, delayMs: 160 }),
    ],
    animIn: { kind: 'slide', durationMs: 520, easing: 'easeOut', from: 'left' },
    animOut: fadeOut(280),
  },
  {
    id: 'logo-bug',
    name: 'Senderlogo',
    kind: 'logoBug',
    fullScreen: false,
    nodes: [
      rect('bg', 1590, 54, 276, 56, NAVY, { radius: 28, opacity: 0.94 }),
      text('label', 1590, 54, 276, 56, 'DanceCup Röbel', { ...title, size: 24, align: 'center' }),
    ],
    animIn: fadeIn(400),
    animOut: fadeOut(300),
  },
  {
    id: 'clock',
    name: 'Uhr',
    kind: 'clock',
    fullScreen: false,
    nodes: [
      rect('bg', 96, 54, 132, 56, NAVY, { radius: 28, opacity: 0.94 }),
      text('time', 96, 54, 132, 56, '{{time}}', { size: 28, align: 'center' }),
    ],
    animIn: fadeIn(400),
    animOut: fadeOut(300),
  },
  {
    id: 'next-up',
    name: 'Als Nächstes',
    kind: 'nextUp',
    fullScreen: false,
    nodes: [
      rect('bg', 1100, 914, 724, 64, WHITE, { radius: 4 }),
      rect('accent', 1100, 914, 8, 64, NAVY),
      text('label', 1132, 914, 668, 64, 'Als Nächstes: {{next.Gruppe}}', { size: 28, color: NAVY, delayMs: 60 }),
    ],
    animIn: { kind: 'slide', durationMs: 480, easing: 'easeOut', from: 'right' },
    animOut: fadeOut(280),
  },
  {
    id: 'break-spot',
    name: 'Werbepause',
    kind: 'breakSpot',
    fullScreen: true,
    nodes: [
      rect('bg', 0, 0, 1920, 1080, WHITE),
      rect('band', 0, 1032, 1920, 48, NAVY),
      // The "Werbung" label sits in the centre column, where no starter overlay (clock, logo bug,
      // donation, lower third, next up) can ever cover it.
      rect('tag-bg', 872, 200, 176, 48, GREY, { radius: 24 }),
      text('tag', 872, 200, 176, 48, 'Werbung', { size: 24, align: 'center' }),
      { id: 'logo', type: 'image', x: 560, y: 284, w: 800, h: 380, src: '{{sponsor.logo}}', fit: 'contain', delayMs: 120 },
      text('name', 160, 690, 1600, 96, '{{sponsor.name}}', { ...title, size: 60, color: NAVY, align: 'center', delayMs: 200 }),
    ],
    animIn: fadeIn(500),
    animOut: fadeOut(400),
  },
  {
    id: 'pause',
    name: 'Pause',
    kind: 'pause',
    fullScreen: true,
    nodes: [
      rect('bg', 0, 0, 1920, 1080, NAVY),
      text('headline', 160, 436, 1600, 130, 'Gleich geht’s weiter', { ...title, size: 96, align: 'center', delayMs: 100 }),
      rect('rule', 900, 594, 120, 6, ACCENT, { radius: 3, delayMs: 180 }),
      text('sub', 160, 626, 1600, 56, 'Röbel/Müritz · {{time}}', { size: 32, color: '#C7D7EA', align: 'center', delayMs: 240 }),
    ],
    animIn: fadeIn(600),
    animOut: fadeOut(500),
  },
  {
    id: 'donation',
    name: 'Unterstützung',
    kind: 'donation',
    fullScreen: false,
    nodes: [
      rect('bg', 560, 54, 800, 124, NAVY, { radius: 4 }),
      rect('accent', 560, 54, 800, 6, ACCENT),
      text('title', 600, 70, 720, 56, '{{donation.name}} unterstützt mit {{donation.amount}}', { ...title, size: 34, align: 'center' }),
      text('message', 600, 124, 720, 40, '{{donation.message}}', { weight: 400, size: 26, color: '#DCE6F2', align: 'center' }),
    ],
    animIn: { kind: 'scale', durationMs: 450, easing: 'backOut' },
    animOut: fadeOut(300),
  },
];

/** Deep copy so state never aliases the module constant. */
export function starterTemplates(): Template[] {
  return structuredClone(STARTER_TEMPLATES);
}
