import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, designHash, type CardDesign } from '../src/index';

const design = (): CardDesign => ({
  schema: 1,
  format: 'card',
  background: { kind: 'preset', preset: 'navy' },
  shine: { enabled: true, intensity: 0.6 },
  layers: [
    { id: 't1', type: 'text', x: 52, y: 72, w: 400, h: 60, rotation: 0, opacity: 1, shine: false,
      text: 'BÜRGER', font: 'barlow-black', size: 44, color: '#e8e4d8', align: 'left', uppercase: true, letterSpacing: 0 },
  ],
});

test('canonicalJson sorts keys and has no whitespace', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 'x' }] }), '{"a":[2,{"c":"x","d":1}],"b":1}');
});

test('designHash ignores key order and changes when a layer moves 1 unit', () => {
  const a = design();
  const reordered = JSON.parse(JSON.stringify(a), function (this: unknown, _k, v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).reverse());
    }
    return v;
  }) as CardDesign;
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(a));
  assert.equal(designHash(reordered), designHash(a));
  assert.match(designHash(a), /^[0-9a-f]{64}$/);

  const moved = design();
  moved.layers[0].x += 1;
  assert.notEqual(designHash(moved), designHash(a));
});
