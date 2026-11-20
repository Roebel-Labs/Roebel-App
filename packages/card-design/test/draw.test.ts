import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import type { CardDesign, Layer } from '../src/index';
import { renderPng, loadCanvasKit, createCanvasKitApi, nodeFontSet } from '../src/adapters/canvaskit';

const silver = (layers: Layer[] = []): CardDesign => ({
  schema: 1, format: 'card', background: { kind: 'preset', preset: 'silver' }, shine: { enabled: true, intensity: 0.6 }, layers,
});

const text = (id: string, extra: Partial<Layer> = {}): Layer =>
  ({ id, type: 'text', x: 52, y: 72, w: 600, h: 60, rotation: 0, opacity: 1, shine: false, text: 'Gast',
    font: 'barlow-black', size: 44, color: '#6B787B', align: 'left', uppercase: true, letterSpacing: 0, ...extra }) as Layer;

const alphaAt = (png: PNG, x: number, y: number) => png.data[(y * png.width + x) * 4 + 3];

test('renders a silver card at width 462 as a 462x290 PNG with rounded corners', async () => {
  const bytes = await renderPng(silver([text('t')]), { width: 462, mode: 'preview', shinePhase: 0.35 });
  const png = PNG.sync.read(Buffer.from(bytes));
  assert.equal(png.width, 462);
  assert.equal(png.height, 290);
  assert.equal(alphaAt(png, 2, 2), 0, 'corner is transparent');
  assert.equal(alphaAt(png, 231, 145), 255, 'centre is opaque');
});

test('a missing image asset or font is skipped without throwing', async () => {
  const design = silver([
    { id: 'img', type: 'image', x: 700, y: 40, w: 180, h: 120, rotation: 0, opacity: 1, shine: true, assetId: 'f'.repeat(64), role: 'logo' },
    text('t'),
  ]);
  const withLayers = await renderPng(design, { width: 462, mode: 'preview', shinePhase: 0.35 });
  assert.ok(withLayers.length > 0);

  const ck = await loadCanvasKit();
  const api = createCanvasKitApi(ck);
  const all = await nodeFontSet(ck, api);
  const noFonts = { provider: all.provider, families: new Set<never>() };
  const a = await renderPng(silver([text('t')]), { width: 462, mode: 'preview', shinePhase: 0.35, fonts: noFonts });
  const b = await renderPng(silver([]), { width: 462, mode: 'preview', shinePhase: 0.35, fonts: noFonts });
  assert.deepEqual(a, b, 'text layer with a missing font draws nothing');
});

test('holder field without a value draws nothing in public mode', async () => {
  const field = { ...text('f'), type: 'field', field: 'holderName', sampleText: 'Vorname Nachname' } as Layer;
  const a = await renderPng(silver([field]), { width: 462, mode: 'public', shinePhase: 0.35, values: { holderName: 'Erika Muster' } });
  const b = await renderPng(silver([]), { width: 462, mode: 'public', shinePhase: 0.35 });
  assert.deepEqual(a, b);
  const c = await renderPng(silver([field]), { width: 462, mode: 'holder', shinePhase: 0.35 });
  assert.deepEqual(c, b);
  const d = await renderPng(silver([field]), { width: 462, mode: 'preview', shinePhase: 0.35 });
  assert.notDeepEqual(d, b);
});

test('shinePhase moves the sheen unless reduced motion is on', async () => {
  const d = silver([text('t', { shine: true })]);
  const a = await renderPng(d, { width: 462, mode: 'preview', shinePhase: 0.2 });
  const b = await renderPng(d, { width: 462, mode: 'preview', shinePhase: 0.8 });
  assert.notDeepEqual(a, b);
  const c = await renderPng(d, { width: 462, mode: 'preview', shinePhase: 0.2, reducedMotion: true });
  const e = await renderPng(d, { width: 462, mode: 'preview', shinePhase: 0.8, reducedMotion: true, tilt: { x: 1, y: -1 } });
  assert.deepEqual(c, e);
});

test('stamp format renders a circle', async () => {
  const stamp: CardDesign = { ...silver(), format: 'stamp', background: { kind: 'preset', preset: 'holo' } };
  const png = PNG.sync.read(Buffer.from(await renderPng(stamp, { width: 200, mode: 'preview', shinePhase: 0.35 })));
  assert.equal(png.width, 200);
  assert.equal(png.height, 200);
  assert.equal(alphaAt(png, 20, 20), 0);
  assert.equal(alphaAt(png, 100, 100), 255);
});
