/**
 * @jest-environment node
 */
// The app's renderer (createRnSkiaApi over RN Skia's object model, headless CanvasKit) must match
// D1's golden images within D1's tolerance (≤ 0.5 % of pixels).
import * as fs from 'fs';
import * as path from 'path';
import { TEMPLATES } from '@roebel/card-design';
import { PACKAGE_DIR, diffRatio, loadHeadlessSkia, renderRgba } from '../test-utils/headless-skia';

// Same settings as packages/card-design/scripts/golden-config.ts.
const GOLDEN = { width: 462, mode: 'preview', shinePhase: 0.35 } as const;

jest.setTimeout(60000);

async function decodePng(file: string) {
  const { Skia } = await loadHeadlessSkia();
  const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(file))));
  const width = img.width(), height = img.height();
  const px = img.readPixels(0, 0, { width, height, colorType: 4, alphaType: 3 });
  return { width, height, data: new Uint8Array(px.buffer, px.byteOffset, px.byteLength) };
}

describe('golden images (RN Skia adapter)', () => {
  for (const t of TEMPLATES) {
    it(`matches ${t.id}`, async () => {
      const actual = await renderRgba(t.design, GOLDEN);
      const expected = await decodePng(path.join(PACKAGE_DIR, 'test/golden', `${t.id}.png`));
      expect(actual.width).toBe(expected.width);
      expect(actual.height).toBe(expected.height);
      const ratio = diffRatio(actual.data, expected.data);
      if (ratio > 0.005) throw new Error(`${t.id}: ${(ratio * 100).toFixed(2)} % pixels differ`);
    });
  }
});
