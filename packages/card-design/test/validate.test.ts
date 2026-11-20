import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDesign } from '../src/index';

const minimal = () => ({
  schema: 1,
  format: 'card',
  background: { kind: 'preset', preset: 'silver' },
  shine: { enabled: true, intensity: 0.6 },
  layers: [] as unknown[],
});

const textLayer = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'text', x: 52, y: 72, w: 400, h: 60, rotation: 0, opacity: 1, shine: false,
  text: 'BÜRGER', font: 'barlow-black', size: 44, color: '#1e2a3a', align: 'left', uppercase: true, letterSpacing: 0,
  ...extra,
});

test('accepts a minimal card', () => {
  assert.equal(validateDesign(minimal()).ok, true);
});

test('accepts every layer type', () => {
  const d = minimal();
  d.layers = [
    textLayer('t1'),
    { ...textLayer('f1'), type: 'field', field: 'holderName', sampleText: 'Vorname Nachname', text: undefined },
    { id: 'i1', type: 'image', x: 700, y: 40, w: 180, h: 120, rotation: 15, opacity: 0.9, shine: true, assetId: 'builtin:person-laurel', role: 'logo' },
    { id: 'i2', type: 'image', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, shine: false, assetId: 'a'.repeat(64), role: 'sticker', ai: true },
  ];
  const r = validateDesign(d);
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('rejects schema 2, 41 layers, a 121-char text, NaN x and colour "javascript:alert(1)"', () => {
  const schema2 = { ...minimal(), schema: 2 };
  const r1 = validateDesign(schema2);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.errors.join('\n'), /schema/);

  const many = minimal();
  many.layers = Array.from({ length: 41 }, (_, i) => textLayer(`l${i}`));
  assert.equal(validateDesign(many).ok, false);

  const long = minimal();
  long.layers = [textLayer('t1', { text: 'x'.repeat(121) })];
  assert.equal(validateDesign(long).ok, false);

  const nan = minimal();
  nan.layers = [textLayer('t1', { x: NaN })];
  assert.equal(validateDesign(nan).ok, false);

  const js = minimal();
  js.layers = [textLayer('t1', { color: 'javascript:alert(1)' })];
  assert.equal(validateDesign(js).ok, false);
});

test('rejects hostile input without throwing', () => {
  const inputs: unknown[] = [
    null, undefined, 42, 'card', [], {},
    { ...minimal(), layers: Array.from({ length: 10_000 }, (_, i) => textLayer(`l${i}`)) },
    { ...minimal(), layers: [textLayer('t1', { text: 'x'.repeat(50_000) })] },
    { ...minimal(), layers: 'nope' },
    { ...minimal(), background: { kind: 'image', assetId: 'https://evil.example/x.png', fit: 'cover' } },
    { ...minimal(), background: { kind: 'preset', preset: 'silver', color: 'red' } },
    { ...minimal(), shine: { enabled: true, intensity: 2 } },
    { ...minimal(), format: 'poster' },
    { ...minimal(), border: { color: '#fff', width: 2 } },
    { ...minimal(), layers: [textLayer('A_B')] },
    { ...minimal(), layers: [textLayer('a'), textLayer('a')] },
    { ...minimal(), layers: [textLayer('a', { w: 0 })] },
    { ...minimal(), layers: [textLayer('a', { x: 3000 })] },
    { ...minimal(), layers: [textLayer('a', { rotation: 400 })] },
    { ...minimal(), layers: [textLayer('a', { size: 5 })] },
    { ...minimal(), layers: [textLayer('a', { letterSpacing: 2 })] },
    { ...minimal(), layers: [textLayer('a', { font: 'comic-sans' })] },
    { ...minimal(), layers: [textLayer('a', { type: 'video' })] },
  ];
  for (const input of inputs) {
    const r = validateDesign(input);
    assert.equal(r.ok, false, `expected rejection: ${JSON.stringify(input)?.slice(0, 120)}`);
    if (!r.ok) assert.ok(r.errors.length > 0);
  }
});

test('stamp format uses 580 as the coordinate bound', () => {
  const stamp = { ...minimal(), format: 'stamp', layers: [textLayer('a', { x: 1200 })] };
  assert.equal(validateDesign(stamp).ok, false);
  const ok = { ...minimal(), format: 'stamp', layers: [textLayer('a', { x: 1100 })] };
  assert.equal(validateDesign(ok).ok, true);
});

test('drops unknown keys', () => {
  const input = {
    ...minimal(),
    foo: 'bar',
    background: { kind: 'preset', preset: 'silver', evil: 1 },
    shine: { enabled: true, intensity: 0.5, extra: true },
    layers: [textLayer('t1', { onClick: 'x', locked: false })],
  };
  const r = validateDesign(input);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal('foo' in r.design, false);
  assert.equal('evil' in r.design.background, false);
  assert.equal('extra' in r.design.shine, false);
  assert.equal('onClick' in r.design.layers[0], false);
  assert.equal('locked' in r.design.layers[0], false);
});

test('keeps an optional border and ai flag', () => {
  const r = validateDesign({ ...minimal(), border: { color: '#C9A748', width: 3 } });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.design.border, { color: '#C9A748', width: 3 });
});
