import type { OverlayAnim, Template, TemplateNode } from '../state/types';
import { ROEBEL_APP_LOGO } from './roebel-app-logo';

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

// ---- Müritz Dance Cup full screens (Gleich geht's los/weiter, Ablaufplan, Pause, Siegerehrung, Finale, Danke).
// Background: dark blue, a blue band, a yellow diagonal stripe and the lighter main field, all with the same slant.
const MDC_DARK = '#11489A';
const MDC_MAIN = '#2468C9';
const MDC_SLANT = 560;
const screenBg = (): TemplateNode[] => [
  rect('bg', 0, 0, 1920, 1080, MDC_DARK),
  rect('band', 0, 0, 1660, 1080, MDC_BLUE, { slant: MDC_SLANT }),
  rect('stripe', 0, 0, 1530, 1080, MDC_YELLOW, { slant: MDC_SLANT, delayMs: 120, animIn: mdcWipe(600), outDelayMs: 200, animOut: mdcFade(300) }),
  rect('main', 0, 0, 1470, 1080, MDC_MAIN, { slant: MDC_SLANT }),
];
const screenHead = (label: string): TemplateNode[] => [
  rect('head-pill', 210, 164, 500, 64, WHITE, { stroke: '#000000', strokeWidth: 1, radii: [0, 32, 32, 0], hug: 'head', hugPad: 40, delayMs: 220, animIn: mdcWipe(420), animOut: mdcFade(200) }),
  text('head', 298, 164, 1300, 64, label, { weight: 900, italic: true, uppercase: true, tracking: -0.6, size: 34, color: MDC_BLUE, delayMs: 360, animIn: mdcFade(300), animOut: mdcFade(180) }),
  rect('head-disc', 150, 136, 120, 120, MDC_YELLOW, { radius: 60, stroke: '#000000', strokeWidth: 1.35, shadow: { x: 4, y: 0, blur: 0, color: 'rgba(0,0,0,0.25)' }, delayMs: 100, animIn: { kind: 'scale', durationMs: 460, easing: 'backOut', scaleFrom: 0.2 }, animOut: mdcFade(200) }),
  text('head-nr', 150, 136, 120, 120, '26', { weight: 900, italic: true, size: 48, tracking: -2, color: '#1656AD', align: 'center', delayMs: 100, animIn: { kind: 'scale', durationMs: 460, easing: 'backOut', scaleFrom: 0.2 }, animOut: mdcFade(200) }),
];
const screenFoot = (): TemplateNode =>
  text('foot', 150, 960, 1200, 50, 'Live in der Röbel App · Röbel/Müritz', { weight: 600, italic: true, uppercase: true, tracking: 1, size: 28, color: 'rgba(255,255,255,0.75)', delayMs: 500, animIn: mdcFade(400), animOut: mdcFade(200) });
const bigLine = (id: string, y: number, value: string, delayMs: number): TemplateNode =>
  text(id, 150, y, 1620, 170, value, { weight: 900, italic: true, uppercase: true, tracking: -5, size: 168, color: WHITE, shadow: { x: 6, y: 6, blur: 0, color: 'rgba(0,0,0,0.18)' }, delayMs, animIn: { kind: 'slide', durationMs: 520, easing: 'easeOut', from: 'left' }, animOut: mdcFade(220) });

function mdcScreen(id: string, name: string, lines: string[], sub: string): Template {
  const top = lines.length > 1 ? 340 : 360;
  const subY = top + lines.length * 165 + 40;
  return {
    id,
    name,
    kind: 'custom',
    fullScreen: true,
    nodes: [
      ...screenBg(),
      ...screenHead('Müritz Dance Cup 2026'),
      ...lines.map((l, i) => bigLine(`title-${i + 1}`, top + i * 165, l, 300 + i * 90)),
      rect('sub-bg', 140, subY, 400, 76, MDC_YELLOW, { slant: 18, hug: 'sub', hugPad: 46, delayMs: 520, animIn: mdcWipe(420), animOut: mdcFade(200) }),
      text('sub', 186, subY, 1560, 76, sub, { weight: 700, italic: true, size: 42, color: MDC_BLUE, delayMs: 640, animIn: mdcFade(300), animOut: mdcFade(180) }),
      screenFoot(),
    ],
    animIn: mdcFade(400),
    animOut: mdcFade(450),
  };
}

