// Builds the agent character artwork from the 4K transparent masters (kept outside git, ~100 MB).
//
//   node scripts/build-agent-art.cjs "<masters dir>" "<web public dir>"
//
// Studio bundle (src/assets/agents/): <id>-tile.webp (256², head + body, for grids and small avatars)
// and <id>-full.webp (whole figure, 720 px tall, for the profile header). Everything larger is served by the
// website (<web public>/agents/<id>/): full.webp (1600 px tall, "Ansehen" + share card), mail.png (132², on
// the character's colour, for mail signatures; mail clients do not take WebP) and card.png (1200×630 link
// preview). Needs sharp (the repo root has it: NODE_PATH=<root>/node_modules/.pnpm/sharp@0.34.5/node_modules).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// id → master folder prefix and background colour (keep in sync with src/agent/characters.ts).
const CHARACTERS = {
  wolke: ['Wolke the sheep', '#A9C79F'],
  pilzi: ['Pilzi the fly agaric', '#CFE3BE'],
  fritz: ['Fritz the Findling', '#CFE0E4'],
  lumi: ['Lumi the firefly', '#E6E9C4'],
  eiko: ['Eiko the acorn', '#F0D79B'],
  lilo: ['Lilo the water-lily frog', '#F5D6E0'],
  olli: ['Olli the osprey', '#C7D2EE'],
  otto: ['Otto the otter', '#AFD6D2'],
  ida: ['Ida the hedgehog', '#CDB9DE'],
  stine: ['Stine the stork', '#F2CBB5'],
  mari: ['Mari the Maraene', '#F6D3A6'],
  klaas: ['Klaas the Klabautermann', '#D8C8A8'],
};

const [src, webPublic] = process.argv.slice(2);
if (!src || !webPublic) {
  console.error('usage: node scripts/build-agent-art.cjs "<masters dir>" "<web public dir>"');
  process.exit(1);
}
const studioOut = path.join(__dirname, '..', 'src', 'assets', 'agents');
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

function master(prefix) {
  const dir = fs.readdirSync(src).find((d) => d.startsWith(prefix));
  if (!dir) throw new Error(`no folder for ${prefix}`);
  const file = fs.readdirSync(path.join(src, dir)).find((f) => /hero 4K/i.test(f) && f.endsWith('.png'));
  if (!file) throw new Error(`no hero 4K png in ${dir}`);
  return path.join(src, dir, file);
}

/** Square crop of head and upper body: the top of the trimmed figure, with a little air above. */
async function bust(trimmed, w, h) {
  const side = Math.min(w, Math.round(h * 0.78));
  const crop = await sharp(trimmed).extract({ left: Math.round((w - side) / 2), top: 0, width: side, height: Math.min(side, h) }).png().toBuffer();
  const pad = Math.round(side * 0.06);
  return sharp(crop).extend({ top: pad, left: pad, right: pad, bottom: 0, background: CLEAR }).png().toBuffer();
}

(async () => {
  fs.mkdirSync(studioOut, { recursive: true });
  for (const [id, [prefix, color]] of Object.entries(CHARACTERS)) {
    const { data: trimmed, info } = await sharp(master(prefix)).trim().png().toBuffer({ resolveWithObject: true });
    const webOut = path.join(webPublic, 'agents', id);
    fs.mkdirSync(webOut, { recursive: true });
    const head = await bust(trimmed, info.width, info.height);

    await sharp(head).resize(256, 256, { fit: 'cover', position: 'top' }).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(studioOut, `${id}-tile.webp`));
    await sharp(trimmed).resize({ height: 720 }).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(studioOut, `${id}-full.webp`));
    await sharp(trimmed).resize({ height: 1600 }).webp({ quality: 84, alphaQuality: 90 }).toFile(path.join(webOut, 'full.webp'));

    const headSmall = await sharp(head).resize(132, 132, { fit: 'cover', position: 'top' }).png().toBuffer();
    await sharp({ create: { width: 132, height: 132, channels: 4, background: color } }).composite([{ input: headSmall }]).png({ compressionLevel: 9, palette: true }).toFile(path.join(webOut, 'mail.png'));

    const figure = await sharp(trimmed).resize({ height: 560 }).png().toBuffer();
    const fw = (await sharp(figure).metadata()).width;
    await sharp({ create: { width: 1200, height: 630, channels: 4, background: color } })
      .composite([{ input: figure, left: Math.round((1200 - fw) / 2), top: 50 }])
      .png({ compressionLevel: 9 }).toFile(path.join(webOut, 'card.png'));
    console.log('built', id);
  }
})().catch((e) => { console.error(e); process.exit(1); });
