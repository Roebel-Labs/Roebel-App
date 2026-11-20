import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_ASSETS, TEMPLATES, validateDesign, type Layer } from '../src/index';
import { builtinAssetBytes } from '../src/adapters/canvaskit';

test('templates come in the agreed order with German labels', () => {
  assert.deepEqual(TEMPLATES.map((t) => t.id), ['gast', 'buerger', 'bescheiniger', 'schwarz', 'papier', 'matt', 'glas', 'holo-stempel']);
  assert.deepEqual(TEMPLATES.map((t) => t.label), ['Gast', 'Bürger', 'Bescheiniger', 'Schwarz', 'Papier', 'Matt', 'Glas', 'Holografischer Stempel']);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

test('every template passes validateDesign unchanged', () => {
  for (const t of TEMPLATES) {
    const r = validateDesign(t.design);
    assert.equal(r.ok, true, `${t.id}: ${JSON.stringify(r)}`);
    if (r.ok) assert.deepEqual(r.design, t.design, t.id);
    assert.equal(t.format, t.design.format);
  }
});

test('card templates carry title, logo, place line, mark and (non-community) the holder field', () => {
  const community = new Set(['gast', 'buerger', 'bescheiniger']);
  for (const t of TEMPLATES.filter((x) => x.format === 'card')) {
    const L = t.design.layers;
    const isCommunity = community.has(t.id);
    const title = L.find((l) => l.type === 'text' && l.id === 'title') as Extract<Layer, { type: 'text' }>;
    assert.ok(title && title.x === 52, `${t.id} title`);
    // Community cards follow the app's card PNGs (semi-condensed); the others the designer layout.
    assert.equal(title.font, isCommunity ? 'mona-condensed' : 'barlow-black');
    assert.equal(title.size, isCommunity ? 55.4 : 44);
    assert.equal(title.y, isCommunity ? 57 : 72);
    assert.equal(title.uppercase, true);
    const place = L.find((l) => l.type === 'text' && l.text === 'Röbel / Müritz') as Extract<Layer, { type: 'text' }>;
    assert.ok(place && place.x === 52, `${t.id} place`);
    if (isCommunity) assert.ok(place.font === 'mona-condensed' && place.size === 39.4, `${t.id} place`);
    else assert.ok(place.y === 480 && place.font === 'barlow' && place.size === 32, `${t.id} place`);
    const logo = L.find((l) => l.type === 'image' && l.role === 'logo');
    assert.ok(logo, `${t.id} logo`);
    if (community.has(t.id)) assert.match((logo as { assetId: string }).assetId, /^builtin:person-laurel/);
    assert.ok(L.some((l) => l.type === 'image' && l.assetId.startsWith('builtin:roebel-mark')), `${t.id} mark`);
    const field = L.find((l) => l.type === 'field' && l.field === 'holderName') as Extract<Layer, { type: 'field' }> | undefined;
    if (community.has(t.id)) assert.equal(field, undefined);
    else assert.ok(field && field.x === 52 && field.y === 400 && field.sampleText === 'Vorname Nachname', `${t.id} field`);
  }
});

test('built-in assets resolve to bytes', async () => {
  for (const id of Object.keys(BUILTIN_ASSETS)) {
    const bytes = await builtinAssetBytes(id);
    assert.ok(bytes.length > 1000, id);
    assert.deepEqual([...bytes.slice(1, 4)], [0x50, 0x4e, 0x47], `${id} is a PNG`);
  }
  await assert.rejects(builtinAssetBytes('builtin:nope'));
});
