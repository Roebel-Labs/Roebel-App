/**
 * Owner step before the benchmark: download the Semaphore circuit artifacts once from PSE and
 * place them where www.roebel.app serves them (apps/web/public/zk/semaphore/4.14.2/), checked
 * against the pins in lib/zk/prover.ts. The app never fetches from a third-party CDN.
 *
 *   node zk/fetch-artifacts.mjs            # depths 4, 8, 10 (the benchmark groups)
 *   node zk/fetch-artifacts.mjs 1 2 … 20   # any depths
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://snark-artifacts.pse.dev/semaphore/4.13.0';
const expo = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(expo, '..', 'web', 'public', 'zk', 'semaphore', '4.14.2');
const proverTs = readFileSync(join(expo, 'lib', 'zk', 'prover.ts'), 'utf8');
const pins = Object.fromEntries(
  [...proverTs.matchAll(/^\s*(\d+): \{ wasm: '([0-9a-f]{64})', zkey: '([0-9a-f]{64})' \},$/gm)].map((m) => [m[1], { wasm: m[2], zkey: m[3] }]),
);

const depths = process.argv.slice(2).length ? process.argv.slice(2) : ['4', '8', '10'];
mkdirSync(outDir, { recursive: true });
let failed = false;
for (const d of depths) {
  for (const ext of ['wasm', 'zkey']) {
    const name = `semaphore-${d}.${ext}`;
    const want = pins[d]?.[ext];
    if (!want) {
      console.error(`${name}: no pin`);
      failed = true;
      continue;
    }
    const res = await fetch(`${SOURCE}/${name}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const got = createHash('sha256').update(bytes).digest('hex');
    if (!res.ok || got !== want) {
      console.error(`${name}: ${res.ok ? `sha256 ${got} != pin ${want}` : `HTTP ${res.status}`}`);
      failed = true;
      continue;
    }
    writeFileSync(join(outDir, name), bytes);
    console.log(`${name}: ok (${(bytes.length / 1048576).toFixed(1)} MB)`);
  }
}
process.exit(failed ? 1 : 0);
