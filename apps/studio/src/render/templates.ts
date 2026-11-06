import type { OverlayAnim, Template, TemplateNode } from '../state/types';

// Starter templates (1920×1080 space). Kept inside the 5 % action-safe area.
const NAVY = '#00498B';
const ACCENT = '#7ABBF2';
const WHITE = '#FFFFFF';
const GREY = '#6B7280';
// Müritz Dance Cup
const MDC_BLUE = '#1555AC';
const MDC_LIGHT = '#3E8CF6';
const MDC_YELLOW = '#F4EA3D';

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

const mdcWipe = (durationMs: number): OverlayAnim => ({ kind: 'wipe', durationMs, easing: 'easeOut', from: 'left' });
const mdcFade = (durationMs: number): OverlayAnim => ({ kind: 'fade', durationMs, easing: 'easeOut' });
// Played backwards on the way out: a short swell, then the disc shrinks away.
const MDC_DISC_OUT: OverlayAnim = { kind: 'scale', durationMs: 380, easing: 'backOut', scaleFrom: 0.2 };

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
      // lower third, next up, chat highlight) can ever cover it.
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
    // Live-Raum: one chat message on air. Sits above the lower third; the avatar simply stays empty without a URL.
    id: 'chat-highlight',
    name: 'Chat-Nachricht',
    kind: 'chatHighlight',
    fullScreen: false,
    nodes: [
      rect('bg', 120, 676, 880, 120, WHITE, { radius: 4 }),
      rect('accent', 120, 676, 8, 120, NAVY),
      { id: 'avatar', type: 'image', x: 152, y: 700, w: 72, h: 72, src: '{{chat.avatar}}', fit: 'cover', delayMs: 60 },
      text('name', 248, 692, 720, 44, '{{chat.name}}', { ...title, size: 28, color: NAVY, delayMs: 80 }),
      text('body', 248, 736, 720, 44, '{{chat.body}}', { weight: 400, size: 28, color: '#1F2937', delayMs: 120 }),
    ],
    animIn: { kind: 'slide', durationMs: 480, easing: 'easeOut', from: 'left' },
    animOut: fadeOut(280),
  },
  {
    // Müritz Dance Cup lower third (Figma "MDC", node 4422:8503): start number in a yellow disc, team name
    // in a white field, Kategorie + Altersklasse in a two-tone bar. Fields grow with the text (hug).
    id: 'mdc-lower-third',
    name: 'Bauchbinde MDC',
    kind: 'lowerThird',
    fullScreen: false,
    nodes: [
      // Bar: light-blue base, dark-blue Kategorie part with a slanted edge, outline on top.
      { id: 'bar', type: 'rect', x: 204, y: 944, w: 600, h: 56, fill: MDC_LIGHT, radii: [0, 0, 56, 0], hug: 'age', hugPad: 40, delayMs: 260, animIn: mdcWipe(420), outDelayMs: 160, animOut: mdcWipe(360) },
      { id: 'bar-dark', type: 'rect', x: 204, y: 944, w: 300, h: 56, fill: MDC_BLUE, slant: 28, hug: 'cat-pill', hugPad: 48.5, delayMs: 260, animIn: mdcWipe(380), outDelayMs: 160, animOut: mdcWipe(320) },
      { id: 'bar-line', type: 'rect', x: 204, y: 944, w: 600, h: 56, stroke: '#000000', strokeWidth: 1, radii: [0, 0, 56, 0], hug: 'age', hugPad: 40, delayMs: 260, animIn: mdcWipe(420), outDelayMs: 160, animOut: mdcWipe(360) },
      { id: 'cat', type: 'text', x: 338, y: 948, w: 520, h: 48, text: '{{row.Kategorie}}', font: 'Inter', weight: 600, italic: true, uppercase: true, tracking: -0.8, size: 28, color: WHITE, delayMs: 520, animIn: mdcFade(300), animOut: mdcFade(180) },
      { id: 'cat-pill', type: 'rect', x: 312, y: 948, w: 200, h: 48, stroke: WHITE, strokeWidth: 2, radius: 24, hug: 'cat', hugPad: 26, delayMs: 480, animIn: mdcFade(300), animOut: mdcFade(180) },
      { id: 'age', type: 'text', x: 600, y: 944, w: 520, h: 56, text: '{{row.Altersklasse}}', font: 'Inter', weight: 700, italic: true, uppercase: true, size: 28, color: WHITE, after: 'cat-pill', afterGap: 56.5, delayMs: 580, animIn: mdcFade(300), animOut: mdcFade(180) },
      // Name field: white, black outline, round right end.
      { id: 'name-bg', type: 'rect', x: 204, y: 840, w: 600, h: 96, fill: WHITE, stroke: '#000000', strokeWidth: 1, radii: [0, 48, 48, 0], hug: 'name', hugPad: 40, delayMs: 140, animIn: mdcWipe(440), outDelayMs: 220, animOut: mdcWipe(380) },
      { id: 'name', type: 'text', x: 312, y: 840, w: 1400, h: 96, text: '{{row.Name}}', font: 'Inter', weight: 700, italic: true, uppercase: true, tracking: -1.2, size: 56, color: MDC_BLUE, delayMs: 340, animIn: mdcFade(320), animOut: mdcFade(180) },
      // Start number disc, on top of both fields.
      { id: 'disc', type: 'rect', x: 104, y: 820, w: 200, h: 200, fill: MDC_YELLOW, radius: 100, stroke: '#000000', strokeWidth: 1.35, shadow: { x: 4, y: 0, blur: 0, color: 'rgba(0,0,0,0.25)' }, animIn: { kind: 'scale', durationMs: 460, easing: 'backOut', scaleFrom: 0.2 }, outDelayMs: 560, animOut: MDC_DISC_OUT },
      { id: 'nr', type: 'text', x: 104, y: 820, w: 200, h: 200, text: '{{row.Nr}}', font: 'Inter', weight: 900, italic: true, size: 112, color: '#1656AD', align: 'center', animIn: { kind: 'scale', durationMs: 460, easing: 'backOut', scaleFrom: 0.2 }, outDelayMs: 560, animOut: MDC_DISC_OUT },
    ],
    animIn: { kind: 'fade', durationMs: 300, easing: 'easeOut' },
    animOut: fadeOut(280),
  },
];

/** Bumped whenever a starter is added; restore() adds the new ones to older saved shows exactly once. */
export const STARTER_VERSION = 5;
/** Starters whose built-in design changed in a version: restore() replaces saved copies once (overlays kept). */
export const STARTERS_REPLACED_IN: Record<number, string[]> = { 5: ['mdc-lower-third'] };
/** Starter ids introduced per starter version (version 1 = the original set; 3 only removed the donation starter). */
export const STARTERS_ADDED_IN: Record<number, string[]> = { 2: ['chat-highlight'], 4: ['mdc-lower-third'] };

/**
 * Template kinds that may never exist: Unterstützungen are never burned into the stream or the recording
 * (dancers watch the recording later). restore() drops them with their overlays.
 */
export const FORBIDDEN_TEMPLATE_KINDS: readonly string[] = ['donation'];

/** Deep copy so state never aliases the module constant. */
export function starterTemplates(): Template[] {
  return structuredClone(STARTER_TEMPLATES);
}

/** True for the built-in templates; duplicates and other custom ones use `custom-` ids. */
export function isStarterTemplate(id: string): boolean {
  return STARTER_TEMPLATES.some((t) => t.id === id);
}
