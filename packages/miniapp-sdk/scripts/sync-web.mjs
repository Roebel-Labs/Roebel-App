/**
 * Copies the built client ESM bundle into apps/web/public/sdk/ so the web app
 * self-hosts the SDK for single-file mini apps (no esm.sh / npm-publish
 * dependency). Run via `pnpm --filter @netizen-labs/miniapp-sdk sync-web`
 * after every SDK change; the copies are checked in.
 *
 * Served as:
 *   https://www.roebel.app/sdk/miniapp-sdk.mjs          (latest alias)
 *   https://www.roebel.app/sdk/miniapp-sdk-<ver>.mjs    (pinned)
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const src = join(pkgDir, 'dist', 'index.js');
const outDir = join(pkgDir, '..', '..', 'apps', 'web', 'public', 'sdk');

mkdirSync(outDir, { recursive: true });
copyFileSync(src, join(outDir, `miniapp-sdk-${version}.mjs`));
copyFileSync(src, join(outDir, 'miniapp-sdk.mjs'));
console.log(`synced dist/index.js -> apps/web/public/sdk/{miniapp-sdk.mjs, miniapp-sdk-${version}.mjs}`);
