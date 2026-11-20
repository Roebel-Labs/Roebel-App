// Starting points for the designer: the three community cards recreated as
// designs, then further finishes. Card units: 924 x 580 (stamp 580 x 580).
import { BUILTIN_ASSETS, LOGO_SLOT_ASSET } from './builtin';
import { PRESETS } from './draw/presets';
import type { CardDesign, DesignFormat, FieldLayer, ImageLayer, Layer, PresetId, TextLayer } from './schema';

export type CardTemplate = { id: string; label: string; format: DesignFormat; design: CardDesign };

const base = { rotation: 0, opacity: 1, shine: false } as const;

const text = (id: string, x: number, y: number, w: number, h: number, value: string, font: TextLayer['font'], size: number, color: string, extra: Partial<TextLayer> = {}): TextLayer =>
  ({ ...base, id, type: 'text', x, y, w, h, text: value, font, size, color, align: 'left', uppercase: true, letterSpacing: 0, ...extra });

const image = (id: string, x: number, y: number, w: number, h: number, assetId: string, role: ImageLayer['role']): ImageLayer =>
  ({ ...base, id, type: 'image', x, y, w, h, assetId, role });

const holderName = (color: string): FieldLayer =>
  ({ ...base, id: 'holder-name', type: 'field', field: 'holderName', sampleText: 'Vorname Nachname', x: 52, y: 400, w: 600, h: 44,
    font: 'mona-bold', size: 30, color, align: 'left', uppercase: false, letterSpacing: 0 });

/** Built-in art variant per finish: light art on dark finishes, dark art on light ones. */
const ART: Record<PresetId, '' | '-dark' | '-gold'> = {
  silver: '-dark', navy: '', gold: '-gold', black: '', paper: '-dark', holo: '-dark', matte: '', glass: '-dark',
};

function card(preset: PresetId, title: string, opts: { community: boolean; shine: boolean; intensity?: number }): CardDesign {
  const p = PRESETS[preset];
  const art = ART[preset];
  const layers: Layer[] = [
    text('title', 52, 72, 600, 60, title, 'barlow-black', 44, p.ink),
    opts.community
      ? image('logo', 698, 46, 180, 102, `builtin:person-laurel${art}`, 'logo')
      : image('logo', 718, 46, 160, 102, LOGO_SLOT_ASSET, 'logo'),
  ];
  if (!opts.community) layers.push(holderName(p.ink));
  layers.push(
    text('place', 52, 480, 500, 44, 'Röbel / Müritz', 'barlow', 32, p.art),
    image('mark', 685, 476, 193, 45, `builtin:roebel-mark${art}`, 'image'),
  );
  return { schema: 1, format: 'card', background: { kind: 'preset', preset }, shine: { enabled: opts.shine, intensity: opts.intensity ?? 0.6 }, layers };
}

function holoStamp(): CardDesign {
  const p = PRESETS.holo;
  return {
    schema: 1,
    format: 'stamp',
    background: { kind: 'preset', preset: 'holo' },
    shine: { enabled: true, intensity: 0.8 },
    layers: [
      image('logo', 210, 110, 160, 160, LOGO_SLOT_ASSET, 'logo'),
      text('title', 50, 290, 480, 60, 'Abzeichen', 'barlow-black', 48, p.ink, { align: 'center', shine: true }),
      text('place', 90, 360, 400, 40, 'Röbel / Müritz', 'barlow', 28, p.art, { align: 'center' }),
      image('mark', 213, 450, 154, 36, 'builtin:roebel-mark-dark', 'image'),
    ],
  };
}

const t = (id: string, label: string, design: CardDesign): CardTemplate => ({ id, label, format: design.format, design });

export const TEMPLATES: CardTemplate[] = [
  t('gast', 'Gast', card('silver', 'Gast', { community: true, shine: true, intensity: 0.5 })),
  t('buerger', 'Bürger', card('navy', 'Bürger', { community: true, shine: true, intensity: 0.5 })),
  t('bescheiniger', 'Bescheiniger', card('gold', 'Bescheiniger', { community: true, shine: true, intensity: 0.5 })),
  t('schwarz', 'Schwarz', card('black', 'Mitglied', { community: false, shine: true })),
  t('papier', 'Papier', card('paper', 'Mitglied', { community: false, shine: false })),
  t('matt', 'Matt', card('matte', 'Mitglied', { community: false, shine: false })),
  t('glas', 'Glas', card('glass', 'Mitglied', { community: false, shine: true })),
  t('holo-stempel', 'Holografischer Stempel', holoStamp()),
];

// Every built-in a template uses must exist (the logo slot is intentionally art-less).
for (const tpl of TEMPLATES) {
  for (const l of tpl.design.layers) {
    if (l.type === 'image' && l.assetId !== LOGO_SLOT_ASSET && !(l.assetId in BUILTIN_ASSETS)) {
      throw new Error(`template ${tpl.id}: unknown built-in ${l.assetId}`);
    }
  }
}
