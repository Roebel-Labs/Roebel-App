/**
 * Release check: npm, the CDN copy and the AI builder's pin must agree before a publish.
 *
 *   - package.json `version`, src/client.ts `SDK_VERSION` and
 *     apps/web/src/lib/miniapp/ai/htmlPrompt.ts `SDK_VERSION` are equal;
 *   - apps/web/public/sdk/miniapp-sdk-<version>.mjs and the unpinned alias
 *     apps/web/public/sdk/miniapp-sdk.mjs are byte-identical to dist/index.js.
 *
 * Run as a script (after tsup) it prints the problems and exits 1 when there are any.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const versionIn = (text, re) => text.match(re)?.[1] ?? null;

/** @param {{ pkgJson: string; clientTs: string; htmlPromptTs: string; dist: string; cdnDir: string }} paths */
export function checkRelease(paths) {
  const problems = [];
  const version = JSON.parse(readFileSync(paths.pkgJson, 'utf8')).version;
  const client = versionIn(readFileSync(paths.clientTs, 'utf8'), /const SDK_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const prompt = versionIn(readFileSync(paths.htmlPromptTs, 'utf8'), /export const SDK_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (client !== version) problems.push(`client.ts SDK_VERSION is ${client ?? 'missing'}, package.json is ${version}`);
  if (prompt !== version) problems.push(`htmlPrompt.ts SDK_VERSION is ${prompt ?? 'missing'}, package.json is ${version}`);

  if (!existsSync(paths.dist)) {
    problems.push(`${paths.dist} is missing: run tsup first`);
    return problems;
  }
  const built = readFileSync(paths.dist);
  for (const name of [`miniapp-sdk-${version}.mjs`, 'miniapp-sdk.mjs']) {
    const file = join(paths.cdnDir, name);
    if (!existsSync(file)) problems.push(`${name} is missing in ${paths.cdnDir}: run sync-web`);
    else if (!readFileSync(file).equals(built)) problems.push(`${name} differs from dist/index.js: run sync-web`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const web = join(pkgDir, '..', '..', 'apps', 'web');
  const problems = checkRelease({
    pkgJson: join(pkgDir, 'package.json'),
    clientTs: join(pkgDir, 'src', 'client.ts'),
    htmlPromptTs: join(web, 'src', 'lib', 'miniapp', 'ai', 'htmlPrompt.ts'),
    dist: join(pkgDir, 'dist', 'index.js'),
    cdnDir: join(web, 'public', 'sdk'),
  });
  if (problems.length > 0) {
    for (const p of problems) console.error(`release-check: ${p}`);
    process.exit(1);
  }
  console.log('release-check: versions agree, CDN copies match the build');
}
