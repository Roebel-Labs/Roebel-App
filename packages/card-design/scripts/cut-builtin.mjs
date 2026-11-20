// One-off: cuts the built-in art (laurel person icon, Röbel App mark) out of the
// 4x card masters in apps/expo/assets/cards as transparent PNGs. The light
// variants come from the navy citizen card, the dark and gold ones from the
// silver guest card. Alpha is keyed from luminance against the crop's border background.
// Run from packages/card-design:  node scripts/cut-builtin.mjs
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const store = path.join(repo, 'node_modules', '.pnpm');
const sharpDir = readdirSync(store).find((d) => d.startsWith('sharp@'));
const sharp = createRequire(import.meta.url)(path.join(store, sharpDir, 'node_modules', 'sharp'));
const cards = path.join(repo, 'apps', 'expo', 'assets', 'cards');
const out = path.join(here, '..', 'assets', 'builtin');

// Search regions in master pixels (1848x1160 = 4x of 462x290); the art's exact
// box differs slightly per card and is detected inside the region.
const REGIONS = { 'person-laurel': [1300, 40, 500, 360], 'roebel-mark': [1300, 900, 500, 220] };
const PAD = 6;
const VARIANTS = [
  { suffix: '', master: 'Citizen.png', ink: [0xdc, 0xd9, 0xc3] },
  { suffix: '-dark', master: 'Guest.png', ink: [0x52, 0x68, 0x72] },
  // Same shapes as on the guest card; the attester card's gold gradient is too uneven
  // to key cleanly, so the gold variants are the guest cut-outs recoloured.
  { suffix: '-gold', master: 'Guest.png', ink: [0x69, 0x5d, 0x39], keyInk: [0x52, 0x68, 0x72] },
];

const lum = (d, i) => (d[i] + d[i + 1] + d[i + 2]) / 3;

for (const v of VARIANTS) {
  for (const [name, region] of Object.entries(REGIONS)) {
    const [left, top, width, height] = await detectBox(path.join(cards, v.master), region);
    const { data } = await sharp(path.join(cards, v.master)).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Local background: the crop's border pixels interpolated across the crop.
    const at = (x, y) => lum(data, (y * width + x) * 4);
    const bgAt = (x, y) => {
      const fx = x / (width - 1), fy = y / (height - 1);
      const h = at(0, y) * (1 - fx) + at(width - 1, y) * fx;
      const v = at(x, 0) * (1 - fy) + at(x, height - 1) * fy;
      return (h + v) / 2;
    };
    const key = v.keyInk ?? v.ink;
    const fg = (key[0] + key[1] + key[2]) / 3;
    const outBuf = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const bg = bgAt(i % width, Math.floor(i / width));
      const a = Math.min(1, Math.max(0, (lum(data, i * 4) - bg) / (fg - bg)));
      // Clean up the faint background gradient.
      const alpha = a < 0.06 ? 0 : a > 0.94 ? 1 : a;
      outBuf[i * 4] = v.ink[0]; outBuf[i * 4 + 1] = v.ink[1]; outBuf[i * 4 + 2] = v.ink[2];
      outBuf[i * 4 + 3] = Math.round(alpha * 255);
    }
    const file = path.join(out, `${name}${v.suffix}.png`);
    await sharp(outBuf, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file);
    console.log(file, width, height);
  }
}

async function detectBox(file, [rx, ry, rw, rh]) {
  const { data } = await sharp(file).extract({ left: rx, top: ry, width: rw, height: rh }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ref = lum(data, 0);
  let x0 = rw, y0 = rh, x1 = -1, y1 = -1;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    if (Math.abs(lum(data, (y * rw + x) * 4) - ref) > 60) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return [rx + x0 - PAD, ry + y0 - PAD, x1 - x0 + 1 + 2 * PAD, y1 - y0 + 1 + 2 * PAD];
}
