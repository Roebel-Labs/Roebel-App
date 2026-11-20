import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { TEMPLATES } from '../src/index';
import { renderPng } from '../src/adapters/canvaskit';
import { GOLDEN_OPTIONS, goldenPath } from '../scripts/golden-config';

for (const t of TEMPLATES) {
  test(`golden: ${t.id}`, async () => {
    const actual = PNG.sync.read(Buffer.from(await renderPng(t.design, GOLDEN_OPTIONS)));
    const expected = PNG.sync.read(readFileSync(goldenPath(t.id)));
    assert.equal(actual.width, expected.width);
    assert.equal(actual.height, expected.height);
    const diff = pixelmatch(actual.data, expected.data, undefined, actual.width, actual.height, { threshold: 0.1 });
    const ratio = diff / (actual.width * actual.height);
    assert.ok(ratio <= 0.005, `${t.id}: ${(ratio * 100).toFixed(2)} % pixels differ`);
  });
}
