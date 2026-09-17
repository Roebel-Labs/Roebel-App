// Downscales the card masters in assets/cards/{Guest,Citizen,Attester}.png (1848x1160,
// i.e. 4x the 462x290 base) to the 1x, 2x and 3x PNGs the app ships. The masters are
// the design source (exported from Figma); Metro picks the @2x/@3x variant for the
// device scale and the bare 1x file keeps jest and web resolvers happy.
//
// Run from apps/expo:  node scripts/render-credential-cards.mjs
// Uses sharp from the monorepo pnpm store (no new dependency).
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const storeDir = path.join(repoRoot, 'node_modules', '.pnpm');
const sharpDir = readdirSync(storeDir).find((d) => d.startsWith('sharp@'));
if (!sharpDir) throw new Error('sharp not found in node_modules/.pnpm — run pnpm install at the repo root');
const sharp = createRequire(import.meta.url)(path.join(storeDir, sharpDir, 'node_modules', 'sharp'));

const SRC = path.join(here, '..', 'assets', 'cards');
const OUT = path.join(SRC, 'png');
mkdirSync(OUT, { recursive: true });

const CARDS = { Guest: 'guest', Citizen: 'citizen', Attester: 'attester' };
const SCALES = [1, 2, 3];
const BASE = { width: 462, height: 290 };
const MASTER_SCALE = 4;

for (const [file, name] of Object.entries(CARDS)) {
  const src = path.join(SRC, `${file}.png`);
  const master = await sharp(src).metadata();
  if (master.width !== BASE.width * MASTER_SCALE || master.height !== BASE.height * MASTER_SCALE) {
    throw new Error(
      `${file}.png is ${master.width}x${master.height}, expected ${BASE.width * MASTER_SCALE}x${BASE.height * MASTER_SCALE}`,
    );
  }
  for (const scale of SCALES) {
    // The 1x file is the bare name: Metro treats it as the base asset, jest and web need it.
    const out = path.join(OUT, scale === 1 ? `${name}.png` : `${name}@${scale}x.png`);
    await sharp(src)
      .resize(BASE.width * scale, BASE.height * scale, { kernel: 'lanczos3', fit: 'fill' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(out);
    const { width, height } = await sharp(out).metadata();
    console.log(`${path.basename(out)} ${width}x${height} ${Math.round(statSync(out).size / 1024)} KB`);
  }
}
