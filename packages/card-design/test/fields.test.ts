import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, resolveText, type Layer } from '../src/index';

const style = { font: 'mona-bold', size: 32, color: '#ffffff', align: 'left', uppercase: false, letterSpacing: 0 } as const;
const base = { x: 52, y: 400, w: 500, h: 50, rotation: 0, opacity: 1, shine: false };
const text: Layer = { ...base, id: 't', type: 'text', text: 'Röbel / Müritz', ...style };
const name: Layer = { ...base, id: 'n', type: 'field', field: 'holderName', sampleText: 'Vorname Nachname', ...style };
const image: Layer = { ...base, id: 'i', type: 'image', assetId: 'builtin:roebel-mark', role: 'logo' };

test('text layers return their text in every mode', () => {
  for (const mode of ['holder', 'preview', 'public'] as const) assert.equal(resolveText(text, mode, {}), 'Röbel / Müritz');
});

test('holder mode shows the value or nothing', () => {
  assert.equal(resolveText(name, 'holder', { holderName: 'Erika Muster' }), 'Erika Muster');
  assert.equal(resolveText(name, 'holder', {}), null);
  assert.equal(resolveText(name, 'holder', { holderName: '' }), null);
});

test('preview mode falls back to the sample text', () => {
  assert.equal(resolveText(name, 'preview', { holderName: 'Erika Muster' }), 'Erika Muster');
  assert.equal(resolveText(name, 'preview', {}), 'Vorname Nachname');
});

test('public mode never returns a name', () => {
  assert.equal(resolveText(name, 'public', { holderName: 'Erika Muster' }), null);
  assert.equal(resolveText(name, 'public', {}), null);
});

test('image layers have no text', () => {
  assert.equal(resolveText(image, 'preview', {}), null);
});

test('formatDate uses the Berlin calendar day', () => {
  assert.equal(formatDate('2027-12-31T22:59:59Z', 'de'), '31.12.2027');
  assert.equal(formatDate('2027-12-31T23:00:00Z', 'de'), '01.01.2028');
  assert.equal(formatDate('2027-12-31T22:59:59Z', 'en'), '31 Dec 2027');
  assert.equal(formatDate('not a date', 'de'), '');
});
