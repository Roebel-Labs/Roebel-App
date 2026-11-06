#!/usr/bin/env node
'use strict';
// Builds an over-the-air interface update (see electron/ota.cjs):
//   1. bump "version" in package.json (must be newer than every installed app / earlier OTA)
//   2. node scripts/ota-publish.cjs            -> release-ota/renderer-<v>.asar + ota.json (signed)
//   3. gh release create ortis-studio-ota-v<v> release-ota/renderer-<v>.asar release-ota/ota.json ...
//      (the command is printed); roebel.app/studio/latest.json picks it up within ~5 minutes.
// Only interface changes (src/**) travel this way. Changes to electron/*.cjs need an installer
// release, and a changed main/preload API also needs OTA_RUNTIME bumped in electron/ota.cjs.
// Signing key: ~/.config/ortis-studio/ota-signing-key.pem (ed25519, never in the repo).

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OTA_RUNTIME, signedText, verifySignature } = require('../electron/ota.cjs');

const root = path.join(__dirname, '..');
const version = require('../package.json').version;
const keyFile = process.env.ORTIS_OTA_KEY || path.join(os.homedir(), '.config', 'ortis-studio', 'ota-signing-key.pem');
if (!fs.existsSync(keyFile)) throw new Error(`signing key missing: ${keyFile}`);

const out = path.join(root, 'release-ota');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: root, stdio: 'inherit' });
const bundle = path.join(out, `renderer-${version}.asar`);
execFileSync('pnpm', ['dlx', '@electron/asar@3.4.1', 'pack', path.join(root, 'dist'), bundle], { cwd: root, stdio: 'inherit' });

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex');
const tag = `ortis-studio-ota-v${version}`;
const o = {
  version,
  runtime: OTA_RUNTIME,
  url: `https://github.com/Roebel-Labs/Roebel-App/releases/download/${tag}/renderer-${version}.asar`,
  sha256,
};
o.signature = crypto.sign(null, Buffer.from(signedText(o)), fs.readFileSync(keyFile)).toString('base64');
if (!verifySignature(o)) throw new Error('signature does not verify with the public key built into the app');
fs.writeFileSync(path.join(out, 'ota.json'), JSON.stringify(o, null, 2));

console.log(`\nOTA ${version} (runtime ${OTA_RUNTIME}) ready in release-ota/. Publish with:\n`);
console.log(
  `gh release create ${tag} release-ota/renderer-${version}.asar release-ota/ota.json --repo Roebel-Labs/Roebel-App --target $(git rev-parse HEAD) --title "Ortis Studio ${version} (Update)" --notes "Oberflächen-Update"`,
);