const SCHEDULE: [string, string, string][] = [
  ['10:00', 'Eröffnung', 'Dance, FunDance MiniMinis – Kids'],
  ['10:15', 'Dance · FunDance', 'MiniMinis – Kids'],
  ['13:30', 'Siegerehrung', 'Dance, FunDance MiniMinis – Kids'],
  ['15:15', 'Eröffnung', 'P-Synchron, FunDance Juniors – Seniors'],
  ['15:30', 'P-Synchron · FunDance', 'Juniors – Seniors'],
  ['18:15', 'Siegerehrung', 'P-Synchron, FunDance Juniors – Seniors'],
  ['18:45', 'Finale', ''],
];

function mdcSchedule(): Template {
  const rows = SCHEDULE.flatMap(([time, what, who], i): TemplateNode[] => {
    const y = 296 + i * 92;
    const d = 300 + i * 70;
    const n = i + 1;
    return [
      rect(`r${n}-bar`, 386, y, 1384, 84, WHITE, { stroke: '#000000', strokeWidth: 1, radii: [0, 42, 42, 0], delayMs: d, animIn: mdcWipe(420), animOut: mdcFade(200) }),
      rect(`r${n}-time-bg`, 150, y, 228, 84, MDC_YELLOW, { stroke: '#000000', strokeWidth: 1, slant: 20, delayMs: d, animIn: mdcWipe(300), animOut: mdcFade(200) }),
      text(`r${n}-time`, 150, y, 220, 84, time, { weight: 900, italic: true, size: 44, color: MDC_BLUE, align: 'center', delayMs: d + 120, animIn: mdcFade(260), animOut: mdcFade(160) }),
      text(`r${n}-what`, 426, y, 900, 84, what, { weight: 900, italic: true, uppercase: true, tracking: -0.6, size: 38, color: MDC_BLUE, delayMs: d + 160, animIn: mdcFade(260), animOut: mdcFade(160) }),
      text(`r${n}-who`, 426, y, 1300, 84, who, { weight: 700, italic: true, size: 30, color: MDC_LIGHT, after: `r${n}-what`, afterGap: 18, delayMs: d + 200, animIn: mdcFade(260), animOut: mdcFade(160) }),
    ];
  });
  return {
    id: 'mdc-ablaufplan',
    name: 'MDC Ablaufplan',
    kind: 'custom',
    fullScreen: true,
    nodes: [...screenBg(), ...screenHead('Ablaufplan · Samstag 07.11.2026'), ...rows, screenFoot()],
    animIn: mdcFade(400),
    animOut: mdcFade(450),
  };
}

/** "Live in der Röbel App": who hosts the stream. */
function mdcHost(): Template {
  return {
    id: 'mdc-roebel-app',
    name: 'MDC Live in der Röbel App',
    kind: 'custom',
    fullScreen: true,
    nodes: [
      ...screenBg(),
      ...screenHead('Müritz Dance Cup 2026'),
      text('title', 150, 330, 1620, 100, 'Livestream präsentiert von', { weight: 900, italic: true, uppercase: true, tracking: -2, size: 76, color: WHITE, shadow: { x: 4, y: 4, blur: 0, color: 'rgba(0,0,0,0.18)' }, delayMs: 300, animIn: { kind: 'slide', durationMs: 520, easing: 'easeOut', from: 'left' }, animOut: mdcFade(220) }),
      rect('card', 150, 462, 1120, 300, WHITE, { stroke: '#000000', strokeWidth: 1, radii: [0, 150, 150, 0], delayMs: 420, animIn: mdcWipe(480), outDelayMs: 120, animOut: mdcFade(260) }),
      { id: 'logo', type: 'image', x: 210, y: 497, w: 960, h: 230, src: ROEBEL_APP_LOGO, fit: 'contain', delayMs: 640, animIn: mdcFade(360), animOut: mdcFade(200) },
      rect('sub-bg', 140, 812, 400, 76, MDC_YELLOW, { slant: 18, hug: 'sub', hugPad: 46, delayMs: 760, animIn: mdcWipe(420), animOut: mdcFade(200) }),
      text('sub', 186, 812, 1560, 76, 'Kostenlos im App Store und bei Google Play', { weight: 700, italic: true, size: 42, color: MDC_BLUE, delayMs: 880, animIn: mdcFade(300), animOut: mdcFade(180) }),
    ],
    animIn: mdcFade(400),
    animOut: mdcFade(450),
  };
}

