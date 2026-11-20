// Re-renders the golden reference PNGs: pnpm golden
import { writeFileSync } from 'node:fs';
import { TEMPLATES } from '../src/index';
import { renderPng } from '../src/adapters/canvaskit';
import { GOLDEN_OPTIONS, goldenPath } from './golden-config';

for (const t of TEMPLATES) {
  const png = await renderPng(t.design, GOLDEN_OPTIONS);
  writeFileSync(goldenPath(t.id), png);
  console.log(`${t.id}.png ${png.length} bytes`);
}
