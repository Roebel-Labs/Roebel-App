import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
// @ts-expect-error plain .mjs script without types
import { checkRelease } from '../scripts/release-check.mjs';

const BUILD = 'export const sdk = 1;\n';

function fixture(o: { pkg?: string; client?: string; prompt?: string; pinned?: string | null; alias?: string | null }) {
  const dir = mkdtempSync(join(tmpdir(), 'release-check-'));
  const pkg = o.pkg ?? '0.4.0';
  const cdnDir = join(dir, 'sdk');
  mkdirSync(cdnDir);
  const paths = {
    pkgJson: join(dir, 'package.json'),
    clientTs: join(dir, 'client.ts'),
    htmlPromptTs: join(dir, 'htmlPrompt.ts'),
    dist: join(dir, 'index.js'),
    cdnDir,
  };
  writeFileSync(paths.pkgJson, JSON.stringify({ version: pkg }));
  writeFileSync(paths.clientTs, `const SDK_VERSION = '${o.client ?? pkg}';\n`);
  writeFileSync(paths.htmlPromptTs, `export const SDK_VERSION = "${o.prompt ?? pkg}";\n`);
  writeFileSync(paths.dist, BUILD);
  if (o.pinned !== null) writeFileSync(join(cdnDir, `miniapp-sdk-${pkg}.mjs`), o.pinned ?? BUILD);
  if (o.alias !== null) writeFileSync(join(cdnDir, 'miniapp-sdk.mjs'), o.alias ?? BUILD);
  return paths;
}

test('agreeing versions and identical files pass', () => assert.deepEqual(checkRelease(fixture({})), []));
test('a client.ts version that lags is reported', () =>
  assert.match(checkRelease(fixture({ client: '0.3.1' })).join('\n'), /client\.ts/));
test('a stale AI-builder pin is reported', () =>
  assert.match(checkRelease(fixture({ prompt: '0.3.1' })).join('\n'), /htmlPrompt/));
test('a missing or different CDN copy is reported', () => {
  assert.match(checkRelease(fixture({ pinned: null })).join('\n'), /miniapp-sdk-0\.4\.0\.mjs/);
  assert.match(checkRelease(fixture({ pinned: 'old' })).join('\n'), /miniapp-sdk-0\.4\.0\.mjs/);
});
test('a stale alias is reported', () =>
  assert.match(checkRelease(fixture({ alias: 'old' })).join('\n'), /miniapp-sdk\.mjs/));