/** Small Röbel App logo top left (white pill), for the whole stream. */
const ROEBEL_APP_BUG: Template = {
  id: 'roebel-app-logo',
  name: 'Röbel App Logo',
  kind: 'logoBug',
  fullScreen: false,
  nodes: [
    rect('bg', 56, 40, 286, 76, WHITE, { radius: 38, stroke: '#000000', strokeWidth: 1, opacity: 0.96 }),
    { id: 'logo', type: 'image', x: 80, y: 52, w: 238, h: 52, src: ROEBEL_APP_LOGO, fit: 'contain' },
  ],
  animIn: fadeIn(400),
  animOut: fadeOut(300),
};

const MDC_SCREENS: Template[] = [
  mdcScreen('mdc-gleich-los', 'MDC Gleich geht’s los', ['Gleich', 'geht’s los'], 'Start um 10:00 Uhr'),
  mdcScreen('mdc-gleich-weiter', 'MDC Gleich geht’s weiter', ['Gleich geht’s', 'weiter'], 'Bleibt dran!'),
  mdcSchedule(),
  mdcScreen('mdc-pause', 'MDC Pause', ['Pause'], 'Weiter um 15:15 Uhr · P-Synchron, FunDance Juniors – Seniors'),
  mdcScreen('mdc-siegerehrung', 'MDC Siegerehrung', ['Siegerehrung'], 'Gleich werden die Pokale vergeben'),
  mdcScreen('mdc-finale', 'MDC Finale', ['Finale'], 'Müritz Dance Cup 2026'),
  mdcScreen('mdc-danke', 'MDC Danke', ['Danke fürs', 'Zuschauen'], 'Bis zum nächsten Mal!'),
  mdcHost(),
  ROEBEL_APP_BUG,
];

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
      { id: 'name', type: 'text', x: 312, y: 840, w: 1400, h: 96, text: '{{row.Name}}', font: 'Inter', weight: 900, italic: true, uppercase: true, tracking: -1.2, size: 56, color: MDC_BLUE, delayMs: 340, animIn: mdcFade(320), animOut: mdcFade(180) },
      // Start number disc, on top of both fields.
      { id: 'disc', type: 'rect', x: 104, y: 820, w: 200, h: 200, fill: MDC_YELLOW, radius: 100, stroke: '#000000', strokeWidth: 1.35, shadow: { x: 4, y: 0, blur: 0, color: 'rgba(0,0,0,0.25)' }, animIn: { kind: 'scale', durationMs: 460, easing: 'backOut', scaleFrom: 0.2 }, outDelayMs: 560, animOut: MDC_DISC_OUT },
      { id: 'nr', type: 'text', x: 104, y: 820, w: 200, h: 200, text: '{{row.Nr}}', font: 'Inter', weight: 900, italic: true, size: 112, color: '#1656AD', align: 'center', animIn: { kind: 'scale', durationMs: 460, easing: 'backOut', scaleFrom: 0.2 }, outDelayMs: 560, animOut: MDC_DISC_OUT },
    ],
    animIn: { kind: 'fade', durationMs: 300, easing: 'easeOut' },
    animOut: fadeOut(280),
  },
  ...MDC_SCREENS,
];

/** Bumped whenever a starter is added; restore() adds the new ones to older saved shows exactly once. */
export const STARTER_VERSION = 7;
/** Starters whose built-in design changed in a version: restore() replaces saved copies once (overlays kept). */
export const STARTERS_REPLACED_IN: Record<number, string[]> = { 5: ['mdc-lower-third'], 6: ['mdc-lower-third'] };
/** Starter ids introduced per starter version (version 1 = the original set; 3 only removed the donation starter). */
export const STARTERS_ADDED_IN: Record<number, string[]> = {
  2: ['chat-highlight'],
  4: ['mdc-lower-third'],
  7: MDC_SCREENS.map((t) => t.id),
};

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
