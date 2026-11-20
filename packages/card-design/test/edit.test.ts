import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addLayer, hitTest, moveLayer, newLayerId, removeLayer, snap, updateLayer,
  type CardDesign, type Layer,
} from '../src/index';

const img = (id: string, extra: Partial<Layer> = {}): Layer =>
  ({ id, type: 'image', x: 100, y: 100, w: 200, h: 100, rotation: 0, opacity: 1, shine: false, assetId: 'builtin:roebel-mark', role: 'image', ...extra }) as Layer;

const design = (layers: Layer[] = [img('a'), img('b'), img('c')]): CardDesign => ({
  schema: 1, format: 'card', background: { kind: 'preset', preset: 'silver' }, shine: { enabled: true, intensity: 0.5 }, layers,
});

test('addLayer appends on top and renames a taken id', () => {
  const d = design();
  const d2 = addLayer(d, img('d'));
  assert.deepEqual(d2.layers.map((l) => l.id), ['a', 'b', 'c', 'd']);
  assert.equal(d.layers.length, 3, 'input not mutated');
  const d3 = addLayer(d2, img('a'));
  assert.equal(d3.layers.length, 5);
  assert.notEqual(d3.layers[4].id, 'a');
  assert.equal(new Set(d3.layers.map((l) => l.id)).size, 5);
});

test('newLayerId returns an unused valid id', () => {
  const id = newLayerId(design([img('l1'), img('l2')]));
  assert.match(id, /^[a-z0-9-]{1,32}$/);
  assert.ok(!['l1', 'l2'].includes(id));
});

test('updateLayer patches one layer, keeps id and type', () => {
  const d = updateLayer(design(), 'b', { x: 5, opacity: 0.5 });
  assert.equal(d.layers[1].x, 5);
  assert.equal(d.layers[1].opacity, 0.5);
  assert.equal(d.layers[1].id, 'b');
  assert.equal(design().layers[1].x, 100);
  const same = updateLayer(d, 'zzz', { x: 1 });
  assert.deepEqual(same, d);
  const keep = updateLayer(d, 'b', { id: 'x', type: 'text' } as never);
  assert.equal(keep.layers[1].id, 'b');
  assert.equal(keep.layers[1].type, 'image');
});

test('removeLayer drops the layer', () => {
  assert.deepEqual(removeLayer(design(), 'b').layers.map((l) => l.id), ['a', 'c']);
});

test('moveLayer up/down/top/bottom', () => {
  const ids = (d: CardDesign) => d.layers.map((l) => l.id);
  assert.deepEqual(ids(moveLayer(design(), 'a', 'top')), ['b', 'c', 'a']);
  assert.deepEqual(ids(moveLayer(design(), 'c', 'bottom')), ['c', 'a', 'b']);
  assert.deepEqual(ids(moveLayer(design(), 'a', 'up')), ['b', 'a', 'c']);
  assert.deepEqual(ids(moveLayer(design(), 'b', 'down')), ['b', 'a', 'c']);
  assert.deepEqual(ids(moveLayer(design(), 'c', 'up')), ['a', 'b', 'c']);
  assert.deepEqual(ids(moveLayer(design(), 'a', 'down')), ['a', 'b', 'c']);
});

test('hitTest returns the top-most layer and respects rotation', () => {
  const d = design([img('under', { x: 0, y: 0, w: 924, h: 580 }), img('rot', { x: 300, y: 200, w: 300, h: 100, rotation: 30 })]);
  // Centre of the rotated layer.
  assert.equal(hitTest(d, 450, 250), 'rot');
  // Corner of its axis-aligned bounding box lies outside the rotated rectangle.
  const rad = (30 * Math.PI) / 180;
  const halfW = (300 * Math.cos(rad) + 100 * Math.sin(rad)) / 2;
  const halfH = (300 * Math.sin(rad) + 100 * Math.cos(rad)) / 2;
  assert.equal(hitTest(d, 450 + halfW - 2, 250 - halfH + 2), 'under');
  assert.equal(hitTest(design([img('only', { x: 300, y: 200, w: 300, h: 100, rotation: 30 })]), 450 + halfW - 2, 250 - halfH + 2), null);
  assert.equal(hitTest(d, 2000, 2000), null);
});

test('snap pulls values within tolerance', () => {
  assert.equal(snap(463, [462]), 462);
  assert.equal(snap(470, [462]), 470);
  assert.equal(snap(468, [462]), 462);
  assert.equal(snap(100, [98, 101]), 101);
  assert.equal(snap(100, [], 6), 100);
});
