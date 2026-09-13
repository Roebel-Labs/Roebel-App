// Renders assets/cards/*.svg to PNG at 1x, 2x and 3x (1x keeps jest and web resolvers happy). The SVGs use a soft-light
// sheen and inner-shadow filters that react-native-svg cannot reproduce, so
// the app ships PNGs and keeps the SVGs as the design source.
//
// Run from apps/expo:  node scripts/render-credential-cards.mjs
// Uses sharp from the monorepo pnpm store (no new dependency).
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync } from 'node:fs';
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

for (const [file, name] of Object.entries(CARDS)) {
  for (const scale of SCALES) {
    const out = path.join(OUT, `${name}@${scale}x.png`);
    await sharp(path.join(SRC, `${file}.svg`), { density: 72 * scale }).png().toFile(out);
    const { width, height } = await sharp(out).metadata();
    console.log(`${name}@${scale}x.png ${width}x${height}`);
  }
}
